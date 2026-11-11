const config = require('../config.cjs');
const { formatUptime } = require('../utils/helper.cjs');
const plugins = require('../utils/PluginLoader.cjs');
const { getImage } = require('../utils/helper.cjs');

const EXCLUDED_CMDS = [
    'menu',
    'generalmenu',
    'ownermenu',
    'ffmpegmenu',
    'downloadmenu',
    'toolsmenu',
    'jadibotmenu',
    'funmenu',
    'groupmenu',
    'mediamenu',
];

const handler = async (m) => {
    const { command } = m;
    const p = config.prefix;

    switch (command.name) {
        case 'samling': case 'menu': {
            const senderRaw = m.senderNumber || m.sender || '';
            const senderNum = senderRaw.split('@')[0].split(':')[0];
            const cleanPhone = senderNum.replace(/^0/, '62');

            // Cek otorisasi role secara paralel & dinamis via backend API (dengan TTL in-memory cache)
            const tps3rService = require('../services/tps3rService.cjs');
            const eventService = require('../services/eventService.cjs');

            const [officerRes, picRes] = await Promise.all([
                tps3rService.verifyOfficer(cleanPhone).catch(() => ({ authorized: false })),
                eventService.verifyPicSender(cleanPhone).catch(() => ({ authorized: false }))
            ]);

            // Murni cek otorisasi via backend API resmi (tidak dipaksa role petugas oleh status superOwner)
            const isOfficer = Boolean(officerRes?.authorized);
            const canReportEvent = Boolean(picRes?.authorized);

            let roleLabel = '👤 *Masyarakat / Warga*';
            if (isOfficer) {
                roleLabel = `👷 *Petugas Lapangan TPS 3R* (${officerRes?.name || officerRes?.zone_name || 'Terverifikasi'})`;
            } else if (canReportEvent) {
                roleLabel = `🎪 *Panitia Event DLH* (${picRes?.pic_name || picRes?.event_name || 'Terverifikasi'})`;
            }

            // Format teks menu bersih, elegan, dan profesional khas instansi DLH DKI Jakarta
            let menutxt = 
`*SAMLING DLH DKI JAKARTA*
Sistem Informasi & Pengaduan Lingkungan Hidup

• *Status Akses:* ${roleLabel}
• *Waktu Operasional:* ${formatUptime(process.uptime())}

Silakan gunakan tombol menu di bawah untuk memilih layanan yang Anda perlukan.`;

            const layananRows = [
                { title: "Pengaduan Sampah", description: "Laporkan penumpukan atau kendala sampah liar", id: "laporan" }
            ];

            if (canReportEvent) {
                layananRows.push({
                    title: "Pemberitahuan Kegiatan/Event",
                    description: "Pengajuan pengelolaan sampah acara masyarakat",
                    id: "lapor_event"
                });
            }

            const sections = [
                {
                    title: 'Layanan Pengaduan & Kegiatan',
                    highlight_label: 'Layanan',
                    rows: layananRows
                },
                {
                    title: 'Layanan Khusus DLH DKI Jakarta',
                    highlight_label: 'Khusus',
                    rows: [
                        { title: "Penjemputan E-Waste (Elektronik)", description: "Layanan penjemputan limbah elektronik rumah tangga", id: "ewaste" },
                        { title: "Penjemputan Bulky Waste (Besar)", description: "Layanan penjemputan kasur, lemari, & perabot besar", id: "bulky_waste" }
                    ]
                },
                {
                    title: 'Pemantauan & Informasi Publik',
                    highlight_label: 'Informasi',
                    rows: [
                        { title: "Status Pengaduan", description: "Periksa status tindak lanjut pengaduan", id: "lihat_laporan" },
                        { title: "Daftar Wilayah & TPS", description: "Informasi sebaran TPS per kecamatan dan kelurahan", id: "daftar_wilayah" }
                    ]
                }
            ];

            if (isOfficer) {
                const zoneName = officerRes?.zone_name || 'TPS 3R';
                sections.push({
                    title: `Fitur Khusus Petugas ${zoneName}`,
                    highlight_label: 'Operasional',
                    rows: [
                        { title: `Lapor Timbangan ${zoneName}`, description: `Pencatatan hasil olahan harian di ${zoneName}`, id: "lapor_tps3r" },
                        { title: "Target Harian TPS 3R", description: "Cek progres capaian 10 dustbin hari ini", id: "target" },
                        { title: "Rekap Mingguan TPS 3R", description: "Rangkuman tonase dan olahan 7 hari terakhir", id: "rekap" },
                        { title: "Riwayat Timbangan", description: "5 daftar laporan timbangan terakhir", id: "riwayat" }
                    ]
                });
            }

            await m.sendInteractiveWithImage({
                imageSource: getImage(),
                text: menutxt,
                footer: config.footerTxt,
                quoted: m.fakeOrder,
                contextInfo: {
                    mentionedJid: ['0@s.whatsapp.net'],
                    forwardingScore: 999,
                    isForwarded: true,
                },
                buttons: [
                    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Bantuan & Layanan Teknis', url: 'https://wa.me/62859195391196' }) },
                    { name: 'single_select', buttonParamsJson: JSON.stringify({
                            title: 'Pilih Layanan',
                            sections
                        })
                    }
                ]
            });
            break;
        }
    }
};

module.exports = handler;