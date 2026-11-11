# 🤖 Samling AI — Chatbot WhatsApp Pintar untuk Manajemen Sampah

Bot WhatsApp berbasis **Node.js** + **Baileys** dengan integrasi AI (OpenRouter API) untuk pelaporan sampah, cek status, dan manajemen wilayah TPS/TPA. Dilengkapi AI Agent yang bisa mengeksekusi fitur Samling secara otomatis berdasarkan intent user.

> **Pencipta:** Agung Dwi Saputra — **Tim Sekawan Engineer**

---

## ✨ Fitur Utama

### 1. AI Chatbot Natural Language
Bot merespon pesan seperti manusia menggunakan **OpenRouter API** dengan model `nvidia/nemotron-nano-12b-v2-vl:free`. Mendukung riwayat percakapan per-user (history limit 28 pesan, TTL 30 menit).

### 2. AI Agent Auto-Execute
AI bisa otomatis mengeksekusi fitur Samling (lapor, cek status, daftar wilayah, dll) berdasarkan intent user. Cukup chat natural, AI akan memilih dan menjalankan command yang sesuai.

### 3. Lapor Sampah
```
!lapor <kondisi>
```
Flow interaktif: pilih **wilayah** → **kecamatan** → **kelurahan** → **TPS** → upload **foto** (opsional) → submit ke API backend.

### 4. Lapor Event/Acara
```
!lapor_event <deskripsi>
```
Laporkan event/acara untuk estimasi lonjakan sampah di area tertentu.

### 5. Cek Status Laporan
```
!cekstatus <id>
!lihat_laporan <id>
```
Cek status laporan sampah berdasarkan ID laporan.

### 6. Daftar Wilayah / TPS / TPA
```
!daftar_wilayah
!daftar_tps
!daftar_tpa
```
Menampilkan daftar wilayah, TPS, dan TPA yang tersedia di sistem Samling.

### 7. Group Whitelist AI
```
!wlistgb   → whitelist grup (aktifkan AI di grup)
!blistgb   → blacklist grup (matikan AI di grup)
```
Khusus **Super Owner**. Mengontrol grup mana saja yang boleh direspon oleh AI.

### 8. Sifat AI Khusus (Custom Persona)
Custom persona/sifat AI per nomor WhatsApp via [`cb/database/ai_personas.json`](cb/database/ai_personas.json). Setiap nomor bisa punya persona dan temperature berbeda.

### 9. Push Notification Polling
Bot menarik notifikasi dari backend **FastAPI** secara berkala (default: 30 detik) dan mengirimkannya via WhatsApp. Mendukung retry otomatis untuk notifikasi yang gagal.

### 10. LID to Phone Number
Auto convert WhatsApp LID (Lightweight Identifier) ke nomor WhatsApp asli untuk kompatibilitas pesan.

### 11. Media Auto-detect
Foto yang dikirim otomatis di-download dan di-submit ke API saat proses pelaporan sampah.

---

## 🛠️ Tech Stack

| Komponen | Teknologi |
|---|---|
| Runtime | Node.js v18+ |
| WhatsApp Library | `@whiskeysockets/baileys` v6.7+ |
| AI API | OpenRouter API (OpenAI-compatible) |
| Model AI | `nvidia/nemotron-nano-12b-v2-vl:free` |
| Backend Integration | FastAPI (Python) |
| Frontend | React (Admin Dashboard) |
| HTTP Client | `axios` |
| Media Processing | `sharp`, `fluent-ffmpeg`, `canvas` |

---

## 📁 Struktur Project

```
cb/
├── index.js                      # Entry point — koneksi Baileys
├── package.json
├── .env                          # API keys, base URLs (SENSITIF)
├── .env.example                  # Template environment variables
├── database/                     # Data persisten bot
│   ├── ai_personas.json          # Custom persona per nomor WA
│   └── ai_group_whitelist.json   # Group whitelist AI
├── src/
│   ├── config.js                 # Konfigurasi utama bot + AI settings
│   ├── cmd_samling/              # Command khusus Samling
│   │   ├── samling.js            # Menu utama
│   │   ├── lapor.js              # Fitur lapor sampah
│   │   ├── cek_status.js         # Cek status laporan
│   │   ├── daftar_wilayah.js     # Daftar wilayah/TPS/TPA
│   │   ├── group_whitelist.js    # Whitelist grup AI
│   │   ├── lapor/                # Helper lapor (button builders)
│   │   └── daftar_wilayah/       # Handler wilayah, kecamatan, kelurahan, TPS, TPA
│   ├── services/                 # Service layer
│   │   ├── ai.js                 # Core AI chat logic (OpenRouter API)
│   │   ├── ai-persona.js         # Load custom persona per nomor
│   │   ├── ai-system-prompt.js   # System prompt builder
│   │   ├── api.js                # API client ke backend FastAPI
│   │   ├── group-whitelist.js    # Group whitelist manager
│   │   ├── notification-poller.js# Polling notifikasi dari backend
│   │   └── zone_cache.js         # Cache data wilayah
│   ├── handlers/
│   │   └── messageHandler.js     # Handler pesan masuk
│   ├── utils/
│   │   ├── helper.js             # Fungsi utilitas umum
│   │   ├── PluginLoader.js       # Auto-load & hot-reload command
│   │   ├── interactiveHelper.js  # Helper button interaktif
│   │   └── fquoted.js            # Fake quoted message
│   └── media/
│       └── logo.png              # Logo bot
└── telegram/                     # Integrasi Telegram bot (opsional)
```

---

## ⚙️ Konfigurasi

### 1. Environment Variables (`.env`)

Salin `.env.example` ke `.env` lalu isi:

```bash
# WhatsApp Bot
WHATSAPP_SUPER_OWNER=628xxxxxxxxxx
WHATSAPP_CO_OWNERS=6289999999999,6289888888888
WHATSAPP_CHANNEL_ID=120363xxxxxxxxx@newsletter
WHATSAPP_LICENSE_KEY=OTP-xxxxx
WHATSAPP_BOT_NUMBER=628xxxxxxxxxx

# Telegram (opsional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_OWNER_ID=your_telegram_owner_id
TELEGRAM_CHANNEL_NAME=your_channel_name
TELEGRAM_GROUP_LINK=https://t.me/your_group

# AI Chatbot
AI_BASE_URL=https://router.cidz.web.id/v1
AI_API_KEY=your_api_key_here

# Notification Polling (Backend FastAPI)
BACKEND_API_URL=http://localhost:8000
BACKEND_API_SECRET=your_secret_key_here
NOTIFICATION_POLLING_INTERVAL=30000
NOTIFICATION_MAX_RETRIES=3
```

### 2. AI Settings (`src/config.js`)

```js
ai: {
    baseUrl: process.env.AI_BASE_URL || 'https://router.cidz.web.id/1',
    apiKey: process.env.AI_API_KEY || '',
    model: 'nvidia/nemotron-nano-12b-v2-vl:free',
    maxTokens: 5000,
    temperature: 0.7,
    historyLimit: 28,           // max messages per user
    historyTTL: 30 * 60 * 2000, // 30 minutes TTL
}
```

### 3. Custom Persona (`cb/database/ai_personas.json`)

```json
{
  "628xxxxxxxxxx": {
    "persona": "Kamu adalah asisten ramah yang selalu menggunakan emoji dan bahasa santai.",
    "temperature": 0.8
  }
}
```

### 4. Group Whitelist (`cb/database/ai_group_whitelist.json`)

```json
[
  "120363xxxxxxxxx@g.us",
  "120363yyyyyyyyy@g.us"
]
```

Gunakan `!wlistgb` di dalam grup untuk menambahkan, `!blistgb` untuk menghapus.

---

## 🚀 Instalasi & Menjalankan

```bash
# Install dependencies
npm install

# Jalankan bot (production)
npm start

# Jalankan bot (development — auto restart on change)
npm run dev
```

Saat pertama kali dijalankan, bot akan menampilkan **QR Code**. Scan dengan WhatsApp → **Linked Devices → Link a device**.

---

## 📋 Daftar Command

| Command | Fungsi |
|---|---|
| `!samling` / `!menu` | Tampilkan menu utama |
| `!lapor <kondisi>` | Lapor sampah (flow interaktif) |
| `!lapor_event <deskripsi>` | Lapor event/acara |
| `!cekstatus <id>` | Cek status laporan by ID |
| `!lihat_laporan <id>` | Lihat detail laporan by ID |
| `!daftar_wilayah` | Daftar wilayah tersedia |
| `!daftar_tps` | Daftar TPS tersedia |
| `!daftar_tpa` | Daftar TPA tersedia |
| `!wlistgb` | Whitelist grup untuk AI (Super Owner) |
| `!blistgb` | Blacklist grup dari AI (Super Owner) |
| `!setmode public/self` | Ubah mode bot |
| `!jadibot <nomor>` | Clone bot ke nomor lain |
| `!listbot` | Lihat daftar clone bot aktif |
| `!stopbot <nomor>` | Matikan clone bot |

---

## 🔧 Sistem Hot-Reload

| Aksi | File | Efek |
|---|---|---|
| Edit file | `src/commands/*.js` | Reload command di file itu saja |
| Edit file | `src/utils/*.js`, `src/handlers/*.js`, `src/config.js` | Reload **semua** command |
| Edit file | `lib/*.js` | Reload **semua** command |
| Tambah file baru | `src/commands/` | Command baru otomatis terdaftar |
| Hapus file | `src/commands/` | Command otomatis terhapus |

> ⚠️ Perubahan di `index.js` **tidak** hot-reload — butuh restart manual.

---

## 📦 Dependencies Utama

| Package | Kegunaan |
|---|---|
| `@whiskeysockets/baileys` | Library koneksi WhatsApp |
| `axios` | HTTP client untuk API calls |
| `dotenv` | Load environment variables |
| `sharp` | Image processing |
| `fluent-ffmpeg` | Media conversion |
| `canvas` | Image generation |
| `pino` | Logging |
| `qrcode` | QR code generation |
| `telegraf` | Telegram bot integration |
| `chokidar` | File watcher untuk hot-reload |

---

## ⚠️ Disclaimer

Penggunaan bot WhatsApp di luar ketentuan resmi WhatsApp sepenuhnya menjadi tanggung jawab pengguna. Penulis tidak bertanggung jawab atas penyalahgunaan script ini.

---

**© 2026 Samling AI — Tim Sekawan Engineer**
