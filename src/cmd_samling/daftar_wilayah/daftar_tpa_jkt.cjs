const config = require('../../config.cjs');
const { getImage } = require('../../utils/helper.cjs');

/**
 * Handler untuk Daftar TPA (Tempat Pemrosesan Akhir) Jakarta
 * Menampilkan informasi TPA Bantar Gebang
 */
const handler = async (m) => {
    const { command } = m;

    switch (command.name) {
        case 'daftar_tpa_jkt':
            
            const infoText = `🗑️ *TEMPAT PEMROSESAN AKHIR (TPA)*

📍 *TPA Bantar Gebang*
Lokasi: Ciketing Udik, Bantar Gebang, Bekasi
Status: ✅ Operasional (melayani seluruh DKI Jakarta)

📊 *Spesifikasi:*
• Luas Area: 110.3 hektar
• Kapasitas: 7,000 ton/hari
• Teknologi:
  - Sanitary Landfill
  - Refuse-Derived Fuel (RDF)
  - Pengolahan Leachate
  - Waste-to-Energy (PLTSa)

ℹ️ *Keterangan:*
Satu-satunya TPA untuk DKI Jakarta, menerima sampah dari 5 kota administratif.

Klik tombol di bawah untuk melihat detail lengkap TPA Bantar Gebang.`;

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
                        name: 'quick_reply', 
                        buttonParamsJson: JSON.stringify({ 
                            display_text: '📋 Detail TPA', 
                            id: 'tpa_bantar_gebang_detail' 
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
