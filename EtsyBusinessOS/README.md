# Etsy Business OS — v1.0.0-rc1

Software lokal untuk mengelola toko Etsy dengan satu AI lokal (Gemma 12B via Ollama).
**AI berpikir · Python mengeksekusi · Database mengingat · Automasi mengatur · Anda yang memutuskan.**

## Cara menjalankan (Windows)
1. Ekstrak zip ke folder biasa, misalnya `D:\EtsyBusinessOS` (bukan di dalam folder aset produk).
2. Double-click **START.bat**.
   - Pertama kali: mengunduh Python portable + library ke folder `runtime\` (3–10 menit, butuh internet). Tidak ada yang diinstal ke sistem Windows.
   - Browser terbuka otomatis di `http://127.0.0.1:8765`.
3. Aplikasi mulai dalam **DEMO MODE**: data contoh + AI demo, tidak ada yang dikirim ke Etsy/Pinterest/YouTube.
4. Untuk berhenti: tutup jendela hitam (console).

Untuk mode LIVE ikuti menu **Setup API guide** di aplikasi: instal Ollama → unduh model → Benchmark → hubungkan Etsy, Pinterest, YouTube → ubah Mode ke LIVE.

## Isi aplikasi
| Menu | Fungsi |
|---|---|
| Dashboard | KPI, status engine, tindakan yang perlu Anda lakukan, tim AI |
| AI Office | Tampilan kantor isometrik; agen bergerak sesuai status job |
| Approval Center | Review, edit, Approve / Reject / Request Revision listing. Tidak ada publish tanpa approval |
| Listings | Generate listing dari produk, sinkron Etsy |
| Assets & Products | Folder aset (read-only), metadata, duplikat, kompatibilitas platform |
| Research | Riset keyword & kompetitor via Etsy API (`findAllListingsActive`, `getListing`), manual-assisted research, registry sumber |
| Social Media | Pinterest & YouTube otomatis; Instagram/Facebook *unavailable* sampai Meta App Review |
| Analytics | KPI dihitung Python; impor Shop Stats (visits, traffic sources, search terms) |
| Accounting | Double-entry, P&L, neraca, arus kas, fee Etsy, profit produk, ringkasan pajak, rekonsiliasi bank, kurs, export Beancount |
| Automation | Antrean job persisten, retry, cancel |
| Audit Log | Catatan semua tindakan (tidak bisa diubah/dihapus) |
| Shared Brain | Catatan Markdown yang dibaca semua agen (bisa dibuka di Obsidian) |
| Diagnostics | Laporan untuk support: `logs\report.txt` (tanpa password/token) |

## Tim AI (peran, dijalankan satu per satu oleh satu model)
Boss (Chief of Staff) · Scout (riset) · Quill (penulis SEO) · Sherlock (validator) · Etta (toko Etsy) ·
Pixie (social media) · Libby (aset) · Nova (analis) · Judith (keuangan).

## Arsitektur singkat
- Satu aplikasi Python: FastAPI + Jinja2 (UI lokal), SQLite WAL, APScheduler + tabel `jobs` persisten.
- 2 jalur worker: `ai` (selalu 1 tugas, model di-unload saat idle) dan `io` (API, scan, publish).
- Semua output AI berupa JSON yang divalidasi Pydantic; aturan SEO divalidasi deterministik.
- Tindakan AI melewati permission matrix (PRD 12.3) dan tool registry; semua dicatat di audit log.
- Kredensial dienkripsi (Fernet), kunci di Windows Credential Manager.
- Folder aset hanya dibaca (`rb`), tidak pernah ditulis/dihapus/di-rename.

## Folder
- `app\` kode · `data\` database, Brain default, backup harian · `logs\` log & laporan diagnostik · `runtime\` Python portable.
- Update ke versi baru: ekstrak zip baru, salin folder `data\` dari versi lama (atau ekstrak di atas folder lama). START.bat akan memperbarui library otomatis.

## Batasan yang diketahui
- Etsy API tidak menyediakan visits/traffic/search terms → impor manual mingguan.
- `findAllListingsActive` tidak memberi search volume → indikator diberi label *Estimated*.
- YouTube: aplikasi yang belum diaudit Google hanya bisa upload *private*.
- Pinterest Trial access: gunakan sandbox sampai Standard access disetujui.
- Tag model Ollama untuk Gemma 12B ditulis manual di Settings (sesuaikan dengan tag di ollama.com).

Lihat `docs\CHECKLIST_TES.md` untuk langkah tes di PC Anda.
