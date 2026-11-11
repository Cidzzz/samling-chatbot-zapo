module.exports = (bot) => {
    bot.action('menu_tps3r_target', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.reply('🎯 *Cek Target Harian TPS 3R*\n\nGunakan perintah:\n`/target <zone_id>`\n\nContoh: `/target 89`', { parse_mode: 'Markdown' });
    });

    bot.action('menu_tps3r_rekap', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.reply('📊 *Rekap 7 Hari Operasional TPS 3R*\n\nGunakan perintah:\n`/rekap <zone_id>`\n\nContoh: `/rekap 89`', { parse_mode: 'Markdown' });
    });

    bot.action('menu_tps3r_riwayat', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.reply('📑 *Riwayat Timbangan TPS 3R*\n\nGunakan perintah:\n`/riwayat` atau `/riwayat <zone_id>`', { parse_mode: 'Markdown' });
    });
};
