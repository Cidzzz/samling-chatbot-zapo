const config = require('../../config.cjs');
const { getImage } = require('../../utils/helper.cjs');
const zoneCache = require('../../services/zone_cache.cjs');
const api = require('../../services/api.cjs');

/**
 * Handler untuk fitur Daftar Wilayah Jakarta (API-based)
 * Menampilkan daftar wilayah DKI Jakarta dengan data TPS dari API
 * 
 * CRITICAL FIX 2026-07-12:
 * - Tidak bergantung pada cache initialization
 * - Langsung fetch API jika data tidak tersedia
 * - Tampilkan error API yang spesifik ke user
 */
const handler = async (m) => {
    const { command } = m;

    switch (command.name) {
        case 'daftar_wilayah':
            try {
                // ponytail: try cache first, fallback to direct API fetch
                let wilayahList = [];
                let stats = { totalZones: 0, uniqueKecamatan: 0 };
                
                // Step 1: Try to get from cache (FIXED: no isInitialized check)
                wilayahList = zoneCache.getUniqueWilayah();
                if (wilayahList && wilayahList.length > 0) {
                    console.log('[daftar_wilayah] Using cached data');
                    stats = zoneCache.getStats();
                }
                
                // Step 2: If cache empty or not initialized, fetch directly from API
                if (!wilayahList || wilayahList.length === 0) {
                    console.log('[daftar_wilayah] Cache empty/not initialized, fetching from API...');
                    await m.reply({ text: '⏳ Mengambil data dari server...' });
                    
                    try {
                        // ponytail: direct API call, no cache dependency
                        const hierarchy = await api.getZonesHierarchy();
                        
                        if (!hierarchy || !hierarchy.wilayah || hierarchy.wilayah.length === 0) {
                            console.error('[daftar_wilayah] API returned empty data');
                            await m.reply({ text: '❌ Server mengembalikan data kosong.\n\nSilakan hubungi admin untuk memeriksa konfigurasi sistem.' });
                            return;
                        }
                        
                        // Extract wilayah from fresh API data
                        // ponytail: API returns 'name' not 'nama_wilayah'
                        wilayahList = hierarchy.wilayah.map(w => w.name);
                        
                        // Calculate stats from fresh data
                        let totalZones = 0;
                        let uniqueKecamatan = 0;
                        hierarchy.wilayah.forEach(w => {
                            uniqueKecamatan += w.kecamatan?.length || 0;
                            w.kecamatan?.forEach(k => {
                                if (Array.isArray(k.tps)) {
                                    totalZones += k.tps.length;
                                } else if (Array.isArray(k.kelurahan)) {
                                    k.kelurahan.forEach(kel => {
                                        totalZones += kel.tps?.length || 0;
                                    });
                                }
                            });
                        });
                        stats = { totalZones, uniqueKecamatan };
                        
                        console.log('[daftar_wilayah] API fetch success:', { wilayahCount: wilayahList.length, totalZones, uniqueKecamatan });
                        console.log('[daftar_wilayah] wilayahList:', wilayahList);
                        
                    } catch (apiError) {
                        console.error('[daftar_wilayah] API fetch failed:', apiError);
                        
                        // ponytail: show SPECIFIC error message to user, not generic "loading..."
                        const errorMsg = apiError.message || 'Tidak dapat terhubung ke server';
                        await m.reply({ 
                            text: `❌ *Gagal Mengambil Data Wilayah*\n\n🔴 Error: ${errorMsg}\n\n💡 Kemungkinan penyebab:\n• Server API tidak aktif\n• Koneksi internet terputus\n• Server sedang maintenance\n\nSilakan coba lagi dalam beberapa saat atau hubungi admin.` 
                        });
                        return;
                    }
                }

                console.log('[daftar_wilayah] Step 3: Validate data');
                // Step 3: Validate we have data to display
                if (!wilayahList || wilayahList.length === 0) {
                    console.log('[daftar_wilayah] Data wilayah kosong, mengirim pesan error');
                    await m.reply({ text: '❌ Data wilayah tidak tersedia saat ini.' });
                    return;
                }

                console.log('[daftar_wilayah] Step 4: Generate rows');
                // Step 4: Generate dynamic button rows
                const rows = wilayahList.map(w => {
                    const wilayah = typeof w === 'string' ? w : (w && w.name ? w.name : '');
                    if (!wilayah) return null;

                    // ponytail: calculate TPS count from cache if available
                    let tpsCount = 0;
                    let kecCount = 0;
                    
                    try {
                        const zones = zoneCache.getZonesByWilayah(wilayah);
                        const kecamatan = zoneCache.getKecamatanByWilayah(wilayah);
                        tpsCount = zones ? zones.length : 0;
                        kecCount = kecamatan ? kecamatan.length : 0;
                    } catch (e) {
                        // ponytail: cache not ready, use 0 counts
                    }
                    
                    // Convert wilayah name to command ID: "Jakarta Barat" -> "wilayah_jakarta_barat"
                    const commandId = `wilayah_${wilayah.toLowerCase().replace(/\s+/g, '_')}`;
                    
                    return {
                        title: wilayah,
                        description: kecCount > 0 ? `${kecCount} Kecamatan • ${tpsCount} TPS` : 'Lihat Detail',
                        id: commandId
                    };
                }).filter(Boolean);
                
                console.log('[daftar_wilayah] Rows generated:', rows.length);
                
                if (rows.length === 0) {
                    console.log('[daftar_wilayah] Rows kosong setelah filter, mengirim pesan error');
                    await m.reply({ text: '❌ Gagal memproses data wilayah.' });
                    return;
                }

                const infoText = `🗺️ *DAFTAR WILAYAH JAKARTA*

📊 *Data TPS Jakarta*
Total: ${stats.totalZones} TPS tersebar di ${stats.uniqueKecamatan} kecamatan

📍 Pilih wilayah untuk melihat daftar kecamatan dan TPS:`;

                console.log('[daftar_wilayah] Sending interactive message...');
                try {
                    await m.sendInteractiveWithImage({
                    imageSource: getImage(),
                    text: infoText,
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
                                title: '『 Pilih Wilayah 』',
                                sections: [{
                                    title: 'Wilayah DKI Jakarta',
                                    rows: rows
                                }]
                            })
                        }
                    ]
                });
                console.log('[daftar_wilayah] Interactive message sent successfully');
                } catch (sendError) {
                    console.error('[daftar_wilayah] Error sending interactive message:', sendError);
                    await m.reply({ text: infoText + '\n\n(Gagal memuat tombol, silakan ketik manual wilayah yang diinginkan)' });
                }
            } catch (error) {
                console.error('[daftar_wilayah] Unexpected error:', error);
                await m.reply({ text: `❌ Terjadi kesalahan: ${error.message}\n\nSilakan coba lagi atau hubungi admin.` });
            }
            break;
    }
};

module.exports = handler;
