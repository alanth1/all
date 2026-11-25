# Checklist tes v1.0.0-rc1

Centang satu per satu. Kalau ada yang gagal: buka menu **Diagnostics**, lalu kirim file `logs\report.txt` (+ screenshot).

## A. Instalasi (tanpa API)
- [ ] Double-click START.bat → setup selesai tanpa error (pertama kali 3–10 menit).
- [ ] Browser terbuka di `http://127.0.0.1:8765`, Dashboard tampil dengan label DEMO MODE.
- [ ] Tutup jendela console, jalankan START.bat lagi → terbuka cepat (tanpa setup ulang).

## B. Mode demo (semua fitur tanpa akun)
- [ ] Settings → Asset folders: isi folder produk Anda (contoh `D:\Etsy\Products`, tiap produk 1 sub-folder; gambar/video promosi di sub-folder `marketing`). Simpan.
- [ ] Assets → Scan now → file, ukuran, halaman PDF, durasi video tampil. **Cek file asli tidak berubah** (tanggal modifikasi sama).
- [ ] Listings → Generate → Approval Center → listing ada, validasi ✔ (judul ≤15 kata, diakhiri "(PDF Download)", 13 tag, tanpa "prefab").
- [ ] Edit judul → simpan → versi naik; approval sebelumnya batal.
- [ ] Approve & Publish → status `active` (demo, tidak ke Etsy sungguhan).
- [ ] Research → keyword "cabin house plan" → laporan dengan label Verified / Estimated / AI interpretation / Hypothesis.
- [ ] Social → Plan & schedule → kalender terisi; Instagram & Facebook tertulis *unavailable*.
- [ ] Analytics → impor CSV visits → conversion rate muncul.
- [ ] Accounting → Trial balance "balanced ✔"; tambah 1 expense; rekonsiliasi tampil.
- [ ] AI Office → karakter bergerak, status berubah saat job berjalan.
- [ ] Matikan aplikasi saat job berjalan, jalankan lagi → Automation menunjukkan job dilanjutkan (RETRYING → DONE).

## C. AI lokal (Ollama)
- [ ] Instal Ollama, Settings → AI → tulis tag model 12B → Download model; lakukan juga untuk model kecil (fallback).
- [ ] Run benchmark → catat tokens/s, VRAM, "fully on GPU", JSON valid. Model yang lulus otomatis dipilih.
- [ ] Settings → Mode = LIVE. Generate listing lagi → kualitas teks dari Gemma, validasi tetap jalan.
- [ ] Setelah ±2 menit idle, VRAM kembali turun (model di-unload).

## D. Etsy (LIVE)
- [ ] Buat app di Etsy Developers, simpan Keystring + Shared secret, daftarkan redirect URI dari halaman Settings.
- [ ] Connect Etsy → Test OK → Listings → Sync: listing, order, ledger masuk.
- [ ] Accounting: transaksi Etsy terposting; selisih saldo Etsy terlihat (wajar jika ada riwayat >90 hari = saldo awal).
- [ ] Settings → Listing defaults: isi taxonomy ID kategori Anda.
- [ ] Approve 1 listing tes → muncul aktif di toko Etsy (cek di Etsy), URL tercatat di Audit Log.

## E. Pinterest & YouTube (LIVE)
- [ ] Connect Pinterest (Trial → centang sandbox), pilih board di Settings → Social.
- [ ] Connect YouTube (OAuth Desktop client). Video pertama mungkin *private* (aplikasi belum diaudit) — ada peringatan.
- [ ] 1 pin & 1 video terbit, tercatat di Social → Published (verified), tidak ada posting ganda.

Laporkan hasil per bagian (A–E).
