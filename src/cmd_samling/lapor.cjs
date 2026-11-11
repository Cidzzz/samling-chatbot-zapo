const config = require('../config.cjs');
const { getImage } = require('../utils/helper.cjs');
const { fakeOrder } = require('../utils/fquoted.cjs');
const { sendInteractiveWithImage } = require('../utils/interactiveHelper.cjs');
const api = require('../services/api.cjs');
const zoneCache = require('../services/zone_cache.cjs');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
async function downloadMediaMessage(msg, type = 'buffer', opts = {}) {
    if (msg && typeof msg.download === 'function') {
        const buf = await msg.download();
        if (buf && buf.length) return buf;
    }
    if (msg?.raw && typeof msg.raw.download === 'function') {
        const buf = await msg.raw.download();
        if (buf && buf.length) return buf;
    }
    return Buffer.from([]);
}
const {
    buildWilayahButtons,
    buildKecamatanButtons,
    buildKelurahanButtons,
    buildTpsButtons,
    buildConfirmationButtons,
    buildMediaDoneButton,
    dec
} = require('./lapor/button_builders.cjs');

/**
 * Extract report type from command or button ID
 * @param {string} cmdName - Command name or button ID
 * @returns {string} 'waste' or 'event'
 */
function extractType(cmdName) {
    if (!cmdName) return 'waste';
    if (cmdName === 'lapor_event' || cmdName.startsWith('event_')) return 'event';
    return 'waste';
}

/**
 * Get localized messages based on report type
 */
function getTypeMessages(type) {
    if (type === 'event') {
        return {
            emoji: '🎪',
            title: 'LAPOR ACARA/EVENT',
            kondisiLabel: 'Deskripsi Acara',
            photoPrompt: 'foto lokasi acara',
            successTitle: 'LAPORAN ACARA BERHASIL DIKIRIM',
            successNote: '\n\nLaporan ini akan membantu estimasi lonjakan sampah di area TPS.'
        };
    }
    // Default: waste
    return {
        emoji: '🗑️',
        title: 'LAPOR SAMPAH',
        kondisiLabel: 'Kondisi',
        photoPrompt: 'foto sampah',
        successTitle: 'LAPORAN SAMPAH BERHASIL DIKIRIM',
        successNote: ''
    };
}

/**
 * Lapor Handler v4 - Stateless Refactor
 *
 * Flow: !lapor <kondisi> → Wilayah → Kecamatan → Kelurahan → TPS → Submit
 * Semua context di-encode dalam button ID, TIDAK ada state_manager.
 * Satu-satunya state: UPLOADING_MEDIA (Map sementara untuk collect foto).
 */

// ponytail: minimal state hanya untuk media upload, auto-expire 5 menit
const mediaStates = new Map();
const MEDIA_TIMEOUT = 5 * 60 * 1000;

const lidMapper = require('../utils/lidMapper.cjs');

function normalizeSenderPhone(raw) {
    if (!raw) return '';
    const clean = String(raw).replace(/\D/g, '').split('@')[0].split(':')[0];
    const mapped = lidMapper.getPhoneFromLid(clean);
    return mapped || clean;
}

function setMediaState(phone, data) {
    const key = normalizeSenderPhone(phone);
    // Clear existing timeout
    const existing = mediaStates.get(key);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(() => mediaStates.delete(key), MEDIA_TIMEOUT);
    mediaStates.set(key, { ...data, timer });
}

function getMediaState(phone) {
    const key = normalizeSenderPhone(phone);
    return mediaStates.get(key) || null;
}

function clearMediaState(phone) {
    const key = normalizeSenderPhone(phone);
    const existing = mediaStates.get(key);
    if (existing?.timer) clearTimeout(existing.timer);
    mediaStates.delete(key);
}

// Build message context helper
function buildCtx(params) {
    const { Hanz, msg, sender, senderNumber, pushname } = params;
    return {
        Hanz, msg, sender, senderNumber, pushname,
        fakeOrder,
        reply: async (text) => Hanz.sendMessage(sender, { text }, { quoted: msg }),
        interactive: async (opts) => {
            if (params.sendInteractiveWithImage) {
                return params.sendInteractiveWithImage(opts);
            }
            return sendInteractiveWithImage(Hanz, sender, opts);
        }
    };
}

// Standard interactive message wrapper
function interactiveOpts(text, buttons) {
    return {
        imageSource: getImage(),
        text,
        footer: config.footerTxt,
        quoted: fakeOrder,
        contextInfo: {
            mentionedJid: ['0@s.whatsapp.net'],
            forwardingScore: 999,
            isForwarded: true,
        },
        buttons
    };
}

/**
 * Ensure zone cache is populated
 */
async function ensureZoneData(ctx) {
    let wilayahList = zoneCache.getWilayahList();
    if (wilayahList && wilayahList.length > 0) return true;

    await ctx.reply('⏳ Memuat data wilayah dari server...');
    try {
        const hierarchy = await api.getZonesHierarchy();
        if (!hierarchy?.wilayah?.length) {
            await ctx.reply('❌ Server mengembalikan data kosong.');
            return false;
        }
        zoneCache.cache.hierarchy = hierarchy;
        zoneCache.cache.zones = zoneCache._flattenHierarchy(hierarchy);
        zoneCache.cache.lastUpdate = new Date();
        zoneCache.isInitialized = true;
        return true;
    } catch (err) {
        await ctx.reply(`❌ Gagal memuat data wilayah: ${err.message || 'Koneksi gagal'}`);
        return false;
    }
}

/**
 * Main Router - Stateless
 */
async function handleLaporanFlow(params) {
    const ctx = buildCtx(params);
    const cmdName = params.command?.name || '';
    const text = params.text?.trim() || '';

    // ─── MEDIA UPLOAD STATE (satu-satunya state) ───
    const mediaState = getMediaState(ctx.senderNumber);
    if (mediaState) {
        // Button commands
        if (cmdName === 'lapor_media_done' || cmdName === 'event_media_done') {
            return await submitReport(ctx, mediaState);
        }
        if (cmdName === 'lapor_batal') {
            clearMediaState(ctx.senderNumber);
            deletePendingKondisi(ctx.senderNumber);
            deletePendingSubmit(ctx.senderNumber);
            return await ctx.reply('❌ Laporan dibatalkan.');
        }

        // FIX 2026-07-14: Handle "lanjut" text → submit tanpa foto
        const textLower = text.toLowerCase().trim();
        if (textLower === 'lanjut' || textLower === 'skip' || textLower === 'kirim') {
            return await submitReport(ctx, mediaState);
        }
        // FIX 2026-07-14 / 2026-09-16: Handle cancel / reset text (fleksibel)
        const isCancel = /^(batal|batalkan|cancel|batalin|reset|stop|keluar)$/i.test(textLower);
        if (isCancel) {
            clearMediaState(ctx.senderNumber);
            deletePendingKondisi(ctx.senderNumber);
            deletePendingSubmit(ctx.senderNumber);
            return await ctx.reply('❌ Laporan berhasil dibatalkan. State telah direset.');
        }

        // Breakout / Interupsi jika user mengetik sapaan atau command lain
        const isBreakout = /^(hai|halo|p|menu|samling|!samling|!menu|timbangan|!timbangan|target|!target|rekap|!rekap|cekstatus|!cekstatus)$/i.test(textLower) || textLower.startsWith('!') || textLower.startsWith('/');
        if (isBreakout) {
            clearMediaState(ctx.senderNumber);
            deletePendingKondisi(ctx.senderNumber);
            deletePendingSubmit(ctx.senderNumber);
            // Return false agar messageHandler melanjutkan pemrosesan pesan ini sebagai command/AI biasa
            return 'BREAKOUT';
        }

        // FIX 2026-07-14: Check for media → auto-detect → auto-submit
        const hasMedia = ctx.msg?.message?.imageMessage || ctx.msg?.message?.videoMessage || ctx.msg?.type === 'image' || ctx.msg?.raw?.message?.imageMessage;
        if (hasMedia) {
            return await handleMediaReceived(ctx, mediaState);
        }

        // Jika user kirim teks lain yang tidak dikenal selama upload mode
        return await ctx.reply(
            '📸 *Menunggu Foto Laporan*\n\n' +
            'Kirim foto sekarang untuk melengkapi laporan Anda.\n' +
            '• Ketik *lanjut* untuk kirim laporan tanpa foto.\n' +
            '• Ketik *batal* untuk membatalkan laporan ini.'
        );
    }

    // ─── ENTRY: !lapor tanpa argumen → show guide ───
    if ((cmdName === 'lapor' || cmdName === 'laporan') && (!text || text === '!lapor' || text === '!laporan' || text === 'lapor' || text === 'laporan')) {
        return await ctx.interactive(interactiveOpts(
            `📝 *PANDUAN MEMBUAT LAPORAN SAMPAH*\n\nGunakan format:\n!lapor <kondisi yang ingin dilaporkan>\n\n*Contoh:*\n!lapor sampah numpuk seminggu di depan rumah\n!lapor TPS penuh tidak diangkut`,
            [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '« Kembali ke Menu', id: 'menu' }) }]
        ));
    }

    // ─── ENTRY: !lapor_event tanpa argumen → show guide ───
    if (cmdName === 'lapor_event' && (!text || text === '!lapor_event' || text === 'lapor_event')) {
        return await ctx.interactive(interactiveOpts(
            `🎪 *LAYANAN PEMBERITAHUAN KEGIATAN / EVENT DLH*\n────────────────────────────\n` +
            `Sebagai Panitia Acara terdaftar, Anda dapat mengajukan pengelolaan sampah kegiatan dengan dua cara mudah:\n\n` +
            `1️⃣ *Ceritakan Langsung ke AI (Otomatis):*\n` +
            `Ketik pesan santai rincian acara Anda. AI Samling akan otomatis mengeksekusi dan memvalidasinya.\n` +
            `_Contoh:_\n` +
            `• "Saya mau lapor event Festival Musik besok sore di Monas estimasi 500 orang"\n` +
            `• "Ajukan armada sampah untuk jalan sehat hari minggu di GBK"\n\n` +
            `2️⃣ *Gunakan Format Cepat:*\n` +
            `• !lapor_event <deskripsi acara>\n\n` +
            `3️⃣ *Minta Formulir Lengkap:*\n` +
            `Ketik *"Kasih form"* atau *"Format event"* untuk mendapatkan formulir isian resmi siap salin.`,
            [
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 Minta Formulir Event', id: 'kasih_form_event' }) },
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '« Kembali ke Menu', id: 'menu' }) }
            ]
        ));
    }

    // ─── ENTRY: !lapor <kondisi> → start flow ───
    if (text.startsWith('!lapor ')) {
        const kondisi = text.substring(7).trim();
        if (!kondisi || kondisi.length < 10) {
            return await ctx.reply('⚠️ Deskripsi terlalu singkat (min 10 karakter).\n\nContoh: !lapor sampah menumpuk di depan rumah sejak seminggu lalu');
        }

        if (!await ensureZoneData(ctx)) return;

        // ponytail: encode kondisi di global temp, keyed by sender, expire 10 min
        // Ini satu-satunya "state" selain media — tapi sangat ringan
        setPendingKondisi(ctx.senderNumber, { kondisi, ts: Date.now() });

        return await ctx.interactive(interactiveOpts(
            `📍 *PILIH WILAYAH*\n\n📝 Kondisi: ${kondisi}\n\nPilih wilayah tempat kejadian:`,
            buildWilayahButtons('waste')
        ));
    }

    // ─── ENTRY: !lapor_event <deskripsi> → start flow for event ───
    if (text.startsWith('!lapor_event ')) {
        const kondisi = text.substring(13).trim(); // 13 = length of '!lapor_event '
        if (!kondisi || kondisi.length < 10) {
            return await ctx.reply('⚠️ Deskripsi acara terlalu singkat (min 10 karakter).\n\nContoh: !lapor_event hajatan pernikahan besok sore, estimasi 200 tamu');
        }

        if (!await ensureZoneData(ctx)) return;

        pendingKondisi.set(ctx.senderNumber, { kondisi, ts: Date.now(), type: 'event' });

        return await ctx.interactive(interactiveOpts(
            `🎪 *LAPOR ACARA/EVENT*\n\n📍 *PILIH WILAYAH*\n\n📝 Acara: ${kondisi}\n\nPilih wilayah lokasi acara:`,
            buildWilayahButtons('event')
        ));
    }

    // ─── BUTTON ROUTER (stateless — semua context di button ID) ───

    // Handle batal for both types
    if (cmdName === 'lapor_batal' || cmdName === 'event_batal') {
        pendingKondisi.delete(ctx.senderNumber);
        return await ctx.reply('❌ Laporan dibatalkan.');
    }

    // Wilayah selected: lapor_wil_<wilayahCode> or event_wil_<wilayahCode>
    if (cmdName.startsWith('lapor_wil_') || cmdName.startsWith('event_wil_')) {
        const reportType = extractType(cmdName);
        const prefix = reportType === 'event' ? 'event_wil_' : 'lapor_wil_';
        const wilayahCode = cmdName.replace(prefix, '');
        const wilayahName = dec(wilayahCode);

        if (!await ensureZoneData(ctx)) return;

        return await ctx.interactive(interactiveOpts(
            `📍 *${wilayahName.toUpperCase()} - Pilih Kecamatan*\n\nPilih kecamatan tempat kejadian:`,
            buildKecamatanButtons(wilayahName, reportType)
        ));
    }

    // Kecamatan selected: lapor_kec_<wilayahCode>::<kecCode> or event_kec_<wilayahCode>::<kecCode>
    if (cmdName.startsWith('lapor_kec_') || cmdName.startsWith('event_kec_')) {
        const reportType = extractType(cmdName);
        const prefix = reportType === 'event' ? 'event_kec_' : 'lapor_kec_';
        const payload = cmdName.replace(prefix, '');
        const [wCode, kCode] = payload.split('::');
        const wilayahName = dec(wCode);
        const kecamatanName = dec(kCode);

        return await ctx.interactive(interactiveOpts(
            `🏘️ *${kecamatanName.toUpperCase()} - Pilih TPS*\n\nPilih TPS tempat kejadian:`,
            buildTpsButtons(wilayahName, kecamatanName, reportType)
        ));
    }

    // TPS selected: lapor_tps_<zone_id>::<wCode>::<kCode>
    if (cmdName.startsWith('lapor_tps_') || cmdName.startsWith('event_tps_')) {
        const reportType = extractType(cmdName);
        const typeMsg = getTypeMessages(reportType);
        const prefix = reportType === 'event' ? 'event_tps_' : 'lapor_tps_';
        const payload = cmdName.replace(prefix, '');
        const parts = payload.split('::');
        const zoneId = parseInt(parts[0], 10);
        const wilayahName = dec(parts[1] || '');
        const kecamatanName = dec(parts[2] || '');

        // Get TPS display name
        const tpsList = zoneCache.getTpsList(wilayahName, kecamatanName);
        const selectedTps = tpsList.find(t => t.id === zoneId) || zoneCache.getZoneById(zoneId);
        const tpsName = selectedTps ? `${selectedTps.name} - ${selectedTps.jenis_tps || 'TPS'}` : `Zone #${zoneId}`;

        // Get kondisi from pending (includes type if set)
        const pending = getPendingKondisi(ctx.senderNumber);
        const kondisi = pending?.kondisi || '(tidak tersedia)';

        // Store submit data & enter media state langsung
        const submitData = {
            kondisi, zoneId, wilayahName, kecamatanName, tpsName,
            senderNumber: ctx.senderNumber,
            pushname: ctx.pushname,
            type: reportType,
            media: []
        };

        setMediaState(ctx.senderNumber, submitData);
        setPendingSubmit(ctx.senderNumber, submitData);

        return await ctx.reply(`${typeMsg.emoji} *RINGKASAN LAPORAN*\n\n📝 *${typeMsg.kondisiLabel}:*\n${kondisi}\n\n📍 *Lokasi:*\nWilayah: ${wilayahName}\nKecamatan: ${kecamatanName}\nTPS: ${tpsName}\n\n───────────────────\n\n📸 Silakan kirim ${typeMsg.photoPrompt} (opsional)\nAtau ketik *lanjut* untuk submit tanpa foto\nKetik *batal* untuk membatalkan`);
    }

    // Legacy button handlers (backward compat jika ada button lama)
    if (cmdName === 'lapor_skip_media') {
        const submitData = pendingSubmit.get(ctx.senderNumber) || getMediaState(ctx.senderNumber);
        if (!submitData) return await ctx.reply('⚠️ Tidak ada laporan aktif. Mulai dengan: !lapor <kondisi>');
        return await submitReport(ctx, submitData);
    }

    if (cmdName === 'lapor_upload_media') {
        // Sudah otomatis dalam media state, cukup reply
        if (getMediaState(ctx.senderNumber)) {
            return await ctx.reply('📸 Silakan kirim foto sekarang, atau ketik *lanjut* untuk submit tanpa foto.');
        }
        const submitData = pendingSubmit.get(ctx.senderNumber);
        if (!submitData) return await ctx.reply('⚠️ Tidak ada laporan aktif. Mulai dengan: !lapor <kondisi>');
        setMediaState(ctx.senderNumber, { ...submitData, media: [] });
        return await ctx.reply('📸 Silakan kirim foto sekarang, atau ketik *lanjut* untuk submit tanpa foto.');
    }

    // Back buttons (stateless — re-render previous step)
    if (cmdName === 'lapor_back_wil' || cmdName === 'event_back_wil') {
        const reportType = extractType(cmdName);
        return await ctx.interactive(interactiveOpts(
            `📍 *PILIH WILAYAH*\n\nPilih wilayah tempat kejadian:`,
            buildWilayahButtons(reportType)
        ));
    }

    if (cmdName.startsWith('lapor_back_kec_') || cmdName.startsWith('event_back_kec_')) {
        const reportType = extractType(cmdName);
        const prefix = reportType === 'event' ? 'event_back_kec_' : 'lapor_back_kec_';
        const wCode = cmdName.replace(prefix, '');
        const wilayahName = dec(wCode);
        return await ctx.interactive(interactiveOpts(
            `📍 *${wilayahName.toUpperCase()} - Pilih Kecamatan*\n\nPilih kecamatan tempat kejadian:`,
            buildKecamatanButtons(wilayahName, reportType)
        ));
    }

    if (cmdName.startsWith('lapor_back_kel_') || cmdName.startsWith('event_back_kel_')) {
        const reportType = extractType(cmdName);
        const prefix = reportType === 'event' ? 'event_back_kel_' : 'lapor_back_kel_';
        const payload = cmdName.replace(prefix, '');
        const [wCode, kCode] = payload.split('::');
        const wilayahName = dec(wCode);
        const kecamatanName = dec(kCode);
        return await ctx.interactive(interactiveOpts(
            `🏘️ *${kecamatanName.toUpperCase()} - Pilih TPS*\n\nPilih TPS tempat kejadian:`,
            buildTpsButtons(wilayahName, kecamatanName, reportType)
        ));
    }
}

// ─── MINIMAL STATE: pending kondisi & submit data ───
// ponytail: lightweight Map with auto-expire, no complex state machine
const pendingKondisi = new Map(); // phone → { kondisi, ts }
const pendingSubmit = new Map();  // phone → { kondisi, zoneId, ... }

function setPendingKondisi(phone, data) {
    const key = normalizeSenderPhone(phone);
    pendingKondisi.set(key, data);
}

function getPendingKondisi(phone) {
    const key = normalizeSenderPhone(phone);
    return pendingKondisi.get(key) || null;
}

function deletePendingKondisi(phone) {
    const key = normalizeSenderPhone(phone);
    pendingKondisi.delete(key);
}

function setPendingSubmit(phone, data) {
    const key = normalizeSenderPhone(phone);
    pendingSubmit.set(key, data);
}

function getPendingSubmit(phone) {
    const key = normalizeSenderPhone(phone);
    return pendingSubmit.get(key) || null;
}

function deletePendingSubmit(phone) {
    const key = normalizeSenderPhone(phone);
    pendingSubmit.delete(key);
}

// Auto-cleanup every 10 min
setInterval(() => {
    const now = Date.now();
    const TEN_MIN = 10 * 60 * 1000;
    for (const [k, v] of pendingKondisi) {
        if (now - v.ts > TEN_MIN) pendingKondisi.delete(k);
    }
    for (const [k, v] of pendingSubmit) {
        if (now - (v.ts || 0) > TEN_MIN) pendingSubmit.delete(k);
    }
}, 10 * 60 * 1000);

/**
 * Handle received media during upload state
 * FIX 2026-07-14: Auto-detect foto → auto-submit laporan
 */
async function handleMediaReceived(ctx, mediaState) {
    try {
        await ctx.reply('📸 Media terdeteksi! Memproses foto...');

        const buffer = await downloadMediaMessage(ctx.msg, 'buffer', {});
        if (!buffer?.length) {
            return await ctx.reply('⚠️ Gagal memproses foto. Coba kirim ulang atau ketik *lanjut* untuk submit tanpa foto.');
        }

        // Save to disk with safe sanitized path
        const safeSender = String(ctx.senderNumber || 'unknown').replace(/\D/g, '');
        const baseDir = path.join(__dirname, '../database/laporan_warga', safeSender, Date.now().toString());
        await fs.promises.mkdir(baseDir, { recursive: true });
        const filename = `media_1.jpg`;
        await fs.promises.writeFile(path.join(baseDir, filename), buffer);

        const mediaPath = path.join(baseDir, filename);
        const updatedData = { ...mediaState, media: [mediaPath] };

        // ponytail: auto-submit setelah foto diterima
        await ctx.reply('📸 Foto diterima! Mengirim laporan...');
        return await submitReport(ctx, updatedData);
    } catch (err) {
        console.error('[lapor] Media save error:', err.message);
        return await ctx.reply('⚠️ Gagal menyimpan foto. Ketik *lanjut* untuk submit tanpa foto, atau kirim ulang.');
    }
}

/**
 * Submit report to API
 */
async function submitReport(ctx, data) {
    const cleanNumber = ctx.senderNumber;

    const form = new FormData();
    form.append('whatsapp_number', cleanNumber);
    form.append('report_content', data.kondisi);
    form.append('zone_id', data.zoneId.toString());
    form.append('type', data.type || 'waste');

    // Attach first image if available
    if (data.media?.length > 0) {
        try {
            const buffer = await fs.promises.readFile(data.media[0]);
            form.append('image', buffer, { filename: 'report.jpg', contentType: 'image/jpeg' });
        } catch (err) {
            console.error('[lapor] Read media error:', err.message);
            // Continue without image
        }
    }

    try {
        const response = await api.submitCitizenReport(form);
        const ticketId = response.data.id;

        // Cleanup all temp state
        clearMediaState(ctx.senderNumber);
        deletePendingKondisi(ctx.senderNumber);
        deletePendingSubmit(ctx.senderNumber);

        const mediaCount = data.media?.length || 0;
        const typeMsg = getTypeMessages(data.type || 'waste');
        return await ctx.reply(`✅ *${typeMsg.successTitle}*\n\n🎫 *Nomor Tiket:* #${ticketId}\n📝 ${typeMsg.kondisiLabel}: ${data.kondisi}\n📍 Lokasi: ${data.wilayahName} / ${data.kecamatanName} / ${data.tpsName}\n📷 Media: ${mediaCount > 0 ? `${mediaCount} file` : 'Tidak ada'}\n📊 Status: Baru\n\n💡 Cek status: !cekstatus ${ticketId}\n\nTerima kasih atas laporan Anda.${typeMsg.successNote}`);
    } catch (err) {
        console.error('[lapor] API submit error:', err);
        return await ctx.reply(`❌ Gagal mengirim laporan: ${err.message || 'Koneksi gagal'}\n\nSilakan coba lagi.`);
    }
}

module.exports = handleLaporanFlow;
module.exports.commands = ['laporan', 'lapor', 'lapor_event'];
// ponytail: export for messageHandler to check media state
module.exports.hasActiveMediaState = (phone) => mediaStates.has(phone);
