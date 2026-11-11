/**
 * Action handlers untuk daftar TPS navigation
 * Handle callbacks dari daftarTpsCommand.js
 * Flow: wilayah → list TPS → TPS detail
 */
const zoneCache = require('../../src/services/zone_cache.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');
const { getState, setState } = require('../utils/stateManager.cjs');

module.exports = (bot) => {
    // Callback: dtps:wil:<index>
    bot.action(/^dtps:wil:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dtpsWilayahList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_tps lagi.');
            }

            const wilayahName = state.dtpsWilayahList[index];
            if (!wilayahName) {
                return await ctx.reply('⚠️ Wilayah tidak ditemukan.');
            }

            // Get TPS list untuk wilayah ini
            const tpsList = zoneCache.getZonesByWilayah(wilayahName);
            if (!tpsList || tpsList.length === 0) {
                return await ctx.reply(`❌ Tidak ada data TPS untuk ${wilayahName}.`);
            }

            // Limit tampilan (max 20 TPS untuk prevent button overflow)
            const displayList = tpsList.slice(0, 20);

            // Update state
            setState(userId, { ...state, dtpsWilayahName: wilayahName, dtpsList: displayList });

            const buttons = displayList.map((zone, i) => ({
                text: zone.name || `TPS ${zone.id}`,
                data: `dtps:tps:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'dtps:back' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            const limitNote = tpsList.length > 20 ? `\n\n⚠️ Menampilkan 20 dari ${tpsList.length} TPS.` : '';

            await ctx.editMessageText(
                `🚮 *TPS DI ${wilayahName.toUpperCase()}*\n\n` +
                `Total TPS: ${tpsList.length}\n\n` +
                `Pilih TPS untuk melihat detail:${limitNote}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[tpsAction] dtps:wil error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: dtps:tps:<index>
    bot.action(/^dtps:tps:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dtpsList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_tps lagi.');
            }

            const zone = state.dtpsList[index];
            if (!zone) {
                return await ctx.reply('⚠️ TPS tidak ditemukan.');
            }

            // Build detail text
            let detailText = `🚮 *DETAIL TPS*\n\n📍 *${zone.name || `TPS ${zone.id}`}*\n\n`;
            detailText += `🏛️ *Lokasi:*\n`;
            if (zone.wilayah) detailText += `• Wilayah: ${zone.wilayah}\n`;
            if (zone.kecamatan) detailText += `• Kecamatan: ${zone.kecamatan}\n`;
            if (zone.kelurahan) detailText += `• Kelurahan: ${zone.kelurahan}\n`;
            detailText += `\n`;

            if (zone.jenis_tps) detailText += `📦 *Jenis TPS:* ${zone.jenis_tps}\n\n`;
            if (zone.alamat) detailText += `📮 *Alamat:*\n${zone.alamat}\n\n`;

            if (zone.latitude && zone.longitude) {
                detailText += `🗺️ *Koordinat:*\n• Lat: ${zone.latitude}\n• Long: ${zone.longitude}\n\n`;
            }

            if (zone.risk_status) {
                const riskEmoji =
                    zone.risk_status.toLowerCase() === 'high'
                        ? '🔴'
                        : zone.risk_status.toLowerCase() === 'medium'
                        ? '🟡'
                        : '🟢';
                detailText += `${riskEmoji} *Risk Status:* ${zone.risk_status}\n\n`;
            }

            if (zone.capacity) detailText += `📊 *Kapasitas:* ${zone.capacity}\n`;
            if (zone.operational_status) detailText += `⚙️ *Status:* ${zone.operational_status}\n`;
            if (zone.contact) detailText += `📞 *Kontak:* ${zone.contact}\n`;

            const buttons = [];
            if (zone.latitude && zone.longitude) {
                const mapsUrl = `https://www.google.com/maps?q=${zone.latitude},${zone.longitude}`;
                buttons.push({ text: '📍 Lihat di Google Maps', url: mapsUrl });
            }
            buttons.push({ text: '« Kembali', data: 'dtps:back:list' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(detailText, {
                parse_mode: 'Markdown',
                reply_markup: buildInlineKeyboard(buttons, 1).reply_markup,
            });
        } catch (err) {
            console.error('[tpsAction] dtps:tps error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: dtps:back (kembali ke pilihan wilayah)
    bot.action('dtps:back', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            // Re-trigger daftar_tps command
            ctx.message = { text: '/daftar_tps' };
            ctx.update.message = ctx.message;
            await bot.handleUpdate(ctx.update);
        } catch (err) {
            console.error('[tpsAction] dtps:back error:', err.message);
        }
    });

    // Callback: dtps:back:list (kembali ke list TPS dari detail)
    bot.action('dtps:back:list', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dtpsList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_tps lagi.');
            }

            const buttons = state.dtpsList.map((zone, i) => ({
                text: zone.name || `TPS ${zone.id}`,
                data: `dtps:tps:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'dtps:back' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(
                `🚮 *TPS DI ${state.dtpsWilayahName.toUpperCase()}*\n\n` +
                `Total TPS: ${state.dtpsList.length}\n\n` +
                `Pilih TPS untuk melihat detail:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[tpsAction] dtps:back:list error:', err.message);
        }
    });
};
