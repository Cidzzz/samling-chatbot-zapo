/**
 * Command: /samling, /menu
 * Menu utama dengan inline keyboard selaras dengan WA
 */
const config = require('../../src/config.cjs');
const { formatMenuText, buildInlineKeyboard, isTelegramOfficer, isTelegramEventCommittee } = require('../utils/helper.cjs');

module.exports = (bot) => {
    bot.command(['samling', 'menu'], async (ctx) => {
        try {
            const isOfficer = isTelegramOfficer(ctx);
            const isEventCommittee = isTelegramEventCommittee(ctx);

            const buttons = [
                { text: '📝 Lapor Sampah', data: 'menu_lapor' }
            ];

            // Hanya panitia event / petugas / owner yang bisa melihat menu Lapor Event
            if (isEventCommittee) {
                buttons.push({ text: '🎪 Lapor Kegiatan/Event', data: 'menu_lapor_event' });
            }

            // Fitur Pemantauan Publik
            buttons.push({ text: '🔍 Cek Status Aduan', data: 'menu_cekstatus' });
            buttons.push({ text: '🗺️ Daftar Wilayah & TPS', data: 'menu_daftar_wilayah' });
            buttons.push({ text: '🗑️ Informasi TPA/TPST', data: 'menu_daftar_tpa' });

            // Fitur Khusus Petugas TPS 3R
            if (isOfficer) {
                buttons.push({ text: '🎯 Target TPS 3R', data: 'menu_tps3r_target' });
                buttons.push({ text: '📊 Rekap Mingguan TPS 3R', data: 'menu_tps3r_rekap' });
                buttons.push({ text: '📑 Riwayat Timbangan', data: 'menu_tps3r_riwayat' });
            }

            buttons.push({ text: 'ℹ️ Kontak Tim DLH', data: 'menu_owner' });

            await ctx.reply(formatMenuText(ctx), {
                parse_mode: 'Markdown',
                reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
            });
        } catch (err) {
            console.error('[samlingCommand] Error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat menampilkan menu.');
        }
    });
};
