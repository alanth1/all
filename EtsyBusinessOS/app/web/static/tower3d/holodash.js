// NEONLOOM HoloDash: every dashboard of the business is a full hologram projected inside the tower.
// Each room's NPC "presents" its own dashboard: the camera flies to them, they read the summary aloud.
const T = () => window.tower;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = new Intl.NumberFormat('id-ID');
const RP = v => 'Rp ' + nf.format(Math.round(v || 0));
const RPs = v => { v = v || 0; const a = Math.abs(v); return 'Rp ' + (a >= 1e9 ? (v / 1e9).toFixed(1).replace('.', ',') + ' M' : a >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' jt' : a >= 1e3 ? Math.round(v / 1e3) + ' rb' : nf.format(v)); };
const N = v => v == null ? '—' : nf.format(v);
const PCT = v => v == null ? '—' : (v > 0 ? '+' : '') + String(v).replace('.', ',') + '%';
const STATE_ID = { draft: 'Draft', pending_approval: 'Menunggu approval', approved: 'Disetujui', publishing: 'Dikirim', active: 'LIVE di Etsy', etsy_draft: 'Draft di Etsy', expired: 'Kedaluwarsa', inactive: 'Nonaktif', deactivated: 'Dimatikan', sold_out: 'Habis', failed: 'Gagal', rejected: 'Ditolak', revision_requested: 'Revisi' };
const JOB_ID = { QUEUED: 'Antri', RUNNING: 'Jalan', DONE: 'Selesai', FAILED: 'Gagal', RETRYING: 'Ulang', WAITING_APPROVAL: 'Tunggu approval', CANCELLED: 'Batal', VALIDATING: 'Cek', APPROVED: 'Disetujui', PUBLISHED: 'Terbit' };

let DATA = null, cur = null, saved = null;

// ---------- tiny SVG charts (glowing, animated)
function areaChart(series, col, h = 150) {
  if (!series || !series.length) return '<div class="empty">belum ada data</div>';
  const W = 600, max = Math.max(1, ...series.map(s => s.v)), step = W / Math.max(1, series.length - 1);
  const pts = series.map((s, i) => [i * step, h - 8 - (s.v / max) * (h - 26)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const ticks = series.map((s, i) => i % Math.ceil(series.length / 6) === 0 ? `<text x="${i * step}" y="${h + 12}" fill="#9fdcff" font-size="11" text-anchor="middle" opacity=".7">${esc(s.d)}</text>` : '').join('');
  return `<svg viewBox="0 -6 ${W} ${h + 20}" preserveAspectRatio="none" style="height:${h + 14}px"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".55"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
    <filter id="${id}f"><feGaussianBlur stdDeviation="3"/></filter></defs>
    ${[.25, .5, .75].map(f => `<line x1="0" x2="${W}" y1="${h * f}" y2="${h * f}" stroke="${col}" stroke-opacity=".15" stroke-dasharray="4 6"/>`).join('')}
    <path d="${line} L${W} ${h} L0 ${h} Z" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${col}" stroke-width="5" opacity=".5" filter="url(#${id}f)"/>
    <path d="${line}" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="2000" stroke-dashoffset="2000"><animate attributeName="stroke-dashoffset" to="0" dur="1.6s" fill="freeze"/></path>
    ${pts.map((p, i) => series[i].v ? `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${col}"><title>${esc(series[i].d)}: ${RP(series[i].v)}</title></circle>` : '').join('')}${ticks}</svg>`;
}
function ring(parts, col) {
  const tot = parts.reduce((a, p) => a + p.v, 0); if (!tot) return '<div class="empty">belum ada data</div>';
  let a = -Math.PI / 2; const R = 46, C = 60;
  const arcs = parts.map((p, i) => { const da = p.v / tot * Math.PI * 2, a2 = a + da, big = da > Math.PI ? 1 : 0;
    const d = `M${C + R * Math.cos(a)} ${C + R * Math.sin(a)} A${R} ${R} 0 ${big} 1 ${C + R * Math.cos(a2 - .001)} ${C + R * Math.sin(a2 - .001)}`; a = a2;
    return `<path d="${d}" fill="none" stroke="${p.c || col}" stroke-width="12" opacity="${.95 - i * .1}" style="filter:drop-shadow(0 0 4px ${p.c || col})"/>`; }).join('');
  const leg = parts.map(p => `<div style="display:flex;gap:6px;align-items:center;font-size:11px"><i style="width:9px;height:9px;background:${p.c || col};box-shadow:0 0 6px ${p.c || col}"></i>${esc(p.n)} <b style="margin-left:auto">${N(p.v)}</b></div>`).join('');
  return `<div style="display:flex;gap:14px;align-items:center"><svg viewBox="0 0 120 120" style="width:120px;flex:none"><circle cx="60" cy="60" r="46" fill="none" stroke="${col}" stroke-opacity=".12" stroke-width="12"/>${arcs}<text x="60" y="66" text-anchor="middle" fill="#fff" font-size="20" font-weight="800">${N(tot)}</text></svg><div style="flex:1;display:grid;gap:4px">${leg}</div></div>`;
}
const bars = (rows, col, fmt = N) => { if (!rows.length) return '<div class="empty">belum ada data</div>'; const m = Math.max(1, ...rows.map(r => r.v));
  return rows.map(r => `<div style="margin:6px 0"><div style="display:flex;font-size:12px;gap:8px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.n)}</span><b>${fmt(r.v)}</b></div><div class="bar"><i style="width:${(r.v / m * 100).toFixed(1)}%"></i></div></div>`).join(''); };

const P = (title, inner, cls = '', col) => `<section class="hp ${cls}"${col ? ` style="--c:${col}"` : ''}><h4>${esc(title)}</h4>${inner}</section>`;
const KPI = (title, val, sub = '', cls = '', col) => P(title, `<div class="big" data-count="${typeof val === 'number' ? val : ''}">${typeof val === 'number' ? '0' : esc(val)}</div><div class="sm">${sub}</div>`, cls, col);

// ---------- one dashboard per room / NPC
const SECTIONS = {
  'COMMAND DECK': { key: 'overview', title: 'PUSAT KOMANDO', col: '#3ff0ff',
    say: d => `Ringkasan ${d.period.days} hari. Pendapatan ${RPs(d.overview.revenue)}, laba ${RPs(d.overview.profit)}, ${d.overview.orders} order. ${d.overview.pending ? d.overview.pending + ' listing menunggu approval.' : 'Tidak ada yang menunggu approval.'}`,
    html: d => { const o = d.overview, f = d.finance; return [
      KPI('PENDAPATAN', o.revenue, `pertumbuhan <span class="${o.growth >= 0 ? 'up' : 'down'}">${PCT(o.growth)}</span>`, '', '#3ff0ff'),
      KPI('LABA BERSIH', o.profit, 'setelah biaya Etsy & pengeluaran', '', '#7dffb5'),
      KPI('ORDER', o.orders, `rata-rata ${RPs(d.sales.aov)} / order`, '', '#ffb13f'),
      KPI('MENUNGGU APPROVAL', o.pending, o.pending ? 'klik QA BAY untuk memutuskan' : 'semua beres ✔', '', o.pending ? '#ff3fa4' : '#7dffb5'),
      P('PENDAPATAN HARIAN', areaChart(f.series, '#3ff0ff'), 'w8'),
      P('STATUS LISTING', ring(Object.entries(d.listings.by_state).map(([k, v]) => ({ n: STATE_ID[k] || k, v })), '#3ff0ff'), 'w4'),
      KPI('LISTING LIVE', o.active_listings, 'aktif di Etsy', 'w4', '#b06bff'),
      KPI('ANTRIAN KERJA', o.queue, `${o.failed_jobs} gagal`, 'w4', o.failed_jobs ? '#ff3fa4' : '#3ff0ff'),
      P('3 TOKO · GABUNGAN', shopsTable(d), 'w12'),
      KPI('KUNJUNGAN TOKO', d.data.visits ?? '—', `konversi ${d.data.conversion == null ? '— (impor Shop Stats)' : String(d.data.conversion).replace('.', ',') + '%'}`, 'w4', '#ffb13f'),
    ]; } },
  'FINANCE VAULT': { key: 'finance', title: 'BRANKAS KEUANGAN', col: '#ffb13f',
    say: d => `Laporan keuangan. Pendapatan ${RPs(d.finance.revenue)}, biaya Etsy ${RPs(d.finance.fees)}, laba bersih ${RPs(d.finance.profit)}. Pembukuan ${d.finance.balanced ? 'seimbang' : 'TIDAK seimbang, perlu dicek'}.`,
    html: d => { const f = d.finance; return [
      KPI('PENDAPATAN KOTOR', f.revenue, `${d.period.start} → ${d.period.end}`, '', '#ffb13f'),
      KPI('BIAYA ETSY', f.fees, 'listing, transaksi, iklan', '', '#ff7aa8'),
      KPI('PENGELUARAN LAIN', f.opex, 'biaya operasional', '', '#ff7aa8'),
      KPI('LABA BERSIH', f.profit, f.revenue ? `margin ${Math.round(f.profit / f.revenue * 100)}%` : '', '', '#7dffb5'),
      P('ARUS PENDAPATAN', areaChart(f.series, '#ffb13f', 170), 'w8'),
      P('NERACA', `<table><tr><td>Total aset</td><td class="r">${RP(f.assets)}</td></tr><tr><td>Saldo kas akhir</td><td class="r">${RP(f.cash_close)}</td></tr><tr><td>Perubahan kas</td><td class="r">${RP(f.cash_change)}</td></tr><tr><td>Pajak di struk (dipungut Etsy)</td><td class="r">${RP(f.tax_on_receipts)}</td></tr><tr><td>Status pembukuan</td><td class="r"><span class="tag" style="--c:${f.balanced ? '#7dffb5' : '#ff3fa4'}">${f.balanced ? 'SEIMBANG ✔' : 'TIDAK SEIMBANG'}</span></td></tr></table>`, 'w4'),
      P('LABA RUGI', `<table><tr><td>Pendapatan kotor</td><td class="r">${RP(f.revenue)}</td></tr><tr><td>Pendapatan bersih</td><td class="r">${RP(f.net_revenue)}</td></tr>${f.expenses.map(e => `<tr><td>− ${esc(e.n)}</td><td class="r">${RP(e.v)}</td></tr>`).join('')}<tr><td><b>Laba bersih</b></td><td class="r"><b>${RP(f.profit)}</b></td></tr></table>`, 'w6'),
      P('PENGELUARAN PER JENIS', bars(f.expenses.map(e => ({ n: e.n, v: e.v })), '#ff7aa8', RPs), 'w6'),
      P('PENDAPATAN PER TOKO (semua masuk ke 1 brankas)', bars((d.shops || []).map(x => ({ n: x.name, v: x.revenue })), '#ffb13f', RPs), 'w12'),
    ]; } },
  'SHOP FLOOR': { key: 'sales', title: 'LANTAI PENJUALAN', col: '#ff3fa4',
    say: d => d.sales.orders.length ? `Order terakhir: ${d.sales.orders[0].t || 'produk'} senilai ${RPs(d.sales.orders[0].g)}. Produk terlaris: ${d.sales.top[0] ? d.sales.top[0].t : 'belum ada'}.` : 'Belum ada order masuk.',
    html: d => [
      KPI('ORDER', d.overview.orders, `${d.period.days} hari terakhir`, '', '#ff3fa4'),
      KPI('NILAI RATA-RATA', d.sales.aov, 'per order', '', '#ffb13f'),
      KPI('REFUND', d.sales.refund_rate == null ? '—' : String(d.sales.refund_rate).replace('.', ',') + '%', 'dari semua order', '', '#ff7aa8'),
      KPI('PENDAPATAN', d.overview.revenue, '', '', '#3ff0ff'),
      P('ORDER TERBARU', d.sales.orders.length ? `<table>${d.sales.orders.map(o => `<tr><td>${esc(o.d)}</td><td>${esc(o.t || '—')}</td><td>${esc(o.c || '')}</td><td class="r">${RP(o.g)}</td></tr>`).join('')}</table>` : '<div class="empty">belum ada order</div>', 'w7'),
      P('PRODUK TERLARIS', bars(d.sales.top.map(t => ({ n: `${t.t} (${t.u}×)`, v: t.v })), '#ff3fa4', RPs), 'w5'),
    ] },
  'QA BAY': { key: 'approval', title: 'RUANG QA · APPROVAL', col: '#ff3fa4',
    say: d => d.approval.count ? `Ada ${d.approval.count} listing yang menunggu keputusan owner.` : 'Semua listing sudah diputuskan. Tidak ada antrian approval.',
    html: d => [
      KPI('MENUNGGU', d.approval.count, 'listing perlu keputusan', 'w4', d.approval.count ? '#ff3fa4' : '#7dffb5'),
      KPI('LIVE DI ETSY', d.listings.by_state.active || 0, '', 'w4', '#7dffb5'),
      KPI('DRAFT DI ETSY', d.listings.by_state.etsy_draft || 0, 'belum tayang', 'w4', '#ffb13f'),
      P('ANTRIAN APPROVAL', d.approval.items.length ? `<table>${d.approval.items.map(i => `<tr><td>${esc(i.title)}</td><td>${i.qa_ok ? '<span class="tag" style="--c:#7dffb5">QA OK</span>' : '<span class="tag" style="--c:#ff3fa4">PERLU PERBAIKAN</span>'}</td><td class="r">${RP(i.price)}</td></tr>`).join('')}</table>` : '<div class="empty">antrian kosong ✔</div>', 'w12'),
    ] },
  'WRITERS STUDIO': { key: 'listings', title: 'STUDIO PENULIS · LISTING', col: '#b06bff',
    say: d => `Total ${d.listings.total} listing. ${d.listings.by_state.active || 0} sudah live, ${d.listings.by_state.pending_approval || 0} menunggu approval.`,
    html: d => [
      KPI('TOTAL LISTING', d.listings.total, '', 'w4', '#b06bff'),
      KPI('LIVE', d.listings.by_state.active || 0, '', 'w4', '#7dffb5'),
      KPI('DALAM PROSES', (d.listings.by_state.draft || 0) + (d.listings.by_state.revision_requested || 0) + (d.listings.by_state.publishing || 0), 'draft · revisi · dikirim', 'w4', '#ffb13f'),
      P('STATUS', ring(Object.entries(d.listings.by_state).map(([k, v]) => ({ n: STATE_ID[k] || k, v })), '#b06bff'), 'w5'),
      P('DIKERJAKAN TERAKHIR', `<table>${d.listings.latest.map(l => `<tr><td>${esc(l.t || '(tanpa judul)')}</td><td class="r"><span class="tag">${esc(STATE_ID[l.s] || l.s)}</span></td></tr>`).join('') || '<tr><td class="empty">belum ada</td></tr>'}</table>`, 'w7'),
    ] },
  'ARCHIVE': { key: 'assets', title: 'ARSIP · FILE PRODUK', col: '#ffb13f',
    say: d => `Arsip menyimpan ${d.assets.n || 0} file untuk ${d.assets.products} produk.`,
    html: d => [
      KPI('FILE', d.assets.n || 0, `${((d.assets.b || 0) / 1048576).toFixed(1).replace('.', ',')} MB`, 'w4', '#ffb13f'),
      KPI('PRODUK', d.assets.products, '', 'w4', '#3ff0ff'),
      KPI('JENIS FILE', d.assets.kinds.length, '', 'w4', '#b06bff'),
      P('KOMPOSISI ARSIP', bars(d.assets.kinds.map(k => ({ n: k.k, v: k.n })), '#ffb13f'), 'w12'),
    ] },
  'RESEARCH LAB': { key: 'research', title: 'LAB RISET PASAR', col: '#7dffb5',
    say: d => d.research.keywords.length ? `Kata kunci terbaru: ${d.research.keywords.slice(0, 3).join(', ')}.` : 'Belum ada riset kata kunci.',
    html: d => [
      KPI('KATA KUNCI', d.research.keywords.length, 'terbaru', 'w4', '#7dffb5'),
      KPI('LAPORAN', d.research.reports.length, '', 'w4', '#3ff0ff'),
      KPI('KOMPETITOR DIPANTAU', d.research.competitors, 'listing', 'w4', '#ff3fa4'),
      P('KATA KUNCI', `<div class="chips">${d.research.keywords.map(k => `<span>${esc(k)}</span>`).join('') || '<span class="empty">kosong</span>'}</div>`, 'w6'),
      P('LAPORAN PASAR', `<ul>${d.research.reports.map(r => `<li>${esc(r)}</li>`).join('') || '<li class="empty">belum ada</li>'}</ul>`, 'w6'),
    ] },
  'DATA ROOM': { key: 'data', title: 'RUANG DATA · STATISTIK', col: '#3ff0ff',
    say: d => `Listing dilihat ${N(d.data.views)} kali, difavoritkan ${N(d.data.favorites)} kali.${d.data.visits == null ? ' Data kunjungan belum diimpor.' : ''}`,
    html: d => [
      KPI('DILIHAT', d.data.views ?? 0, 'view listing', '', '#3ff0ff'),
      KPI('FAVORIT', d.data.favorites ?? 0, '', '', '#ff3fa4'),
      KPI('KUNJUNGAN', d.data.visits ?? '—', d.data.visits == null ? 'impor Shop Stats' : '', '', '#ffb13f'),
      KPI('KONVERSI', d.data.conversion == null ? '—' : String(d.data.conversion).replace('.', ',') + '%', 'order ÷ kunjungan', '', '#7dffb5'),
      P('SUMBER TRAFIK', bars(d.data.sources.map(s => ({ n: s.channel, v: s.visits })), '#3ff0ff'), 'w6'),
      P('ORDER HARIAN', areaChart(d.finance.series.map(s => ({ d: s.d, v: s.n })), '#3ff0ff', 130).replace(/Rp [\d.]+/g, m => m.slice(3) + ' order'), 'w6'),
    ] },
  'GROWTH STUDIO': { key: 'social', title: 'STUDIO PROMOSI', col: '#ff3fa4',
    say: d => `${d.social.posts} posting terbit, ${d.social.scheduled} terjadwal, ${N(d.social.impressions)} tayangan.`,
    html: d => [
      KPI('POSTING', d.social.posts, 'terbit periode ini', '', '#ff3fa4'),
      KPI('TERJADWAL', d.social.scheduled, '', '', '#ffb13f'),
      KPI('TAYANGAN', d.social.impressions, '', '', '#3ff0ff'),
      KPI('KLIK KE ETSY', d.social.clicks, '', '', '#7dffb5'),
      P('AKUN SOSMED', `<table>${d.social.accounts.map(a => `<tr><td>${esc(a.p)}</td><td class="r"><span class="tag" style="--c:${a.s === 'connected' ? '#7dffb5' : a.s === 'unavailable' ? '#ff3fa4' : '#ffb13f'}">${esc(a.s)}</span></td></tr>`).join('') || '<tr><td class="empty">belum ada</td></tr>'}</table>`, 'w6'),
      P('INTERAKSI', bars([{ n: 'Views', v: d.social.views || 0 }, { n: 'Engagement', v: d.social.engagement || 0 }, { n: 'Klik', v: d.social.clicks || 0 }], '#ff3fa4'), 'w6'),
    ] },
  'SERVER ROOM': { key: 'system', title: 'RUANG SERVER · SISTEM', col: '#ff3fa4',
    say: d => `Sistem ${d.mode === 'live' ? 'mode LIVE' : 'mode DEMO'}. ${d.system.jobs.FAILED || 0} pekerjaan gagal, ${d.system.audit_total} catatan audit.`,
    html: d => [
      KPI('MODE', d.mode === 'live' ? 'LIVE' : 'DEMO', d.mode === 'live' ? 'terhubung ke Etsy' : 'data contoh', 'w4', d.mode === 'live' ? '#7dffb5' : '#b06bff'),
      KPI('CATATAN AUDIT', d.system.audit_total, 'tidak bisa dihapus', 'w4', '#3ff0ff'),
      KPI('KURS', RP(d.currency.rate), esc(d.currency.source), 'w4', '#ffb13f'),
      P('PEKERJAAN', ring(Object.entries(d.system.jobs).map(([k, v]) => ({ n: JOB_ID[k] || k, v, c: k === 'FAILED' ? '#ff3fa4' : k === 'DONE' ? '#7dffb5' : undefined })), '#3ff0ff'), 'w5'),
      P('AUDIT TERBARU', `<table>${d.system.audit.map(a => `<tr><td>${esc((a.t || '').slice(5, 16).replace('T', ' '))}</td><td>${esc(a.a)}</td><td>${esc(a.x)}</td><td class="r">${a.o === 'ok' ? '✔' : '✖'}</td></tr>`).join('')}</table>`, 'w7'),
    ] },
  'LOUNGE · PANTRY': { key: 'crew', title: 'LOUNGE · KRU', col: '#b06bff',
    say: () => 'Ini kru NEONLOOM. Semua agen dan apa yang sedang mereka kerjakan.',
    html: () => [P('KRU', `<table>${Object.values(T().npcs).map(n => `<tr><td style="color:${n.meta.color}"><b>${esc(n.name)}</b></td><td>${esc(n.meta.role || '')}</td><td class="r">${esc(n.server && n.server.current || (n.sitting ? 'di meja' : 'jalan-jalan'))}</td></tr>`).join('')}</table>`, 'w12')] },
};
const BRAND_NAMES = ['Buildvero', 'StudioForgeCo', 'AvArchID'];
for (const sl of [1, 2, 3]) SECTIONS['TOKO ' + sl] = { key: 'shop' + sl, title: BRAND_NAMES[sl - 1].toUpperCase(), col: ['#e0a86a', '#ffa62b', '#ff6a1a'][sl - 1], shop: sl, npc: 'NYX-21',
  say: d => { const x = (d.shops || [])[sl - 1]; if (!x) return ''; if (!x.enabled) return `${x.name} sedang nonaktif. Aktifkan di tab pengaturan kalau mau dipakai.`;
    return `${x.name}. Pendapatan ${RPs(x.revenue)}, ${x.orders} order, ${x.live} listing live${x.pending ? ', ' + x.pending + ' menunggu approval' : ''}.`; },
  html: d => { const x = (d.shops || [])[sl - 1] || {}; const c = SECTIONS['TOKO ' + sl].col; return [
    KPI('PENDAPATAN', x.revenue || 0, `${d.period.days} hari`, '', c), KPI('ORDER', x.orders || 0, '', '', c),
    KPI('BIAYA ETSY', x.fees || 0, 'perkiraan dari ledger toko ini', '', '#ff7aa8'), KPI('LABA (perk.)', x.profit_est || 0, 'pendapatan − biaya Etsy', '', '#7dffb5'),
    P('PENJUALAN HARIAN', areaChart(x.series || [], c), 'w8'),
    P('STATUS', `<table><tr><td>Koneksi Etsy</td><td class="r"><span class="tag">${esc(STAT_ID[x.status] || x.status || '—')}</span></td></tr><tr><td>Akun Etsy</td><td class="r">${esc(x.account || '—')}</td></tr>
      <tr><td>Setelah approve</td><td class="r">${x.effective_target === 'active' ? 'LIVE' : 'DRAFT'}</td></tr><tr><td>Listing</td><td class="r">${N(x.listings)}</td></tr><tr><td>Live · Draft Etsy · Approval</td><td class="r">${N(x.live)} · ${N(x.drafts)} · ${N(x.pending)}</td></tr>
      <tr><td>Aktif</td><td class="r">${x.enabled ? 'YA' : 'TIDAK'}</td></tr></table>`, 'w4'),
  ]; } };
const STAT_ID = { connected: 'TERSAMBUNG', not_connected: 'BELUM TERSAMBUNG', expired: 'LOGIN KEDALUWARSA', error: 'ERROR' };
function shopsTable(d) { const rows = d.shops || []; if (!rows.length) return '<div class="empty">—</div>';
  const tot = rows.reduce((a, x) => a + (x.revenue || 0), 0);
  return `<table>${rows.map(x => `<tr style="cursor:pointer" data-open="TOKO ${x.slot}"><td><img src="${esc(x.logo_holo)}" alt="" style="height:16px;vertical-align:middle;margin-right:6px"><b style="color:${x.color}">L${x.slot}</b> · ${esc(x.name)}</td><td>${x.enabled ? (d.mode === 'demo' ? 'DEMO' : esc(STAT_ID[x.status] || x.status)) : 'NONAKTIF'}</td><td class="r">${x.orders} order</td><td class="r">${N(x.live)} live</td><td class="r">${RP(x.revenue)}</td></tr>`).join('')}
    <tr><td><b>TOTAL (1 owner)</b></td><td></td><td class="r"><b>${rows.reduce((a, x) => a + x.orders, 0)} order</b></td><td></td><td class="r"><b>${RP(tot)}</b></td></tr></table>`; }
const ORDER = ['COMMAND DECK', 'FINANCE VAULT', 'TOKO 1', 'TOKO 2', 'TOKO 3', 'SHOP FLOOR', 'QA BAY', 'WRITERS STUDIO', 'DATA ROOM', 'GROWTH STUDIO', 'RESEARCH LAB', 'ARCHIVE', 'SERVER ROOM', 'LOUNGE · PANTRY'];
const SHORT = { 'TOKO 1': 'L1 BUILDVERO', 'TOKO 2': 'L2 STUDIOFORGECO', 'TOKO 3': 'L3 AVARCHID', 'COMMAND DECK': 'RINGKASAN', 'FINANCE VAULT': 'KEUANGAN', 'SHOP FLOOR': 'PENJUALAN', 'QA BAY': 'APPROVAL', 'WRITERS STUDIO': 'LISTING', 'DATA ROOM': 'STATISTIK', 'GROWTH STUDIO': 'PROMOSI', 'RESEARCH LAB': 'RISET', 'ARCHIVE': 'ARSIP', 'SERVER ROOM': 'SISTEM', 'LOUNGE · PANTRY': 'KRU' };

// ---------- DOM
const deck = document.createElement('div'); deck.id = 'holodeck';
deck.innerHTML = `<div class="hd-veil"></div><div class="hd-frame"><div class="hd-top"><div><div class="hd-title"></div><div class="hd-sub"></div></div><button class="hd-close">✕ TUTUP</button></div><div class="hd-tabs"></div><div class="hd-body"></div><div class="hd-foot"></div></div>`;
document.body.appendChild(deck);
deck.querySelector('.hd-close').onclick = close;
deck.querySelector('.hd-veil').onclick = close;
addEventListener('keydown', e => { if (e.key === 'Escape' && deck.classList.contains('on')) close(); });

async function load() { try { const r = await fetch('/api/holo/dashboard'); if (r.ok) { DATA = await r.json(); updateMini(); dispatchEvent(new CustomEvent('holodata', { detail: DATA })); if (cur && view === 'dash') render(cur, false); } } catch (e) {} }

// ---------- server calls (CSRF protected)
async function api(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf': window.CSRF || '' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({ error: 'respon tidak valid' })); if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status)); return j; }
let SET = null; async function loadSettings() { try { SET = await (await fetch('/api/holo/settings')).json(); } catch (e) { SET = { npcs: {} }; } return SET; }

function countUp(root) { root.querySelectorAll('[data-count]').forEach(el => { const v = +el.dataset.count; if (el.dataset.count === '' || isNaN(v)) return; const money = /RP|PENDAPATAN|LABA|BIAYA|PENGELUARAN|NILAI/.test(el.parentElement.querySelector('h4').textContent);
  const t0 = performance.now(), dur = 900; const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), x = v * e; el.textContent = money ? RP(x) : nf.format(Math.round(x)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }); }

let view = 'dash', detailId = null;
const ownerOf = name => { const S = SECTIONS[name]; if (S && S.npc) return S.npc; const room = T().ROOMS.find(r => r.name === name); return room && room.agent; };
function npcObj(name) { const who = ownerOf(name); return who && T().npcs[who]; }
function fieldsFor(name) { if (!SET) return []; const S = SECTIONS[name];
  if (S && S.shop) return [...(SET.npcs['KAI-07'] || []).filter(f => f.group === 'TOKO ' + S.shop), ...(SET.npcs['VOLT-3'] || []).filter(f => f.id === `shop${S.shop}.target`)];
  return SET.npcs[ownerOf(name)] || []; }

function speak(name, line) { const t = T(), n = npcObj(name); if (!line) return; subtitle(line, ownerOf(name));
  try { if (n) { n.say(line, 7000, 'say'); t.NPCVoice && t.NPCVoice.speak(n, line); } } catch (e) {} }
function subtitle(line, who) { const f = deck.querySelector('.hd-sub2'); if (f) { f.innerHTML = `<b>${esc(who || 'NEONLOOM')}:</b> ${esc(line)}`; f.classList.remove('pulse'); void f.offsetWidth; f.classList.add('pulse'); } }

function render(name, fresh = true) {
  const S = SECTIONS[name]; if (!S || !DATA) return; cur = name;
  deck.style.setProperty('--hc', S.col);
  const shopRow = S.shop && DATA.shops ? DATA.shops[S.shop - 1] : null;
  deck.querySelector('.hd-title').innerHTML = shopRow ? `<img class="hd-logo" src="${esc(shopRow.logo_holo)}" alt="${esc(shopRow.name)}"><span class="hd-tagline">LANTAI ${S.shop} · ${esc(shopRow.tagline || '')}${shopRow.name !== BRAND_NAMES[S.shop - 1] ? ' · ' + esc(shopRow.name) : ''}</span>` : esc(S.title);
  const who = ownerOf(name);
  deck.querySelector('.hd-sub').innerHTML = `${DATA.period.start} → ${DATA.period.end} · semua angka dalam Rupiah<div class="hd-sub2"></div>`;
  deck.querySelector('.hd-tabs').innerHTML = ORDER.map(k => `<button class="hd-tab${k === name ? ' on' : ''}" style="--c:${SECTIONS[k].col}" data-k="${esc(k)}">${SHORT[k]}${ownerOf(k) && !SECTIONS[k].shop ? ` <b>${esc(ownerOf(k))}</b>` : ''}</button>`).join('');
  deck.querySelectorAll('.hd-tab').forEach(b => b.onclick = () => { view = 'dash'; render(b.dataset.k); present(b.dataset.k); });
  const hasSet = fieldsFor(name).length || (SET == null && who);
  const modes = [['dash', '📊 DASHBOARD']]; if (name === 'QA BAY' || name === 'SHOP FLOOR' || name === 'WRITERS STUDIO' || S.shop) modes.push(['approval', '✅ APPROVAL']); if (hasSet) modes.push(['settings', `⚙ PENGATURAN ${who ? '· ' + who : ''}`]);
  const body = deck.querySelector('.hd-body'), scroll = body.scrollTop;
  const modeBar = `<div class="hd-modes w12">${modes.map(([m, l]) => `<button class="hd-mode${view === m || (m === 'approval' && view === 'detail') ? ' on' : ''}" data-m="${m}">${l}</button>`).join('')}</div>`;
  if (view === 'settings') { body.innerHTML = modeBar + settingsHTML(name); bindSettings(name); }
  else if (view === 'approval') { body.innerHTML = modeBar + `<section class="hp w12"><h4>MEMUAT ANTRIAN…</h4></section>`; loadQueue(name); }
  else if (view === 'detail') { body.innerHTML = modeBar + `<section class="hp w12"><h4>MEMUAT LISTING…</h4></section>`; loadDetail(name, detailId); }
  else {
    body.innerHTML = modeBar + S.html(DATA).map((h, i) => h.replace('<section class="hp', `<section style="--i:${fresh ? i : 0}" class="hp`)).join('');
    if (!fresh) { body.querySelectorAll('.hp').forEach(p => p.style.animation = 'none'); body.scrollTop = scroll; body.querySelectorAll('[data-count]').forEach(el => { const v = +el.dataset.count; if (el.dataset.count === '' || isNaN(v)) return; const money = /PENDAPATAN|LABA|BIAYA|PENGELUARAN|NILAI/.test(el.parentElement.querySelector('h4').textContent); el.textContent = money ? RP(v) : nf.format(v); }); }
    else countUp(body);
    body.querySelectorAll('[data-open]').forEach(r => r.onclick = () => { view = 'dash'; render(r.dataset.open); present(r.dataset.open); });
  }
  body.querySelectorAll('.hd-mode').forEach(b => b.onclick = async () => { view = b.dataset.m; if (view === 'settings' && !SET) await loadSettings(); render(name); if (view === 'settings') { const f = fieldsFor(name).find(x => x.ask); speak(name, f ? f.ask : 'Ini pengaturan yang saya pegang.'); } if (view === 'approval') speak(name, 'Ini antrian listing. Pilih satu untuk diperiksa.'); });
  deck.querySelector('.hd-foot').innerHTML = `${who ? `<span class="presenter">◉ ${S.shop ? 'dipandu' : 'dipresentasikan'} oleh ${esc(who)}</span>` : ''}<span class="mode">${DATA.mode === 'live' ? 'LIVE' : 'DEMO · data contoh'}</span><span>kurs ${RP(DATA.currency.rate)} / USD · ${esc(DATA.currency.source)}</span><span style="margin-left:auto">ESC / klik luar = tutup</span>`;
}

// ---------- settings as holographic controls owned by the NPC
function ctl(f) {
  const v = f.value ?? '', id = esc(f.id);
  if (f.type === 'info') return `<div class="hs-info">${esc(v)}</div>`;
  if (f.type === 'toggle') return `<button class="hs-toggle${v ? ' on' : ''}" data-f="${id}" data-v="${v ? 1 : 0}"><i></i>${v ? 'AKTIF' : 'NONAKTIF'}</button>`;
  if (f.type === 'choice') return `<div class="hs-choice">${f.options.map(o => `<button data-f="${id}" data-v="${esc(o.v)}" class="${String(o.v) === String(v) ? 'on' : ''}">${esc(o.t)}</button>`).join('')}</div>`;
  if (f.type === 'number') return `<div class="hs-row"><input type="number" data-in="${id}" value="${esc(v)}" min="${f.min ?? ''}" max="${f.max ?? ''}"><button data-save="${id}">SIMPAN</button></div>`;
  if (f.type === 'text') return `<div class="hs-row"><input type="text" data-in="${id}" value="${esc(v)}"><button data-save="${id}">SIMPAN</button></div>`;
  if (f.type === 'textarea') return `<div class="hs-row"><textarea data-in="${id}" rows="3">${esc(v)}</textarea><button data-save="${id}">SIMPAN</button></div>`;
  if (f.type === 'keys') return `<div class="hs-row"><input type="text" data-k1="${id}" placeholder="${v ? 'tersimpan ✔ (isi untuk mengganti)' : 'keystring / client id'}" autocomplete="off"><input type="password" data-k2="${id}" placeholder="shared secret" autocomplete="off"><button data-keys="${id}">SIMPAN</button></div>`;
  if (f.type === 'button') return `<button class="hs-btn" data-act="${id}"${f.confirm ? ` data-confirm="${esc(f.confirm)}"` : ''}>${esc(f.label)}</button>`;
  if (f.type === 'upload') return `<div class="hs-row"><select data-kind="${id}">${f.options.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('')}</select><input type="file" accept=".csv,text/csv" data-file="${id}"><button data-up="${id}">IMPOR</button></div>`;
  if (f.type === 'form') return `<div class="hs-form" data-form="${id}">${f.fields.map(x => `<label>${esc(x.label)}${x.type === 'choice' ? `<select data-fk="${esc(x.k)}">${x.options.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('')}</select>` : `<input type="text" data-fk="${esc(x.k)}">`}</label>`).join('')}<button data-go="${id}">KERJAKAN</button></div>`;
  return '';
}
function settingsHTML(name) {
  const fs = fieldsFor(name); if (!fs.length) return `<section class="hp w12"><h4>PENGATURAN</h4><div class="empty">NPC ini tidak memegang pengaturan.</div></section>`;
  const groups = {}; fs.forEach(f => (groups[f.group] = groups[f.group] || []).push(f));
  return Object.entries(groups).map(([g, list], i) => `<section class="hp ${Object.keys(groups).length === 1 ? 'w12' : 'w6'}" style="--i:${i}"><h4>${esc(g)}</h4>${list.map(f => `<div class="hs-field" data-ask="${esc(f.ask || '')}">${f.type === 'button' ? '' : `<div class="hs-label">${esc(f.label)}</div>`}${ctl(f)}</div>`).join('')}</section>`).join('')
    + `<section class="hp w12 hs-log"><h4>LOG</h4><div class="hs-msg">Klik pilihan, ${esc(ownerOf(name) || 'NPC')} akan mengonfirmasi.</div></section>`;
}
function bindSettings(name) {
  const body = deck.querySelector('.hd-body'), log = m => { const el = body.querySelector('.hs-msg'); if (el) el.textContent = m; };
  const done = (r, f) => { log(r.msg); speak(name, r.msg); if (r.open) { location.href = r.open; return; } T().Sound && T().Sound.chime && T().Sound.chime(); loadSettings().then(() => { load(); if (cur === name && view === 'settings') render(name); }); };
  const fail = e => { log('✖ ' + e.message); speak(name, 'Maaf, gagal: ' + e.message); T().Sound && T().Sound.error && T().Sound.error(); };
  const fdef = id => fieldsFor(name).find(f => f.id === id) || {};
  let asked = 0; body.querySelectorAll('.hs-field').forEach(el => el.addEventListener('mouseenter', () => { const a = el.dataset.ask; if (a && Date.now() - asked > 6000) { asked = Date.now(); speak(name, a); } }));
  body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { const f = fdef(b.dataset.f); let v = b.dataset.v; if (f.type === 'toggle') v = b.dataset.v !== '1';
    const cm = f.confirm_value && f.confirm_value[v]; if (cm && !confirm(cm)) return; api('/api/holo/settings', { id: b.dataset.f, value: v }).then(r => done(r, f), fail); });
  body.querySelectorAll('[data-save]').forEach(b => b.onclick = () => { const i = body.querySelector(`[data-in="${b.dataset.save}"]`); api('/api/holo/settings', { id: b.dataset.save, value: i.value }).then(r => done(r), fail); });
  body.querySelectorAll('[data-keys]').forEach(b => b.onclick = () => { const k = body.querySelector(`[data-k1="${b.dataset.keys}"]`).value, sct = body.querySelector(`[data-k2="${b.dataset.keys}"]`).value; api('/api/holo/settings', { id: b.dataset.keys, extra: { key: k, secret: sct } }).then(r => done(r), fail); });
  body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { if (b.dataset.confirm && !confirm(b.dataset.confirm)) return; b.disabled = true; api('/api/holo/settings', { id: b.dataset.act }).then(r => done(r), fail).finally(() => { b.disabled = false; }); });
  body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const form = body.querySelector(`[data-form="${b.dataset.go}"]`), extra = {}; form.querySelectorAll('[data-fk]').forEach(x => extra[x.dataset.fk] = x.value); api('/api/holo/settings', { id: b.dataset.go, extra }).then(r => done(r), fail); });
  body.querySelectorAll('[data-up]').forEach(b => b.onclick = async () => { const f = body.querySelector(`[data-file="${b.dataset.up}"]`).files[0]; if (!f) return fail(new Error('pilih file CSV dulu'));
    const fd = new FormData(); fd.append('file', f); fd.append('kind', body.querySelector(`[data-kind="${b.dataset.up}"]`).value);
    try { const r = await fetch('/api/holo/stats-import', { method: 'POST', headers: { 'x-csrf': window.CSRF || '' }, body: fd }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'gagal'); done(j); } catch (e) { fail(e); } });
}

// ---------- approval as holograms
const ST_TAG = s => `<span class="tag" style="--c:${{ pending_approval: '#ff3fa4', etsy_draft: '#ffb13f', active: '#7dffb5', failed: '#ff3fa4', rejected: '#ff7aa8' }[s] || '#3ff0ff'}">${esc(STATE_ID[s] || s)}</span>`;
async function loadQueue(name) {
  const body = deck.querySelector('.hd-body'); let items = [];
  try { items = (await (await fetch('/api/holo/listings')).json()).items || []; } catch (e) {}
  const S = SECTIONS[name]; if (S && S.shop) items = items.filter(i => i.slot === S.shop);
  if (cur !== name || view !== 'approval') return;
  const sec = body.querySelector('.hp:not(.hd-modes)') || body.lastElementChild;
  sec.outerHTML = `<section class="hp w12"><h4>ANTRIAN LISTING ${S && S.shop ? '· ' + esc(BRAND_NAMES[S.shop - 1]) : '· SEMUA TOKO'}</h4>${items.length ? `<table>${items.map(i => `<tr class="hs-pick" data-id="${i.id}" style="cursor:pointer"><td>${esc(i.title || '(belum ada judul)')}</td><td><b>${esc(i.shop)}</b></td><td class="r">${ST_TAG(i.state)}</td></tr>`).join('')}</table>` : '<div class="empty">tidak ada listing yang perlu diurus ✔</div>'}</section>`;
  body.querySelectorAll('.hs-pick').forEach(r => r.onclick = () => { detailId = +r.dataset.id; view = 'detail'; render(name); });
}
async function loadDetail(name, id) {
  const body = deck.querySelector('.hd-body'); let L;
  try { const r = await fetch('/api/holo/listing/' + id); L = await r.json(); if (!r.ok) throw 0; } catch (e) { return; }
  if (cur !== name || view !== 'detail') return;
  [...body.querySelectorAll('.hp')].forEach(x => x.remove());
  const can = { approve: ['pending_approval', 'draft', 'revision_requested', 'rejected', 'failed'].includes(L.state) && L.valid, decide: ['pending_approval', 'draft', 'revision_requested', 'failed', 'etsy_draft', 'approved'].includes(L.state) };
  body.insertAdjacentHTML('beforeend', `
    <section class="hp w8" style="--i:0"><h4>LISTING #${L.id} · ${esc(L.shop)} · ${ST_TAG(L.state)}</h4>
      <div class="hs-label">JUDUL</div><textarea class="hl-title" rows="2">${esc(L.title)}</textarea>
      <div class="hs-label">DESKRIPSI</div><textarea class="hl-desc" rows="7">${esc(L.description)}</textarea>
      <div class="hs-label">TAG (pisah koma)</div><textarea class="hl-tags" rows="2">${esc(L.tags.join(', '))}</textarea>
      <div class="hs-row"><div class="hs-label" style="margin:0">HARGA USD</div><input type="number" step="0.01" class="hl-price" value="${L.price_usd}"><span class="sm">≈ ${RP(L.price_idr)}</span><button class="hl-save">💾 SIMPAN PERUBAHAN</button></div>
      ${L.images.length ? `<div class="hl-imgs">${L.images.map(i => `<img src="/api/holo/asset/${i.id}" alt="${esc(i.name)}" loading="lazy">`).join('')}</div>` : '<div class="empty">tidak ada gambar</div>'}
      <div class="sm">File: ${esc(L.files.join(', ') || '—')}${L.video ? ' · + video' : ''}</div></section>
    <section class="hp w4" style="--i:1"><h4>QA · ${L.valid ? 'LOLOS ✔' : 'PERLU PERBAIKAN'}</h4><ul>${L.checks.map(c => `<li style="color:${c.ok ? '#9fffcf' : c.sev === 'error' ? '#ff7aa8' : '#ffd38a'}">${c.ok ? '✔' : c.sev === 'error' ? '✖' : '!'} ${esc(c.msg)}</li>`).join('') || '<li class="empty">—</li>'}</ul>
      <h4 style="margin-top:12px">TOKO</h4><div class="hs-choice">${L.shops.map(o => `<button data-slot="${o.v}" class="${o.v === L.slot ? 'on' : ''}" ${L.can_change_shop ? '' : 'disabled'}>${esc(o.t)}</button>`).join('')}</div>
      <div class="sm">Setelah approve → ${L.target === 'active' ? 'LIVE di Etsy' : 'DRAFT di Etsy'}</div>
      <h4 style="margin-top:12px">KEPUTUSAN OWNER</h4>
      <textarea class="hl-note" rows="2" placeholder="catatan (untuk revisi/tolak)"></textarea>
      <div class="hl-acts">
        <button class="hl-a ok" data-d="approve" ${can.approve ? '' : 'disabled'}>✅ APPROVE · ${L.target === 'active' ? 'LIVE' : 'DRAFT'}</button>
        <button class="hl-a rev" data-d="request_revision" ${can.decide && L.state !== 'etsy_draft' ? '' : 'disabled'}>✏ MINTA REVISI</button>
        <button class="hl-a no" data-d="reject" ${can.decide && L.state !== 'etsy_draft' ? '' : 'disabled'}>✖ TOLAK</button>
        ${L.state === 'etsy_draft' && L.approved ? '<button class="hl-a live" data-live="1">🚀 JADIKAN LIVE</button>' : ''}
        ${L.url ? `<a class="hl-a" href="${esc(L.url)}" target="_blank" rel="noopener">↗ BUKA DI ETSY</a>` : ''}
      </div>${L.error ? `<div class="sm" style="color:#ff7aa8">Error terakhir: ${esc(L.error)}</div>` : ''}
      <ul style="margin-top:8px">${L.history.map(h => `<li>${esc((h.created_at || '').slice(0, 16).replace('T', ' '))} · ${esc(h.decision)}${h.note ? ' · ' + esc(h.note) : ''}</li>`).join('')}</ul>
      <button class="hs-btn hl-back">← kembali ke antrian</button></section>`);
  const who = 'VOLT-3', qa = T().npcs[who];
  const line = L.valid ? `Listing ${L.shop}: ${L.title.slice(0, 70)}. QA lolos. Silakan diputuskan.` : `Listing ini belum lolos QA: ${(L.checks.find(c => !c.ok && c.sev === 'error') || {}).msg || 'ada yang perlu diperbaiki'}.`;
  subtitle(line, who); try { qa && (qa.say(line, 7000), T().NPCVoice.speak(qa, line)); } catch (e) {}
  const after = r => { subtitle(r.msg, who); try { qa && (qa.say(r.msg, 6000), T().NPCVoice.speak(qa, r.msg)); T().Sound.chime(); } catch (e) {} load(); render(name); };
  const fail = e => { subtitle('Gagal: ' + e.message, who); try { T().Sound.error(); } catch (x) {} };
  body.querySelectorAll('.hl-a[data-d]').forEach(b => b.onclick = () => { const d = b.dataset.d; if (d === 'approve' && !confirm(`Approve dan kirim ke Etsy sebagai ${L.target === 'active' ? 'LIVE' : 'DRAFT'} di ${L.shop}?`)) return;
    api(`/api/holo/listing/${L.id}/decide`, { decision: d, note: body.querySelector('.hl-note').value }).then(r => { if (d === 'approve') try { window.ShopTower && window.ShopTower.sendPacket(L.slot - 1, true); } catch (e) {} after(r); }, fail); });
  const lv = body.querySelector('[data-live]'); if (lv) lv.onclick = () => { if (confirm(`Jadikan LIVE di ${L.shop}? Pembeli akan bisa melihat listing ini.`)) api(`/api/holo/listing/${L.id}/golive`, {}).then(after, fail); };
  body.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => api(`/api/holo/listing/${L.id}/slot`, { slot: +b.dataset.slot }).then(after, fail));
  body.querySelector('.hl-save').onclick = () => api(`/api/holo/listing/${L.id}/edit`, { title: body.querySelector('.hl-title').value, description: body.querySelector('.hl-desc').value, tags: body.querySelector('.hl-tags').value, price_usd: body.querySelector('.hl-price').value }).then(after, fail);
  body.querySelector('.hl-back').onclick = () => { view = 'approval'; render(name); };
}

function present(name) {
  const t = T(), S = SECTIONS[name];
  if (!saved) saved = { tx: t.camState.tx, ty: t.camState.ty, zoom: t.camState.zoom };
  if (S.shop && window.ShopTower && window.ShopTower.floors[S.shop - 1]) { const F = window.ShopTower.floors[S.shop - 1]; t.camState.tx = -4.5 + 2.4; t.camState.ty = F.y + 1.7; t.camState.zoom = 3.2; window.ShopTower.floors[S.shop - 1].flash = .8; speak(name, S.say(DATA)); return; }
  const n = npcObj(name); if (!n) return;
  t.camState.tx = n.x + 2.2; t.camState.ty = n.y + 1.4; t.camState.zoom = 3.4;
  try { n.pop && n.pop('📊'); t.Sound && t.Sound.chime && t.Sound.chime(); } catch (e) {}
  speak(name, S.say(DATA));
}

function open(name, mode = 'dash') {
  if (!SECTIONS[name]) return false;
  view = mode;
  const go = async () => { if (!SET) await loadSettings(); deck.classList.add('on'); document.body.classList.add('hd-open'); render(name); present(name); };
  if (DATA) go(); else load().then(go);
  return true;
}
function close() { deck.classList.remove('on'); document.body.classList.remove('hd-open'); cur = null; view = 'dash'; const t = T();
  if (saved && t) { t.camState.tx = saved.tx; t.camState.ty = saved.ty; t.camState.zoom = saved.zoom; } saved = null; }

// ---------- floating mini holograms above each room (always on, live numbers)
const MINI = {
  'COMMAND DECK': d => [`${RPs(d.overview.revenue)}`, 'PENDAPATAN 30H'], 'FINANCE VAULT': d => [RPs(d.finance.profit), 'LABA BERSIH'],
  'SHOP FLOOR': d => [`${d.overview.orders} order`, 'PENJUALAN'], 'QA BAY': d => [`${d.approval.count} menunggu`, 'APPROVAL'],
  'WRITERS STUDIO': d => [`${d.listings.total} listing`, 'LISTING'], 'DATA ROOM': d => [`${N(d.data.views)} view`, 'STATISTIK'],
  'GROWTH STUDIO': d => [`${d.social.posts} post`, 'PROMOSI'], 'RESEARCH LAB': d => [`${d.research.keywords.length} kata kunci`, 'RISET'],
  'ARCHIVE': d => [`${d.assets.n || 0} file`, 'ARSIP'], 'SERVER ROOM': d => [`${d.system.jobs.FAILED || 0} gagal`, 'SISTEM'],
};
const minis = [];
function buildMini() { const t = T(), ov = document.getElementById('overlay'); if (!t || !ov) return false;
  for (const r of t.ROOMS) { if (!MINI[r.name]) continue; const d = document.createElement('div'); d.className = 'room-holo'; d.style.setProperty('--c', SECTIONS[r.name].col);
    d.onclick = e => { e.stopPropagation(); open(r.name); }; ov.appendChild(d);
    minis.push({ d, r, v: new t.THREE.Vector3(r.x1 - 1.9, t.FL[r.f].y + t.FH * .62, t.D), last: '' }); }
  return true; }
function updateMini() { if (!DATA) return; for (const m of minis) { const [a, b] = MINI[m.r.name](DATA); const h = `<small>${esc(b)}</small>${esc(a)}`; if (h !== m.last) { m.d.innerHTML = h; if (m.last) { m.d.classList.remove('flick'); void m.d.offsetWidth; m.d.classList.add('flick'); } m.last = h; } } }
function placeMini() { const t = T(); if (t && t.project) for (const m of minis) { const [x, y, vis] = t.project(m.v); m.d.style.display = vis ? '' : 'none'; m.d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; } requestAnimationFrame(placeMini); }

window.HoloDash = {
  openRoom: r => open(r.name, r.name === 'QA BAY' ? 'approval' : 'dash'),
  openNPC: n => { const r = T().ROOMS.find(q => q.agent === n.name); return r ? open(r.name) : false; },
  open, close, reload: load, get data() { return DATA; }, get current() { return cur; }, get view() { return view; },
};
(function boot() { if (!T() || !T().ROOMS || !T().Holo) return setTimeout(boot, 200); buildMini(); placeMini(); load(); loadSettings(); setInterval(load, 30000);
  const q = new URLSearchParams(location.search), m = q.get('msg'), er = q.get('err');
  if (m || er) { setTimeout(() => { try { T().Holo.show(er ? 'GAGAL' : 'BERHASIL', m || er, T().npcs['KAI-07'], er ? '#ff3fa4' : '#7dffb5'); } catch (e) {} }, 2500); history.replaceState(null, '', location.pathname); } })();
