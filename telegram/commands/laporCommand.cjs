/**
 * Commands: /lapor, /lapor_event
 * Entry point untuk flow laporan sampah/event
 * Navigation logic ada di actions/laporAction.js
 */
const config = require('../../src/config.cjs');
const api = require('../../src/services/api.cjs');
const zoneCache = require('../../src/services/zone_cache.cjs');
const FormData = require('form-data');
const { buildInlineKeyboard } = require('../utils/helper.cjs');
const { setState, getState, clearState } = require('../utils/stateManager.cjs');

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
            successNote: '\n\nLaporan ini akan membantu estimasi lonjakan sampah di area TPS.',
        };
    }
    return {
        emoji: '🗑️',
        title: 'LAPOR SAMPAH',
        kondisiLabel: 'Kondisi',
        photoPrompt: 'foto sampah',
        successTitle: 'LAPORAN SAMPAH BERHASIL DIKIRIM',
        successNote: '',
    };
}

/**
 * Submit report to API
 */
async function submitReport(ctx, state) {
    const userId = String(ctx.from.id);
    const form = new FormData();

    form.append('whatsapp_number', userId); // Gunakan telegram userId
    form.append('report_content', state.kondisi);
    form.append('zone_id', state.zoneId.toString());
    form.append('type', state.type || 'waste');

    // Attach photo jika ada
    if (state.photoBuffer) {
        form.append('image', state.photoBuffer, {
            filename: 'report.jpg',
            contentType: 'image/jpeg',
        });
    }

    try {
        const response = await api.submitCitizenReport(form);
        const ticketId = response.data.id;

        clearState(userId);

        const typeMsg = getTypeMessages(state.type || 'waste');
        const mediaCount = state.photoBuffer ? 1 : 0;

        const output = (
            `✅ *${typeMsg.successTitle}*\n\n` +
            `🎫 *Nomor Tiket:* #${ticketId}\n` +
            `📝 ${typeMsg.kondisiLabel}: ${state.kondisi}\n` +
            `📍 Lokasi: ${state.wilayahName} / ${state.kecamatanName} / ${state.kelurahanName} / ${state.tpsName}\n` +
            `📷 Media: ${mediaCount > 0 ? `${mediaCount} file` : 'Tidak ada'}\n` +
            `📊 Status: Baru\n\n` +
            `💡 Cek status: /cekstatus ${ticketId}\n\n` +
            `Terima kasih atas laporan Anda.${typeMsg.successNote}`
        );

        await ctx.reply(output, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('[lapor] API submit error:', err.message);
        await ctx.reply(
            `❌ Gagal mengirim laporan: ${err.message || 'Koneksi gagal'}\n\nSilakan coba lagi.`
        );
    }
}

module.exports = (bot) => {
    // Command: /lapor
    bot.command('lapor', async (ctx) => {
        try {
            const args = ctx.message.text.split(/\s+/).slice(1);
            const kondisi = args.join(' ').trim();

            if (!kondisi || kondisi.length < 10) {
                return await ctx.reply(
                    `📝 *PANDUAN MEMBUAT LAPORAN SAMPAH*\n\n` +
                    `Gunakan format:\n/lapor <kondisi yang ingin dilaporkan>\n\n` +
                    `*Contoh:*\n/lapor sampah numpuk seminggu di depan rumah\n/lapor TPS penuh tidak diangkut`,
                    { parse_mode: 'Markdown' }
                );
            }

            await ctx.reply('⏳ Memuat data wilayah...');

            const ok = await zoneCache.ensureInitialized();
            if (!ok) {
                return await ctx.reply(
                    '❌ Gagal memuat data wilayah. Silakan coba lagi nanti.'
                );
            }

            const wilayahList = zoneCache.getWilayahList();
            if (!wilayahList || wilayahList.length === 0) {
                return await ctx.reply('❌ Data wilayah kosong.');
            }

            // Simpan kondisi + wilayahList ke state
            const userId = String(ctx.from.id);
            setState(userId, {
                flow: 'lapor',
                type: 'waste',
                kondisi,
                wilayahList,
            });

            const buttons = wilayahList.map((wil, i) => ({
                text: wil,
                data: `lapor:wil:${i}`,
            }));
            buttons.push({ text: '❌ Batal', data: 'lapor:batal' });

            await ctx.reply(
                `📍 *PILIH WILAYAH*\n\n` +
                `📝 Kondisi: ${kondisi}\n\n` +
                `Pilih wilayah tempat kejadian:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporCommand] Error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat memproses laporan.');
        }
    });

    // Command: /lapor_event
    bot.command('lapor_event', async (ctx) => {
        try {
            const args = ctx.message.text.split(/\s+/).slice(1);
            const kondisi = args.join(' ').trim();

            if (!kondisi || kondisi.length < 10) {
                return await ctx.reply(
                    `🎪 *PANDUAN LAPOR ACARA/EVENT*\n\n` +
                    `Gunakan format:\n/lapor_event <deskripsi acara>\n\n` +
                    `*Contoh:*\n/lapor_event hajatan pernikahan besok sore estimasi 200 tamu\n/lapor_event pengajian akbar minggu depan di kelurahan`,
                    { parse_mode: 'Markdown' }
                );
            }

            await ctx.reply('⏳ Memuat data wilayah...');

            const ok = await zoneCache.ensureInitialized();
            if (!ok) {
                return await ctx.reply(
                    '❌ Gagal memuat data wilayah. Silakan coba lagi nanti.'
                );
            }

            const wilayahList = zoneCache.getWilayahList();
            if (!wilayahList || wilayahList.length === 0) {
                return await ctx.reply('❌ Data wilayah kosong.');
            }

            const userId = String(ctx.from.id);
            setState(userId, {
                flow: 'lapor',
                type: 'event',
                kondisi,
                wilayahList,
            });

            const buttons = wilayahList.map((wil, i) => ({
                text: wil,
                data: `lapor:wil:${i}`,
            }));
            buttons.push({ text: '❌ Batal', data: 'lapor:batal' });

            await ctx.reply(
                `🎪 *LAPOR ACARA/EVENT*\n\n` +
                `📍 *PILIH WILAYAH*\n\n` +
                `📝 Acara: ${kondisi}\n\n` +
                `Pilih wilayah lokasi acara:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporCommand] Error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat memproses laporan event.');
        }
    });

    // Photo handler: detect user kirim foto saat dalam media state
    bot.on('photo', async (ctx) => {
        try {
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || state.flow !== 'lapor' || !state.uploadingMedia) {
                return; // Bukan bagian dari flow lapor
            }

            await ctx.reply('📸 Foto terdeteksi! Memproses...');

            // Download photo
            const photos = ctx.message.photo;
            const largestPhoto = photos[photos.length - 1];
            const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);

            // Download as buffer
            const axios = require('axios');
            const response = await axios.get(fileLink.href, {
                responseType: 'arraybuffer',
            });
            const photoBuffer = Buffer.from(response.data);

            // Update state dengan foto
            setState(userId, { ...state, photoBuffer });

            await ctx.reply('📸 Foto diterima! Mengirim laporan...');

            // Auto-submit
            await submitReport(ctx, { ...state, photoBuffer });
        } catch (err) {
            console.error('[laporCommand] Photo handler error:', err.message);
            await ctx.reply(
                '⚠️ Gagal memproses foto. Ketik /lapor untuk mulai ulang.'
            );
        }
    });

    // Text handler untuk "lanjut" saat media state
    bot.on('text', async (ctx) => {
        try {
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || state.flow !== 'lapor' || !state.uploadingMedia) {
                return; // Bukan bagian dari flow lapor
            }

            const text = ctx.message.text.toLowerCase().trim();
            if (text === 'lanjut' || text === 'skip' || text === 'kirim') {
                await ctx.reply('📤 Mengirim laporan tanpa foto...');
                await submitReport(ctx, state);
            } else if (text === 'batal' || text === 'cancel') {
                clearState(userId);
                await ctx.reply('❌ Laporan dibatalkan.');
            }
        } catch (err) {
            console.error('[laporCommand] Text handler error:', err.message);
        }
    });
};

// Export submit function untuk dipanggil dari action
module.exports.submitReport = submitReport;
