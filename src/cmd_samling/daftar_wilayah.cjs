const config = require('../config.cjs');
const { getImage } = require('../utils/helper.cjs');

/**
 * Handler untuk Daftar Kecamatan & Kelurahan Jakarta
 * Menampilkan daftar 6 wilayah administratif DKI Jakarta dengan info kecamatan & kelurahan
 */
const handler = async (m) => {
    const { command } = m;

    switch (command.name) {
        case 'wilayah_kec_kel':
            
            // Data wilayah DKI Jakarta
            const infoText = `📍 *DAFTAR KECAMATAN & KELURAHAN*

🏛️ *Total Wilayah Administratif:*
• 5 Kota Administratif + 1 Kabupaten
• 44 Kecamatan
• 267 Kelurahan

📋 Silahkan pilih wilayah di bawah untuk melihat detail kecamatan dan kelurahan.`;

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
                            title: '🗺️ Pilih Wilayah',
                            sections: [{
                                title: 'Pilih Wilayah',
                                rows: [
                                    { 
                                        title: "Jakarta Pusat", 
                                        description: "8 Kecamatan, 44 Kelurahan", 
                                        id: "wilayah_jakarta_pusat" 
                                    },
                                    { 
                                        title: "Jakarta Utara", 
                                        description: "6 Kecamatan, 31 Kelurahan", 
                                        id: "wilayah_jakarta_utara" 
                                    },
                                    { 
                                        title: "Jakarta Timur", 
                                        description: "10 Kecamatan, 65 Kelurahan", 
                                        id: "wilayah_jakarta_timur" 
                                    },
                                    { 
                                        title: "Jakarta Barat", 
                                        description: "8 Kecamatan, 56 Kelurahan", 
                                        id: "wilayah_jakarta_barat" 
                                    },
                                    { 
                                        title: "Jakarta Selatan", 
                                        description: "10 Kecamatan, 65 Kelurahan", 
                                        id: "wilayah_jakarta_selatan" 
                                    },
                                    { 
                                        title: "Kepulauan Seribu", 
                                        description: "2 Kecamatan, 6 Kelurahan", 
                                        id: "wilayah_kepulauan_seribu" 
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '« Kembali',
                            id: 'daftar_wilayah'
                        })
                    }
                ]
            });
            break;
    }
};

module.exports = handler;
