// Load environment variables from .env file
require('dotenv').config();

module.exports = {
    // ═══════════════════════════════════════════════════════
    // BOT IDENTITY - Aman untuk diedit langsung
    // ═══════════════════════════════════════════════════════
    
    // Nama owner
    ownerName: 'Samling Team',

    // Nama bot
    botName: 'Samling AI',

    // Footer text untuk pesan bot
    footerTxt: 'Samling Team © 2026',

    // Prefix command (contoh: ! . /)
    prefix: '!',

    // ═══════════════════════════════════════════════════════
    // BOT BEHAVIOR - Aman untuk diedit langsung
    // ═══════════════════════════════════════════════════════
    
    // Mode bot: 'public' → semua orang | 'self' → hanya owner
    botMode: 'public',

    // Otomatis centang biru pesan yang masuk
    autoRead: true,

    // Tampilkan indikator "mengetik..." saat membalas
    autoTyping: true,

    // Folder penyimpanan sesi login
    authFolder: './src/database/session',

    // ═══════════════════════════════════════════════════════
    // WHATSAPP CREDENTIALS - Dari .env (SENSITIF)
    // ═══════════════════════════════════════════════════════
    
    // Super Owner — hanya 1 nomor, akses penuh termasuk manage co-owner
    superOwner: process.env.WHATSAPP_SUPER_OWNER || '62859195391196',

    // Co-Owner — bisa lebih dari satu, akses owner biasa
    // Format di .env: pisahkan dengan koma (contoh: 6289111111111,6289222222222)
    coOwner: process.env.WHATSAPP_CO_OWNERS 
        ? process.env.WHATSAPP_CO_OWNERS.split(',').map(num => num.trim())
        : ['6289999999999'],

    // Nomor Petugas Lapangan TPS 3R / Dinas (Dikelola murni via web backend API)
    officers: process.env.WHATSAPP_OFFICERS 
        ? process.env.WHATSAPP_OFFICERS.split(',').map(num => num.trim())
        : [],

    // Nomor Panitia Event (Whitelist Lapor Event)
    eventCommittees: process.env.WHATSAPP_EVENT_COMMITTEES
        ? process.env.WHATSAPP_EVENT_COMMITTEES.split(',').map(num => num.trim())
        : ['6282335241416', '082335241416'],

    // Channel ID WhatsApp - Format: '120363xxxxxxxxx@newsletter'
    // Kosongkan jika tidak dipakai
    channelId: process.env.WHATSAPP_CHANNEL_ID || '120363185570235320@newsletter',
    
    // License key untuk sistem lisensi bot
    licenseKey: process.env.WHATSAPP_LICENSE_KEY || 'OTP-xxxxx',
    
    // Nomor WhatsApp bot ini
    botNumber: process.env.WHATSAPP_BOT_NUMBER || '6288740306882',
    
    // ═══════════════════════════════════════════════════════
    // TELEGRAM BOT CONFIGURATION - Dari .env (SENSITIF)
    // ═══════════════════════════════════════════════════════
    
    // Token bot Telegram dari @BotFather
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    
    // Owner ID Telegram (dapatkan dari @userinfobot)
    telegramOwnerId: process.env.TELEGRAM_OWNER_ID || '1816457002',

    // List ID Telegram Petugas / Owner
    telegramOfficers: (process.env.TELEGRAM_OFFICERS || '1816457002,7173328223').split(',').map(s => s.trim()),

    // List ID Telegram Panitia Event
    telegramEventCommittees: (process.env.TELEGRAM_EVENT_COMMITTEES || '1816457002').split(',').map(s => s.trim()),
    
    // Nama channel testimoni Telegram (tanpa @)
    telegramChannelName: process.env.TELEGRAM_CHANNEL_NAME || '',
    
    // Link grup Telegram
    telegramGroupLink: process.env.TELEGRAM_GROUP_LINK || '',

    // ═══════════════════════════════════════════════════════
    // AI CHATBOT CONFIGURATION - Dari .env (SENSITIF)
    // ═══════════════════════════════════════════════════════
    
    // AI Chatbot Model Configuration
    ai: {
        baseUrl: process.env.AI_BASE_URL || 'https://router.agung.web.id/1', //bisa memakai base url dan apikey yang di env, atau base api pribadi
        apiKey: process.env.AI_API_KEY || '',
        model: process.env.AI_MODEL || 'combo/low',
        //'cohere/north-mini-code:free', // model setting disini, bisa diganti sesuai kebutuhan
        maxTokens: 9000,
        temperature: 0.78,
        historyLimit: 33, // max messages per user conversation
        historyTTL: 30 * 60 * 2000, // 60 minutes TTL
    }
};
