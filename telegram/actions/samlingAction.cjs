/**
 * Action handlers untuk menu utama Samling
 * Handle callbacks dari samlingCommand.js
 */
const config = require('../../src/config.cjs');
const { formatMenuText, buildInlineKeyboard } = require('../utils/helper.cjs');

module.exports = (bot) => {
    // Callback: menu_lapor
    bot.action('menu_lapor', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📝 *PANDUAN MEMBUAT LAPORAN SAMPAH*\n\n` +
                `Gunakan format:\n/lapor <kondisi yang ingin dilaporkan>\n\n` +
                `*Contoh:*\n/lapor sampah numpuk seminggu di depan rumah\n/lapor TPS penuh tidak diangkut`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard([
                        { text: '🏠 Menu Utama', data: 'menu_samling' },
                    ]).reply_markup,
                }
            );
        } catch (err) {
            console.error('[samlingAction] menu_lapor error:', err.message);
        }
    });

    // Callback: menu_daftar_wilayah
    bot.action('menu_daftar_wilayah', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await ctx.reply('⏳ Memuat data wilayah...');
            // Trigger command handler
            ctx.message = { text: '/daftar_wilayah' };
            ctx.update.message = ctx.message;
            await bot.handleUpdate(ctx.update);
        } catch (err) {
            console.error('[samlingAction] menu_daftar_wilayah error:', err.message);
        }
    });

    // Callback: menu_daftar_tps
    bot.action('menu_daftar_tps', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await ctx.reply('⏳ Memuat data TPS...');
            ctx.message = { text: '/daftar_tps' };
            ctx.update.message = ctx.message;
            await bot.handleUpdate(ctx.update);
        } catch (err) {
            console.error('[samlingAction] menu_daftar_tps error:', err.message);
        }
    });

    // Callback: menu_daftar_tpa
    bot.action('menu_daftar_tpa', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            ctx.message = { text: '/daftar_tpa' };
            ctx.update.message = ctx.message;
            await bot.handleUpdate(ctx.update);
        } catch (err) {
            console.error('[samlingAction] menu_daftar_tpa error:', err.message);
        }
    });

    // Callback: menu_cekstatus
    bot.action('menu_cekstatus', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `⚠️ *Format Cek Status*\n\n` +
                `Gunakan: \`/cekstatus <nomor_tiket>\`\n\n` +
                `📝 Contoh: \`/cekstatus 12\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard([
                        { text: '🏠 Menu Utama', data: 'menu_samling' },
                    ]).reply_markup,
                }
            );
        } catch (err) {
            console.error('[samlingAction] menu_cekstatus error:', err.message);
        }
    });

    // Callback: menu_owner
    bot.action('menu_owner', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `👤 *Informasi Owner*\n\n` +
                `• Nama: ${config.ownerName}\n` +
                `• Bot: ${config.botName}\n` +
                `• Channel: ${config.telegramChannelName ? '@' + config.telegramChannelName : '-'}\n` +
                `• Grup: ${config.telegramGroupLink || '-'}\n\n` +
                `Untuk bantuan lebih lanjut, silakan hubungi owner.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard([
                        { text: '🏠 Menu Utama', data: 'menu_samling' },
                    ]).reply_markup,
                }
            );
        } catch (err) {
            console.error('[samlingAction] menu_owner error:', err.message);
        }
    });

    // Callback: menu_samling (back to main menu)
    bot.action('menu_samling', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const { isTelegramOfficer, isTelegramEventCommittee } = require('../utils/helper.cjs');
            const isOfficer = isTelegramOfficer(ctx);
            const isEventCommittee = isTelegramEventCommittee(ctx);

            const buttons = [
                { text: '📝 Lapor Sampah', data: 'menu_lapor' }
            ];

            if (isEventCommittee) {
                buttons.push({ text: '🎪 Lapor Kegiatan/Event', data: 'menu_lapor_event' });
            }

            buttons.push({ text: '🔍 Cek Status Aduan', data: 'menu_cekstatus' });
            buttons.push({ text: '🗺️ Daftar Wilayah & TPS', data: 'menu_daftar_wilayah' });
            buttons.push({ text: '🗑️ Informasi TPA/TPST', data: 'menu_daftar_tpa' });

            if (isOfficer) {
                buttons.push({ text: '🎯 Target TPS 3R', data: 'menu_tps3r_target' });
                buttons.push({ text: '📊 Rekap Mingguan TPS 3R', data: 'menu_tps3r_rekap' });
                buttons.push({ text: '📑 Riwayat Timbangan', data: 'menu_tps3r_riwayat' });
            }

            buttons.push({ text: 'ℹ️ Kontak Tim DLH', data: 'menu_owner' });

            await ctx.editMessageText(formatMenuText(ctx), {
                parse_mode: 'Markdown',
                reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
            });
        } catch (err) {
            console.error('[samlingAction] menu_samling error:', err.message);
        }
    });
};
