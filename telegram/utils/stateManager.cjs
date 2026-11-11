/**
 * State Manager untuk Telegram Bot
 * Single Map dengan auto-expire (key: userId)
 * Dipakai bersama oleh commands & actions (lapor, navigation, whitelist)
 */

const DEFAULT_TTL = 10 * 60 * 1000; // 10 menit

const _store = new Map(); // userId -> { data, timer }

/**
 * Set state untuk user. Overwrite jika sudah ada (reset timer).
 * @param {string} userId - Telegram user ID (string)
 * @param {object} data - State data
 * @param {number} ttl - TTL dalam ms (default 10 menit)
 */
function setState(userId, data, ttl = DEFAULT_TTL) {
    const existing = _store.get(userId);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(() => _store.delete(userId), ttl);
    _store.set(userId, { data, timer });
}

/**
 * Get state untuk user. Returns null jika tidak ada.
 * @param {string} userId
 * @returns {object|null}
 */
function getState(userId) {
    const entry = _store.get(userId);
    return entry ? entry.data : null;
}

/**
 * Update sebagian state (merge). Auto-create jika belum ada.
 * @param {string} userId
 * @param {object} patch - Partial data to merge
 * @param {number} ttl
 */
function updateState(userId, patch, ttl = DEFAULT_TTL) {
    const existing = getState(userId) || {};
    setState(userId, { ...existing, ...patch }, ttl);
}

/**
 * Hapus state untuk user.
 * @param {string} userId
 */
function clearState(userId) {
    const entry = _store.get(userId);
    if (entry?.timer) clearTimeout(entry.timer);
    _store.delete(userId);
}

/**
 * Cek apakah user punya state aktif.
 * @param {string} userId
 * @returns {boolean}
 */
function hasState(userId) {
    return _store.has(userId);
}

module.exports = { setState, getState, updateState, clearState, hasState };
