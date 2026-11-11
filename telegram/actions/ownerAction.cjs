const config = require('../../src/config.cjs');

/**
 * Action handlers untuk owner info dan back to start
 * Pattern untuk PluginLoader: module.exports = (bot) => { ... }
 * 
 * @param {Telegraf} bot - Instance bot Telegram
 */
module.exports = (bot) => {
    // Handler untuk button "Owner Info"
    bot.action('owner_info', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            
            const ownerInfo = `
👤 *Informasi Owner*

• Nama: ${config.ownerName}
• Bot: ${config.botName}

Untuk bantuan lebih lanjut, silakan hubungi owner melalui WhatsApp.
            `;

            await ctx.editMessageText(ownerInfo.trim(), {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Kembali', callback_data: 'back_to_start' }]
                    ]
                }
            });
        } catch (error) {
            console.error('[Telegram Owner Info Error]:', error);
        }
    });

    // Handler untuk button "Kembali"
    bot.action('back_to_start', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            
            const username = ctx.from.username || ctx.from.first_name || 'User';
            const welcomeMessage = `
🤖 *Selamat Datang di ${config.botName}!*

Halo ${username}! 👋

Bot Telegram ${config.botName} aktif dan siap melayani Anda.

━━━━━━━━━━━━━━━━━━━━
📋 *Informasi Bot*
• Nama: ${config.botName}
• Owner: ${config.ownerName}
• Status: 🟢 Online

━━━━━━━━━━━━━━━━━━━━
💡 *Fitur Bot*
Bot ini terintegrasi dengan sistem Samling AI dan menyediakan berbagai layanan otomatis.

━━━━━━━━━━━━━━━━━━━━
📞 *Butuh Bantuan?*
Hubungi owner untuk informasi lebih lanjut.

${config.footerTxt}
            `;

            await ctx.editMessageText(welcomeMessage.trim(), {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📱 WhatsApp Bot', url: `https://wa.me/${config.botNumber}` }],
                        [{ text: '👤 Owner', callback_data: 'owner_info' }]
                    ]
                }
            });
        } catch (error) {
            console.error('[Telegram Back Handler Error]:', error);
        }
    });
};
