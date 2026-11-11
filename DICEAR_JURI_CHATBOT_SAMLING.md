# 🥊 AMUNISI DICEAR JURI: SISTEM CHATBOT SAMLING (AI OPEN 2026)
*Cheat-sheet & Jawaban Telak Tim jika dicecar Juri Pemprov DKI Jakarta & Kemenko Perekonomian*

---

## 📌 Ringkasan Solusi Chatbot (30 Detik Elevator Pitch)
> "Chatbot Samling bukan sekadar bot FAQ/customer care biasa. Ini adalah **Dual-Channel Operational Agent (WhatsApp & Telegram)** yang menjembatani **Warga, Petugas Lapangan TPS 3R, dan Panitia Event** langsung ke Core Engine Samling tanpa perlu menginstal aplikasi baru. Dilengkapi **Function Calling / Auto-Execution AI**, sistem mengenali intent percakapan natural dan langsung mengeksekusi aksi database (lapor aduan, tracking tiket, monitoring timbangan TPS 3R harian/mingguan) secara aman, terverifikasi, dan hemat biaya token."

---

## 🎯 DAFTAR PERTANYAAN KRUSIAL & JAWABAN TELAK (Q&A JURI)

### Kategori 1: Urgensi & Nilai Bisnis (Kenapa Chatbot? Bukan Aplikasi Mobile?)
#### ❓ Pertanyaan 1: "Kenapa bikin chatbot di WhatsApp/Telegram? Kenapa nggak bikin aplikasi mobile khusus warga/petugas aja kayak JAKI?"
* **Jawaban:**
  * **Zero Friction & Barrier to Entry Rendah:** Warga dan petugas lapangan di Jakarta enggan mengunduh aplikasi baru yang memakan memori HP hanya untuk lapor sampah sesekali. WhatsApp sudah terpasang di 98% smartphone warga dan digunakan petugas sehari-hari.
  * **Integrasi Inklusif (Warga & Lapangan):** Driver armada dan petugas TPS 3R lebih terbiasa mengetik chat atau mengirim pesan suara daripada menavigasi menu aplikasi yang rumit.
  * **Komplementer, Bukan Saingan JAKI:** Chatbot ini bukan menggantikan JAKI, melainkan **omnichannel entry point**. Laporan dari chatbot bisa diteruskan ke sistem backend DLH/JAKI via REST API standar kami.

---

### Kategori 2: Arsitektur & Keandalan Teknis (Dual-Bot Engine)
#### ❓ Pertanyaan 2: "Bagaimana arsitektur teknis bot ini? Kalau ribuan warga chat bersamaan, apakah server bot tidak down atau kena limit WhatsApp/Telegram?"
* **Jawaban:**
  * **Arsitektur Dual-Bot Terpisah tapi Terpusat:** Menggunakan **Node.js modular**. WhatsApp ditenagai library Baileys (Multi-Device socket langsung tanpa overhead browser Chromium/Puppeteer), sedangkan Telegram ditenagai framework Telegraf.
  * **Non-Blocking Execution & Anti-Conflict:** Telegram bot di-launch dengan mode  non-blocking di background, mencegah race condition conflict (HTTP 409).
  * **Polling & Concurrency Guard:** Untuk notifikasi status tiket dari backend ke WA/TG, bot menggunakan arsitektur **Outbound Polling (pull-based)** dengan batching dan mutex flag (). Jika bot restart, pesan tersimpan aman di queue backend (stateless & fault-tolerant).
  * **Anti-Banned / Rate-Limiting WA:** Pengiriman pesan massal diatur dengan *jitter delay* (2-5 detik antar chat) dan filter sanitasi agar tidak terdeteksi spam oleh WhatsApp.

#### ❓ Pertanyaan 3: "Kenapa arsitektur notifikasinya polling, bukan Webhook?"
* **Jawaban:**
  * **Zero Public Port Exposure (Security First):** Dengan polling outbound dari bot ke backend (), bot tidak perlu membuka open port publik, tidak butuh domain SSL publik tambahan untuk bot, dan kebal dari serangan DDoS atau probe scanner eksternal.
  * **Resilience:** Jika bot mati sejenak untuk update/maintenance, antrean notifikasi tetap tertampung di database backend dan langsung ditarik begitu bot aktif kembali tanpa ada data hilang.

---

### Kategori 3: Kecerdasan Buatan (AI, Halusinasi, & Auto-Execution)
#### ❓ Pertanyaan 4: "Pakai model AI apa? Bagaimana jika AI-nya halusinasi, salah memberikan data timbangan, atau ngawur bikin tiket laporan?"
* **Jawaban:**
  * **Model yang Digunakan:** Gemini 3.6 Flash Low () via secure proxy, dipilih karena latency inferensi sangat cepat (<1.5 detik) dan efisiensi biaya token yang optimal untuk skala dinas kota.
  * **Strict Function Tagging (Auto-Execution):** AI **tidak diizinkan mengarang data**. AI hanya bertindak sebagai semantic parser untuk mendeteksi intent pengguna dan menghasilkan structured command tag:
    * Contoh: Saat user tanya *"Gimana progress TPS Melati hari ini?"*, AI mengeluarkan .
    * Sistem backend Samling yang akan mengeksekusi query database riil dan mengembalikan angka timbangan pasti. AI tidak pernah menebak-nebak angka.
  * **Fallback & Validation Boundary:** Jika format input tidak valid (misal berat > 10.000 kg, input negatif, atau koma salah), controller bot langsung memotong dengan pesan error validasi sebelum mencapai backend (mencegah HTTP 422).

#### ❓ Pertanyaan 5: "Apakah AI bisa di-jailbreak pengguna nakal untuk mengubah data TPS atau menghapus laporan sampah?"
* **Jawaban:**
  * **Zero Mutating Actions from AI Prompt:** AI hanya memetakan intent ke aksi yang diizinkan sistem.
  * **Database Security Boundary:** AI hanya perantara input. Validasi schema, integritas foreign key, dan validasi status seluruhnya dijamin oleh backend FastAPI Samling, bukan oleh prompt teks AI.

---

### Kategori 4: Keamanan & Role-Based Access Control (RBAC)
#### ❓ Pertanyaan 6: "Apakah sembarang warga bisa melihat target timbangan TPS 3R atau laporan internal dinas lewat chat?"
* **Jawaban:**
  * **Multi-Tier RBAC Ketat:** Bot mengenali ID pengguna secara granular di level middleware:
    1. **Warga Umum:** Hanya bisa lapor sampah (), cek tiket sendiri (), dan tanya panduan pilah sampah edukatif. Menu operasional di-hide total.
    2. **Panitia Event:** Terverifikasi nomor HP-nya (whitelist) khusus untuk pelaporan lonjakan sampah kegiatan temporer/event.
    3. **Petugas TPS 3R & Supervisor DLH:** Terdaftar via nomor WA dan Telegram User ID terverifikasi. Hanya mereka yang bisa mengakses progress target harian (), rekap 7 hari (), dan log timbangan residu ().
  * **M2M Token Guard:** Komunikasi bot ke API backend dilindungi header khusus  dengan secret rotating key.

---

### Kategori 5: Dampak Nyata untuk DLH DKI Jakarta & TPS 3R
#### ❓ Pertanyaan 7: "Apa dampak terukur (ROI/Impact) dari implementasi chatbot ini bagi DLH DKI Jakarta?"
* **Jawaban:**
  * **Memangkas Latensi Aduan Warga hingga 70%:** Warga tidak perlu mengisi formulir panjang di web; cukup ketik chat bahasa sehari-hari, sistem langsung mengeluarkan ID Tiket resmi yang bisa dipantau real-time.
  * **Digitalisasi Pencatatan Timbangan Lapangan (Tanpa Kertas):** Petugas TPS 3R bisa langsung mencatat dan memonitor tonase sampah masuk dan residu langsung dari ponsel mereka saat berdiri di samping jembatan timbang/timbangan gantung.
  * **Data Real-time untuk Model Prediksi Logistik:** Data timbangan yang masuk detik itu juga via bot langsung menjadi bahan latih dan feed data bagi model prediksi overload TPS Samling untuk mengarahkan armada pengangkut.

---

## 💡 TIPS PRESENTASI JIKA ANGGOTA LAIN YANG BICARA
* **Kuncinya tenang:** Ingatkan bahwa Chatbot adalah **jembatan komunikasi 2 arah** antara manusia (warga/petugas) dan sistem AI/Backend Samling.
* **Bila ditanya detail kode:** Jawab: *"Implementasi kode kami full modular (Node.js/Telegraf/Baileys) dengan pemisahan service, controller, dan middleware RBAC yang rapi di repository, siap di-containerize dengan Docker/PM2 untuk high-availability."*
