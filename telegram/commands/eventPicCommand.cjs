/**
 * Telegram Command: /lapor_event
 * Pelaporan formulir event oleh PIC Whitelist DLH via Telegram
 */

const eventService = require('../../src/services/eventService.cjs');
const config = require('../../src/config.cjs');

const VALID_CATEGORIES = ['Konser', 'Event', 'Olahraga', 'Pameran', 'Keagamaan', 'Festival', 'Pasar Rakyat'];
const VALID_WILAYAH = ['Jakarta Pusat', 'Jakarta Utara', 'Jakarta Barat', 'Jakarta Selatan', 'Jakarta Timur', 'Kepulauan Seribu'];

module.exports = (bot) => {
    bot.command('lapor_event', async (ctx) => {
        const text = ctx.message.text.replace(/^\/lapor_event\s*/i, '').trim();

        if (!text || !text.includes('#')) {
            return ctx.reply(
                `🎪 *PANDUAN LAPOR EVENT (PIC DLH)*\n\n` +
                `Format pendaftaran formulir event resmi:\n\n` +
                `\`/lapor_event EVENT#<Nama>#<Kategori>#<Mulai ISO>#<Selesai ISO>#<Venue>#<Wilayah>#<Kecamatan>#<Kuota>#<Deskripsi>#<No.WA PIC>\`\n\n` +
                `*Contoh:*\n` +
                `\`/lapor_event EVENT#Jakarta Marathon 2026#Olahraga#2026-06-20T06:00:00#2026-06-20T12:00:00#GBK Senayan#Jakarta Pusat#Tanah Abang#25000#Lomba lari tahunan#6281234567890\`\n\n` +
                `📋 *Kategori:* ${VALID_CATEGORIES.join(', ')}\n` +
                `📍 *Wilayah:* ${VALID_WILAYAH.join(', ')}\n\n` +
                `💡 _Catatan: Nomor WA PIC akan divalidasi ke sistem Whitelist DLH._`,
                { parse_mode: 'Markdown' }
            );
        }

        const parts = text.split('#').map(p => p.trim());
        let dataParts = parts;
        if (['EVENT', 'LAPOR_EVENT', 'FORM_EVENT'].includes(parts[0].toUpperCase())) {
            dataParts = parts.slice(1);
        }

        if (dataParts.length < 9) {
            return ctx.reply('⚠️ Format kurang lengkap. Mohon sertakan 10 bagian sesuai contoh.');
        }

        const [
            name,
            rawCategory,
            rawStartDate,
            rawEndDate,
            venue_name,
            rawWilayah,
            kecamatan,
            rawQuota,
            description,
            picPhone
        ] = dataParts;

        const cleanPhone = eventService.normalizePhone(picPhone);
        const verifyResult = await eventService.verifyPicSender(cleanPhone);
        if (!verifyResult || !verifyResult.authorized) {
            return ctx.reply(`⚠️ Akses ditolak untuk nomor PIC ${cleanPhone}: ${verifyResult?.message || 'Belum terdaftar di whitelist DLH'}`);
        }

        const matchedWilayah = VALID_WILAYAH.find(w => w.toLowerCase() === (rawWilayah || '').toLowerCase());
        if (!matchedWilayah) {
            return ctx.reply(`⚠️ Wilayah tidak valid. Pilih: ${VALID_WILAYAH.join(', ')}`);
        }

        const payload = {
            pic_id: verifyResult.whitelist_id || null,
            pic_phone: cleanPhone,
            name: name || verifyResult.event_name,
            category: VALID_CATEGORIES.find(c => c.toLowerCase() === (rawCategory || '').toLowerCase()) || 'Event',
            start_date: rawStartDate,
            end_date: rawEndDate,
            venue_name: venue_name || 'Lokasi Kegiatan',
            wilayah: matchedWilayah,
            kecamatan: kecamatan || '-',
            visitor_quota: parseInt(rawQuota, 10) || 0,
            description: description || 'Laporan event via Telegram Bot Samling',
            source: 'pic_chatbot'
        };

        await ctx.reply('⏳ Memproses laporan event ke backend Samling...');
        try {
            const res = await eventService.submitPicReport(payload);
            const d = res.data || {};
            return ctx.reply(
                `✅ *LAPORAN EVENT BERHASIL DIDAFTARKAN*\n\n` +
                `🆔 *ID Event:* #${d.id || '-'}\n` +
                `🎪 *Nama Event:* ${d.name}\n` +
                `📍 *Lokasi:* ${d.venue_name} (${d.wilayah})\n` +
                `📅 *Waktu:* ${d.start_date} s.d. ${d.end_date}\n` +
                `👥 *Estimasi Peserta:* ${Number(d.visitor_quota || 0).toLocaleString('id-ID')} orang\n` +
                `👤 *PIC:* ${verifyResult.pic_name || cleanPhone}\n\n` +
                `💡 Data terhubung ke Heatmap DLH DKI Jakarta.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            return ctx.reply(`❌ Gagal menyimpan event: ${err.message}`);
        }
    });
};
