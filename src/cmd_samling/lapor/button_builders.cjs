const zoneCache = require('../../services/zone_cache.cjs');

/**
 * Button Builders untuk Fitur Lapor v4 - Stateless
 * Semua context di-encode dalam button ID agar tidak butuh state_manager.
 * Format ID: <type>_<step>_<encoded_context>
 * 
 * UPDATED 2026-07-15: Support multiple report types (waste, event)
 * - type='waste' → prefix 'lapor_' (default)
 * - type='event' → prefix 'event_'
 */

// ponytail: helper encode/decode nama lokasi ke button ID safe string
const enc = s => s.toLowerCase().replace(/\s+/g, '_');
const dec = s => s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/**
 * Get button prefix based on report type
 * @param {string} type - 'waste' or 'event'
 * @returns {string} Button prefix
 */
function getPrefix(type = 'waste') {
    return type === 'event' ? 'event' : 'lapor';
}

/**
 * Build buttons untuk pemilihan wilayah
 * Button ID format: <prefix>_wil_<wilayahCode>
 * @param {string} type - 'waste' or 'event' (default: 'waste')
 */
function buildWilayahButtons(type = 'waste') {
    const prefix = getPrefix(type);
    const wilayahNames = zoneCache.getWilayahList();

    const rows = wilayahNames.map(name => ({
        title: name,
        description: `Pilih ${name}`,
        id: `${prefix}_wil_${enc(name)}`
    }));

    return [
        {
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: '『 Pilih Wilayah 』',
                sections: [{ title: 'Wilayah Jakarta', rows }]
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '❌ Batal',
                id: `${prefix}_batal`
            })
        }
    ];
}

/**
 * Build buttons untuk pemilihan kecamatan
 * Button ID format: <prefix>_kec_<wilayahCode>::<kecamatanName>
 * @param {string} wilayahName - Nama wilayah
 * @param {string} type - 'waste' or 'event' (default: 'waste')
 */
function buildKecamatanButtons(wilayahName, type = 'waste') {
    const prefix = getPrefix(type);
    const kecamatanList = zoneCache.getKecamatanList(wilayahName);
    const wCode = enc(wilayahName);

    const rows = kecamatanList.map(kec => ({
        title: kec,
        description: `Kecamatan ${kec}`,
        id: `${prefix}_kec_${wCode}::${enc(kec)}`
    }));

    return [
        {
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: '『 Pilih Kecamatan 』',
                sections: [{ title: `Kecamatan ${wilayahName}`, rows }]
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '« Kembali',
                id: `${prefix}_back_wil`
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '❌ Batal',
                id: `${prefix}_batal`
            })
        }
    ];
}

/**
 * Build buttons untuk pemilihan TPS (Level 3 - Wilayah -> Kecamatan -> TPS)
 * Button ID format: <prefix>_tps_<zone_id>::<wilayahCode>::<kecCode>
 * @param {string} wilayahName - Nama wilayah
 * @param {string} kecamatanName - Nama kecamatan
 * @param {string} type - 'waste' or 'event' (default: 'waste')
 */
function buildTpsButtons(wilayahName, kecamatanName, type = 'waste') {
    const prefix = getPrefix(type);
    const tpsList = zoneCache.getTpsList(wilayahName, kecamatanName);
    const wCode = enc(wilayahName);
    const kCode = enc(kecamatanName);

    const rows = tpsList.map(zone => ({
        title: `${zone.name} - ${zone.jenis_tps || 'TPS'}`,
        description: zone.alamat ? zone.alamat.slice(0, 60) : `Kecamatan ${kecamatanName}`,
        id: `${prefix}_tps_${zone.id}::${wCode}::${kCode}`
    }));

    return [
        {
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: '『 Pilih TPS 』',
                sections: [{ title: `TPS di ${kecamatanName}`, rows }]
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '« Kembali',
                id: `${prefix}_back_kec_${wCode}`
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '❌ Batal',
                id: `${prefix}_batal`
            })
        }
    ];
}

/**
 * Backward compatibility alias for kelurahan buttons
 */
function buildKelurahanButtons(wilayahName, kecamatanName, type = 'waste') {
    return buildTpsButtons(wilayahName, kecamatanName, type);
}

/**
 * Build buttons untuk konfirmasi media upload
 * @param {string} type - 'waste' or 'event' (default: 'waste')
 */
function buildConfirmationButtons(type = 'waste') {
    const prefix = getPrefix(type);
    return [
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '📷 Upload Foto',
                id: `${prefix}_upload_media`
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '⏭️ Kirim Tanpa Foto',
                id: `${prefix}_skip_media`
            })
        }
    ];
}

/**
 * Build button untuk selesai upload media
 * @param {string} type - 'waste' or 'event' (default: 'waste')
 */
function buildMediaDoneButton(type = 'waste') {
    const prefix = getPrefix(type);
    return [
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '✅ Selesai & Kirim',
                id: `${prefix}_media_done`
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '❌ Batal',
                id: `${prefix}_batal`
            })
        }
    ];
}

module.exports = {
    buildWilayahButtons,
    buildKecamatanButtons,
    buildKelurahanButtons,
    buildTpsButtons,
    buildConfirmationButtons,
    buildMediaDoneButton,
    getPrefix,
    enc,
    dec
};
