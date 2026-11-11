# DOKUMENTASI STRUKTUR & ARSITEKTUR SAMLING CHATBOT (ZAPO-JS)
**Dinas Lingkungan Hidup Provinsi DKI Jakarta**  
*Testing & Staging Environment: `cb2`*

---

## 1. Ringkasan Eksekutif
Chatbot SAMLING (Sampah Lingkungan) pada folder `cb2` adalah reimplementasi modern berbasis **`zapo-js`** (ESM native) yang menggantikan stack legacy Baileys. Sistem dirancang ringan, minim dependensi biner/bloatware, menggunakan penyimpanan sesi SQLite, serta terintegrasi langsung dengan backend API DLH DKI Jakarta dan AI Agent otonom.

* **Lokasi Direktori:** `/home/container/home/cidz/service/cb2`
* **Node Environment:** ESM (`"type": "module"` di `package.json`)
* **Port Webhook:** `3008` (HTTP API internal: `/health`, `/notify`, `/otp`)
* **Backend API DLH:** `https://api-samling.naufalrafa.my.id/api/v1`
* **Database Session:** SQLite Store (`@zapo-js/store-sqlite` / `better-sqlite3`)

---

## 2. Struktur Direktori Proyek

```text
/home/container/home/cidz/service/cb2/
├── index.js                           # Entry point utama (ESM), init socket & webhook
├── zapo_bridge.js                     # Bridge kompatibilitas adapter Zapo-js ke interface lama
├── settings.js                        # Konfigurasi metadata global & pairing
├── package.json                       # Dependensi ESM: zapo-js, better-sqlite3, axios, express
│
├── src/
│   ├── config.cjs                     # Konfigurasi runtime, port webhook, nomor bot
│   ├── connectionHandler.js           # Penanganan koneksi WhatsApp, QR & pairing code
│   │
│   ├── handlers/
│   │   └── messageHandler.cjs         # Router pesan WhatsApp, role guard, native GPS, AI triggers
│   │
│   ├── cmd_samling/                   # Modul perintah & fitur inti SAMLING
│   │   ├── samling.cjs                # Menu utama WhatsApp interaktif & cek role dinamis
│   │   ├── lapor.cjs                  # Pengaduan sampah warga, state upload foto, koordinat
│   │   ├── event_pic.cjs              # Formulir event, parser GMaps, draft holding GPS
│   │   ├── tps3r.cjs                  # Input & rekap timbangan RDF TPS 3R (akumulasi/revisi)
│   │   ├── special_waste.cjs          # Handler layanan resmi E-Waste & Bulky Waste DLH
│   │   ├── cek_status.cjs             # Pengecekan tiket status aduan masyarakat
│   │   ├── daftar_wilayah.cjs         # Informasi wilayah administratif & TPS se-DKI Jakarta
│   │   └── tpa_bantar_gebang.cjs      # Edukasi & data TPST Bantar Gebang
│   │
│   ├── services/                      # Integrasi eksternal & backend
│   │   ├── ai.cjs                     # Integrasi provider AI LLM (Gemini / OpenAI API)
│   │   ├── ai-system-prompt.cjs       # System prompt & aturan semantic action tags [ACTION:xxx]
│   │   ├── eventService.cjs           # Client API backend untuk whitelist & laporan event
│   │   ├── tps3rService.cjs           # Client API backend untuk verifikasi petugas & timbangan
│   │   ├── webhook-server.cjs         # Server Express internal webhook & rate limiter (Port 3008)
│   │   ├── zoneCache.cjs              # In-memory cache 1.294 zona DKI Jakarta (sinkron per 30 mnt)
│   │   └── notification-poller.cjs    # Background worker notifikasi tiket ke WhatsApp warga
│   │
│   ├── utils/                         # Modul pembantu
│   │   ├── geoHelper.cjs              # Parser link Google Maps (IPv4) & OpenStreetMap Nominatim
│   │   ├── interactiveHelper.cjs      # Builder native flow button, image header card zapo
│   │   ├── PluginLoader.cjs           # Dynamic plugin & command loader
│   │   └── lidMapper.cjs              # Resolver LID (WhatsApp Phone Privacy ID) ke nomor telepon
│   │
│   └── media/
│       └── logo.png                   # Asset gambar resmi banner SAMLING DLH DKI Jakarta
│
└── telegram/                          # Modul listener & helper bot Telegram monitoring
    └── utils/chalkShim.cjs            # Shim pewarnaan CLI kompatibel CJS/ESM
```

---

## 3. Fitur Utama & Cara Kerjanya

### 1. Pesan Interaktif Native Card Bersatu
* Menggunakan `src/utils/interactiveHelper.cjs`.
* Banner logo (`src/media/logo.png`) diunggah secara native ke server WhatsApp via `sock.message.upload()`, kemudian metadata-nya dimasukkan langsung ke properti `header.imageMessage` pada kartu interaktif.
* Hasil: Tampilan pesan WhatsApp berupa **1 gelembung (bubble) kartu utuh** berisi gambar logo, deskripsi layanan, dan tombol aksi tanpa terpisah.

### 2. Layanan Khusus E-Waste & Bulky Waste
* Mengarahkan warga langsung ke portal resmi milik DLH DKI Jakarta tanpa form custom:
  * **E-Waste (Limbah Elektronik):** `https://ewaste.dinaslhdki.id/`
  * **Bulky Waste (Kasur, Lemari, Sofa):** `https://lingkunganhidup.jakarta.go.id/layanan/bulky-waste`
* Terintegrasi dua arah:
  * Tombol menu interaktif & command `!ewaste`, `!bulky`.
  * AI Agent otomatis mendeteksi percakapan santai warga yang ingin membuang perabot/elektronik dan langsung memicu tag aksi.

### 3. Otorisasi Role Dinamis (100% Backend Whitelist)
* Tidak ada nomor telepon yang di-hardcode sebagai petugas/panitia di dalam source code.
* Role dicek secara real-time ke API backend DLH saat pesan masuk:
  * **Masyarakat / Warga:** Hak akses lapor sampah, cek status, panduan e-waste/bulky waste.
  * **Petugas Lapangan TPS 3R:** Menu tambahan pencatatan timbangan harian sampah & RDF.
  * **Panitia Event DLH:** Menu formulir perizinan dan mitigasi sampah kegiatan/acara publik.

### 4. Smart Geocoding & Alur Share Lock (PIN GPS)
* **Resolver Link Google Maps:** Mendukung shortlink `maps.app.goo.gl` menggunakan `curl -4` (paksa IPv4 untuk menghindari limitasi container).
* **Reverse Geocode:** Koordinat GPS otomatis diurai menjadi nama venue, kecamatan, dan wilayah kota DKI Jakarta via OpenStreetMap Nominatim.
* **Pending Event Draft:** Bila PIC mengirim formulir dengan mengosongkan baris lokasi, data acara disimpan sementara ke memori (`pendingEventDrafts`). Saat user mengirimkan **Native Share Location WhatsApp (PIN GPS)**, bot otomatis menyatukan titik koordinat tersebut dan mendaftarkan event ke backend DLH seketika.

---

## 4. Konfigurasi & Cara Menjalankan Layanan

### Menjalankan Service di Background
```bash
cd /home/container/home/cidz/service/cb2
node index.js
```

### Health Check Webhook (Port 3008)
```bash
curl -s http://127.0.0.1:3008/health
# Respons yang diharapkan:
# {"status":"ok","service":"samling-chatbot-webhook","port":3008,"whatsapp_connected":true}
```

---
*Dokumentasi ini digenerate untuk kelanjutan pengembangan pada sesi baru.*
