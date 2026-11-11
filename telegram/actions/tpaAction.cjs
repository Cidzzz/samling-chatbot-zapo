/**
 * Action handlers untuk TPA detail
 * Handle callbacks dari daftarTpaCommand.js
 */
const config = require('../../src/config.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');

const TPA_DETAIL = (
    `🗑️ *DETAIL TPA BANTAR GEBANG*\n\n` +
    `📍 *LOKASI & STATUS*\n` +
    `• Alamat: Ciketing Udik, Bantar Gebang, Bekasi\n` +
    `• Koordinat: 6°23'S, 106°59'E (perbatasan Jakarta-Bekasi)\n` +
    `• Status: ✅ Operasional sejak 1989\n` +
    `• Jangkauan: Melayani seluruh DKI Jakarta (5 kota administratif)\n\n` +
    `📊 *SPESIFIKASI TEKNIS*\n` +
    `• Luas Total: 110.3 hektar\n` +
    `• Kapasitas Harian: 7,000 ton/hari\n` +
    `• Volume Timbunan: ~40 juta ton (akumulasi)\n` +
    `• Tinggi Timbunan: ~40-50 meter\n\n` +
    `🔧 *TEKNOLOGI PENGOLAHAN*\n` +
    `1. *Sanitary Landfill*\n` +
    `   - Sistem pembuangan terkelola dengan lapisan kedap air\n` +
    `   - Pengumpulan gas metana untuk energi\n\n` +
    `2. *Refuse-Derived Fuel (RDF)*\n` +
    `   - Pengolahan sampah menjadi bahan bakar alternatif\n` +
    `   - Digunakan untuk industri semen\n\n` +
    `3. *Pengolahan Leachate*\n` +
    `   - Instalasi pengolahan air lindi (limbah cair)\n` +
    `   - Mencegah pencemaran air tanah\n\n` +
    `4. *Waste-to-Energy (PLTSa)*\n` +
    `   - Pembangkit Listrik Tenaga Sampah\n` +
    `   - Kapasitas: ~35 MW (target)\n` +
    `   - Mengolah sampah jadi listrik untuk 150,000 rumah\n\n` +
    `⚡ *OPERASIONAL*\n` +
    `• Jam Operasi: 24/7 (non-stop)\n` +
    `• Jumlah Truk: 500+ truk sampah/hari\n` +
    `• Pekerja: 2,000+ pekerja (termasuk pemulung)\n` +
    `• Fasilitas: Jalan akses, weighbridge, area sortir, kantor pengelola\n\n` +
    `🌍 *DAMPAK LINGKUNGAN*\n` +
    `• Bau: Radius 2-5 km (tergantung arah angin)\n` +
    `• Udara: Monitoring kualitas udara rutin\n` +
    `• Air: Sistem pengolahan leachate modern\n` +
    `• Tanah: Lapisan geomembran pencegah rembesan\n\n` +
    `💼 *PENGELOLA*\n` +
    `Dinas Lingkungan Hidup DKI Jakarta\n` +
    `Kerjasama dengan PT Godang Tua Jaya (operator PLTSa)\n\n` +
    `ℹ️ *INFO TAMBAHAN*\n` +
    `TPA Bantar Gebang adalah salah satu TPA terbesar di Asia Tenggara. Setiap hari, sampah dari 10+ juta penduduk Jakarta diangkut ke lokasi ini melalui jaringan TPS → Transfer Station → TPA.`
);

module.exports = (bot) => {
    // Callback: dtpa:detail
    bot.action('dtpa:detail', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await ctx.editMessageText(TPA_DETAIL, {
                parse_mode: 'Markdown',
                reply_markup: buildInlineKeyboard([
                    { text: '« Kembali ke TPA', data: 'dtpa:back' },
                    { text: '🏠 Menu Utama', data: 'menu_samling' },
                ], 1).reply_markup,
            });
        } catch (err) {
            console.error('[tpaAction] dtpa:detail error:', err.message);
        }
    });

    // Callback: dtpa:back
    bot.action('dtpa:back', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            // Re-trigger daftar_tpa command
            ctx.message = { text: '/daftar_tpa' };
            ctx.update.message = ctx.message;
            await bot.handleUpdate(ctx.update);
        } catch (err) {
            console.error('[tpaAction] dtpa:back error:', err.message);
        }
    });
};
