// cb2/src/cmd_samling/special_waste.cjs
const config = require('../config.cjs');

async function handleSpecialWaste({ Hanz, msg, sender, type }) {
    if (type === 'ewaste') {
        const text = 
`📱 *LAYANAN PENJEMPUTAN E-WASTE (LIMBAH ELEKTRONIK)*
────────────────────────────
Halo Bapak/Ibu! Untuk penanganan limbah elektronik rumah tangga (seperti handphone, kabel, baterai, komputer, TV, atau alat elektronik rusak lainnya), Dinas Lingkungan Hidup DKI Jakarta menyediakan layanan penjemputan khusus yang aman bagi lingkungan.

Silakan daftarkan jadwal penjemputan limbah elektronik Anda langsung melalui portal resmi e-Waste DLH DKI Jakarta:

🌐 *Portal Resmi:*
https://ewaste.dinaslhdki.id/

Petugas DLH akan menjadwalkan penjemputan langsung ke lokasi Anda sesuai antrean sistem.`;

        try {
            const { sendInteractiveMessage } = require('../utils/interactiveHelper.cjs');
            await sendInteractiveMessage(Hanz, sender, {
                text,
                footer: config.footerTxt || 'Dinas Lingkungan Hidup DKI Jakarta',
                buttons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Buka Portal E-Waste DLH',
                            url: 'https://ewaste.dinaslhdki.id/'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '« Kembali ke Menu',
                            id: 'menu'
                        })
                    }
                ],
                quoted: msg
            });
        } catch (e) {
            await Hanz.sendMessage(sender, { text }, { quoted: msg });
        }
        return;
    }

    if (type === 'bulky') {
        const text = 
`🛋️ *LAYANAN PENJEMPUTAN BULKY WASTE (SAMPAH BESAR)*
────────────────────────────
Halo Bapak/Ibu! Untuk sampah rumah tangga berukuran besar (seperti kasur, springbed, lemari, sofa, meja, atau perabot rumah lainnya yang tidak muat di tempat sampah biasa), DLH DKI Jakarta menyediakan armada penjemputan terjadwal.

Silakan ajukan permohonan penjemputan sampah besar Anda melalui website resmi DLH DKI Jakarta:

🌐 *Website Resmi Bulky Waste:*
https://lingkunganhidup.jakarta.go.id/layanan/bulky-waste

Isi data perabot dan alamat penjemputan, armada DLH tingkat kecamatan akan berkoordinasi untuk pengangkutan.`;

        try {
            const { sendInteractiveMessage } = require('../utils/interactiveHelper.cjs');
            await sendInteractiveMessage(Hanz, sender, {
                text,
                footer: config.footerTxt || 'Dinas Lingkungan Hidup DKI Jakarta',
                buttons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Buka Portal Bulky Waste DLH',
                            url: 'https://lingkunganhidup.jakarta.go.id/layanan/bulky-waste'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '« Kembali ke Menu',
                            id: 'menu'
                        })
                    }
                ],
                quoted: msg
            });
        } catch (e) {
            await Hanz.sendMessage(sender, { text }, { quoted: msg });
        }
        return;
    }
}

module.exports = { handleSpecialWaste };
