const groupWhitelist = require('../services/group-whitelist.cjs');
const config = require('../config.cjs');

/**
 * Group Whitelist Command Handler
 * Allows super owner to manage which groups AI can respond in
 * 
 * Commands:
 * - !wlistgb - Add group to AI whitelist
 * - !blistgb - Remove group from AI whitelist
 */

const handler = async (m) => {
    const { command, Hanz, sender, isSuperOwner, isGroup } = m;

    // Super owner only
    if (!isSuperOwner) {
        await Hanz.sendMessage(sender, { 
            text: '❌ Command ini hanya untuk Super Owner!' 
        });
        return;
    }

    switch (command.name) {
        case 'wlistgb': {
            try {
                // Fetch all groups bot is in
                const groups = await Hanz.groupFetchAllParticipating();
                const groupList = Object.values(groups);

                if (groupList.length === 0) {
                    await Hanz.sendMessage(sender, { 
                        text: '❌ Bot tidak tergabung di grup manapun.' 
                    });
                    return;
                }

                // Filter groups NOT in whitelist
                const nonWhitelistedGroups = groupList.filter(g => 
                    !groupWhitelist.isWhitelisted(g.id)
                );

                if (nonWhitelistedGroups.length === 0) {
                    await Hanz.sendMessage(sender, { 
                        text: '✅ Semua grup sudah di-whitelist untuk AI!' 
                    });
                    return;
                }

                // Build interactive list
                const rows = nonWhitelistedGroups.map(g => ({
                    title: g.subject || 'Tanpa Nama',
                    description: `ID: ${g.id.split('@')[0]}`,
                    id: `wlist_add_${g.id}`
                }));

                const sections = [{
                    title: '🤖 Pilih Grup untuk Whitelist AI',
                    highlight_label: 'Available',
                    rows: rows.slice(0, 20) // Limit to 20 groups per page
                }];

                await m.sendInteractive({
                    text: `*📋 GRUP BELUM DI-WHITELIST*\n\n` +
                          `Total: ${nonWhitelistedGroups.length} grup\n` +
                          `Ditampilkan: ${Math.min(20, rows.length)} grup\n\n` +
                          `Pilih grup yang ingin diizinkan untuk AI:`,
                    footer: config.footerTxt,
                    buttons: [{
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: '🔓 Pilih Grup',
                            sections
                        })
                    }]
                });

                if (nonWhitelistedGroups.length > 20) {
                    await Hanz.sendMessage(sender, { 
                        text: `⚠️ Hanya 20 grup pertama yang ditampilkan.\nTotal grup tersedia: ${nonWhitelistedGroups.length}` 
                    });
                }

            } catch (err) {
                console.error('[WLISTGB] Error:', err.message);
                await Hanz.sendMessage(sender, { 
                    text: '❌ Terjadi kesalahan saat mengambil daftar grup.' 
                });
            }
            break;
        }

        case 'blistgb': {
            try {
                // Fetch all groups bot is in
                const groups = await Hanz.groupFetchAllParticipating();
                const groupList = Object.values(groups);

                if (groupList.length === 0) {
                    await Hanz.sendMessage(sender, { 
                        text: '❌ Bot tidak tergabung di grup manapun.' 
                    });
                    return;
                }

                // Filter groups IN whitelist
                const whitelistedGroups = groupList.filter(g => 
                    groupWhitelist.isWhitelisted(g.id)
                );

                if (whitelistedGroups.length === 0) {
                    await Hanz.sendMessage(sender, { 
                        text: '❌ Belum ada grup yang di-whitelist untuk AI.' 
                    });
                    return;
                }

                // Build interactive list
                const rows = whitelistedGroups.map(g => ({
                    title: g.subject || 'Tanpa Nama',
                    description: `ID: ${g.id.split('@')[0]}`,
                    id: `wlist_remove_${g.id}`
                }));

                const sections = [{
                    title: '🤖 Pilih Grup untuk Hapus dari Whitelist',
                    highlight_label: 'Whitelisted',
                    rows: rows.slice(0, 20) // Limit to 20 groups per page
                }];

                await m.sendInteractive({
                    text: `*📋 GRUP SUDAH DI-WHITELIST*\n\n` +
                          `Total: ${whitelistedGroups.length} grup\n` +
                          `Ditampilkan: ${Math.min(20, rows.length)} grup\n\n` +
                          `Pilih grup yang ingin dihapus dari whitelist:`,
                    footer: config.footerTxt,
                    buttons: [{
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: '🔒 Pilih Grup',
                            sections
                        })
                    }]
                });

                if (whitelistedGroups.length > 20) {
                    await Hanz.sendMessage(sender, { 
                        text: `⚠️ Hanya 20 grup pertama yang ditampilkan.\nTotal grup whitelisted: ${whitelistedGroups.length}` 
                    });
                }

            } catch (err) {
                console.error('[BLISTGB] Error:', err.message);
                await Hanz.sendMessage(sender, { 
                    text: '❌ Terjadi kesalahan saat mengambil daftar grup.' 
                });
            }
            break;
        }
    }
};

module.exports = handler;
