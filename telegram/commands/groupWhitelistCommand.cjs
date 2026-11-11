/**
 * Commands: /wlistgb, /blistgb
 * Group whitelist management (owner only)
 */
const config = require('../../src/config.cjs');
const groupWhitelist = require('../../src/services/group-whitelist.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');
const { setState } = require('../utils/stateManager.cjs');

module.exports = (bot) => {
    bot.command(['wlistgb', 'blistgb'], async (ctx) => {
        try {
            // Owner only
            if (String(ctx.from.id) !== config.telegramOwnerId) {
                return await ctx.reply('❌ Command ini hanya untuk Owner!');
            }

            const whitelisted = groupWhitelist.getWhitelistedGroups();

            if (whitelisted.length === 0) {
                return await ctx.reply(
                    '📋 *GRUP WHITELIST*\n\n' +
                    'Belum ada grup yang di-whitelist.\n\n' +
                    'Untuk menambahkan grup, jalankan command ini di dalam grup yang ingin di-whitelist.',
                    { parse_mode: 'Markdown' }
                );
            }

            // Simpan list ke state untuk callback reference
            const userId = String(ctx.from.id);
            setState(userId, { whitelistGroups: whitelisted });

            const buttons = whitelisted.map((gid, i) => ({
                text: `🗑️ Hapus #${i + 1}`,
                data: `wl:remove:${i}`,
            }));
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            const listText = whitelisted
                .map((gid, i) => `${i + 1}. \`${gid}\``)
                .join('\n');

            await ctx.reply(
                `📋 *GRUP WHITELIST*\n\n` +
                `Total: ${whitelisted.length} grup\n\n` +
                listText +
                `\n\nKlik tombol untuk hapus grup dari whitelist.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[groupWhitelistCommand] Error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat mengambil daftar whitelist.');
        }
    });
};
