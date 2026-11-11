const config = require('../../config.cjs');
const { getImage } = require('../../utils/helper.cjs');
const zoneCache = require('../../services/zone_cache.cjs');

/**
 * Unified TPS Handler (API-based)
 * Handle all tps_* commands dynamically
 * Shows detailed TPS information with Google Maps integration
 */
const handler = async (m) => {
    const { command } = m;
    const commandName = command.name;
    
    // ponytail: check if this is our command
    if (!commandName.startsWith('tps_')) {
        return;
    }

    try {
        // ponytail: ensure cache is initialized
        let allZones = zoneCache.getAllZones();
        if (!allZones || allZones.length === 0) {
            await zoneCache.initialize();
        }

        // Extract zone_id from command: "tps_1" -> "1"
        const zoneIdStr = commandName.replace('tps_', '');
        const zoneId = parseInt(zoneIdStr);
        
        if (isNaN(zoneId)) {
            await m.reply({ text: '❌ ID TPS tidak valid.' });
            return;
        }

        // Refresh allZones after potential initialization
        allZones = zoneCache.getAllZones();
        
        // Find zone by ID
        const zone = allZones.find(z => z.id === zoneId);

        if (!zone) {
            await m.reply({ text: '❌ Data TPS tidak ditemukan.' });
            return;
        }

        // Build detailed information text
        let detailText = `🚮 *DETAIL TPS*\n\n`;
        detailText += `📍 *${zone.nama || `TPS ${zone.id}`}*\n\n`;
        
        // Location hierarchy
        detailText += `🏛️ *Lokasi:*\n`;
        if (zone.wilayah) detailText += `• Wilayah: ${zone.wilayah}\n`;
        if (zone.kecamatan) detailText += `• Kecamatan: ${zone.kecamatan}\n`;
        if (zone.kelurahan) detailText += `• Kelurahan: ${zone.kelurahan}\n`;
        detailText += `\n`;
        
        // TPS type
        if (zone.jenis_tps) {
            detailText += `📦 *Jenis TPS:* ${zone.jenis_tps}\n\n`;
        }
        
        // Full address
        if (zone.alamat) {
            detailText += `📮 *Alamat:*\n${zone.alamat}\n\n`;
        }
        
        // Geographic coordinates
        if (zone.latitude && zone.longitude) {
            detailText += `🗺️ *Koordinat:*\n`;
            detailText += `• Latitude: ${zone.latitude}\n`;
            detailText += `• Longitude: ${zone.longitude}\n\n`;
        }
        
        // Risk status if available
        if (zone.risk_status) {
            const riskEmoji = zone.risk_status.toLowerCase() === 'high' ? '🔴' : 
                             zone.risk_status.toLowerCase() === 'medium' ? '🟡' : '🟢';
            detailText += `${riskEmoji} *Risk Status:* ${zone.risk_status}\n\n`;
        }
        
        // Additional operational info
        if (zone.capacity) {
            detailText += `📊 *Kapasitas:* ${zone.capacity}\n`;
        }
        if (zone.operational_status) {
            detailText += `⚙️ *Status Operasional:* ${zone.operational_status}\n`;
        }
        
        // Contact info if available
        if (zone.contact) {
            detailText += `📞 *Kontak:* ${zone.contact}\n`;
        }

        // Prepare interactive buttons
        const buttons = [];
        
        // Add Google Maps button if coordinates are available
        if (zone.latitude && zone.longitude) {
            const mapsUrl = `https://www.google.com/maps?q=${zone.latitude},${zone.longitude}`;
            buttons.push({
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '📍 Lihat di Google Maps',
                    url: mapsUrl,
                    merchant_url: mapsUrl
                })
            });
        }
        
        // Add back button to return to main menu
        buttons.push({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '« Kembali ke Daftar Wilayah',
                id: 'daftar_wilayah'
            })
        });

        await m.sendInteractiveWithImage({
            imageSource: getImage(),
            text: detailText,
            footer: config.footerTxt,
            quoted: m.fakeOrder,
            contextInfo: {
                mentionedJid: ['0@s.whatsapp.net'],
                forwardingScore: 999,
                isForwarded: true,
            },
            buttons: buttons
        });

    } catch (error) {
        console.error('[tps_handler] Error:', error);
        await m.reply({ text: '❌ Terjadi kesalahan saat memuat detail TPS.' });
    }
};

// Register commands for PluginLoader auto-detection
// ponytail: generate tps_1 through tps_200 (covers all possible IDs)
handler.commands = Array.from({length: 200}, (_, i) => `tps_${i + 1}`);

module.exports = handler;
