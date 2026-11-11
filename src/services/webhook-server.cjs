/**
 * OTP & Notification Webhook Receiver
 * Dibuat sebagai modul terpisah (side-car) agar tidak mengganggu logic bot utama.
 */
const http = require('http');
const path = require('path');
const config = require('../config.cjs');

const API_KEY = process.env.CHATBOT_API_KEY || 'samling-secret-bot-key-2026';
const PORT = process.env.WEBHOOK_PORT || 3008;

// Rate limiting in-memory: IP -> { count, resetTime }
const ipRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = ipRateLimits.get(ip);
    if (!entry || now > entry.resetTime) {
        ipRateLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    entry.count += 1;
    return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

let serverInstance = null;
let activeSock = null;

function initWebhookServer(sock) {
    activeSock = sock;

    if (serverInstance) {
        console.log('[Webhook Server] 🔄 Socket Baileys/Zapo diperbarui pada server webhook aktif.');
        return serverInstance;
    }

    serverInstance = http.createServer(async (req, res) => {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';

        // 1. Dukungan CORS / Preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            });
            return res.end();
        }

        // Rate limiting check
        if (isRateLimited(clientIp)) {
            res.writeHead(429, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({ success: false, error: 'Too Many Requests' }));
        }

        // 2. Health check endpoint (GET / atau GET /health)
        if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(JSON.stringify({
                status: 'ok',
                service: 'samling-chatbot-webhook',
                port: PORT,
                whatsapp_connected: !!(activeSock && activeSock.user),
                timestamp: new Date().toISOString()
            }));
        }

        // 3. Routing Endpoint Notifikasi & OTP
        if (req.method === 'POST' && req.url === '/api/v1/notifications/send') {
            const clientApiKey = req.headers['x-api-key'];
            if (!clientApiKey || clientApiKey !== API_KEY) {
                res.writeHead(401, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Invalid API Key' }));
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const { whatsapp_number, message, type } = data;

                    if (!whatsapp_number || !message) {
                        res.writeHead(400, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        return res.end(JSON.stringify({ success: false, error: 'whatsapp_number and message are required' }));
                    }

                    // Sanitasi format nomor WhatsApp ke format JID Baileys
                    let cleanNumber = String(whatsapp_number).replace(/\D/g, '');
                    if (cleanNumber.startsWith('0')) {
                        cleanNumber = '62' + cleanNumber.substring(1);
                    } else if (!cleanNumber.startsWith('62')) {
                        cleanNumber = '62' + cleanNumber;
                    }
                    const jid = `${cleanNumber}@s.whatsapp.net`;

                    // Pastikan socket Baileys aktif dan terhubung
                    if (!activeSock || !activeSock.user) {
                        res.writeHead(503, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        return res.end(JSON.stringify({ success: false, error: 'WhatsApp socket is not connected yet' }));
                    }

                    // Kirim pesan via Baileys socket yang sudah ada
                    await activeSock.sendMessage(jid, { text: message });
                    console.log(`[Webhook Notifier] ✅ Sukses mengirim ${type || 'pesan'} ke ${jid}`);

                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ success: true, message: 'Pesan terkirim' }));
                } catch (err) {
                    console.error('[Webhook Notifier] ❌ Gagal memproses request:', err.message);
                    res.writeHead(500, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        }
        // 4. Routing Endpoint Data Kritikal & High Priority Alert
        else if (req.method === 'POST' && req.url === '/api/v1/alerts/critical') {
            const clientApiKey = req.headers['x-api-key'];
            if (!clientApiKey || clientApiKey !== API_KEY) {
                res.writeHead(401, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Invalid API Key' }));
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const {
                        alert_id,
                        facility_name,
                        title,
                        priority = 'CRITICAL',
                        targets = [],
                        forward_to_super_owner = true,
                        details = {}
                    } = data;

                    if (!alert_id || !title) {
                        res.writeHead(400, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        return res.end(JSON.stringify({
                            success: false,
                            error: 'alert_id and title are required'
                        }));
                    }

                    // Pastikan socket Baileys aktif
                    if (!activeSock || !activeSock.user) {
                        res.writeHead(503, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        return res.end(JSON.stringify({
                            success: false,
                            error: 'WhatsApp socket is not connected yet'
                        }));
                    }

                    // Rangkai format pesan darurat WhatsApp
                    const prioUpper = String(priority).toUpperCase();
                    const badgeEmoji = prioUpper === 'CRITICAL' || prioUpper === 'DARURAT' ? '🔴' : '🟠';
                    
                    const timeStr = details.timestamp
                        ? new Date(details.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
                        : new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';

                    let alertMessage = `🚨 *PERINGATAN DARURAT TPS 3R (${prioUpper})* 🚨\n\n`;
                    alertMessage += `*ID Insiden:* ${alert_id}\n`;
                    alertMessage += `*Status:* ${badgeEmoji} ${prioUpper} / BUTUH TINDAKAN SEGERA\n`;
                    if (facility_name) alertMessage += `*Fasilitas:* ${facility_name}\n`;
                    if (details.zone_name) alertMessage += `*Wilayah:* ${details.zone_name}\n`;

                    alertMessage += `\n📋 *Rincian Masalah:*\n`;
                    alertMessage += `• *Judul:* ${title}\n`;
                    if (details.current_load) alertMessage += `• *Beban/Volume:* ${details.current_load}\n`;
                    if (details.reported_by) alertMessage += `• *Pelapor:* ${details.reported_by}\n`;
                    if (details.description) alertMessage += `• *Keterangan:* ${details.description}\n`;

                    alertMessage += `\n⏰ *Waktu Kejadian:* ${timeStr}\n`;
                    if (details.action_url) {
                        alertMessage += `🔗 *Akses Penanganan:* ${details.action_url}\n`;
                    }
                    alertMessage += `\n⚠️ _Pesan ini diteruskan otomatis oleh Sistem AI Samling DLH Jakarta ke Petugas dan Admin Pengawas._`;

                    // Kumpulkan semua nomor target (deduplikasi dengan Set)
                    const targetList = [];
                    const addedNumbers = new Set();

                    function sanitizeNumber(rawNum) {
                        let clean = String(rawNum || '').replace(/\D/g, '');
                        if (clean.startsWith('0')) clean = '62' + clean.substring(1);
                        else if (!clean.startsWith('62')) clean = '62' + clean;
                        return clean;
                    }

                    // 1. Tambah targets dari payload
                    if (Array.isArray(targets)) {
                        for (const t of targets) {
                            const clean = sanitizeNumber(t);
                            if (clean.length >= 9 && !addedNumbers.has(clean)) {
                                addedNumbers.add(clean);
                                targetList.push({ number: clean, role: 'petugas_tps3r' });
                            }
                        }
                    }

                    // 2. Tambah Super Owner jika forward_to_super_owner = true
                    if (forward_to_super_owner && config.superOwner) {
                        const cleanOwner = sanitizeNumber(config.superOwner);
                        if (cleanOwner.length >= 9 && !addedNumbers.has(cleanOwner)) {
                            addedNumbers.add(cleanOwner);
                            targetList.push({ number: cleanOwner, role: 'super_owner_admin' });
                        }
                    }

                    if (targetList.length === 0) {
                        res.writeHead(400, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        return res.end(JSON.stringify({
                            success: false,
                            error: 'No valid recipient phone numbers found in targets or configuration'
                        }));
                    }

                    // Kirim ke semua target
                    const results = [];
                    let deliveredCount = 0;
                    let failedCount = 0;

                    for (const item of targetList) {
                        const jid = `${item.number}@s.whatsapp.net`;
                        try {
                            await activeSock.sendMessage(jid, { text: alertMessage });
                            deliveredCount++;
                            results.push({
                                target: item.number,
                                role: item.role,
                                status: 'sent',
                                timestamp: new Date().toISOString()
                            });
                            console.log(`[Alert Notifier] 🚨 Alert ${alert_id} berhasil dikirim ke [${item.role}] ${jid}`);
                        } catch (sendErr) {
                            failedCount++;
                            results.push({
                                target: item.number,
                                role: item.role,
                                status: 'failed',
                                error: sendErr.message,
                                timestamp: new Date().toISOString()
                            });
                            console.error(`[Alert Notifier] ❌ Gagal kirim alert ${alert_id} ke ${jid}:`, sendErr.message);
                        }
                    }

                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({
                        success: deliveredCount > 0,
                        alert_id,
                        total_targets: targetList.length,
                        delivered_count: deliveredCount,
                        failed_count: failedCount,
                        results
                    }));

                } catch (err) {
                    console.error('[Alert Notifier] ❌ Gagal memproses alert:', err.message);
                    res.writeHead(500, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        } else {
            res.writeHead(404, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
        }
    });

    serverInstance.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 [Webhook Server] Siap menerima webhook OTP/Notifikasi di port ${PORT} (0.0.0.0:${PORT})`);
    });

    serverInstance.on('error', (err) => {
        console.error(`[Webhook Server] ❌ Server error:`, err.message);
    });

    return serverInstance;
}

module.exports = { initWebhookServer };
