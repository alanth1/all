# Etsy Business OS — v1.1.0-rc1

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

## Tampilan utama: NEONLOOM HQ (kantor hidup)
Saat dibuka, aplikasi menampilkan gedung kantor isometrik bergaya pixel-art cyberpunk. **Tidak ada menu atau tombol pengaturan** — setiap fungsi punya ruangan dan NPC sendiri:

| Ruangan | NPC | Isi (klik ruangan / NPC) |
|---|---|---|
| Command Deck | KAI-07 | Ringkasan, Automation, Audit log, Notifikasi |
| Research Lab | RAZE-11 | Riset keyword & kompetitor |
| Writers Studio | JUNO-X9 | Buat listing, Shared Brain |
| QA Bay | VOLT-3 | Approval & validasi |
| Shop Floor | NYX-21 | Approval Center, listing & toko |
| Growth Studio | HEX-04 | Social media (Pinterest, YouTube) |
| Archive | SABLE-6 | Aset & produk |
| Data Room | ORIN-88 | Analytics & impor Shop Stats |
| Finance Vault | KADE-12 | Akuntansi |
| Server Room | ZERO-1 | Pengaturan, panduan API, diagnostik, CPU/GPU/RAM/VRAM asli |
| Lounge · Pantry | semua | Ngopi, ngobrol, arcade, bean bag, ping-pong |

- NPC **bekerja di mejanya saat ada job nyata** (monitor menyala, gelembung pikiran), lalu **mengumumkan hasilnya** lewat gelembung bicara + notifikasi, dan kadang **mengantar hasil** ke rekan berikutnya (riset → penulis → QA → toko).
- Saat tidak ada tugas mereka **hidup**: jalan-jalan, ngopi, ngobrol berdua, main arcade, rebahan, melihat jendela, tidur di malam hari.
- **Siang/malam** mengikuti jam PC; **cuaca** di jendela simulasi atau cuaca asli kota Anda (Server Room → Pengaturan → World & weather, gratis via Open-Meteo).
- **Ruangan yang bermasalah** (job gagal, koneksi API putus, GPU panas, RAM penuh, approval menunggu) menyalakan lampu alarm; ZERO-1 datang memeriksa.
- Di LIVE mode, saat GPU sedang kosong, AI lokal menulis obrolan santai baru untuk NPC (bisa dimatikan).
- Kontrol: scroll = zoom, tarik = geser, klik ruangan/NPC, `Esc` = tutup panel, tombol `` ` `` = tampilan klasik (/dashboard).
- Grafik: NPC dan tile lantai dibuat dengan **PixelLab**; furnitur, efek, cuaca digambar oleh kode. Font Silkscreen & VT323 (lisensi OFL). Engine: Phaser 3.90 (MIT), disimpan lokal.

## Isi aplikasi (tampilan klasik /dashboard)
| Menu | Fungsi |
|---|---|
| Dashboard | KPI, status engine, tindakan yang perlu Anda lakukan, tim AI |
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
KAI-07 (operasional) · RAZE-11 (riset) · JUNO-X9 (penulis SEO) · VOLT-3 (QA) · NYX-21 (toko Etsy) ·
HEX-04 (social media) · SABLE-6 (aset) · ORIN-88 (analis) · KADE-12 (keuangan) · ZERO-1 (sistem & server).

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
