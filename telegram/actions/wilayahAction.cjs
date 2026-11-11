/**
 * Action handlers untuk daftar wilayah navigation
 * Handle callbacks dari daftarWilayahCommand.js
 * Flow: wilayah → kecamatan → kelurahan → TPS detail
 */
const zoneCache = require('../../src/services/zone_cache.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');
const { getState, setState } = require('../utils/stateManager.cjs');

module.exports = (bot) => {
    // Callback: dw:wil:<index>
    bot.action(/^dw:wil:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dwWilayahList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_wilayah lagi.');
            }

            const wilayahName = state.dwWilayahList[index];
            if (!wilayahName) {
                return await ctx.reply('⚠️ Wilayah tidak ditemukan.');
            }

            // Get kecamatan list
            const kecamatanList = zoneCache.getKecamatanList(wilayahName);
            if (!kecamatanList || kecamatanList.length === 0) {
                return await ctx.reply(`❌ Tidak ada data kecamatan untuk ${wilayahName}.`);
            }

            // Count total TPS
            const totalTPS = zoneCache.getZonesByWilayah(wilayahName).length;

            // Update state
            setState(userId, { ...state, dwWilayahName: wilayahName, dwKecamatanList: kecamatanList });

            const buttons = kecamatanList.map((kec, i) => ({
                text: kec,
                data: `dw:kec:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'dw:back:wil' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(
                `🏛️ *${wilayahName.toUpperCase()}*\n\n` +
                `📍 *Daftar Kecamatan*\n` +
                `Total: ${kecamatanList.length} Kecamatan | ${totalTPS} TPS\n\n` +
                `Pilih kecamatan untuk melihat daftar TPS:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[wilayahAction] dw:wil error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: dw:kec:<index>
    bot.action(/^dw:kec:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dwKecamatanList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_wilayah lagi.');
            }

            const kecamatanName = state.dwKecamatanList[index];
            if (!kecamatanName) {
                return await ctx.reply('⚠️ Kecamatan tidak ditemukan.');
            }

            // Get TPS list (3-level hierarchy)
            const tpsList = zoneCache.getTpsList(state.dwWilayahName, kecamatanName);
            if (!tpsList || tpsList.length === 0) {
                return await ctx.reply(`❌ Tidak ada data TPS untuk ${kecamatanName}.`);
            }

            // Update state
            setState(userId, { ...state, dwKecamatanName: kecamatanName, dwTpsList: tpsList });

            const displayList = tpsList.slice(0, 50);
            const buttons = displayList.map((tps, i) => ({
                text: `${tps.name}`,
                data: `dw:tps:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'dw:back:kec' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(
                `📍 *KECAMATAN ${kecamatanName.toUpperCase()}*\n` +
                `${state.dwWilayahName}\n\n` +
                `🚮 *Daftar TPS*\n` +
                `Total: ${tpsList.length} TPS\n\n` +
                `Pilih TPS untuk melihat detail:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[wilayahAction] dw:kec error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: dw:kel:<index>
    bot.action(/^dw:kel:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dwKelurahanList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_wilayah lagi.');
            }

            const kelurahanName = state.dwKelurahanList[index];
            if (!kelurahanName) {
                return await ctx.reply('⚠️ Kelurahan tidak ditemukan.');
            }

            // Get TPS list
            const allZones = zoneCache.getAllZones();
            const tpsList = allZones.filter(z =>
                z.kelurahan && z.kelurahan.toLowerCase() === kelurahanName.toLowerCase()
            );

            if (!tpsList || tpsList.length === 0) {
                return await ctx.reply(`❌ Tidak ada data TPS untuk ${kelurahanName}.`);
            }

            // Update state
            setState(userId, { ...state, dwKelurahanName: kelurahanName, dwTpsList: tpsList });

            const buttons = tpsList.map((zone, i) => {
                const desc = zone.alamat || zone.jenis_tps || 'TPS';
                const shortDesc = desc.length > 25 ? desc.substring(0, 22) + '...' : desc;
                return {
                    text: zone.name || `TPS ${zone.id}`,
                    data: `dw:tps:${i}`,
                };
            });
            buttons.push({ text: '« Kembali', data: 'dw:back:kel' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(
                `🏘️ *KELURAHAN ${kelurahanName.toUpperCase()}*\n` +
                `📍 ${state.dwKecamatanName}, ${state.dwWilayahName}\n\n` +
                `🚮 *Daftar TPS*\n` +
                `Total: ${tpsList.length} TPS\n\n` +
                `Pilih TPS untuk melihat detail:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[wilayahAction] dw:kel error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: dw:tps:<index>
    bot.action(/^dw:tps:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dwTpsList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_wilayah lagi.');
            }

            const zone = state.dwTpsList[index];
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

            const buttons = [];
            if (zone.latitude && zone.longitude) {
                const mapsUrl = `https://www.google.com/maps?q=${zone.latitude},${zone.longitude}`;
                buttons.push({ text: '📍 Lihat di Google Maps', url: mapsUrl });
            }
            buttons.push({ text: '« Kembali', data: 'dw:back:tps' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(detailText, {
                parse_mode: 'Markdown',
                reply_markup: buildInlineKeyboard(buttons, 1).reply_markup,
            });
        } catch (err) {
            console.error('[wilayahAction] dw:tps error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: dw:back:wil (kembali ke pilihan wilayah)
    bot.action('dw:back:wil', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            // Re-trigger daftar_wilayah command
            ctx.message = { text: '/daftar_wilayah' };
            ctx.update.message = ctx.message;
            await bot.handleUpdate(ctx.update);
        } catch (err) {
            console.error('[wilayahAction] dw:back:wil error:', err.message);
        }
    });

    // Callback: dw:back:kec (kembali ke pilihan kecamatan)
    bot.action('dw:back:kec', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dwKecamatanList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_wilayah lagi.');
            }

            const totalTPS = zoneCache.getZonesByWilayah(state.dwWilayahName).length;

            const buttons = state.dwKecamatanList.map((kec, i) => ({
                text: kec,
                data: `dw:kec:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'dw:back:wil' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(
                `🏛️ *${state.dwWilayahName.toUpperCase()}*\n\n` +
                `📍 *Daftar Kecamatan*\n` +
                `Total: ${state.dwKecamatanList.length} Kecamatan | ${totalTPS} TPS\n\n` +
                `Pilih kecamatan untuk melihat daftar TPS:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[wilayahAction] dw:back:kec error:', err.message);
        }
    });

    // Callback: dw:back:kel (kembali ke pilihan kelurahan)
    bot.action('dw:back:kel', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dwKelurahanList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_wilayah lagi.');
            }

            const totalTPS = zoneCache.getZonesByKecamatan(state.dwKecamatanName).length;

            const buttons = state.dwKelurahanList.map((kel, i) => ({
                text: kel,
                data: `dw:kel:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'dw:back:kec' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(
                `📍 *KECAMATAN ${state.dwKecamatanName.toUpperCase()}*\n` +
                `${state.dwWilayahName}\n\n` +
                `🏘️ *Daftar Kelurahan*\n` +
                `Total: ${state.dwKelurahanList.length} Kelurahan | ${totalTPS} TPS\n\n` +
                `Pilih kelurahan untuk melihat daftar TPS:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[wilayahAction] dw:back:kel error:', err.message);
        }
    });

    // Callback: dw:back:tps (kembali ke pilihan TPS dari detail)
    bot.action('dw:back:tps', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.dwTpsList) {
                return await ctx.reply('⚠️ Session expired. Silakan jalankan /daftar_wilayah lagi.');
            }

            const buttons = state.dwTpsList.map((zone, i) => ({
                text: zone.name || `TPS ${zone.id}`,
                data: `dw:tps:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'dw:back:kel' });
            buttons.push({ text: '🏠 Menu Utama', data: 'menu_samling' });

            await ctx.editMessageText(
                `🏘️ *KELURAHAN ${state.dwKelurahanName.toUpperCase()}*\n` +
                `📍 ${state.dwKecamatanName}, ${state.dwWilayahName}\n\n` +
                `🚮 *Daftar TPS*\n` +
                `Total: ${state.dwTpsList.length} TPS\n\n` +
                `Pilih TPS untuk melihat detail:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[wilayahAction] dw:back:tps error:', err.message);
        }
    });
};
