/**
 * Command: /daftar_tpa
 * Tampilkan info TPA Bantar Gebang
 */
const config = require('../../src/config.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');

const TPA_INFO = (
    `🗑️ *TEMPAT PEMROSESAN AKHIR (TPA)*\n\n` +
    `📍 *TPA Bantar Gebang*\n` +
    `Lokasi: Ciketing Udik, Bantar Gebang, Bekasi\n` +
    `Status: ✅ Operasional (melayani seluruh DKI Jakarta)\n\n` +
    `📊 *Spesifikasi:*\n` +
    `• Luas Area: 110.3 hektar\n` +
    `• Kapasitas: 7,000 ton/hari\n` +
    `• Teknologi:\n` +
    `  - Sanitary Landfill\n` +
    `  - Refuse-Derived Fuel (RDF)\n` +
    `  - Pengolahan Leachate\n` +
    `  - Waste-to-Energy (PLTSa)\n\n` +
    `ℹ️ *Keterangan:*\n` +
    `Satu-satunya TPA untuk DKI Jakarta, menerima sampah dari 5 kota administratif.\n\n` +
    `Klik tombol di bawah untuk melihat detail lengkap TPA Bantar Gebang.`
);

module.exports = (bot) => {
    bot.command(['daftar_tpa', 'tpa'], async (ctx) => {
        try {
            const buttons = [
                { text: '📋 Detail Lengkap', data: 'dtpa:detail' },
                { text: '🏠 Menu Utama', data: 'menu_samling' },
            ];

            await ctx.reply(TPA_INFO, {
                parse_mode: 'Markdown',
                reply_markup: buildInlineKeyboard(buttons, 1).reply_markup,
            });
        } catch (err) {
            console.error('[daftarTpaCommand] Error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat menampilkan info TPA.');
        }
    });
};
