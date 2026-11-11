const config = require('../../config.cjs');
const { getImage } = require('../../utils/helper.cjs');
const zoneCache = require('../../services/zone_cache.cjs');

/**
 * Kelurahan Handler (API-based) - LEVEL 3 Navigation
 * Handle all kel_* commands dynamically
 * Shows TPS list per kelurahan
 */
const handler = async (m) => {
    const { command } = m;
    const commandName = command.name;
    
    // ponytail: check if this is our command
    if (!commandName.startsWith('kel_')) {
        return;
    }

    try {
        // ponytail: ensure cache is initialized
        let allZones = zoneCache.getAllZones();
        if (!allZones || allZones.length === 0) {
            await zoneCache.initialize();
        }

        // Extract kelurahan from command: "kel_penggilingan" -> "penggilingan"
        let kelurahanKey = commandName.replace('kel_', '').replace(/_/g, ' ');
        
        // Refresh allZones after potential initialization
        allZones = zoneCache.getAllZones();
        
        // Find matching kelurahan from zones (case-insensitive)
        const matchedZone = allZones.find(z =>
            z.kelurahan && z.kelurahan.toLowerCase() === kelurahanKey.toLowerCase()
        );

        if (!matchedZone) {
            await m.reply({ text: '❌ Data kelurahan tidak ditemukan.' });
            return;
        }

        const kelurahan = matchedZone.kelurahan;
        const kecamatan = matchedZone.kecamatan;
        const wilayah = matchedZone.wilayah;

        // Get all TPS for this kelurahan (use getTpsList with hierarchy)
        const tpsList = allZones.filter(z => 
            z.kelurahan && z.kelurahan.toLowerCase() === kelurahan.toLowerCase()
        );
        
        if (!tpsList || tpsList.length === 0) {
            await m.reply({ text: `❌ Tidak ada data TPS untuk Kelurahan ${kelurahan}.` });
            return;
        }

        // Generate button rows for TPS list
        const rows = tpsList.map(zone => {
            // Truncate address if too long for description
            let description = zone.alamat || zone.jenis_tps || 'TPS';
            if (description.length > 60) {
                description = description.substring(0, 57) + '...';
            }

            return {
                // CRITICAL FIX 2026-07-13: Field dari API adalah "name", bukan "nama"
                title: zone.name || `TPS ${zone.id}`,
                description: description,
                id: `tps_${zone.id}`
            };
        });

        const menuText = `🏘️ *KELURAHAN ${kelurahan.toUpperCase()}*
📍 ${kecamatan}, ${wilayah}

🚮 *Daftar TPS (Tempat Penampungan Sementara)*
Total: ${tpsList.length} TPS

Pilih TPS untuk melihat detail lengkap:`;

        await m.sendInteractiveWithImage({
            imageSource: getImage(),
            text: menuText,
            footer: config.footerTxt,
            quoted: m.fakeOrder,
            contextInfo: {
                mentionedJid: ['0@s.whatsapp.net'],
                forwardingScore: 999,
                isForwarded: true,
            },
            buttons: [
                {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: '『 Pilih TPS 』',
                        sections: [{
                            title: `TPS di ${kelurahan}`,
                            rows: rows
                        }]
                    })
                },
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: '« Kembali ke Daftar Wilayah',
                        id: 'daftar_wilayah'
                    })
                }
            ]
        });

    } catch (error) {
        console.error('[kelurahan_handler] Error:', error);
        await m.reply({ text: '❌ Terjadi kesalahan saat memuat data TPS.' });
    }
};

// Register kelurahan commands for PluginLoader
// ponytail: dynamic generation, akan di-detect dari cache saat runtime
handler.commands = ['kel_*']; // Wildcard untuk semua kelurahan

module.exports = handler;
