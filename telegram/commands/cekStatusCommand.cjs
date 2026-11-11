/**
 * Command: /cekstatus
 * Cek status laporan berdasarkan ticket ID
 */
const api = require('../../src/services/api.cjs');

module.exports = (bot) => {
    bot.command('cekstatus', async (ctx) => {
        try {
            const args = ctx.message.text.split(/\s+/).slice(1);
            const ticketInput = args[0];

            if (!ticketInput) {
                return await ctx.reply(
                    '⚠️ *Format Salah*\n\n' +
                    'Gunakan: `/cekstatus <nomor_tiket>`\n\n' +
                    '📝 Contoh: `/cekstatus 12`',
                    { parse_mode: 'Markdown' }
                );
            }

            const ticketId = parseInt(ticketInput.trim(), 10);

            if (isNaN(ticketId)) {
                return await ctx.reply(
                    '⚠️ *Nomor Tiket Tidak Valid*\n\n' +
                    'Masukkan nomor tiket berupa angka saja.\n\n' +
                    '📝 Contoh: `/cekstatus 12`',
                    { parse_mode: 'Markdown' }
                );
            }

            await ctx.reply('⏳ Mengambil data laporan...');

            try {
                const report = await api.getReportStatus(ticketId);

                if (!report) {
                    return await ctx.reply(
                        `🔍 *Tiket #${ticketId} Tidak Ditemukan*\n\n` +
                        'Pastikan kembali nomor tiket Anda sudah benar.\n\n' +
                        '💡 Nomor tiket diberikan saat Anda mengirim laporan.',
                        { parse_mode: 'Markdown' }
                    );
                }

                const dateFormatted = new Date(report.created_at).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });

                const STATUS_MAP = {
                    'Baru': '🔴 Baru (Menunggu Antrean Armada)',
                    'Sedang Ditangani': '🟡 Sedang Ditangani (Supir sedang menuju TPS)',
                    'Selesai': '🟢 Selesai (Sampah telah diangkut & TPS bersih)',
                };

                const output = (
                    `📋 *STATUS LAPORAN ADUAN WARGA*\n` +
                    `════════════════════════\n` +
                    `🎫 *Nomor Tiket:* #${report.id}\n` +
                    `📅 *Tanggal Lapor:* ${dateFormatted}\n` +
                    `📌 *Lokasi TPS:* ${report.zone?.name || 'Tidak diketahui'}\n` +
                    `📍 *Kelurahan/Kecamatan:* ${report.zone?.kelurahan || '-'}/${report.zone?.kecamatan || '-'}\n` +
                    `💬 *Deskripsi:* "${report.report_content}"\n\n` +
                    `📊 *Status Penanganan:*\n` +
                    `👉 *${STATUS_MAP[report.status] || report.status}*\n` +
                    `════════════════════════\n\n` +
                    `Terima kasih telah menggunakan layanan Samling AI.`
                );

                await ctx.reply(output, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('[cekstatus] Error:', error.message);
                if (error.statusCode === 404) {
                    await ctx.reply(
                        `🔍 *Tiket #${ticketId} Tidak Ditemukan*\n\n` +
                        'Pastikan kembali nomor tiket Anda sudah benar.\n\n' +
                        '💡 Nomor tiket diberikan saat Anda mengirim laporan.',
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    await ctx.reply(
                        '❌ *Gagal Memproses Permintaan*\n\n' +
                        'Terjadi kesalahan saat mengambil status laporan.\n\n' +
                        'Silakan coba lagi nanti atau hubungi admin jika masalah berlanjut.',
                        { parse_mode: 'Markdown' }
                    );
                }
            }
        } catch (err) {
            console.error('[cekStatusCommand] Error:', err.message);
            await ctx.reply('❌ Terjadi kesalahan saat memproses permintaan.');
        }
    });
};
