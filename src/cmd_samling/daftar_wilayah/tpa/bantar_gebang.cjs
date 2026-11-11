const config = require('../../../config.cjs');
const { getImage } = require('../../../utils/helper.cjs');

/**
 * Handler untuk Detail TPA Bantar Gebang
 * Menampilkan informasi lengkap TPA Bantar Gebang
 */
const handler = async (m) => {
    const { command } = m;

    switch (command.name) {
        case 'tpa_bantar_gebang_detail':
            
            const infoText = `🗑️ *DETAIL TPA BANTAR GEBANG*

📍 *LOKASI & STATUS*
• Alamat: Ciketing Udik, Bantar Gebang, Bekasi
• Koordinat: 6°23'S, 106°59'E (perbatasan Jakarta-Bekasi)
• Status: ✅ Operasional sejak 1989
• Jangkauan: Melayani seluruh DKI Jakarta (5 kota administratif)

📊 *SPESIFIKASI TEKNIS*
• Luas Total: 110.3 hektar
• Kapasitas Harian: 7,000 ton/hari
• Volume Timbunan: ~40 juta ton (akumulasi)
• Tinggi Timbunan: ~40-50 meter

🔧 *TEKNOLOGI PENGOLAHAN*
1. *Sanitary Landfill*
   - Sistem pembuangan terkelola dengan lapisan kedap air
   - Pengumpulan gas metana untuk energi

2. *Refuse-Derived Fuel (RDF)*
   - Pengolahan sampah menjadi bahan bakar alternatif
   - Digunakan untuk industri semen

3. *Pengolahan Leachate*
   - Instalasi pengolahan air lindi (limbah cair)
   - Mencegah pencemaran air tanah

4. *Waste-to-Energy (PLTSa)*
   - Pembangkit Listrik Tenaga Sampah
   - Kapasitas: ~35 MW (target)
   - Mengolah sampah jadi listrik untuk 150,000 rumah

⚡ *OPERASIONAL*
• Jam Operasi: 24/7 (non-stop)
• Jumlah Truk: 500+ truk sampah/hari
• Pekerja: 2,000+ pekerja (termasuk pemulung)
• Fasilitas: Jalan akses, weighbridge, area sortir, kantor pengelola

🌍 *DAMPAK LINGKUNGAN*
• Bau: Radius 2-5 km (tergantung arah angin)
• Udara: Monitoring kualitas udara rutin
• Air: Sistem pengolahan leachate modern
• Tanah: Lapisan geomembran pencegah rembesan

💼 *PENGELOLA*
Dinas Lingkungan Hidup DKI Jakarta
Kerjasama dengan PT Godang Tua Jaya (operator PLTSa)

ℹ️ *INFO TAMBAHAN*
TPA Bantar Gebang adalah salah satu TPA terbesar di Asia Tenggara. Setiap hari, sampah dari 10+ juta penduduk Jakarta diangkut ke lokasi ini melalui jaringan TPS → Transfer Station → TPA.`;

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
                            display_text: '« Kembali ke TPA', 
                            id: 'daftar_tpa_jkt' 
                        }) 
                    },
                    { 
                        name: 'quick_reply', 
                        buttonParamsJson: JSON.stringify({ 
                            display_text: '🏠 Menu Utama', 
                            id: 'samling' 
                        }) 
                    }
                ]
            });
            break;
    }
};

module.exports = handler;
