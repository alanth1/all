"""Accounting & Financial Engine (PRD module 06). Integer cents, double entry, immutable posted entries
(enforced by SQLite triggers), corrections via reversal. AI only suggests classifications."""
from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel, Field

from .. import db
from ..ai.runner import run_task
from ..audit import audit, notify
from ..jobs import handler
from ..permissions import check
from ..util import dumps, now, sha256_text, to_cents

DEFAULT_COA = [
    ("1000", "Cash", "asset"), ("1010", "Bank", "asset"), ("1100", "Etsy Receivables (Payment Account)", "asset"),
    ("2100", "Taxes Payable", "liability"), ("3000", "Owner Equity", "equity"),
    ("4000", "Sales Revenue", "revenue"), ("4100", "Refunds", "contra_revenue"),
    ("5000", "Etsy Fees", "expense"), ("5100", "Marketing Expenses", "expense"), ("5200", "Software Expenses", "expense"),
    ("5300", "Operating Expenses", "expense"), ("7000", "Currency Gain/Loss", "expense"),
]
ETSY_RULES = {  # ledger_type (lowercase, startswith) -> (debit, credit) for the type's natural sign (sale +, others -)
    "payment": ("1100", "4000"), "sale": ("1100", "4000"),
    "refund": ("4100", "1100"),
    "disbursement": ("1010", "1100"), "deposit": ("1010", "1100"),
}
FEE_PREFIXES = ("transaction", "paymentprocessingfee", "processing", "listing", "renew", "shipping_label", "shipping label",
                "etsy ads", "prolist", "offsite", "vat", "regulatory", "subscription", "fee")


class UnbalancedEntry(ValueError):
    pass


def seed_coa():
    for code, name, typ in DEFAULT_COA:
        if not db.q1("SELECT 1 FROM accounts WHERE code=?", (code,)):
            db.ex("INSERT INTO accounts(code, name, type) VALUES(?,?,?)", (code, name, typ))


def base_ccy() -> str:
    return db.settings()["accounting"]["base_currency"]


def acct(code: str) -> int:
    row = db.q1("SELECT id FROM accounts WHERE code=? AND active=1", (code,))
    if not row:
        raise ValueError(f"account {code} not found or inactive")
    return row["id"]


def fx_rate(day: str, ccy: str) -> Decimal | None:
    if ccy == base_ccy():
        return Decimal(1)
    row = db.q1("SELECT rate FROM exchange_rates WHERE quote=? AND base=? AND rate_date<=? ORDER BY rate_date DESC LIMIT 1",
                (ccy, base_ccy(), day[:10]))
    return Decimal(row["rate"]) if row else None


def convert(cents: int, rate: Decimal) -> int:
    return int((Decimal(cents) * rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def create_entry(entry_date: str, memo: str, source_type: str, source_ref: str, lines: list[dict], created_by: str,
                 post: bool = True, reverses_id: int | None = None) -> int:
    """lines: [{code, debit|credit (cents, base ccy), orig_amount_cents?, orig_currency?, fx_rate?, memo?}].
    Idempotent per (source_type, source_ref)."""
    existing = db.q1("SELECT id FROM journal_entries WHERE source_type=? AND source_ref=?", (source_type, source_ref))
    if existing:
        return existing["id"]
    deb = sum(int(l.get("debit", 0)) for l in lines)
    cred = sum(int(l.get("credit", 0)) for l in lines)
    if deb != cred or deb == 0:
        raise UnbalancedEntry(f"debit {deb} != credit {cred} (or zero) for {source_type}:{source_ref}")
    for l in lines:
        if int(l.get("debit", 0)) < 0 or int(l.get("credit", 0)) < 0:
            raise UnbalancedEntry("negative line amounts are not allowed")
    with db.tx():
        eid = db.ex("INSERT INTO journal_entries(entry_date, memo, source_type, source_ref, status, reverses_id, created_by, created_at) "
                    "VALUES(?,?,?,?,'draft',?,?,?)", (entry_date[:10], memo, source_type, source_ref, reverses_id, created_by, now()))
        for l in lines:
            db.ex("INSERT INTO journal_lines(entry_id, account_id, debit_cents, credit_cents, currency, orig_amount_cents, orig_currency, fx_rate, memo) "
                  "VALUES(?,?,?,?,?,?,?,?,?)", (eid, acct(l["code"]), int(l.get("debit", 0)), int(l.get("credit", 0)), base_ccy(),
                                                l.get("orig_amount_cents"), l.get("orig_currency"), str(l["fx_rate"]) if l.get("fx_rate") else None,
                                                l.get("memo")))
        if post:
            db.ex("UPDATE journal_entries SET status='posted', posted_at=? WHERE id=?", (now(), eid))
    audit(created_by, "journal.create", "journal_entry", eid, {"source": f"{source_type}:{source_ref}", "amount": deb, "posted": post})
    return eid


def reverse(entry_id: int, reason: str, actor: str) -> int:
    """Financial correction: human-authorized reversal (PRD 9.5). AI may only propose."""
    if actor != "human":
        raise PermissionError("financial corrections must be authorized by the owner")
    check("human", "financial_correction")
    e = db.q1("SELECT * FROM journal_entries WHERE id=?", (entry_id,))
    if not e or e["status"] != "posted":
        raise ValueError("only posted entries can be reversed")
    if db.q1("SELECT 1 FROM journal_entries WHERE reverses_id=?", (entry_id,)):
        raise ValueError("entry already reversed")
    lines = db.q("SELECT a.code, l.* FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE entry_id=?", (entry_id,))
    rev = [{"code": l["code"], "debit": l["credit_cents"], "credit": l["debit_cents"], "orig_amount_cents": l["orig_amount_cents"],
            "orig_currency": l["orig_currency"], "fx_rate": l["fx_rate"], "memo": "reversal"} for l in lines]
    rid = create_entry(date.today().isoformat(), f"Reversal of #{entry_id}: {reason}", "reversal", str(entry_id), rev, actor,
                       reverses_id=entry_id)
    audit(actor, "journal.reverse", "journal_entry", entry_id, {"reversal_id": rid, "reason": reason})
    return rid


def _classify_etsy(ledger_type: str, amount: int) -> tuple[str, str] | None:
    t = (ledger_type or "").strip().lower()
    if t.startswith(FEE_PREFIXES) or "fee" in t:  # checked first: "PaymentProcessingFee" starts with "payment"
        return ("5000", "1100") if amount < 0 else ("1100", "5000")  # fee or fee credit
    for k, rule in ETSY_RULES.items():
        if t.startswith(k):
            return rule
    return None


@handler("accounting_post_etsy", lane="io", agent="Judith", max_attempts=3)
def job_post_etsy(payload, job):
    rows = db.q("SELECT * FROM etsy_ledger_entries WHERE posted_journal_id IS NULL ORDER BY created_ts")
    posted, unknown, missing_fx = 0, [], []
    for e in rows:
        rule = _classify_etsy(e["ledger_type"], e["amount_cents"])
        if not rule:
            unknown.append(e["ledger_type"])
            continue
        amt = abs(int(e["amount_cents"]))
        if amt == 0:
            continue
        ccy = e["currency"] or base_ccy()
        rate = fx_rate(e["created_ts"], ccy)
        if rate is None:
            missing_fx.append(f"{ccy} {e['created_ts'][:10]}")
            continue
        base_amt = convert(amt, rate)
        dr, cr = rule
        t = (e["ledger_type"] or "").lower()
        natural_positive = t.startswith(("payment", "sale"))
        is_fee = dr == "5000" or cr == "5000"
        if not is_fee and (natural_positive != (e["amount_cents"] > 0)):
            dr, cr = cr, dr
        extra = {"orig_amount_cents": amt, "orig_currency": ccy, "fx_rate": rate} if ccy != base_ccy() else {}
        eid = create_entry(e["created_ts"], f"Etsy {e['ledger_type']}: {e['description'] or ''}"[:200], "etsy_ledger", e["etsy_entry_id"],
                           [{"code": dr, "debit": base_amt, **extra}, {"code": cr, "credit": base_amt, **extra}], "ai:Judith")
        db.ex("UPDATE etsy_ledger_entries SET posted_journal_id=? WHERE id=?", (eid, e["id"]))
        db.ex("INSERT OR IGNORE INTO transactions(txn_date, kind, description, amount_cents, currency, source_type, source_ref, journal_id, created_at) "
              "VALUES(?,?,?,?,?,?,?,?,?)", (e["created_ts"][:10], e["ledger_type"] or "", e["description"], int(e["amount_cents"]), ccy,
                                           "etsy_ledger", e["etsy_entry_id"], eid, now()))
        if t.startswith(("disbursement", "deposit")):
            db.ex("INSERT OR IGNORE INTO payouts(payout_ref, payout_date, amount_cents, currency, source, created_at) VALUES(?,?,?,?,?,?)",
                  (e["etsy_entry_id"], e["created_ts"][:10], amt, ccy, e["source"], now()))
        posted += 1
    if unknown:
        notify("warning", "Unmapped Etsy ledger types", ", ".join(sorted(set(unknown))), "/accounting")
    if missing_fx:
        notify("warning", "Exchange rate missing", ", ".join(sorted(set(missing_fx))[:10]), "/accounting")
    if posted:
        reconcile()  # keep reconciliation current with the freshly posted ledger
    return {"posted": posted, "unknown_types": sorted(set(unknown)), "missing_fx": sorted(set(missing_fx))}


# ---------- expenses ----------

class ExpenseClass(BaseModel):
    account_code: str
    confidence: float = Field(ge=0, le=1)
    reason: str


def add_expense(expense_date: str, vendor: str, description: str, amount: str, currency: str, actor: str = "human",
                account_code: str | None = None, receipt_ref: str = "") -> int:
    cents = to_cents(amount)
    if cents <= 0:
        raise ValueError("amount must be positive")
    xid = db.ex("INSERT INTO expenses(expense_date, vendor, description, amount_cents, currency, account_code, status, receipt_ref, created_at) "
                "VALUES(?,?,?,?,?,?, 'pending', ?, ?)", (expense_date, vendor, description, cents, currency.upper(), account_code, receipt_ref, now()))
    audit(actor, "expense.add", "expense", xid, {"amount": cents, "currency": currency})
    if not account_code:
        from ..jobs import enqueue
        enqueue("expense_classify", {"expense_id": xid}, idempotency_key=f"classify:{xid}", actor=actor)
    return xid


def post_expense(expense_id: int, account_code: str, actor: str, paid_from: str = "1010") -> int:
    x = db.q1("SELECT * FROM expenses WHERE id=?", (expense_id,))
    if not x or x["status"] != "pending":
        raise ValueError("expense not pending")
    a = db.q1("SELECT type FROM accounts WHERE code=?", (account_code,))
    if not a or a["type"] != "expense":
        raise ValueError("choose an expense account")
    rate = fx_rate(x["expense_date"], x["currency"])
    if rate is None:
        raise ValueError(f"exchange rate {x['currency']}->{base_ccy()} missing for {x['expense_date']} - add it first")
    amt = convert(x["amount_cents"], rate)
    extra = {"orig_amount_cents": x["amount_cents"], "orig_currency": x["currency"], "fx_rate": rate} if x["currency"] != base_ccy() else {}
    eid = create_entry(x["expense_date"], f"Expense: {x['vendor'] or ''} {x['description']}"[:200], "expense", str(expense_id),
                       [{"code": account_code, "debit": amt, **extra}, {"code": paid_from, "credit": amt, **extra}], actor)
    db.ex("UPDATE expenses SET status='posted', account_code=?, journal_id=? WHERE id=?", (account_code, eid, expense_id))
    return eid


@handler("expense_classify", lane="ai", agent="Judith", max_attempts=2)
def job_classify(payload, job):
    x = db.q1("SELECT * FROM expenses WHERE id=?", (payload["expense_id"],))
    accounts = [dict(r) for r in db.q("SELECT code, name FROM accounts WHERE type='expense' AND active=1")]
    codes = {a["code"] for a in accounts}

    def demo():
        d = (x["description"] + " " + (x["vendor"] or "")).lower()
        code = "5100" if any(w in d for w in ("ads", "pinterest", "marketing", "promo")) else \
               "5200" if any(w in d for w in ("software", "subscription", "app", "license")) else "5300"
        return {"account_code": code, "confidence": 0.7, "reason": "DEMO keyword rule"}

    res, meta = run_task("expense_classify", "Bookkeeper", "Pick the best expense account code for this expense.",
                         {"expense": {"vendor": x["vendor"], "description": x["description"]}, "accounts": accounts},
                         ExpenseClass, demo=demo, job_id=job["id"],
                         extra_check=lambda o: [] if o.account_code in codes else [f"account_code must be one of {sorted(codes)}"])
    db.ex("UPDATE expenses SET ai_suggestion=? WHERE id=?", (dumps(res.model_dump() | {"model": meta["model"]}), x["id"]))
    # Rule: AI may post only high-confidence classifications (accounting_entry = execute within rules)
    if res.confidence >= 0.85 and check("ai", "accounting_entry") == "allow":
        try:
            post_expense(x["id"], res.account_code, "ai:Judith")
            return {"posted": True, **res.model_dump()}
        except ValueError as e:
            return {"posted": False, "error": str(e), **res.model_dump()}
    return {"posted": False, **res.model_dump()}


# ---------- bank import & reconciliation ----------

def import_bank_csv(text: str, currency: str) -> dict:
    rd = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    cols = {c.lower().strip(): c for c in (rd.fieldnames or [])}
    dcol = next((cols[c] for c in cols if c in ("date", "tanggal", "posting date", "transaction date")), None)
    acol = next((cols[c] for c in cols if c in ("amount", "jumlah", "nominal", "value")), None)
    desc = next((cols[c] for c in cols if c in ("description", "keterangan", "memo", "details")), None)
    if not dcol or not acol:
        raise ValueError(f"CSV needs 'date' and 'amount' columns, found {rd.fieldnames}")
    batch = now()
    added = dup = 0
    for row in rd:
        d = _parse_date(row[dcol])
        amt = to_cents(row[acol])
        h = sha256_text(f"{d}|{amt}|{row.get(desc, '') if desc else ''}|{currency}")
        try:
            db.ex("INSERT INTO bank_lines(line_date, description, amount_cents, currency, import_batch, line_hash, created_at) VALUES(?,?,?,?,?,?,?)",
                  (d, row.get(desc, "") if desc else "", amt, currency.upper(), batch, h, now()))
            added += 1
        except Exception:  # noqa: BLE001 - duplicate line
            dup += 1
    audit("human", "bank.import", "bank_lines", batch, {"added": added, "duplicates": dup})
    return {"added": added, "duplicates": dup}


def _parse_date(s: str) -> str:
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y", "%b %d, %Y", "%d %b %Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"unrecognised date '{s}'")


@handler("reconcile", lane="io", agent="Judith", max_attempts=2)
def job_reconcile(payload, job):
    return reconcile()


def reconcile(window_days: int = 5) -> dict:
    db.ex("DELETE FROM reconciliation_records WHERE status IN ('matched','unmatched','difference')")
    bank = [dict(r) for r in db.q("SELECT * FROM bank_lines WHERE amount_cents > 0")]
    used = set()
    matched = unmatched = 0
    for p in db.q("SELECT * FROM payouts ORDER BY payout_date"):
        pd = date.fromisoformat(p["payout_date"])
        cand = [b for b in bank if b["id"] not in used and b["currency"] == p["currency"]
                and abs((date.fromisoformat(b["line_date"]) - pd).days) <= window_days]
        exact = next((b for b in cand if b["amount_cents"] == p["amount_cents"]), None)
        near = exact or next((b for b in sorted(cand, key=lambda b: abs(b["amount_cents"] - p["amount_cents"]))
                              if abs(b["amount_cents"] - p["amount_cents"]) <= max(100, p["amount_cents"] * 0.02)), None)
        if near:
            used.add(near["id"])
            diff = near["amount_cents"] - p["amount_cents"]
            db.ex("INSERT INTO reconciliation_records(kind, ref_a, ref_b, amount_a_cents, amount_b_cents, difference_cents, status, note, created_at) "
                  "VALUES('payout_bank',?,?,?,?,?,?,?,?)", (p["payout_ref"], f"bank:{near['id']}", p["amount_cents"], near["amount_cents"], diff,
                                                           "matched" if diff == 0 else "difference", near["description"], now()))
            matched += 1
        else:
            db.ex("INSERT INTO reconciliation_records(kind, ref_a, amount_a_cents, difference_cents, status, note, created_at) "
                  "VALUES('payout_bank',?,?,?, 'unmatched', 'no bank line found', ?)", (p["payout_ref"], p["amount_cents"], -p["amount_cents"], now()))
            unmatched += 1
    # Etsy balance check: our Etsy Receivables vs Etsy's own running balance
    last = db.q1("SELECT balance_cents, created_ts FROM etsy_ledger_entries WHERE balance_cents IS NOT NULL ORDER BY created_ts DESC, id DESC LIMIT 1")
    if last:
        ours = balance_of("1100")
        diff = ours - int(last["balance_cents"])
        db.ex("INSERT INTO reconciliation_records(kind, ref_a, ref_b, amount_a_cents, amount_b_cents, difference_cents, status, note, created_at) "
              "VALUES('etsy_balance','ledger:1100','etsy_balance',?,?,?,?,?,?)",
              (ours, int(last["balance_cents"]), diff, "matched" if diff == 0 else "difference",
               "Difference can come from history before the first sync (opening balance).", now()))
    audit("system", "accounting.reconcile", "reconciliation", None, {"matched": matched, "unmatched": unmatched})
    return {"matched": matched, "unmatched": unmatched}


# ---------- reports ----------

def balance_of(code: str, upto: str | None = None) -> int:
    row = db.q1("SELECT COALESCE(SUM(l.debit_cents - l.credit_cents),0) b FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id "
                "JOIN accounts a ON a.id=l.account_id WHERE e.status='posted' AND a.code=? AND (? IS NULL OR e.entry_date<=?)",
                (code, upto, upto))
    return int(row["b"])


def trial_balance(upto: str | None = None) -> dict:
    rows = db.q("SELECT a.code, a.name, a.type, COALESCE(SUM(l.debit_cents),0) d, COALESCE(SUM(l.credit_cents),0) c FROM accounts a "
                "LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.entry_id "
                "WHERE (e.id IS NULL OR (e.status='posted' AND (? IS NULL OR e.entry_date<=?))) GROUP BY a.id ORDER BY a.code", (upto, upto))
    lines = [dict(r) for r in rows]
    td, tc = sum(r["d"] for r in lines), sum(r["c"] for r in lines)
    return {"lines": lines, "total_debit": td, "total_credit": tc, "balanced": td == tc}


def _period_sums(start: str, end: str):
    rows = db.q("SELECT a.code, a.name, a.type, SUM(l.debit_cents) d, SUM(l.credit_cents) c FROM journal_lines l "
                "JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id "
                "WHERE e.status='posted' AND e.entry_date BETWEEN ? AND ? GROUP BY a.id ORDER BY a.code", (start, end))
    return [dict(r) for r in rows]


def profit_and_loss(start: str, end: str) -> dict:
    s = _period_sums(start, end)
    rev = [{"code": r["code"], "name": r["name"], "amount": r["c"] - r["d"]} for r in s if r["type"] == "revenue"]
    contra = [{"code": r["code"], "name": r["name"], "amount": r["d"] - r["c"]} for r in s if r["type"] == "contra_revenue"]
    exp = [{"code": r["code"], "name": r["name"], "amount": r["d"] - r["c"]} for r in s if r["type"] == "expense"]
    gross = sum(x["amount"] for x in rev)
    net_rev = gross - sum(x["amount"] for x in contra)
    total_exp = sum(x["amount"] for x in exp)
    return {"start": start, "end": end, "revenue": rev, "contra_revenue": contra, "expenses": exp, "gross_revenue": gross,
            "net_revenue": net_rev, "total_expenses": total_exp, "net_profit": net_rev - total_exp}


def balance_sheet(asof: str) -> dict:
    tb = trial_balance(asof)
    assets = [{"code": r["code"], "name": r["name"], "amount": r["d"] - r["c"]} for r in tb["lines"] if r["type"] == "asset"]
    liab = [{"code": r["code"], "name": r["name"], "amount": r["c"] - r["d"]} for r in tb["lines"] if r["type"] == "liability"]
    eq = [{"code": r["code"], "name": r["name"], "amount": r["c"] - r["d"]} for r in tb["lines"] if r["type"] == "equity"]
    retained = sum(r["c"] - r["d"] for r in tb["lines"] if r["type"] in ("revenue", "contra_revenue", "expense"))
    ta = sum(x["amount"] for x in assets)
    tl = sum(x["amount"] for x in liab)
    te = sum(x["amount"] for x in eq) + retained
    return {"asof": asof, "assets": assets, "liabilities": liab, "equity": eq, "retained_earnings": retained,
            "total_assets": ta, "total_liabilities": tl, "total_equity": te, "balanced": ta == tl + te}


def cash_flow(start: str, end: str) -> dict:
    """Direct method on Cash + Bank + Etsy payment account."""
    cash_codes = ("1000", "1010", "1100")
    rows = db.q("SELECT e.id, a.code, a.type, l.debit_cents d, l.credit_cents c FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id "
                "JOIN accounts a ON a.id=l.account_id WHERE e.status='posted' AND e.entry_date BETWEEN ? AND ?", (start, end))
    by_entry = defaultdict(list)
    for r in rows:
        by_entry[r["id"]].append(r)
    flows = defaultdict(int)
    for lines in by_entry.values():
        cash = sum(l["d"] - l["c"] for l in lines if l["code"] in cash_codes)
        if cash == 0:
            continue
        other = next((l for l in lines if l["code"] not in cash_codes), None)
        cat = "operating" if not other or other["type"] in ("revenue", "contra_revenue", "expense", "liability") else "financing"
        flows[cat] += cash
    opening = sum(balance_of(c, (date.fromisoformat(start) - timedelta(days=1)).isoformat()) for c in cash_codes)
    closing = sum(balance_of(c, end) for c in cash_codes)
    return {"start": start, "end": end, "opening": opening, "operating": flows["operating"], "financing": flows["financing"],
            "net_change": flows["operating"] + flows["financing"], "closing": closing}


def fee_report(start: str, end: str) -> list[dict]:
    rows = db.q("SELECT ledger_type, COUNT(*) n, SUM(amount_cents) total FROM etsy_ledger_entries WHERE substr(created_ts,1,10) BETWEEN ? AND ? "
                "AND amount_cents < 0 AND lower(ledger_type) NOT LIKE 'disburs%' AND lower(ledger_type) NOT LIKE 'refund%' GROUP BY ledger_type ORDER BY total", (start, end))
    return [dict(r) for r in rows]


def product_profitability(start: str, end: str) -> list[dict]:
    """Revenue per listing from receipt items (verified) and fees allocated pro-rata by revenue (estimated)."""
    rows = [dict(r) for r in db.q(
        "SELECT ri.etsy_listing_id, MAX(ri.title) title, SUM(ri.quantity) units, SUM(ri.price_cents*ri.quantity) revenue FROM receipt_items ri "
        "JOIN receipts r ON r.id=ri.receipt_id WHERE substr(r.created_ts,1,10) BETWEEN ? AND ? GROUP BY ri.etsy_listing_id ORDER BY revenue DESC", (start, end))]
    total_rev = sum(r["revenue"] or 0 for r in rows)
    fees = -sum(r["total"] or 0 for r in fee_report(start, end))
    for r in rows:
        r["allocated_fees_estimated"] = int(round(fees * (r["revenue"] or 0) / total_rev)) if total_rev else 0
        r["contribution_estimated"] = (r["revenue"] or 0) - r["allocated_fees_estimated"]
    return rows


def tax_summary(start: str, end: str) -> dict:
    pl = profit_and_loss(start, end)
    tax_collected = db.q1("SELECT COALESCE(SUM(tax_cents),0) t FROM receipts WHERE substr(created_ts,1,10) BETWEEN ? AND ?", (start, end))["t"]
    return {"start": start, "end": end, "gross_revenue": pl["gross_revenue"],
            "refunds": sum(x["amount"] for x in pl["contra_revenue"]), "expenses_by_account": pl["expenses"],
            "net_profit": pl["net_profit"], "buyer_tax_on_receipts": tax_collected,
            "note": "Sales tax/VAT shown on receipts is usually collected and remitted by Etsy as marketplace facilitator. "
                    "This is a preparation summary, not tax advice."}


def to_beancount() -> str:
    out = [f'option "operating_currency" "{base_ccy()}"', ""]
    names = {}
    for a in db.q("SELECT code, name, type FROM accounts"):
        root = {"asset": "Assets", "liability": "Liabilities", "equity": "Equity", "revenue": "Income", "contra_revenue": "Income",
                "expense": "Expenses"}[a["type"]]
        nm = "".join(ch for ch in a["name"].title() if ch.isalnum())
        names[a["code"]] = f"{root}:A{a['code']}-{nm}"
        out.append(f"2000-01-01 open {names[a['code']]}")
    out.append("")
    for e in db.q("SELECT * FROM journal_entries WHERE status='posted' ORDER BY entry_date, id"):
        out.append(f'{e["entry_date"]} * "{e["memo"].replace(chr(34), chr(39))}"')
        out.append(f'  source: "{e["source_type"]}:{e["source_ref"]}"')
        for l in db.q("SELECT a.code, l.* FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE entry_id=?", (e["id"],)):
            amt = l["debit_cents"] - l["credit_cents"]
            out.append(f"  {names[l['code']]}  {amt / 100:.2f} {l['currency']}")
        out.append("")
    return "\n".join(out)
