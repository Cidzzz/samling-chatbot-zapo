# 📑 LAPORAN KRONOLOGIS LENGKAP PENGEMBANGAN CHATBOT SAMLING (DLH DKI JAKARTA)
*Dokumentasi Riwayat Teknis, Masalah Lapangan, Investigasi & Solusi*  
*Rentang Waktu: 07 September 2026 s/d 28 September 2026*  
*Target: Dwi / Aditya Pratama (Tim Sekawan Engineers - SMK Telkom Sidoarjo)*

---

## 📌 DAFTAR ISI
1. [Ringkasan Eksekutif & Arsitektur Sistem](#1-ringkasan-eksekutif--arsitektur-sistem)
2. [Kronologi Hari per Hari (07 - 28 September 2026)](#2-kronologi-hari-per-hari)
3. [Daftar Bug Kritis & Root Cause Analysis (RCA)](#3-daftar-bug-kritis--root-cause-analysis-rca)
4. [Ringkasan Endpoint Backend & M2M Key](#4-ringkasan-endpoint-backend--m2m-key)
5. [Status Akhir Layanan & Runtime](#5-status-akhir-layanan--runtime)

---

## 1. RINGKASAN EKSEKUTIF & ARSITEKTUR SISTEM

SAMLING (Sampah Keliling / Solusi Pengelolaan Sampah Lingkungan) adalah platform operasional berbasis kecerdasan buatan (AI) yang dikembangkan untuk Dinas Lingkungan Hidup (DLH) Provinsi DKI Jakarta. Chatbot berfungsi sebagai antarmuka dua arah (*two-way operational interface*) untuk menghubungkan masyarakat, petugas lapangan fasilitas TPS 3R, dan panitia event langsung ke sistem backend terpusat.

### Dual-Stack Evolusi:
* **Fase 1 (Legacy - `cb`):** Node.js CommonJS berbasis `@whiskeysockets/baileys` (WhatsApp) + `telegraf` (Telegram). Menggunakan sistem plugin dinamis, integrasi polling notifikasi, dan semantic intent tagging.
* **Fase 2 (Modern Testing & Staging - `cb2`):** Migrasi penuh ke `zapo-js` (ESM native), penyimpanan sesi SQLite (`@zapo-js/store-sqlite`), native single-bubble card (banner logo bersatu dengan menu tombol), penghapusan dependensi berat (*zero bloatware*), dan integrasi Webhook Port `3008`.

---

## 2. KRONOLOGI HARI PER HARI

### 📅 07 September 2026: Inisialisasi Fondasi Dual-Bot & AI Intent Router
* **Setup Awal Codebase (`cb`):**
  - Mengonfigurasi lingkungan runtime Node.js di `/home/container/home/cidz/service/cb`.
  - Mengintegrasikan socket WhatsApp Multi-Device (Baileys) dan bot Telegram (Telegraf).
  - Menyambungkan bot ke Core API DLH: `https://api-samling.naufalrafa.my.id/api/v1` dengan autentikasi `X-API-Key: samling-secret-bot-key-2026`.
* **Koneksi Provider AI (LLM):**
  - Mengintegrasikan proxy AI `https://r.dwiai.web.id/v1` model `ag/gemini-3.6-flash-low`.
  - Merancang prompt semantic parser: AI tidak boleh mengarang data/angka (*zero hallucination*), melainkan mengekstrak intent percakapan menjadi action tags:
    - `[ACTION:lapor:kondisi]`
    - `[ACTION:tps3r_today:zone_id]`
    - `[ACTION:tps3r_input:payload]`
    - `[ACTION:menu]`
* **Pembenahan Dynamic Plugin Loader:**
  - Memperbaiki `PluginLoader.js` yang mengalami circular dependency / method nesting error pada scanning folder `cmd_samling`, `daftar_wilayah`, dan `lapor`.

---

### 📅 08 September 2026: Manajemen Background Service & Polling Notifikasi
* **Stabilisasi Port & Tunnel:**
  - Penataan alokasi port server: Webhook internal di port `3008`, vansrouter proxy port `59921`, dan local Telegram Bot API port `8081`.
* **Background Notification Worker:**
  - Mengimplementasikan `notification-poller.js` dengan mekanisme mutex lock (`isProcessing`).
  - Worker menarik antrean notifikasi tiket warga dari backend secara berkala (interval 5 detik) untuk mencegah banjir request (*rate limit 429*) dan mencegah duplikasi pengiriman pesan notifikasi WhatsApp.

---

### 📅 09 September 2026: Penyusunan Pertahanan Juri & Validasi Format
* **Dokumen Pertahanan Juri AI Open 2026:**
  - Menyusun naskah `DICEAR_JURI_CHATBOT_SAMLING.md` yang merinci 5 pilar jawaban telak:
    1. Mengapa memilih bot WhatsApp ketimbang aplikasi Android/iOS khusus (Zero Friction, aksesibilitas 98% warga).
    2. Arsitektur keandalan & anti-banned Meta (jitter delay, socket Baileys langsung).
    3. Mitigasi halusinasi AI (strict function tags, backend yang mengeksekusi query database riil).
    4. Keamanan RBAC 3-Tier (Masyarakat, Petugas TPS 3R, PIC Event).
    5. ROI terukur bagi DLH DKI Jakarta (memangkas waktu respon aduan dari hari menjadi menit).
* **Sanitasi Input Angka Desimal:**
  - Memperbaiki parser angka koma (contoh: `2,5 kg` otomatis diubah ke desimal titik `2.5`) guna mencegah error validasi HTTP 422 *Unprocessable Entity* di backend FastAPI.

---

### 📅 10 - 12 September 2026: Audit Keamanan Role (Dynamic RBAC) & Multi-Device LID
* **Penghapusan Hardcode Nomor Petugas:**
  - Menghapus seluruh array static nomor HP di kode lokal. Seluruh otorisasi dialihkan 100% dinamis melalui API:
    - Petugas TPS 3R: `GET /tps3r/officers/verify?phone={number}`
    - Panitia Event: `GET /event-pic-whitelist/verify?phone={number}`
* **Isu WhatsApp LID (Linked Identity Device):**
  - Mengidentifikasi masalah di mana WhatsApp versi terbaru menyamarkan nomor telepon menjadi JID acak berakhiran `@lid`.
  - Membangun `src/utils/lidMapper.cjs` untuk mendeteksi nomor asli sebelum melakukan query ke backend agar hak akses petugas tidak salah tertolak.
* **Pencegahan Error ID Grup WhatsApp:**
  - Memperbaiki logic router di grup agar saat petugas mengetik laporan di grup TPS, sistem mengekstrak `m.senderNumber` pengirim aslinya, bukan ID grup (`@g.us`).

---

### 📅 13 - 14 September 2026: Standarisasi Timbangan RDF & Modul Edukasi
* **Penyempurnaan Parser Timbangan TPS 3R:**
  - Menambahkan dukungan kategori timbangan: *dustbin*, *gerobak dorong*, *anorganik bernilai*, *anorganik residu*, *organik grandong*, dan *cacahan RDF (Refuse Derived Fuel)*.
* **Integrasi Layanan Resmi Khusus:**
  - Membuat modul `special_waste.cjs` untuk mengarahkan limbah B3/elektronik dan perabot rumah tangga besar langsung ke portal resmi DLH DKI:
    - E-Waste: `https://ewaste.dinaslhdki.id/`
    - Bulky Waste: `https://lingkunganhidup.jakarta.go.id/layanan/bulky-waste`
* **Optimasi Cache Otorisasi:**
  - Memangkas TTL cache petugas di RAM (`officerCache`) dari 10 menit menjadi 2 menit agar pembaruan petugas baru di admin DLH langsung dikenali bot.

---

### 📅 15 - 16 September 2026: Duplikasi & Migrasi Penuh ke `cb2` (zapo-js)
* **Pemisahan Environment `cb2`:**
  - Menduplikasi seluruh project `cb` ke direktori baru `/home/container/home/cidz/service/cb2` khusus untuk engine zapo-js.
  - Memangkas dependensi biner berlebih (menghapus modul canvas, puppeteer, dan downloader pihak ketiga) sehingga bot beroperasi ringan.
* **Format Timbangan 3-Tier Transparan:**
  - Memperbaiki output konfirmasi timbangan harian menjadi 3 bagian yang informatif bagi petugas lapangan:
    1. `📋 CATATAN SEBELUMNYA HARI INI` (jika ada data yang telah masuk hari itu).
    2. `📥 DATA BARU YANG DIINPUT` (angka tambahan baru dengan tanda `+`).
    3. `📊 HASIL AKHIR AKUMULASI HARI INI` (total tonase & capaian target 10 dustbin).
  - Menyediakan mode `revisi` (petugas cukup mengetik awalan *"revisi..."* jika ingin menimpa total data hari ini dan bukan menambahkan).
* **Solusi Looping Tombol Fasilitas:**
  - Memperbaiki `extractZoneId` agar ketika tombol atau teks fasilitas TPS 3R ditekan (misal ID `1122`), bot langsung menyajikan data target tanpa looping daftar pilihan.

---

### 📅 17 September 2026: Resolusi 4 Bug Kritis di Staging `cb2`
1. **Perbaikan Mismatch Identitas Petugas TPS 3R:**
   - *Masalah:* Laporan dari nomor Aditya Pratama (`628887771117`) masuk ke dashboard tercatat atas nama "Dewi Lestari".
   - *Penyebab:* Payload submission `POST /tps3r/reports` pada `tps3r.cjs` tidak menyertakan `officer_name` dan `whatsapp_number`, sehingga backend otomatis memakai petugas pertama di zona tersebut.
   - *Solusi:* Injeksi identitas terverifikasi dari response backend ke payload submit. Berhasil diverifikasi dan teruji langsung.
2. **Respon Humanis Penolakan Role (Anti-Monoton):**
   - *Masalah:* Non-petugas atau PIC yang statusnya sudah *"Sudah Melapor"* langsung dilempar ke kartu menu statis tanpa penjelasan.
   - *Solusi:* Injeksi status detail whitelist ke dalam system prompt AI dan un-mute teks AI pada action tag `[ACTION:menu]`. Bot kini menjelaskan alasan hak akses secara santun sebelum menampilkan tombol menu.
3. **Penyelesaian Bug Ghosting Upload Foto & Kondisi Kosong:**
   - *Masalah 1:* Deskripsi kondisi sampah berubah menjadi `(tidak tersedia)` saat memilih TPS. (Fixed: Normalisasi key Map state `normalizeSenderPhone` dengan mapping LID).
   - *Masalah 2:* Bot tidak merespon saat user mengirimkan foto sampah. (Fixed: Mematikan proses lama Baileys yang memicu disconnect loop `stream_error_replaced` dan memperluas deteksi media native Zapo `msg.type === 'image'`).
4. **Penyempurnaan Dialog Edukasi Warga:**
   - Memisahkan antara pertanyaan langkah lapor (*"bagaimana caranya"*) dengan input masalah riil. AI kini menyapa ramah dan memandu warga menceritakan kondisi tumpukan sampah terlebih dahulu sebelum membuka langkah pemilihan lokasi.

---

### 📅 18 - 28 September 2026: Stabilisasi Runtime, Logging & Verifikasi Terpadu
* **Audit Proses & Sesi Tunggal:**
  - Memastikan hanya satu proses WhatsApp runtime yang berjalan pada server untuk nomor bot SAMLING guna menjamin stabilitas socket.
  - Memverifikasi endpoint Webhook port `3008` aktif merespon `GET /health` (`whatsapp_connected: true`).
* **Verifikasi Pipeline Notifikasi Telegram:**
  - Menetapkan standarisasi pengiriman laporan dan dokumen audit ke akun Telegram ID `1816457002` melalui personal bot gateway `@autocidz_bot` via server local Bot API (`http://127.0.0.1:8081`).

---

## 3. DAFTAR BUG KRITIS & ROOT CAUSE ANALYSIS (RCA)

| Kasus Kendala | Gejala di Lapangan | Akar Masalah (Root Cause) | Tindakan Perbaikan |
|---|---|---|---|
| **Identitas Petugas Tertukar** | Laporan Aditya Pratama tercatat sebagai Dewi Lestari | Payload bot ke `/tps3r/reports` kehilangan field `officer_name` & `whatsapp_number`. Backend fallback ke petugas default zona. | Menambahkan injeksi data petugas terverifikasi sebelum pemanggilan API submission. |
| **Respon Bot Kaku / Monoton** | User bukan role terkait langsung dilempar menu default tanpa teks penjelasan | AI teks dimatikan (`muted`) pada tag `[ACTION:menu]` dan prompt tidak memiliki konteks penolakan backend. | Mengaktifkan teks AI dan menginjeksi riwayat whitelist (nama agenda/status lapor) ke system prompt. |
| **Kondisi Laporan Kosong** | Ringkasan aduan warga tertulis: `Kondisi: (tidak tersedia)` | Key Map `pendingKondisi` mismatch akibat perbedaan format nomor internasional vs WhatsApp Privacy LID (`@lid`). | Membungkus seluruh state Map dengan fungsi `normalizeSenderPhone()` dan resolver LID. |
| **Ghosting Upload Foto** | Bot tidak merespon sama sekali saat dikirimi gambar sampah | 1) Sesi login ganda memicu loop `stream_error_replaced`.<br>2) Router hanya membaca `msg.message.imageMessage` milik Baileys. | Menghentikan service Baileys dan memperluas parser gambar ke tipe native zapo-js (`msg.type === 'image'`). |
| **Looping Menu TPS 3R** | Pilihan fasilitas TPS 3R muncul terus-menerus tanpa akhir | Regex parser tidak mengonversi teks nama TPS menjadi ID angka saat user mengetik manual. | Normalisasi fungsi `extractZoneId` agar menerima format numerik langsung. |

---

## 4. RINGKASAN ENDPOINT BACKEND & M2M KEY

* **Base URL Backend:** `https://api-samling.naufalrafa.my.id/api/v1`
* **Header Autentikasi:** `X-API-Key: samling-secret-bot-key-2026`
* **Daftar Endpoint Operasional:**
  - `GET /zones/hierarchy`: Sinkronisasi 1.294 zona administratif DKI Jakarta.
  - `GET /tps3r/officers/verify?phone={nomor}`: Verifikasi petugas resmi TPS 3R.
  - `GET /tps3r/reports/today?zone_id={id}`: Rekap capaian target timbangan hari berjalan.
  - `POST /tps3r/reports`: Input dan akumulasi data timbangan lapangan.
  - `GET /event-pic-whitelist/verify?phone={nomor}`: Verifikasi panitia event berizin DLH.
  - `POST /citizen-reports`: Pembuatan tiket laporan aduan penumpukan sampah masyarakat.
  - `GET /citizen-reports/status?ticket_id={id}`: Tracking progres penanganan sampah oleh armada DLH.

---

## 5. STATUS AKHIR LAYANAN & RUNTIME

* **WhatsApp Bot Runtime:** Active (`cb2` zapo-js ESM, PID 283240).
* **Port Webhook:** `3008` (Status: Healthy / HTTP 200 OK).
* **Zone Cache:** 1.294 zona terindeks (Sinkronisasi otomatis per 30 menit).
* **AI Engine:** Online (`https://r.dwiai.web.id/v1`, Model `ag/gemini-3.6-flash-low`).
* **Telegram Delivery Bot:** Active via `@autocidz_bot` (Local API port `8081`).

---
*Laporan ini digenerate secara otomatis untuk dokumentasi menyeluruh project SAMLING AI 2026.*
