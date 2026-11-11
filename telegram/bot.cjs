const { Telegraf } = require('telegraf');
const config = require('../src/config.cjs');
const chalk = { red: (s) => s, green: (s) => s, yellow: (s) => s, cyan: (s) => s, blue: (s) => s };
const path = require('path');

// Import PluginLoader
const TelegramPluginLoader = require('./utils/PluginLoader.cjs');

// Import handlers and services
const zoneCache = require('../src/services/zone_cache.cjs');
const { handleMessage } = require('./handlers/messageHandler.cjs');
const TelegramNotificationPoller = require('./services/notification-poller.cjs');

let telegramBot = null;
let pluginLoader = null;
let notificationPoller = null;

/**
 * Inisialisasi dan jalankan bot Telegram
 */
async function initTelegramBot() {
    try {
        if (!config.telegramBotToken) {
            console.log(chalk.yellow('⚠️  Telegram Bot Token tidak ditemukan. Bot Telegram tidak akan dijalankan.'));
            return null;
        }

        console.log(chalk.cyan('🤖 Menginisialisasi Bot Telegram...'));

        // Initialize zone cache first
        console.log(chalk.cyan('📦 Menginisialisasi zone cache...'));
        await zoneCache.ensureInitialized();
        console.log(chalk.green('✅ Zone cache ready'));

        // Buat instance bot Telegram
        telegramBot = new Telegraf(config.telegramBotToken);

        // Initialize PluginLoader
        pluginLoader = new TelegramPluginLoader();

        // Load commands dari folder commands/
        const commandsPath = path.join(__dirname, 'commands');
        pluginLoader.loadHandlers(telegramBot, commandsPath);

        // Load actions dari folder actions/
        const actionsPath = path.join(__dirname, 'actions');
        pluginLoader.loadHandlers(telegramBot, actionsPath);

        // Enable watcher untuk auto-reload di semua environment
        pluginLoader.initWatcher();

        console.log(
            chalk.green(`✅ ${pluginLoader.getLoadedCount()} handler(s) loaded successfully`)
        );

        // Register AI message handler (fallback untuk non-command)
        handleMessage(telegramBot);
        console.log(chalk.green('✅ AI message handler registered'));

        // Error handling
        telegramBot.catch((err, ctx) => {
            console.error(chalk.red('[Telegram Error]:'), err);
        });

        // Launch bot in background with polling
        telegramBot.launch({
            dropPendingUpdates: true
        }).then(() => {
            console.log(chalk.green('✅ Bot Telegram polling aktif!'));
        }).catch((err) => {
            console.error(chalk.red('❌ Gagal launch Telegram Bot:'), err.message);
        });

        console.log(chalk.green('✅ Bot Telegram listener didaftarkan!'));

        // Start notification poller (if enabled)
        if (config.enableNotificationPoller === true) {
            notificationPoller = new TelegramNotificationPoller(telegramBot);
            notificationPoller.start();
            console.log(chalk.green('✅ Notification poller started'));
        }

        // Enable graceful stop
        process.once('SIGINT', () => {
            stopTelegramBot();
            telegramBot.stop('SIGINT');
        });
        process.once('SIGTERM', () => {
            stopTelegramBot();
            telegramBot.stop('SIGTERM');
        });

        return telegramBot;
    } catch (error) {
        console.error(chalk.red('❌ Gagal menjalankan Bot Telegram:'), error.message);
        return null;
    }
}

/**
 * Stop bot Telegram
 */
function stopTelegramBot() {
    if (notificationPoller) {
        notificationPoller.stop();
        console.log(chalk.yellow('🛑 Notification poller stopped'));
    }
    
    if (pluginLoader) {
        pluginLoader.stopWatcher();
    }
    
    if (telegramBot) {
        telegramBot.stop();
        console.log(chalk.yellow('🛑 Bot Telegram dihentikan'));
    }
}

/**
 * Get bot instance
 */
function getTelegramBot() {
    return telegramBot;
}

module.exports = {
    initTelegramBot,
    stopTelegramBot,
    getTelegramBot
};
