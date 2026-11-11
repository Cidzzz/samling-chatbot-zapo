/**
 * WhatsApp Event Poller & Reminder Scheduler
 * Memeriksa event yang sedang berlangsung hari ini dan mengirimkan prompt live update ke PIC.
 */

const chalk = require('../../telegram/utils/chalkShim.cjs');
const eventService = require('./eventService.cjs');

class EventPoller {
    constructor() {
        this.sock = null;
        this.isRunning = false;
        this.intervalHandle = null;
        this.checkIntervalMs = 60 * 60 * 1000; // Cek setiap 1 jam
        // Simpan riwayat notifikasi harian: `${dateStr}:${eventId}:${picPhone}`
        this.notifiedEventsToday = new Set();
        this.currentDay = new Date().toISOString().split('T')[0];
    }

    setSocket(sock) {
        this.sock = sock;
    }

    start() {
        if (this.isRunning) return;
        if (!this.sock) {
            console.log(chalk.yellow('[Event Poller] ⚠️ Socket Baileys belum siap, scheduler ditunda.'));
            return;
        }

        this.isRunning = true;
        console.log(chalk.cyan(`[Event Poller] 🎪 Background worker PIC event aktif (Cek per ${this.checkIntervalMs / 60000} menit)`));

        // Jalankan periodic check
        this.intervalHandle = setInterval(() => {
            this.pollActiveEvents();
        }, this.checkIntervalMs);

        // Delay 10 detik setelah start awal sebelum menjalankan polling pertama
        setTimeout(() => {
            this.pollActiveEvents();
        }, 10000);
    }

    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
        this.isRunning = false;
        console.log(chalk.yellow('[Event Poller] ⏹️ Background worker dihentikan.'));
    }

    async pollActiveEvents() {
        if (!this.sock) return;

        // Reset set jika berganti hari (WIB UTC+7)
        const todayStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
        if (todayStr !== this.currentDay) {
            this.currentDay = todayStr;
            this.notifiedEventsToday.clear();
        }

        try {
            const events = await eventService.getActiveEventsToday();
            if (!Array.isArray(events) || events.length === 0) return;

            for (const evt of events) {
                const phone = eventService.normalizePhone(evt.pic_phone);
                if (!phone) continue;

                // Cegah spam lebih dari 1x reminder per hari untuk event yang sama ke nomor PIC tersebut
                const notifyKey = `${todayStr}:${evt.id}:${phone}`;
                if (this.notifiedEventsToday.has(notifyKey)) continue;

                const jid = `${phone}@s.whatsapp.net`;

                // Chat 1: Salam pembuka, penjelasan ringkas, dan opsi tingkat kerumunan
                const openingMsg =
                    `🎪 *PEMANTAUAN EVENT HARI-H (DLH DKI JAKARTA)*\n\n` +
                    `Halo Sdr/i *${evt.pic_name || 'PIC Penyelenggara'}*,\n\n` +
                    `Hari ini event *"${evt.name}"* di *${evt.venue_name || 'Lokasi Terdaftar'}* sedang berlangsung.\n` +
                    `Untuk membantu Dinas Lingkungan Hidup mengoptimalkan penanganan armada sampah dan kebersihan di sekitar lokasi, mohon laporkan kondisi pengunjung saat ini.\n\n` +
                    `📋 *Pilihan Tingkat Kerumunan:*\n` +
                    `• *Rendah*\n` +
                    `• *Sedang*\n` +
                    `• *Padat*\n` +
                    `• *Sangat Padat*\n\n` +
                    `Berikut format laporan yang dapat langsung Anda salin:`;

                // Chat 2: Template form bersih siap copy-paste
                const formTemplate =
`*UPDATE KONDISI PENGUNJUNG EVENT*
Event ${evt.name || ''}
Jumlah Pengunjung: 
Tingkat Kerumunan: 
Keterangan (Opsional): `;

                try {
                    await this.sock.sendMessage(jid, { text: openingMsg });
                    await this.sock.sendMessage(jid, { text: formTemplate });
                    this.notifiedEventsToday.add(notifyKey);
                    console.log(chalk.green(`[Event Poller] ✅ Reminder live-update 2-chat terkirim ke PIC: ${phone} (Event #${evt.id})`));
                } catch (sendErr) {
                    console.error(chalk.red(`[Event Poller] ❌ Gagal kirim pesan ke ${phone}:`), sendErr.message);
                }
            }
        } catch (err) {
            console.error(chalk.red('[Event Poller] Error saat pollActiveEvents:'), err.message);
        }
    }
}

module.exports = new EventPoller();
