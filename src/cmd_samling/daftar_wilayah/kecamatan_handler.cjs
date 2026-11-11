const config = require('../../config.cjs');
const { getImage } = require('../../utils/helper.cjs');
const zoneCache = require('../../services/zone_cache.cjs');

/**
 * Unified Kecamatan Handler (API-based) - LEVEL 2 Navigation
 * Handle all kec_* commands dynamically
 * Shows KELURAHAN list per kecamatan (4-level hierarchy)
 */
const handler = async (m) => {
    const { command } = m;
    const commandName = command.name;
    
    // ponytail: check if this is our command
    if (!commandName.startsWith('kec_')) {
        return;
    }

    try {
        // ponytail: ensure cache is initialized
        let allZones = zoneCache.getAllZones();
        if (!allZones || allZones.length === 0) {
            await zoneCache.initialize();
        }

        // Extract kecamatan from command: "kec_cengkareng" -> "cengkareng"
        let kecamatanKey = commandName.replace('kec_', '').replace(/_/g, ' ');
        
        // Refresh allZones after potential initialization
        allZones = zoneCache.getAllZones();
        
        // Find matching kecamatan from zones (case-insensitive)
        const matchedZone = allZones.find(z =>
            z.kecamatan && z.kecamatan.toLowerCase() === kecamatanKey.toLowerCase()
        );

        if (!matchedZone) {
            await m.reply({ text: '❌ Data kecamatan tidak ditemukan.' });
            return;
        }

        const kecamatan = matchedZone.kecamatan;
        const wilayah = matchedZone.wilayah;

        // Get all TPS for this kecamatan (3-level hierarchy)
        const tpsList = zoneCache.getTpsList(wilayah, kecamatan);
        
        if (!tpsList || tpsList.length === 0) {
            await m.reply({ text: `❌ Tidak ada data TPS untuk ${kecamatan}.` });
            return;
        }

        // Generate button rows for TPS list
        const rows = tpsList.map(tps => {
            if (!tps || !tps.id) return null;
            return {
                title: `${tps.name} - ${tps.jenis_tps || 'TPS'}`,
                description: tps.alamat ? tps.alamat.slice(0, 60) : `Status: ${tps.risk_status || 'Aman'}`,
                id: `tps_${tps.id}`
            };
        }).filter(Boolean);

        const totalTPS = tpsList.length;

        const menuText = `📍 *KECAMATAN ${kecamatan.toUpperCase()}*
${wilayah}

🚮 *Daftar TPS*
Total: ${totalTPS} TPS

Pilih TPS untuk melihat detail:`;

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
                            title: `TPS di ${kecamatan}`,
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
        console.error('[kecamatan_handler] Error:', error);
        await m.reply({ text: '❌ Terjadi kesalahan saat memuat data kelurahan.' });
    }
};

// Register all kecamatan commands for PluginLoader (44 kecamatan di DKI Jakarta)
handler.commands = [
    // Jakarta Barat (8)
    'kec_cengkareng', 'kec_grogol_petamburan', 'kec_taman_sari', 'kec_tambora',
    'kec_kebon_jeruk', 'kec_kalideres', 'kec_palmerah', 'kec_kembangan',
    // Jakarta Pusat (8)
    'kec_gambir', 'kec_tanah_abang', 'kec_menteng', 'kec_senen',
    'kec_cempaka_putih', 'kec_johar_baru', 'kec_kemayoran', 'kec_sawah_besar',
    // Jakarta Selatan (10)
    'kec_tebet', 'kec_setiabudi', 'kec_mampang_prapatan', 'kec_pasar_minggu',
    'kec_kebayoran_lama', 'kec_kebayoran_baru', 'kec_pesanggrahan', 'kec_cilandak',
    'kec_pancoran', 'kec_jagakarsa',
    // Jakarta Timur (10)
    'kec_matraman', 'kec_pulo_gadung', 'kec_jatinegara', 'kec_kramat_jati',
    'kec_pasar_rebo', 'kec_cakung', 'kec_duren_sawit', 'kec_makasar',
    'kec_ciracas', 'kec_cipayung',
    // Jakarta Utara (6)
    'kec_penjaringan', 'kec_pademangan', 'kec_tanjung_priok', 'kec_koja',
    'kec_kelapa_gading', 'kec_cilincing',
    // Kepulauan Seribu (2)
    'kec_kepulauan_seribu_selatan', 'kec_kepulauan_seribu_utara'
];

module.exports = handler;
