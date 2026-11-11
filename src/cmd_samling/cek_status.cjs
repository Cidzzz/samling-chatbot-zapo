const api = require('../services/api.cjs');

/**
 * Cek Status Laporan Handler
 * Check citizen report status by ticket ID
 * Command: !cekstatus <ticket_id>
 * Endpoint: GET /citizen-reports/{id}
 */
const handler = async (m) => {
    const { command } = m;

    switch (command.name) {
        case 'cekstatus':
            // Handle !cekstatus <ticket_id>
            const ticketId = command.args && command.args[0];
            
            if (!ticketId) {
                return await m.reply(`⚠️ *Format Salah*

Gunakan: !cekstatus <nomor_tiket>

📝 Contoh: !cekstatus 12`);
            }
            
            await handleCekStatus(m, ticketId);
            break;
    }
};

/**
 * Handle cek status request
 * @param {object} m - Message object
 * @param {string} ticketInput - Ticket ID from user input
 */
async function handleCekStatus(m, ticketInput) {
    const ticketId = parseInt(ticketInput.trim(), 10);

    if (isNaN(ticketId)) {
        await m.reply(`⚠️ *Nomor Tiket Tidak Valid*

Masukkan nomor tiket berupa angka saja.

📝 Contoh: !cekstatus 12`);
        return;
    }

    try {
        // Call API to get report status
        const report = await api.getReportStatus(ticketId);
        
        if (!report) {
            await m.reply(`🔍 *Tiket #${ticketId} Tidak Ditemukan*

Pastikan kembali nomor tiket Anda sudah benar.

💡 Nomor tiket diberikan saat Anda mengirim laporan.`);
            return;
        }
        
        // Format date to Indonesian locale
        const dateFormatted = new Date(report.created_at).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Status mapping with lowercase keys (case-insensitive)
        const STATUS_MAP = {
            "baru": "🔴 Baru (Menunggu Antrean Armada)",
            "sedang ditangani": "🟡 Sedang Ditangani (Petugas / Driver dalam perjalanan)",
            "selesai": "🟢 Selesai (Sampah telah diangkut & TPS bersih)"
        };
        const statusKey = (report.status || '').toLowerCase();
        
        // Build output message
        const outputMessage = `📋 *STATUS PENGADUAN WARGA*
════════════════════════
🎫 *Nomor Tiket:* #${report.id}
📅 *Waktu Lapor:* ${dateFormatted}
📌 *Lokasi TPS:* ${report.zone?.name || 'Tidak diketahui'}
📍 *Kecamatan:* ${report.kecamatan || report.zone?.kecamatan || '-'}
💬 *Isi Keluhan:* "${report.report_content || '-'}"

📊 *Status Penanganan:* 
👉 *${STATUS_MAP[statusKey] || report.status}*
════════════════════════

Terima kasih telah menggunakan layanan Samling AI.`;

        await m.reply(outputMessage);
        
    } catch (error) {
        console.error('[cekstatus] Error:', error);
        
        // Handle 404 specifically
        if (error.statusCode === 404) {
            await m.reply(`🔍 *Tiket #${ticketId} Tidak Ditemukan*

Pastikan kembali nomor tiket Anda sudah benar.

💡 Nomor tiket diberikan saat Anda mengirim laporan.`);
        } else {
            await m.reply(`❌ *Gagal Memproses Permintaan*

Terjadi kesalahan saat mengambil status laporan.

Silakan coba lagi nanti atau hubungi admin jika masalah berlanjut.`);
        }
    }
}

module.exports = handler;
