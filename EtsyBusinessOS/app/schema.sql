PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);

-- ===== System =====
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS permissions (id INTEGER PRIMARY KEY, action TEXT UNIQUE NOT NULL, ai_level TEXT NOT NULL, human_level TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS system_settings (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, changed_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_connections (
  id INTEGER PRIMARY KEY, platform TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'not_connected',
  account_name TEXT, account_id TEXT, scopes TEXT, last_ok_at TEXT, last_error TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credentials (name TEXT PRIMARY KEY, secret BLOB NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL, lane TEXT NOT NULL DEFAULT 'io', state TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5, payload TEXT NOT NULL DEFAULT '{}', result TEXT, error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5,
  idempotency_key TEXT UNIQUE, agent TEXT, parent_id INTEGER REFERENCES jobs(id),
  run_after TEXT NOT NULL, started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (state IN ('QUEUED','RUNNING','VALIDATING','WAITING_APPROVAL','APPROVED','PUBLISHED','DONE','FAILED','RETRYING','CANCELLED')));
CREATE INDEX IF NOT EXISTS ix_jobs_pick ON jobs(lane, state, run_after, priority);
CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id), state TEXT NOT NULL, message TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_job_events_job ON job_events(job_id);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT, entity_id TEXT,
  detail TEXT, outcome TEXT NOT NULL DEFAULT 'ok', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_audit_time ON audit_logs(created_at);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, level TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_runs (
  id INTEGER PRIMARY KEY, task TEXT NOT NULL, model TEXT NOT NULL, prompt_chars INTEGER, ok INTEGER NOT NULL,
  attempts INTEGER NOT NULL, duration_ms INTEGER, tokens_per_sec REAL, error TEXT, output TEXT, job_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS benchmarks (id INTEGER PRIMARY KEY, model TEXT NOT NULL, result TEXT NOT NULL, passed INTEGER NOT NULL, created_at TEXT NOT NULL);

-- ===== Shop management =====
CREATE TABLE IF NOT EXISTS shops (id INTEGER PRIMARY KEY, etsy_shop_id TEXT UNIQUE, name TEXT NOT NULL, currency TEXT, url TEXT, raw TEXT, synced_at TEXT);
CREATE TABLE IF NOT EXISTS shop_profiles (id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id), title TEXT, announcement TEXT, raw TEXT, captured_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, facts TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY, shop_id INTEGER REFERENCES shops(id), product_id INTEGER REFERENCES products(id),
  etsy_listing_id TEXT UNIQUE, state TEXT NOT NULL DEFAULT 'draft', current_version_id INTEGER,
  title TEXT, price_cents INTEGER, currency TEXT, url TEXT, views INTEGER, num_favorers INTEGER, raw TEXT,
  last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (state IN ('draft','pending_approval','approved','publishing','active','expired','inactive','deactivated','sold_out','failed','rejected','revision_requested','etsy_draft')));
CREATE TABLE IF NOT EXISTS listing_versions (
  id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id), version INTEGER NOT NULL,
  content TEXT NOT NULL, content_hash TEXT NOT NULL, validation TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(listing_id, version));
CREATE TABLE IF NOT EXISTS listing_approvals (
  id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id), version_id INTEGER NOT NULL REFERENCES listing_versions(id),
  content_hash TEXT NOT NULL, decision TEXT NOT NULL, note TEXT, decided_by TEXT NOT NULL, valid INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
  CHECK (decision IN ('approve','reject','request_revision')));
CREATE TABLE IF NOT EXISTS listing_images (id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id), asset_id INTEGER REFERENCES social_assets(id), rank INTEGER, etsy_image_id TEXT, uploaded_at TEXT);
CREATE TABLE IF NOT EXISTS listing_videos (id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id), asset_id INTEGER REFERENCES social_assets(id), etsy_video_id TEXT, uploaded_at TEXT);
CREATE TABLE IF NOT EXISTS listing_files (id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id), asset_id INTEGER REFERENCES social_assets(id), etsy_file_id TEXT, uploaded_at TEXT);
CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY, etsy_receipt_id TEXT UNIQUE NOT NULL, created_ts TEXT NOT NULL, status TEXT,
  grandtotal_cents INTEGER, subtotal_cents INTEGER, shipping_cents INTEGER, tax_cents INTEGER, discount_cents INTEGER,
  currency TEXT, is_paid INTEGER, refunded_cents INTEGER NOT NULL DEFAULT 0, buyer_country TEXT, raw TEXT, source TEXT NOT NULL, synced_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS receipt_items (
  id INTEGER PRIMARY KEY, receipt_id INTEGER NOT NULL REFERENCES receipts(id), etsy_transaction_id TEXT UNIQUE,
  etsy_listing_id TEXT, title TEXT, quantity INTEGER, price_cents INTEGER, currency TEXT);
CREATE TABLE IF NOT EXISTS etsy_ledger_entries (
  id INTEGER PRIMARY KEY, etsy_entry_id TEXT UNIQUE NOT NULL, created_ts TEXT NOT NULL, ledger_type TEXT, description TEXT,
  amount_cents INTEGER NOT NULL, balance_cents INTEGER, currency TEXT, reference_id TEXT, raw TEXT, posted_journal_id INTEGER, source TEXT NOT NULL, synced_at TEXT NOT NULL);

-- ===== Research =====
CREATE TABLE IF NOT EXISTS research_sources (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, url TEXT, access_method TEXT NOT NULL, permission_status TEXT NOT NULL,
  tos_reference TEXT, robots_policy TEXT, rate_limit TEXT, last_access TEXT, data_freshness TEXT, notes TEXT,
  CHECK (permission_status IN ('allowed','manual_only','denied','unknown')));
CREATE TABLE IF NOT EXISTS research_permissions (id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES research_sources(id), checked_at TEXT NOT NULL, result TEXT NOT NULL, detail TEXT);
CREATE TABLE IF NOT EXISTS research_jobs (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, query TEXT NOT NULL, job_id INTEGER REFERENCES jobs(id), status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_results (
  id INTEGER PRIMARY KEY, research_job_id INTEGER NOT NULL REFERENCES research_jobs(id), source_id INTEGER REFERENCES research_sources(id),
  label TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, captured_at TEXT NOT NULL,
  CHECK (label IN ('verified','estimated','ai_interpretation','hypothesis')));
CREATE TABLE IF NOT EXISTS keywords (id INTEGER PRIMARY KEY, keyword TEXT UNIQUE NOT NULL, kind TEXT, intent TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS keyword_history (
  id INTEGER PRIMARY KEY, keyword_id INTEGER NOT NULL REFERENCES keywords(id), research_job_id INTEGER REFERENCES research_jobs(id),
  listing_count INTEGER, sample_size INTEGER, tag_frequency INTEGER, avg_price_cents INTEGER, median_price_cents INTEGER,
  avg_favorers REAL, label TEXT NOT NULL, source TEXT NOT NULL, captured_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS competitor_references (
  id INTEGER PRIMARY KEY, etsy_listing_id TEXT NOT NULL, url TEXT, title TEXT, price_cents INTEGER, currency TEXT, tags TEXT,
  num_favorers INTEGER, views INTEGER, shop_id TEXT, method TEXT NOT NULL, source TEXT NOT NULL, research_job_id INTEGER REFERENCES research_jobs(id), captured_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_comp_listing ON competitor_references(etsy_listing_id);
CREATE TABLE IF NOT EXISTS market_reports (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, query TEXT, body TEXT NOT NULL, research_job_id INTEGER REFERENCES research_jobs(id), created_at TEXT NOT NULL);

-- ===== Assets & social =====
CREATE TABLE IF NOT EXISTS social_assets (
  id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, root TEXT NOT NULL, rel_path TEXT NOT NULL, file_type TEXT NOT NULL, kind TEXT NOT NULL,
  size_bytes INTEGER, sha256 TEXT NOT NULL, mtime REAL, width INTEGER, height INTEGER, duration_s REAL, pages INTEGER,
  text_excerpt TEXT, meta TEXT, product_id INTEGER REFERENCES products(id), marketing_ready INTEGER NOT NULL DEFAULT 0,
  compat TEXT, version INTEGER NOT NULL DEFAULT 1, missing INTEGER NOT NULL DEFAULT 0, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_assets_hash ON social_assets(sha256);
CREATE TABLE IF NOT EXISTS asset_versions (id INTEGER PRIMARY KEY, asset_id INTEGER NOT NULL REFERENCES social_assets(id), version INTEGER NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER, seen_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS social_accounts (id INTEGER PRIMARY KEY, platform TEXT UNIQUE NOT NULL, account_name TEXT, account_id TEXT, status TEXT NOT NULL, reason TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_items (id INTEGER PRIMARY KEY, asset_id INTEGER NOT NULL REFERENCES social_assets(id), product_id INTEGER REFERENCES products(id), goal TEXT, understanding TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_variants (
  id INTEGER PRIMARY KEY, content_item_id INTEGER NOT NULL REFERENCES content_items(id), platform TEXT NOT NULL,
  title TEXT, caption TEXT, description TEXT, hashtags TEXT, keywords TEXT, cta TEXT, link TEXT,
  content_hash TEXT NOT NULL, validation TEXT, status TEXT NOT NULL DEFAULT 'ready', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS publishing_calendar (
  id INTEGER PRIMARY KEY, variant_id INTEGER NOT NULL REFERENCES content_variants(id), platform TEXT NOT NULL, scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', job_id INTEGER REFERENCES jobs(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS publishing_jobs (id INTEGER PRIMARY KEY, calendar_id INTEGER NOT NULL REFERENCES publishing_calendar(id), job_id INTEGER REFERENCES jobs(id), attempt INTEGER NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS published_posts (
  id INTEGER PRIMARY KEY, platform TEXT NOT NULL, variant_id INTEGER NOT NULL REFERENCES content_variants(id), asset_sha256 TEXT NOT NULL,
  content_hash TEXT NOT NULL, post_id TEXT NOT NULL, url TEXT, published_at TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, verified_at TEXT, raw TEXT,
  UNIQUE(platform, asset_sha256), UNIQUE(platform, content_hash));
CREATE TABLE IF NOT EXISTS social_metrics (
  id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES published_posts(id), captured_at TEXT NOT NULL,
  impressions INTEGER, views INTEGER, engagements INTEGER, saves INTEGER, clicks INTEGER, outbound_clicks INTEGER, likes INTEGER, comments INTEGER, raw TEXT);

-- ===== Analytics =====
CREATE TABLE IF NOT EXISTS sales_snapshots (id INTEGER PRIMARY KEY, period TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS listing_metrics (id INTEGER PRIMARY KEY, etsy_listing_id TEXT NOT NULL, captured_on TEXT NOT NULL, views INTEGER, num_favorers INTEGER, price_cents INTEGER, source TEXT NOT NULL, UNIQUE(etsy_listing_id, captured_on, source));
CREATE TABLE IF NOT EXISTS traffic_metrics (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'all', visits INTEGER, views INTEGER, orders INTEGER, revenue_cents INTEGER,
  source TEXT NOT NULL, import_batch TEXT, created_at TEXT NOT NULL, UNIQUE(day, channel, source));
CREATE TABLE IF NOT EXISTS search_terms (id INTEGER PRIMARY KEY, period_start TEXT, period_end TEXT, term TEXT NOT NULL, visits INTEGER, source TEXT NOT NULL, import_batch TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_performance (id INTEGER PRIMARY KEY, period_start TEXT NOT NULL, period_end TEXT NOT NULL, etsy_listing_id TEXT, title TEXT, units INTEGER, revenue_cents INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analytics_reports (id INTEGER PRIMARY KEY, period_start TEXT NOT NULL, period_end TEXT NOT NULL, kpis TEXT NOT NULL, interpretation TEXT, created_at TEXT NOT NULL);

-- ===== Accounting =====
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  CHECK (type IN ('asset','liability','equity','revenue','expense','contra_revenue')));
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY, entry_date TEXT NOT NULL, memo TEXT NOT NULL, source_type TEXT NOT NULL, source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', reverses_id INTEGER REFERENCES journal_entries(id), created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, posted_at TEXT, UNIQUE(source_type, source_ref), CHECK (status IN ('draft','posted')));
CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES journal_entries(id), account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit_cents INTEGER NOT NULL DEFAULT 0, credit_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL,
  orig_amount_cents INTEGER, orig_currency TEXT, fx_rate TEXT, memo TEXT,
  CHECK (debit_cents >= 0 AND credit_cents >= 0 AND (debit_cents = 0 OR credit_cents = 0)));
CREATE TRIGGER IF NOT EXISTS je_posted_no_update BEFORE UPDATE ON journal_entries WHEN OLD.status = 'posted'
  BEGIN SELECT RAISE(ABORT, 'posted journal entries are immutable; use a reversal'); END;
CREATE TRIGGER IF NOT EXISTS je_posted_no_delete BEFORE DELETE ON journal_entries WHEN OLD.status = 'posted'
  BEGIN SELECT RAISE(ABORT, 'posted journal entries are immutable; use a reversal'); END;
CREATE TRIGGER IF NOT EXISTS jl_posted_no_update BEFORE UPDATE ON journal_lines
  WHEN (SELECT status FROM journal_entries WHERE id = OLD.entry_id) = 'posted'
  BEGIN SELECT RAISE(ABORT, 'lines of posted entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS jl_posted_no_delete BEFORE DELETE ON journal_lines
  WHEN (SELECT status FROM journal_entries WHERE id = OLD.entry_id) = 'posted'
  BEGIN SELECT RAISE(ABORT, 'lines of posted entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS jl_posted_no_insert BEFORE INSERT ON journal_lines
  WHEN (SELECT status FROM journal_entries WHERE id = NEW.entry_id) = 'posted'
  BEGIN SELECT RAISE(ABORT, 'cannot add lines to a posted entry'); END;
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY, txn_date TEXT NOT NULL, kind TEXT NOT NULL, description TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL,
  source_type TEXT NOT NULL, source_ref TEXT NOT NULL, journal_id INTEGER REFERENCES journal_entries(id), created_at TEXT NOT NULL, UNIQUE(source_type, source_ref));
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, expense_date TEXT NOT NULL, vendor TEXT, description TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL,
  fx_rate TEXT, account_code TEXT, ai_suggestion TEXT, status TEXT NOT NULL DEFAULT 'pending', receipt_ref TEXT, journal_id INTEGER REFERENCES journal_entries(id), created_at TEXT NOT NULL,
  CHECK (status IN ('pending','posted','rejected')));
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, etsy_payment_id TEXT UNIQUE, etsy_receipt_id TEXT, amount_gross_cents INTEGER, amount_fees_cents INTEGER, amount_net_cents INTEGER, currency TEXT, created_ts TEXT, raw TEXT, synced_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payouts (id INTEGER PRIMARY KEY, payout_ref TEXT UNIQUE NOT NULL, payout_date TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_lines (id INTEGER PRIMARY KEY, line_date TEXT NOT NULL, description TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, import_batch TEXT NOT NULL, line_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exchange_rates (id INTEGER PRIMARY KEY, rate_date TEXT NOT NULL, base TEXT NOT NULL, quote TEXT NOT NULL, rate TEXT NOT NULL, source TEXT NOT NULL, UNIQUE(rate_date, base, quote));
CREATE TABLE IF NOT EXISTS reconciliation_records (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref_a TEXT, ref_b TEXT, amount_a_cents INTEGER, amount_b_cents INTEGER, difference_cents INTEGER NOT NULL,
  status TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL);
