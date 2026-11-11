/**
 * Telegram Notification Polling Service
 * 
 * Service yang melakukan polling ke backend FastAPI untuk menarik
 * notifikasi yang perlu dikirim via Telegram.
 * 
 * @author Zoo - Samling AI Team
 * @date 2026-07-17
 */

const axios = require('axios');
const chalk = require('../utils/chalkShim.cjs');

class TelegramNotificationPoller {
    constructor(bot) {
        this.bot = bot;
        this.isRunning = false;
        this.pollingInterval = null;
        
        // Konfigurasi dari environment variables
        this.backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
        this.apiSecret = process.env.BACKEND_API_SECRET || '';
        this.pollingIntervalMs = parseInt(process.env.NOTIFICATION_POLLING_INTERVAL || '30000'); // Default 30 detik
        this.maxRetries = parseInt(process.env.NOTIFICATION_MAX_RETRIES || '3');
        
        // Tracking
        this.lastPollTime = null;
        this.consecutiveErrors = 0;
        this.totalNotificationsSent = 0;
        this.totalErrors = 0;
        
        console.log(chalk.cyan('[TG Notification Poller] Initialized'));
        console.log(chalk.white(`  • Backend URL: ${this.backendUrl}`));
        console.log(chalk.white(`  • Polling Interval: ${this.pollingIntervalMs / 1000}s`));
    }

    /**
     * Start polling service
     */
    start() {
        if (this.isRunning) {
            console.log(chalk.yellow('[TG Notification Poller] Already running'));
            return;
        }

        if (!this.bot) {
            console.log(chalk.red('[TG Notification Poller] Cannot start: Bot not connected'));
            return;
        }

        this.isRunning = true;
        console.log(chalk.green('[TG Notification Poller] Service started'));

        // Jalankan polling pertama kali setelah delay singkat
        setTimeout(() => this._poll(), 5000);

        // Set interval untuk polling berikutnya
        this.pollingInterval = setInterval(() => {
            this._poll();
        }, this.pollingIntervalMs);
    }

    /**
     * Stop polling service
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }

        console.log(chalk.yellow('[TG Notification Poller] Service stopped'));
        console.log(chalk.white(`  • Total notifications sent: ${this.totalNotificationsSent}`));
        console.log(chalk.white(`  • Total errors: ${this.totalErrors}`));
    }

    /**
     * Melakukan satu siklus polling (private method)
     */
    async _poll() {
        if (!this.bot) {
            console.log(chalk.red('[TG Notification Poller] Bot not available, skipping poll'));
            return;
        }

        try {
            this.lastPollTime = new Date();
            
            // Ambil pending notifications dari backend
            const notifications = await this._fetchPendingNotifications();
            
            if (!notifications || notifications.length === 0) {
                // Tidak ada notifikasi, reset error counter
                this.consecutiveErrors = 0;
                return;
            }

            console.log(chalk.cyan(`[TG Notification Poller] Found ${notifications.length} pending notification(s)`));

            // Proses setiap notifikasi
            for (const notification of notifications) {
                await this._processNotification(notification);
                // Delay antar notifikasi untuk menghindari spam
                await this._delay(1000);
            }

            // Reset error counter setelah polling berhasil
            this.consecutiveErrors = 0;

        } catch (error) {
            this.consecutiveErrors++;
            this.totalErrors++;
            
            console.error(chalk.red('[TG Notification Poller] Polling error:'), error.message);
            
            // Jika terlalu banyak error berturut-turut, tambah delay
            if (this.consecutiveErrors >= 5) {
                console.log(chalk.yellow(`[TG Notification Poller] Too many consecutive errors (${this.consecutiveErrors}), will retry later`));
            }
        }
    }

    /**
     * Fetch pending notifications dari backend FastAPI
     * @returns {Array} Array of notification objects
     */
    async _fetchPendingNotifications() {
        const endpoint = `${this.backendUrl}/api/v1/notifications/pending`;
        
        const headers = {
            'Content-Type': 'application/json'
        };

        // Tambahkan API secret jika ada
        if (this.apiSecret) {
            headers['X-API-Key'] = this.apiSecret;
        }

        try {
            const response = await axios.get(endpoint, {
                headers,
                timeout: 10000 // 10 detik timeout
            });

            if (response.data && Array.isArray(response.data.notifications)) {
                return response.data.notifications;
            } else if (Array.isArray(response.data)) {
                return response.data;
            }

            return [];

        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                // Backend tidak bisa diakses, ini normal jika backend belum running
                // Jangan log error untuk menghindari spam
                return [];
            }
            
            if (error.response) {
                // Server merespon dengan error
                console.error(chalk.red('[TG Notification Poller] Backend error:'), error.response.status, error.response.data);
            } else {
                // Network error atau timeout
                console.error(chalk.red('[TG Notification Poller] Network error:'), error.message);
            }
            
            throw error;
        }
    }

    /**
     * Process satu notifikasi
     * @param {object} notification - Notification object dari backend
     */
    async _processNotification(notification) {
        try {
            // Validasi notification object
            if (!notification.id) {
                console.error(chalk.red('[TG Notification Poller] Invalid notification: missing id'));
                return;
            }

            // Get Telegram user ID (support multiple field names)
            const telegramUserId = notification.telegram_user_id || 
                                    notification.telegram_id || 
                                    notification.user_telegram_id;

            if (!telegramUserId) {
                console.error(chalk.red(`[TG Notification Poller] Invalid notification ${notification.id}: missing telegram_user_id`));
                await this._markNotificationFailed(notification.id, 'Missing telegram_user_id');
                return;
            }

            if (!notification.message) {
                console.error(chalk.red(`[TG Notification Poller] Invalid notification ${notification.id}: missing message`));
                await this._markNotificationFailed(notification.id, 'Missing message');
                return;
            }

            // Kirim pesan via Telegram
            await this._sendTelegramMessage(telegramUserId, notification.message);

            console.log(chalk.green(`[TG Notification Poller] Sent notification ${notification.id} to ${telegramUserId}`));

            // Beritahu backend bahwa notifikasi sudah terkirim
            await this._markNotificationSent(notification.id);

            this.totalNotificationsSent++;

        } catch (error) {
            console.error(chalk.red(`[TG Notification Poller] Failed to process notification ${notification.id}:`), error.message);
            
            // Beritahu backend bahwa notifikasi gagal dikirim
            await this._markNotificationFailed(notification.id, error.message);
        }
    }

    /**
     * Kirim pesan Telegram menggunakan Telegraf bot
     * @param {string|number} userId - Telegram user ID
     * @param {string} message - Pesan yang akan dikirim
     */
    async _sendTelegramMessage(userId, message) {
        if (!this.bot) {
            throw new Error('Telegram bot not initialized');
        }

        try {
            await this.bot.telegram.sendMessage(userId, message);
        } catch (error) {
            console.error('[TG Notification Poller] Failed to send Telegram message:', error);
            throw new Error('Failed to send Telegram message: ' + error.message);
        }
    }

    /**
     * Beritahu backend bahwa notifikasi sudah terkirim
     * @param {string|number} notificationId - ID notifikasi
     */
    async _markNotificationSent(notificationId) {
        const endpoint = `${this.backendUrl}/api/v1/notifications/${notificationId}/mark-sent`;
        
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.apiSecret) {
            headers['X-API-Key'] = this.apiSecret;
        }

        try {
            await axios.post(endpoint, {
                sent_at: new Date().toISOString(),
                status: 'sent'
            }, {
                headers,
                timeout: 5000
            });

        } catch (error) {
            console.error(chalk.red(`[TG Notification Poller] Failed to mark notification ${notificationId} as sent:`), error.message);
            // Tidak throw error, karena notifikasi sudah terkirim ke user
        }
    }

    /**
     * Beritahu backend bahwa notifikasi gagal dikirim
     * @param {string|number} notificationId - ID notifikasi
     * @param {string} errorMessage - Pesan error
     */
    async _markNotificationFailed(notificationId, errorMessage) {
        const endpoint = `${this.backendUrl}/api/v1/notifications/${notificationId}/mark-failed`;
        
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.apiSecret) {
            headers['X-API-Key'] = this.apiSecret;
        }

        try {
            await axios.post(endpoint, {
                failed_at: new Date().toISOString(),
                status: 'failed',
                error_message: errorMessage
            }, {
                headers,
                timeout: 5000
            });

        } catch (error) {
            console.error(chalk.red(`[TG Notification Poller] Failed to mark notification ${notificationId} as failed:`), error.message);
        }
    }

    /**
     * Helper delay function
     * @param {number} ms - Milliseconds to delay
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get status poller
     * @returns {object} Status object
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            backendUrl: this.backendUrl,
            pollingInterval: this.pollingIntervalMs,
            lastPollTime: this.lastPollTime,
            consecutiveErrors: this.consecutiveErrors,
            totalNotificationsSent: this.totalNotificationsSent,
            totalErrors: this.totalErrors,
            botConnected: !!this.bot
        };
    }
}

module.exports = TelegramNotificationPoller;
