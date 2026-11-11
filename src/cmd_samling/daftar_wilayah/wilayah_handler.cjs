const config = require('../../config.cjs');
const { getImage } = require('../../utils/helper.cjs');
const zoneCache = require('../../services/zone_cache.cjs');

/**
 * Unified Wilayah Handler (API-based)
 * Handle all wilayah_jakarta_* commands dynamically
 * Commands: wilayah_jakarta_barat, wilayah_jakarta_pusat, wilayah_jakarta_selatan,
 *           wilayah_jakarta_timur, wilayah_jakarta_utara, wilayah_kepulauan_seribu
 */
const handler = async (m) => {
    const { command } = m;

    // Extract wilayah name from command
    const commandName = command.name;
    
    // ponytail: check if this is our command
    if (!commandName.startsWith('wilayah_jakarta_') && commandName !== 'wilayah_kepulauan_seribu') {
        return;
    }

    try {
        // ponytail: ensure cache is initialized
        let wilayahList = zoneCache.getUniqueWilayah();
        if (!wilayahList || wilayahList.length === 0) {
            await zoneCache.initialize();
        }

        // Extract wilayah from command: "wilayah_jakarta_barat" -> "jakarta barat"
        let wilayahKey = commandName.replace('wilayah_', '').replace(/_/g, ' ');
        
        // Find matching wilayah from cache (case-insensitive match)
        const allWilayah = zoneCache.getUniqueWilayah();
        const wilayah = allWilayah.find(w => {
            const wStr = typeof w === 'string' ? w : (w && w.name ? w.name : '');
            return wStr && wStr.toLowerCase() === wilayahKey.toLowerCase();
        });

        if (!wilayah) {
            await m.reply({ text: '❌ Data wilayah tidak ditemukan.' });
            return;
        }

        // Get kecamatan list for this wilayah
        const kecamatanList = zoneCache.getKecamatanByWilayah(wilayah);
        
        if (!kecamatanList || kecamatanList.length === 0) {
            await m.reply({ text: `❌ Tidak ada data kecamatan untuk ${wilayah}.` });
            return;
        }

        // Generate button rows with TPS count per kecamatan
        const rows = kecamatanList.map(k => {
            const kecamatan = typeof k === 'string' ? k : (k && k.name ? k.name : '');
            if (!kecamatan) return null;

            const tpsCount = zoneCache.getZonesByKecamatan(kecamatan).length;
            const commandId = `kec_${kecamatan.toLowerCase().replace(/\s+/g, '_')}`;
            
            return {
                title: kecamatan,
                description: `${tpsCount} TPS`,
                id: commandId
            };
        }).filter(Boolean);

        // Calculate total TPS for this wilayah
        const totalTPS = kecamatanList.reduce((sum, kec) => 
            sum + zoneCache.getZonesByKecamatan(kec).length, 0
        );

        const menuText = `🏛️ *${wilayah.toUpperCase()}*

📍 *Daftar Kecamatan*
Total: ${kecamatanList.length} Kecamatan | ${totalTPS} TPS

Pilih kecamatan untuk melihat daftar TPS:`;

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
                        title: '『 Pilih Kecamatan 』',
                        sections: [{
                            title: `Kecamatan ${wilayah}`,
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
        console.error('[wilayah_handler] Error:', error);
        await m.reply({ text: '❌ Terjadi kesalahan saat memuat data kecamatan.' });
    }
};

// Register commands for PluginLoader auto-detection
handler.commands = [
    'wilayah_jakarta_barat',
    'wilayah_jakarta_pusat',
    'wilayah_jakarta_selatan',
    'wilayah_jakarta_timur',
    'wilayah_jakarta_utara',
    'wilayah_kepulauan_seribu'
];

module.exports = handler;
