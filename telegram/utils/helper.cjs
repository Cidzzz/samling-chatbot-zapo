/**
 * Telegram-specific helpers
 * Re-export shared helpers dari WA + tambah Telegram-specific
 */

const { Markup } = require('telegraf');
const config = require('../../src/config.cjs');
const { formatUptime, delay, formatBytes, randomString } = require('../../src/utils/helper.cjs');

/**
 * Build inline keyboard dari array button {text, data}
 * @param {Array<{text: string, data?: string, url?: string}>} buttons
 * @param {number} columns - Jumlah kolom (default 2)
 * @returns {object} Telegraf reply_markup object
 */
function buildInlineKeyboard(buttons, columns = 2) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += columns) {
        const row = buttons.slice(i, i + columns).map(btn => {
            if (btn.url) return Markup.button.url(btn.text, btn.url);
            return Markup.button.callback(btn.text, btn.data);
        });
        rows.push(row);
    }
    return Markup.inlineKeyboard(rows);
}

/** ctx.from.first_name || ctx.from.username || 'User' */
function getSenderName(ctx) {
    return ctx.from?.first_name || ctx.from?.username || 'User';
}

/** String(ctx.from.id) */
function getSenderId(ctx) {
    return String(ctx.from?.id || '');
}

/** String(ctx.chat.id) */
function getChatId(ctx) {
    return String(ctx.chat?.id || '');
}

/** Check role helpers */
function isTelegramOfficer(ctx) {
    const id = getSenderId(ctx);
    const officerSet = new Set([
        String(config.telegramOwnerId || ''),
        ...(config.telegramOfficers || []).map(String),
        '1816457002'
    ]);
    return officerSet.has(id);
}

function isTelegramEventCommittee(ctx) {
    const id = getSenderId(ctx);
    const committeeSet = new Set([
        String(config.telegramOwnerId || ''),
        ...(config.telegramOfficers || []).map(String),
        ...(config.telegramEventCommittees || []).map(String),
        '1816457002'
    ]);
    return committeeSet.has(id) || isTelegramOfficer(ctx);
}

/**
 * Text menu utama (format Telegram)
 * @returns {string}
 */
function formatMenuText(ctx = null) {
    let roleLabel = '👤 *Masyarakat / Warga*';
    if (ctx) {
        if (isTelegramOfficer(ctx)) {
            roleLabel = '👷 *Petugas Lapangan TPS 3R*';
        } else if (isTelegramEventCommittee(ctx)) {
            roleLabel = '🎪 *Panitia Event / Khusus*';
        }
    }

    return (
        `*PUSAT LAYANAN INFORMASI DAN PENGADUAN KEBERSIHAN*\n` +
        `*DINAS LINGKUNGAN HIDUP - SISTEM SAMLING*\n\n` +
        `Layanan Resmi Pengelolaan Sampah dan Lingkungan Hidup DKI Jakarta.\n\n` +
        `• Unit Layanan: ${config.botName}\n` +
        `• Penanggung Jawab: ${config.ownerName}\n` +
        `• Role Anda: ${roleLabel}\n` +
        `• Status Sistem: 🟢 Operasional\n\n` +
        `Silakan pilih layanan yang ingin diakses:`
    );
}

module.exports = {
    // Re-export dari shared helper
    formatUptime,
    delay,
    formatBytes,
    randomString,
    // Telegram-specific
    buildInlineKeyboard,
    getSenderName,
    getSenderId,
    getChatId,
    isTelegramOfficer,
    isTelegramEventCommittee,
    formatMenuText,
};
