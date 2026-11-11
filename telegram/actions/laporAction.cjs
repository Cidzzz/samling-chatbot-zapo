/**
 * Action handlers untuk flow laporan
 * Handle callbacks dari laporCommand.js
 */
const zoneCache = require('../../src/services/zone_cache.cjs');
const { buildInlineKeyboard } = require('../utils/helper.cjs');
const { getState, setState, clearState } = require('../utils/stateManager.cjs');
const { submitReport } = require('../commands/laporCommand.cjs');

module.exports = (bot) => {
    // Callback: lapor:wil:<index>
    bot.action(/^lapor:wil:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.wilayahList) {
                return await ctx.reply('⚠️ Session expired. Silakan mulai lagi dengan /lapor');
            }

            const wilayahName = state.wilayahList[index];
            if (!wilayahName) {
                return await ctx.reply('⚠️ Wilayah tidak ditemukan.');
            }

            // Get kecamatan list
            const kecamatanList = zoneCache.getKecamatanList(wilayahName);
            if (!kecamatanList || kecamatanList.length === 0) {
                return await ctx.reply(`❌ Tidak ada data kecamatan untuk ${wilayahName}.`);
            }

            // Update state
            setState(userId, { ...state, wilayahName, kecamatanList });

            const buttons = kecamatanList.map((kec, i) => ({
                text: kec,
                data: `lapor:kec:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'lapor:back:wil' });
            buttons.push({ text: '❌ Batal', data: 'lapor:batal' });

            await ctx.editMessageText(
                `📍 *${wilayahName.toUpperCase()} - Pilih Kecamatan*\n\n` +
                `Pilih kecamatan tempat kejadian:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporAction] lapor:wil error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: lapor:kec:<index>
    bot.action(/^lapor:kec:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.kecamatanList) {
                return await ctx.reply('⚠️ Session expired. Silakan mulai lagi dengan /lapor');
            }

            const kecamatanName = state.kecamatanList[index];
            if (!kecamatanName) {
                return await ctx.reply('⚠️ Kecamatan tidak ditemukan.');
            }

            // Get TPS list (3-level hierarchy)
            const tpsList = zoneCache.getTpsList(state.wilayahName, kecamatanName);
            if (!tpsList || tpsList.length === 0) {
                return await ctx.reply(`❌ Tidak ada data TPS untuk ${kecamatanName}.`);
            }

            // Update state
            setState(userId, { ...state, kecamatanName, tpsList });

            const displayList = tpsList.slice(0, 50);
            const buttons = displayList.map((tps, i) => ({
                text: `${tps.name}`,
                data: `lapor:tps:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'lapor:back:kec' });
            buttons.push({ text: '❌ Batal', data: 'lapor:batal' });

            await ctx.editMessageText(
                `📍 *${kecamatanName.toUpperCase()} - Pilih TPS*\n\n` +
                `Pilih TPS tempat kejadian:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporAction] lapor:kec error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: lapor:kel:<index>
    bot.action(/^lapor:kel:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.kelurahanList) {
                return await ctx.reply('⚠️ Session expired. Silakan mulai lagi dengan /lapor');
            }

            const kelurahanName = state.kelurahanList[index];
            if (!kelurahanName) {
                return await ctx.reply('⚠️ Kelurahan tidak ditemukan.');
            }

            // Get TPS list
            const tpsList = zoneCache.getTpsList(state.wilayahName, state.kecamatanName, kelurahanName);
            if (!tpsList || tpsList.length === 0) {
                return await ctx.reply(`❌ Tidak ada data TPS untuk ${kelurahanName}.`);
            }

            // Update state
            setState(userId, { ...state, kelurahanName, tpsList });

            const buttons = tpsList.map((zone, i) => ({
                text: `${zone.name} - ${zone.jenis_tps || 'TPS'}`,
                data: `lapor:tps:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'lapor:back:kel' });
            buttons.push({ text: '❌ Batal', data: 'lapor:batal' });

            await ctx.editMessageText(
                `🏘️ *${kelurahanName.toUpperCase()} - Pilih TPS*\n\n` +
                `Pilih TPS tempat kejadian:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporAction] lapor:kel error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: lapor:tps:<index>
    bot.action(/^lapor:tps:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const index = parseInt(ctx.match[1], 10);
            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.tpsList) {
                return await ctx.reply('⚠️ Session expired. Silakan mulai lagi dengan /lapor');
            }

            const selectedTps = state.tpsList[index];
            if (!selectedTps) {
                return await ctx.reply('⚠️ TPS tidak ditemukan.');
            }

            const tpsName = `${selectedTps.name} - ${selectedTps.jenis_tps || 'TPS'}`;
            const zoneId = selectedTps.id;

            // Get type messages
            const typeMsg = state.type === 'event' 
                ? { emoji: '🎪', kondisiLabel: 'Deskripsi Acara', photoPrompt: 'foto lokasi acara' }
                : { emoji: '🗑️', kondisiLabel: 'Kondisi', photoPrompt: 'foto sampah' };

            // Update state: set uploadingMedia=true, store all data
            setState(userId, {
                ...state,
                tpsName,
                zoneId,
                uploadingMedia: true,
            });

            await ctx.editMessageText(
                `${typeMsg.emoji} *RINGKASAN LAPORAN*\n\n` +
                `📝 *${typeMsg.kondisiLabel}:*\n${state.kondisi}\n\n` +
                `📍 *Lokasi:*\n` +
                `Wilayah: ${state.wilayahName}\n` +
                `Kecamatan: ${state.kecamatanName}\n` +
                `TPS: ${tpsName}\n\n` +
                `───────────────────\n\n` +
                `📸 Silakan kirim ${typeMsg.photoPrompt} (opsional)\n` +
                `Atau ketik *lanjut* untuk submit tanpa foto\n` +
                `Ketik *batal* untuk membatalkan`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard([
                        { text: '⏭️ Kirim Tanpa Foto', data: 'lapor:skip' },
                        { text: '❌ Batal', data: 'lapor:batal' },
                    ], 1).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporAction] lapor:tps error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: lapor:skip
    bot.action('lapor:skip', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.zoneId) {
                return await ctx.reply('⚠️ Session expired. Silakan mulai lagi dengan /lapor');
            }

            await ctx.editMessageText('📤 Mengirim laporan tanpa foto...');
            await submitReport(ctx, state);
        } catch (err) {
            console.error('[laporAction] lapor:skip error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
        }
    });

    // Callback: lapor:batal
    bot.action('lapor:batal', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            clearState(userId);

            await ctx.editMessageText('❌ Laporan dibatalkan.');
        } catch (err) {
            console.error('[laporAction] lapor:batal error:', err.message);
        }
    });

    // Callback: lapor:back:wil (kembali ke pilihan wilayah)
    bot.action('lapor:back:wil', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.wilayahList) {
                return await ctx.reply('⚠️ Session expired. Silakan mulai lagi dengan /lapor');
            }

            const buttons = state.wilayahList.map((wil, i) => ({
                text: wil,
                data: `lapor:wil:${i}`,
            }));
            buttons.push({ text: '❌ Batal', data: 'lapor:batal' });

            await ctx.editMessageText(
                `📍 *PILIH WILAYAH*\n\n` +
                `📝 Kondisi: ${state.kondisi}\n\n` +
                `Pilih wilayah tempat kejadian:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporAction] lapor:back:wil error:', err.message);
        }
    });

    // Callback: lapor:back:kec (kembali ke pilihan kecamatan)
    bot.action('lapor:back:kec', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.kecamatanList) {
                return await ctx.reply('⚠️ Session expired. Silakan mulai lagi dengan /lapor');
            }

            const buttons = state.kecamatanList.map((kec, i) => ({
                text: kec,
                data: `lapor:kec:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'lapor:back:wil' });
            buttons.push({ text: '❌ Batal', data: 'lapor:batal' });

            await ctx.editMessageText(
                `📍 *${state.wilayahName.toUpperCase()} - Pilih Kecamatan*\n\n` +
                `Pilih kecamatan tempat kejadian:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporAction] lapor:back:kec error:', err.message);
        }
    });

    // Callback: lapor:back:kel (kembali ke pilihan kelurahan)
    bot.action('lapor:back:kel', async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const userId = String(ctx.from.id);
            const state = getState(userId);

            if (!state || !state.kelurahanList) {
                return await ctx.reply('⚠️ Session expired. Silakan mulai lagi dengan /lapor');
            }

            const buttons = state.kelurahanList.map((kel, i) => ({
                text: kel,
                data: `lapor:kel:${i}`,
            }));
            buttons.push({ text: '« Kembali', data: 'lapor:back:kec' });
            buttons.push({ text: '❌ Batal', data: 'lapor:batal' });

            await ctx.editMessageText(
                `📍 *${state.kecamatanName.toUpperCase()} - Pilih Kelurahan*\n\n` +
                `Pilih kelurahan tempat kejadian:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: buildInlineKeyboard(buttons, 2).reply_markup,
                }
            );
        } catch (err) {
            console.error('[laporAction] lapor:back:kel error:', err.message);
        }
    });
};
