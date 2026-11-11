/**
 * Command: /daftar_tps
 * Tampilkan pilihan wilayah → list TPS di wilayah tersebut
 */
const config = require('../../src/config.cjs');
const zoneCache = require('../../src/services/zone_cache.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');
const { setState } = require('../utils/stateManager.cjs');

module.exports = (bot) => {
    bot.command('daftar_tps', async (ctx) => {
        try {
            await ctx.reply('⏳ Mengambil data TPS...');

            const ok = await zoneCache.ensureInitialized();
            if (!ok) {
                return await ctx.reply(
                    '❌ *Gagal Mengambil Data TPS*\n\n' +
                    'Tidak dapat terhubung ke server. Silakan coba lagi nanti.',
                    { parse_mode: 'Markdown' }
                );
            }

            const wilayahList = zoneCache.getUniqueWilayah();
            if (!wilayahList || wilayahList.length === 0) {
                return await ctx.reply('❌ Data wilayah kosong.');
            }

            // Simpan list ke state untuk callback reference
            const userId = String(ctx.from.id);
            setState(userId, { dtpsWilayahList: wilayahList });

            const buttons = wilayahList.map((wil, i) => ({
                text: wil,
                data: `dtps:wil:${i}`,
            }));
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            const infoText = (
                `🚮 *TEMPAT PENAMPUNGAN SEMENTARA (TPS)*\n\n` +
                `DKI Jakarta memiliki *500+ TPS* tersebar di 267 kelurahan.\n\n` +
                `TPS adalah tempat penampungan sampah sementara sebelum diangkut ke TPA Bantar Gebang.\n\n` +
                `📋 *Pilih wilayah* untuk melihat daftar TPS per wilayah:`
            );

            await ctx.reply(infoText, {
                parse_mode: 'Markdown',
                reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
            });
        } catch (err) {
            console.error('[daftarTpsCommand] Error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat memuat data TPS.');
        }
    });
};
