const config = require('../../config.cjs');
const { getImage } = require('../../utils/helper.cjs');

/**
 * Handler untuk Daftar TPS (Tempat Penampungan Sementara) Jakarta
 * Menampilkan pilihan wilayah untuk melihat daftar TPS per wilayah
 */
const handler = async (m) => {
    const { command } = m;

    switch (command.name) {
        case 'daftar_tps_jkt':
            
            const infoText = `🚮 *TEMPAT PENAMPUNGAN SEMENTARA (TPS)*

DKI Jakarta memiliki *500+ TPS* tersebar di 267 kelurahan.

TPS adalah tempat penampungan sampah sementara sebelum diangkut ke TPA Bantar Gebang.

📋 *Pilih wilayah* untuk melihat daftar TPS utama per wilayah:`;

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
                                title: 'Wilayah Jakarta',
                                rows: [
                                    { 
                                        title: "Jakarta Pusat", 
                                        description: "5 TPS Utama", 
                                        id: "tps_jakarta_pusat" 
                                    },
                                    { 
                                        title: "Jakarta Utara", 
                                        description: "5 TPS Utama", 
                                        id: "tps_jakarta_utara" 
                                    },
                                    { 
                                        title: "Jakarta Timur", 
                                        description: "5 TPS Utama", 
                                        id: "tps_jakarta_timur" 
                                    },
                                    { 
                                        title: "Jakarta Barat", 
                                        description: "5 TPS Utama", 
                                        id: "tps_jakarta_barat" 
                                    },
                                    { 
                                        title: "Jakarta Selatan", 
                                        description: "5 TPS Utama", 
                                        id: "tps_jakarta_selatan" 
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
