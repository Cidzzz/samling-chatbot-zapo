# 📋 RANGKUMAN HISTORIS PENGEMBANGAN SAMLING CHATBOT (DLH DKI JAKARTA)
*Catatan Kronologis Pekerjaan Teknis & Solusi Lapangan*
*Target Pengguna: Dwi / Aditya Pratama (SMK Telkom Sidoarjo)*

---

## 📅 1. Periode Awal: 07 - 09 September 2026
### Fokus: Arsitektur Dual-Bot Baileys & Telegraf (Base `cb`)
1. **Inisialisasi Project Dual-Bot:**
   - Menyiapkan arsitektur dual-bot pada `/home/container/home/cidz/service/cb` menggunakan `@whiskeysockets/baileys` (WhatsApp) dan `telegraf` (Telegram).
   - Integrasi REST API DLH DKI Jakarta (`https://api-samling.naufalrafa.my.id/api/v1`) dengan autentikasi Machine-to-Machine `X-API-Key: samling-secret-bot-key-2026`.
   - Menghubungkan provider AI Router (`https://r.dwiai.web.id/v1`) model `ag/gemini-3.6-flash-low` untuk semantic parser percakapan menjadi action tags: `[ACTION:lapor]`, `[ACTION:tps3r_today]`, `[ACTION:lapor_event]`, `[ACTION:menu]`.
2. **Penyusunan Modul Plugin & Dynamic Loader:**
   - Memperbaiki `PluginLoader.js` untuk memindai subdirektori modular (`cmd_samling`, `daftar_wilayah`, `lapor`).
   - Menyusun strategi defense juri di dokumen `DICEAR_JURI_CHATBOT_SAMLING.md` (Zero barrier-to-entry via WhatsApp, anti-halusinasi AI guardrails, dan dynamic RBAC).

---

## 📅 2. Periode 10 - 14 September 2026
### Fokus: Pembenahan Parsing, RBAC Dinamis, & Integrasi TPS 3R
1. **Transisi Hak Akses Dinamis (Dynamic RBAC 100%):**
   - Menghilangkan bypass hardcode nomor WhatsApp untuk role Petugas TPS 3R dan Panitia Event.
   - Pengecekan status real-time ke endpoint backend:
     - Petugas TPS 3R: `GET /api/v1/tps3r/officers/verify?phone={number}`
     - PIC Event: `GET /api/v1/event-pic-whitelist/verify?phone={number}`
2. **Perbaikan Multi-Device Privacy ID (WhatsApp LID):**
   - Mengatasi isu WhatsApp multi-device modern yang mengirim JID berformat LID (`<id>@lid`).
   - Membuat utilitas `lidMapper` dan pemetaan sender grup agar ID grup (`@g.us`) tidak tertukar dengan nomor telepon pengirim asli.
3. **Penyelarasan Menu Timbangan TPS 3R:**
   - Menyempurnakan regex parser operasional timbangan: `dustbin`, `gerobak dorong`, `anorganik ber-value`, `anorganik non-value`, `organik grandong`, dan `cacahan RDF`.
   - Mengatur TTL cache otorisasi petugas menjadi 2 menit agar sinkronisasi penambahan petugas dari web admin cepat terdeteksi bot.

---

## 📅 3. Periode 15 - 16 September 2026
### Fokus: Duplikasi Migrasi ke `cb2` (zapo-js) & Format Akumulasi Lapangan
1. **Duplikasi Codebase ke `cb2`:**
   - Meng-clone seluruh direktori `cb` ke `cb2` sebagai testing bed migrasi engine WhatsApp dari Baileys ke native `zapo-js` (ESM native + SQLite store `@zapo-js/store-sqlite`).
   - Memangkas bloatware: menghapus downloader media pihak ketiga, library canvas, dan ffmpeg installer.
   - Mengimplementasikan `zapo_bridge.js` untuk menjembatani interface lama handler CommonJS ke event loop zapo-js.
2. **Transparansi Respon 3-Tier Laporan Timbangan TPS 3R:**
   - Memperbaiki UX pelaporan timbangan agar tidak membingungkan petugas:
     - Menampilkan `📋 CATATAN SEBELUMNYA HARI INI` (jika sudah ada ritase pagi/siang).
     - Menampilkan `📥 DATA BARU YANG DIINPUT` (angka tambahan dengan tanda plus `+`).
     - Menampilkan `📊 HASIL AKHIR AKUMULASI HARI INI` (akumulasi kumulatif).
   - Mendukung kata kunci `revisi` / `koreksi` di awal pesan untuk beralih dari mode akumulasi (`accumulate`) ke mode timpa data utuh (`replace`).
3. **Pencegahan Looping Menu TPS 3R:**
   - Memperbaiki parser `extractZoneId` agar input murni angka (`!target 1122`) langsung diproses tanpa memunculkan daftar fasilitas berulang kali.

---

## 📅 4. Periode 17 September 2026 (Hari Ini)
### Fokus: Investigasi Bug Fatal Identitas Petugas, Non-Monotone LLM, & Media Upload
1. **Fix Bug Mismatch Identitas Petugas TPS 3R:**
   - **Akar Masalah:** Nomor Aditya Pratama (`628887771117`) melapor timbangan di TPS 3R Meruya Selatan (Zone 1122), namun di dashboard web admin nama yang tampil adalah "Dewi Lestari". Hal ini terjadi karena handler `tps3r.cjs` hanya mem-pass metrik berat dan `zone_id` tanpa parameter `officer_name` dan `whatsapp_number`, sehingga backend DLH otomatis fallback ke petugas default pertama di zona tersebut.
   - **Solusi:** Menginjeksi identitas terverifikasi (`payload.officer_name = officer.name`, `payload.whatsapp_number = officer.whatsapp_number`) sebelum request submit dikirim ke backend API.
   - **Uji Nyata:** Record laporan harian di backend berhasil terverifikasi tercatat atas nama **Aditya Pratama**.
2. **Respon Humanis & Edukatif Penolakan Role (Anti-Monoton):**
   - **Akar Masalah:** User non-PIC atau PIC yang statusnya sudah *"Sudah Melapor"* saat mengetik *"Aku mau lapor event"* langsung dilempar ke kartu menu statis tanpa penjelasan.
   - **Solusi:**
     - Menginjeksi metadata riwayat akun secara real-time ke dalam system prompt AI: jika pernah melapor pada agenda tertentu (misal: "Moklet Jakarta"), AI menjelaskan bahwa hak akses event tersebut telah selesai dan mengarahkan pengajuan rekomendasi baru ke DLH.
     - Melakukan un-mute terhadap teks penjelasan LLM sebelum menampilkan tombol menu layanan.
     - Menerapkan aturan yang sama untuk non-petugas TPS 3R dengan menjelaskan bahwa fitur timbangan khusus petugas terdaftar.
3. **Penyelesaian Bug Ghosting Upload Foto & Kondisi Kosong Aduan Warga:**
   - **Akar Masalah Kondisi "(tidak tersedia)":** Inkonsistensi key string `senderNumber` vs LID pada RAM Map `pendingKondisi` menyebabkan data kondisi terhapus saat user mengklik tombol TPS. Diperbaiki dengan membungkus seluruh Map state via helper `normalizeSenderPhone` dan mapping LID.
   - **Akar Masalah Bot Ghosting Saat Kirim Foto:**
     - Adanya sesi ganda Baileys (`cb`) dan Zapo (`cb2`) yang berebut login memicu loop error WhatsApp `stream_error_replaced`.
     - Router `messageHandler.cjs` melewatkan pesan foto native Zapo karena hanya mengecek properti Baileys (`msg.message.imageMessage`).
     - Diperbaiki dengan menghentikan total service Baileys dan memperluas deteksi media (`msg.type === 'image'`, `msg.raw.message`, `m.download()`).
4. **Penyempurnaan Alur Dialog Lapor Sampah Warga:**
   - Menata ulang system prompt AI agar membedakan antara pertanyaan awal/langkah pelaporan dengan input kondisi riil.
   - Jika warga bertanya *"bagaimana langkahnya"*, AI menyapa secara ramah dan memandu warga menceritakan kondisi tumpukan sampah terlebih dahulu.
   - Setelah kondisi dijelaskan warga, AI secara cerdas mengekstrak deskripsi tersebut ke dalam action tag pelaporan untuk memandu pemilihan Wilayah & TPS.
