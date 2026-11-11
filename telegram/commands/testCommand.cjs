/**
 * Test command untuk demonstrasi auto-detect
 * File ini otomatis terdeteksi oleh PluginLoader tanpa perlu restart manual
 * 
 * @param {Telegraf} bot - Instance bot Telegram
 */
module.exports = (bot) => {
    bot.command('ping', async (ctx) => {
        try {
            const start = Date.now();
            const sent = await ctx.reply('🏓 Pong!');
            const latency = Date.now() - start;
            
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                sent.message_id,
                null,
                `🏓 Pong!\n⏱️ Latency: ${latency}ms`
            );
        } catch (error) {
            console.error('[Telegram Ping Error]:', error);
            await ctx.reply('❌ Error saat ping');
        }
    });

    bot.command('help', async (ctx) => {
        const helpMessage = `
🤖 *Bot Commands*

/start - Mulai bot dan lihat info
/ping - Cek latency bot
/help - Tampilkan bantuan ini

_Bot ini menggunakan auto-reload system._
        `;

        await ctx.reply(helpMessage.trim(), { parse_mode: 'Markdown' });
    });
};
