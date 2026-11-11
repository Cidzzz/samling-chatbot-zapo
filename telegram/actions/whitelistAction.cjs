/**
 * Action handlers untuk group whitelist
 * Handle callbacks dari groupWhitelistCommand.js
 */
const config = require('../../src/config.cjs');
const groupWhitelist = require('../../src/services/group-whitelist.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');
const { getState, clearState } = require('../utils/stateManager.cjs');

module.exports = (bot) => {
    // Callback: wl:remove:<index>
    bot.action(/^wl:remove:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            // Owner only
            if (String(ctx.from.id) !== config.telegramOwnerId) {
                return await ctx.reply('❌ Command ini hanya untuk Owner!');
            }

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.whitelistGroups) {
                return await ctx.reply('⚠️ Data whitelist tidak ditemukan. Silakan jalankan /wlistgb lagi.');
            }

            const groupId = state.whitelistGroups[index];
            if (!groupId) {
                return await ctx.reply('⚠️ Grup tidak ditemukan.');
            }

            const removed = groupWhitelist.removeGroup(groupId);
            if (removed) {
                await ctx.editMessageText(
                    `✅ *Grup Dihapus dari Whitelist*\n\n` +
                    `Grup ID: \`${groupId}\`\n\n` +
                    `AI tidak akan merespon di grup tersebut lagi.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: buildInlineKeyboard([
                            { text: '🏠 Menu Utama', data: 'menu_samling' },
                        ]).reply_markup,
                    }
                );
                clearState(userId);
                console.log(`[Whitelist] Group ${groupId} removed from whitelist`);
            } else {
                await ctx.reply('⚠️ Grup tidak ada di whitelist.');
            }
        } catch (err) {
            console.error('[whitelistAction] wl:remove error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat menghapus grup dari whitelist.');
        }
    });

    // Callback: wl:add:<groupId> (untuk implementasi add di masa depan)
    bot.action(/^wl:add:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            // Owner only
            if (String(ctx.from.id) !== config.telegramOwnerId) {
                return await ctx.reply('❌ Command ini hanya untuk Owner!');
            }

            const groupId = ctx.match[1];
            const added = groupWhitelist.addGroup(groupId);

            if (added) {
                await ctx.editMessageText(
                    `✅ *Grup Ditambahkan ke Whitelist*\n\n` +
                    `Grup ID: \`${groupId}\`\n\n` +
                    `AI sekarang dapat merespon di grup tersebut.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: buildInlineKeyboard([
                            { text: '🏠 Menu Utama', data: 'menu_samling' },
                        ]).reply_markup,
                    }
                );
                console.log(`[Whitelist] Group ${groupId} added to whitelist`);
            } else {
                await ctx.reply('⚠️ Grup sudah ada di whitelist.');
            }
        } catch (err) {
            console.error('[whitelistAction] wl:add error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat menambahkan grup ke whitelist.');
        }
    });
};
