/**
 * Command: /daftar_wilayah
 * Tampilkan pilihan wilayah Jakarta dengan stats dari zoneCache
 */
const config = require('../../src/config.cjs');
const zoneCache = require('../../src/services/zone_cache.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');
const { setState } = require('../utils/stateManager.cjs');

module.exports = (bot) => {
    bot.command(['daftar_wilayah', 'wilayah'], async (ctx) => {
        try {
            await ctx.reply('⏳ Mengambil data wilayah...');

            const ok = await zoneCache.ensureInitialized();
            if (!ok) {
                return await ctx.reply(
                    '❌ *Gagal Mengambil Data Wilayah*\n\n' +
                    'Tidak dapat terhubung ke server. Silakan coba lagi nanti.',
                    { parse_mode: 'Markdown' }
                );
            }

            const wilayahList = zoneCache.getUniqueWilayah();
            if (!wilayahList || wilayahList.length === 0) {
                return await ctx.reply('❌ Data wilayah kosong.');
            }

            const stats = zoneCache.getStats();

            // Simpan list ke state untuk callback reference
            const userId = String(ctx.from.id);
            setState(userId, { dwWilayahList: wilayahList });

            const buttons = wilayahList.map((wil, i) => ({
                text: wil,
                data: `dw:wil:${i}`,
            }));
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            const infoText = (
                `🗺️ *DAFTAR WILAYAH JAKARTA*\n\n` +
                `📊 *Data TPS Jakarta*\n` +
                `Total: ${stats.totalZones} TPS tersebar di ${stats.uniqueKecamatan} kecamatan\n\n` +
                `📍 Pilih wilayah untuk melihat daftar kecamatan dan TPS:`
            );

            await ctx.reply(infoText, {
                parse_mode: 'Markdown',
                reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
            });
        } catch (err) {
            console.error('[daftarWilayahCommand] Error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat memuat data wilayah.');
        }
    });
};
