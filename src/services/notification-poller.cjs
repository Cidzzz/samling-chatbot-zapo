/**
 * WhatsApp Notification Poller Worker
 * Mengambil antrean notifikasi dari FastAPI dan mengirimkannya ke WhatsApp warga via Baileys.
 */

const axios = require('axios');
const chalk = require('../../telegram/utils/chalkShim.cjs');

class NotificationPoller {
    constructor() {
        this.sock = null;
        this.isRunning = false;
        this.pollingInterval = null;
        this.isProcessing = false;
        
        // Konfigurasi dari .env / config
        let rawUrl = (process.env.BACKEND_API_URL || '').trim().replace(/\/+$/, '');
        if (!rawUrl) {
            rawUrl = 'https://samling-api.ezzar.my.id';
        }
        
        if (!rawUrl.endsWith('/api/v1')) {
            rawUrl = `${rawUrl}/api/v1`;
        }
        this.backendUrl = rawUrl;
        
        // Jika berisi localhost, tes koneksi async dan ganti jika mati
        const isLocal = this.backendUrl.includes('localhost') || this.backendUrl.includes('127.0.0.1');
        if (isLocal) {
            axios.get(this.backendUrl, { timeout: 1000 }).catch(err => {
                if (!err.response || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                    console.log(chalk.yellow(`[Notification Poller] ⚠️ Localhost API pada ${this.backendUrl} terdeteksi mati. Fallback ke production: https://samling-api.ezzar.my.id/api/v1`));
                    this.backendUrl = 'https://samling-api.ezzar.my.id/api/v1';
                }
            });
        }
        
        this.apiSecret = process.env.BACKEND_API_SECRET || 'samling-secret-bot-key-2026';
        this.pollingIntervalMs = 5000; // Interval harus 5 detik (5000 ms)
    }

    /**
     * Mengatur instance Baileys socket
     */
    setSocket(sock) {
        this.sock = sock;
    }

    /**
     * Menjalankan worker polling
     */
    start() {
        if (this.isRunning) return;
        if (!this.sock) {
            console.log(chalk.yellow('[Notification Poller] ⚠️ Socket Baileys belum siap, poller ditunda.'));
            return;
        }

        this.isRunning = true;
        console.log(chalk.cyan(`[Notification Poller] 🚀 Background worker aktif (Interval: ${this.pollingIntervalMs / 1000} detik)`));

        // Polling loop
        this.pollingInterval = setInterval(() => {
            this.pollPendingNotifications();
        }, this.pollingIntervalMs);

        // Langsung jalankan sekali saat start
        this.pollPendingNotifications();
    }

    /**
     * Menghentikan worker
     */
    stop() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isRunning = false;
        console.log(chalk.yellow('[Notification Poller] ⏹️ Background worker dihentikan.'));
    }

    /**
     * Memeriksa dan memproses notifikasi pending dari Backend
     */
    async pollPendingNotifications() {
        if (this.isProcessing || !this.sock) return;

        this.isProcessing = true;
        try {
            let attempt = 0;
            let response = null;
            let lastError = null;

            while (attempt < 2) {
                const endpoints = [
                    `${this.backendUrl}/citizen-reports/pending-notifications?limit=20`,
                    `${this.backendUrl}/report-notifications/pending?limit=20`
                ];

                response = null;
                lastError = null;

                try {
                    for (const baseEp of endpoints) {
                        // Coba dengan header dulu, lalu fallback dengan query param jika gagal
                        const variations = [
                            { url: baseEp, useQuery: false },
                            { url: `${baseEp}${baseEp.includes('?') ? '&' : '?'}api_key=${this.apiSecret}`, useQuery: true }
                        ];
                        
                        for (const variant of variations) {
                            try {
                                const headers = {
                                    'Authorization': `Bearer ${this.apiSecret}`,
                                    'X-API-Key': this.apiSecret
                                };
                                response = await axios.get(variant.url, {
                                    headers: headers,
                                    timeout: 10000
                                });
                                if (response && response.status === 200) break;
                            } catch (err) {
                                lastError = err;
                                // Jika 401/403/404, coba variasi berikutnya
                                if (err.response && (err.response.status === 401 || err.response.status === 403 || err.response.status === 404)) {
                                    continue;
                                }
                                throw err;
                            }
                        }
                        if (response && response.status === 200) break;
                    }
                    if (response && response.status === 200) {
                        break;
                    }
                } catch (error) {
                    lastError = error;
                    const isLocal = this.backendUrl.includes('localhost') || this.backendUrl.includes('127.0.0.1');
                    const isConnectionError = !error.response || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.message.includes('Network Error') || error.code === 'ETIMEOUT' || error.code === 'ECONNABORTED';

                    if (isLocal && isConnectionError && attempt === 0) {
                        console.log(chalk.yellow(`[Notification Poller] ⚠️ Localhost API (${this.backendUrl}) tidak aktif/tidak bisa terhubung (${error.message}). Melakukan fallback ke Production Server: https://samling-api.ezzar.my.id/api/v1`));
                        this.backendUrl = 'https://samling-api.ezzar.my.id/api/v1';
                        attempt++;
                        continue;
                    }
                    throw error;
                }
            }

            if (!response && lastError) {
                throw lastError;
            }

            const notifications = response?.data?.data?.notifications || response?.data?.notifications || (Array.isArray(response?.data?.data) ? response?.data?.data : (Array.isArray(response?.data) ? response?.data : []));
            if (notifications.length === 0) {
                return;
            }

            console.log(chalk.blue(`[Notification Poller] 📥 Ditemukan ${notifications.length} notifikasi pending.`));

            for (const notif of notifications) {
                await this.sendNotification(notif);
                // Delay 1 detik antar pesan untuk keamanan anti-spam WhatsApp
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

        } catch (error) {
            console.error(chalk.red('[Notification Poller] ❌ Network/Request Error:'));
            console.error(chalk.red(`  • URL: ${error.config?.url || 'N/A'}`));
            console.error(chalk.red(`  • Message: ${error.message}`));
            console.error(chalk.red(`  • Status: ${error.response?.status || 'N/A'}`));
            console.error(chalk.red(`  • Data: ${typeof error.response?.data === 'object' ? JSON.stringify(error.response.data) : (error.response?.data || 'N/A')}`));
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Mengirimkan satu notifikasi ke nomor WhatsApp warga
     */
    async sendNotification(notif) {
        const { id, report_id, whatsapp_number, message, report_status } = notif;

        try {
            // 1. Sanitasi format nomor WhatsApp ke JID Baileys
            const jid = this.formatWhatsAppNumber(whatsapp_number);

            // 2. Kirim pesan menggunakan Baileys
            await this.sock.sendMessage(jid, { text: message });

            console.log(chalk.green(`[Notification Poller] ✅ Notifikasi laporan #${report_id} (${report_status}) berhasil dikirim ke ${jid}`));

            // 3. Update status notifikasi menjadi 'sent' di database backend
            await this.markAsSent(id, 'sent', null);

        } catch (error) {
            console.error(chalk.red(`[Notification Poller] ❌ Gagal kirim notifikasi ID ${id}:`), error.message);
            // Laporkan kegagalan ke database
            await this.markAsSent(id, 'failed', error.message);
        }
    }

    /**
     * Memperbarui status notifikasi di Backend API
     */
    async markAsSent(notificationId, status, errorMessage) {
        let success = false;
        let lastErr = null;
        let attempt = 0;

        while (attempt < 2) {
            const endpoints = [
                `${this.backendUrl}/citizen-reports/${notificationId}/mark-notified`,
                `${this.backendUrl}/report-notifications/${notificationId}/mark-notified`,
                `${this.backendUrl}/report-notifications/${notificationId}/mark-sent`,
                `${this.backendUrl}/citizen-reports/notifications/${notificationId}/mark-sent`,
                `${this.backendUrl}/citizen-reports/${notificationId}/mark-sent`
            ];

            success = false;
            lastErr = null;

            try {
                for (const endpoint of endpoints) {
                    try {
                        await axios.post(endpoint, {
                            status: status,
                            error_message: errorMessage
                        }, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${this.apiSecret}`,
                                'X-API-Key': this.apiSecret
                            },
                            timeout: 8000
                        });
                        success = true;
                        break;
                    } catch (err) {
                        lastErr = err;
                        if (err.response && err.response.status === 404) {
                            continue;
                        }
                        throw err;
                    }
                }
                if (success) break;

                // Fallback query param
                for (const endpoint of endpoints) {
                    try {
                        const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${this.apiSecret}`;
                        await axios.post(url, {
                            status: status,
                            error_message: errorMessage
                        }, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${this.apiSecret}`,
                                'X-API-Key': this.apiSecret
                            },
                            timeout: 8000
                        });
                        success = true;
                        break;
                    } catch (err) {
                        lastErr = err;
                        if (err.response && err.response.status === 404) {
                            continue;
                        }
                        throw err;
                    }
                }
                if (success) break;
            } catch (error) {
                lastErr = error;
                const isLocal = this.backendUrl.includes('localhost') || this.backendUrl.includes('127.0.0.1');
                const isConnectionError = !error.response || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.message.includes('Network Error') || error.code === 'ETIMEOUT' || error.code === 'ECONNABORTED';

                if (isLocal && isConnectionError && attempt === 0) {
                    console.log(chalk.yellow(`[Notification Poller] ⚠️ Localhost API (${this.backendUrl}) tidak aktif/tidak bisa terhubung (${error.message}). Melakukan fallback ke Production Server: https://samling-api.ezzar.my.id/api/v1`));
                    this.backendUrl = 'https://samling-api.ezzar.my.id/api/v1';
                    attempt++;
                    continue;
                }
                break;
            }
        }

        if (!success && lastErr) {
            console.error(chalk.red(`[Notification Poller] ⚠️ Gagal update status notifikasi #${notificationId}:`));
            console.error(chalk.red(`  • URL: ${lastErr.config?.url || 'N/A'}`));
            console.error(chalk.red(`  • Message: ${lastErr.message}`));
            console.error(chalk.red(`  • Status: ${lastErr.response?.status || 'N/A'}`));
            console.error(chalk.red(`  • Data: ${typeof lastErr.response?.data === 'object' ? JSON.stringify(lastErr.response.data) : (lastErr.response?.data || 'N/A')}`));
        }
    }

    /**
     * Helper sanitasi nomor telepon menjadi JID Baileys (628xxx@s.whatsapp.net)
     */
    formatWhatsAppNumber(number) {
        let clean = String(number).replace(/\D/g, '');
        if (clean.startsWith('0')) {
            clean = '62' + clean.substring(1);
        } else if (!clean.startsWith('62')) {
            clean = '62' + clean;
        }
        return clean + '@s.whatsapp.net';
    }
}

module.exports = new NotificationPoller();
