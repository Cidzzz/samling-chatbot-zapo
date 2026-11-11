const config = require('../../src/config.cjs');

/**
 * Command handler untuk /start
 * Pattern untuk PluginLoader: module.exports = (bot) => { ... }
 * 
 * @param {Telegraf} bot - Instance bot Telegram
 */
module.exports = (bot) => {
    bot.start(async (ctx) => {
        try {
            const userId = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name || 'User';
            
            const welcomeMessage = (
                `🤖 *Selamat Datang di ${config.botName}!* (${config.footerTxt})\n\n` +
                `Halo ${username}! Layanan Resmi Pengelolaan Sampah & Operasional TPS 3R DKI Jakarta.\n\n` +
                `Silakan gunakan menu di bawah untuk mulai berinteraksi:`
            );

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📝 Lapor Sampah', callback_data: 'menu_lapor' },
                        { text: '🔍 Cek Status Tiket', callback_data: 'menu_cekstatus' }
                    ],
                    [
                        { text: '🗺️ Daftar Wilayah & TPS', callback_data: 'menu_daftar_wilayah' },
                        { text: '🗑️ Info TPA', callback_data: 'menu_daftar_tpa' }
                    ]
                ]
            };

            const isOfficer = String(userId) === '1816457002' || (config.telegramOfficers || []).includes(String(userId));
            if (isOfficer) {
                keyboard.inline_keyboard.push([
                    { text: '🎯 Target TPS 3R', callback_data: 'menu_tps3r_target' },
                    { text: '📊 Rekap Mingguan', callback_data: 'menu_tps3r_rekap' }
                ]);
            }

            keyboard.inline_keyboard.push([
                { text: '📱 WhatsApp Bot', url: `https://wa.me/${config.botNumber}` },
                { text: '👤 Info Petugas/Owner', callback_data: 'owner_info' }
            ]);

            await ctx.reply(welcomeMessage.trim(), {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            console.log(`[Telegram] User ${username} (${userId}) started the bot`);
        } catch (error) {
            console.error('[Telegram Start Handler Error]:', error.message);
            await ctx.reply('Maaf, terjadi kesalahan saat memulai bot.');
        }
    });
};
