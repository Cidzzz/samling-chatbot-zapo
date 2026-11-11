/**
 * Event & PIC Whitelist Service for Samling Bot
 * Handles verification, event reporting, active event polling, and live crowd updates.
 */

const axios = require('axios');
const chalk = require('../../telegram/utils/chalkShim.cjs');
const apiConfig = require('../config/api.config.cjs');

class EventService {
    constructor() {
        this.baseURL = (process.env.BACKEND_API_URL || apiConfig.baseURL || 'https://samling-api.ezzar.my.id/api/v1').trim().replace(/\/+$/, '');
        if (!this.baseURL.endsWith('/api/v1')) {
            this.baseURL = `${this.baseURL}/api/v1`;
        }
        this.apiKey = process.env.BACKEND_API_SECRET || process.env.SAMLING_SECRET_KEY || apiConfig.apiKey || 'samling-secret-bot-key-2026';

        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 12000,
            headers: {
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Standardize phone number format (628...)
     */
    normalizePhone(raw) {
        if (!raw) return '';
        let clean = String(raw).replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '62' + clean.slice(1);
        return clean;
    }

    /**
     * Verify if phone number is in PIC event whitelist
     * Endpoint live uses query param: ?phone=... (fallback to whatsapp_number)
     */
    async verifyPicSender(phoneNumber) {
        const cleanPhone = this.normalizePhone(phoneNumber);
        if (!cleanPhone) {
            return {
                authorized: false,
                message: 'Nomor telepon tidak valid.'
            };
        }

        try {
            const res = await this.client.get('/event-pic-whitelist/verify', {
                params: {
                    phone: cleanPhone,
                    whatsapp_number: cleanPhone
                }
            });
            return res.data?.data || {
                authorized: false,
                message: res.data?.message || 'Nomor tidak terdaftar.'
            };
        } catch (err) {
            console.error(chalk.red('[EventService] verifyPicSender error:'), err.response?.data || err.message);
            return {
                authorized: false,
                message: err.response?.data?.message || err.response?.data?.detail || 'Gagal memverifikasi status whitelist PIC.'
            };
        }
    }

    /**
     * Submit event report by verified PIC
     * Endpoint: POST /events/pic-report
     */
    async submitPicReport(eventData) {
        try {
            const payload = {
                ...eventData,
                pic_phone: this.normalizePhone(eventData.pic_phone)
            };
            const res = await this.client.post('/events/pic-report', payload);
            return res.data;
        } catch (err) {
            console.error(chalk.red('[EventService] submitPicReport error:'), err.response?.data || err.message);
            const detail = err.response?.data?.detail || err.response?.data?.message || 'Gagal menyimpan laporan event.';
            const errorObj = new Error(typeof detail === 'object' ? JSON.stringify(detail) : detail);
            errorObj.response = err.response;
            throw errorObj;
        }
    }

    /**
     * Get list of events active today
     * Endpoint: GET /events/active-today
     */
    async getActiveEventsToday() {
        try {
            const res = await this.client.get('/events/active-today');
            return res.data?.data || [];
        } catch (err) {
            console.error(chalk.red('[EventService] getActiveEventsToday error:'), err.response?.data || err.message);
            return [];
        }
    }

    /**
     * Submit live update on event day (attendees & crowd level)
     * Endpoint: POST /events/{id}/live-update
     */
    async updateEventHariH(eventId, liveData) {
        try {
            const id = parseInt(eventId, 10);
            const payload = {
                actual_attendees: Number(liveData.actual_attendees) || 0,
                crowd_level: liveData.crowd_level || 'Sedang',
                crowd_condition: liveData.crowd_condition || 'Tidak ada keterangan tambahan.',
                pic_phone: this.normalizePhone(liveData.pic_phone)
            };
            const res = await this.client.post(`/events/${id}/live-update`, payload);
            return res.data;
        } catch (err) {
            console.error(chalk.red(`[EventService] updateEventHariH id=${eventId} error:`), err.response?.data || err.message);
            const detail = err.response?.data?.detail || err.response?.data?.message || 'Gagal memperbarui status kerumunan event.';
            const errorObj = new Error(typeof detail === 'object' ? JSON.stringify(detail) : detail);
            errorObj.response = err.response;
            throw errorObj;
        }
    }

    /**
     * AI Agent Auto-Repair & Auto-Fill:
     * Menggunakan LLM untuk menyusun ulang format event yang kurang lengkap,
     * menginferensikan wilayah/kategori/tanggal, dan menghasilkan data siap eksekusi.
     */
    async repairEventDataWithAI(rawText, verifyResult = {}) {
        const config = require('../config.cjs');
        if (!config.ai || !config.ai.apiKey) return null;

        const defaultEventName = verifyResult.event_name || '';

        const systemInstruction = `Kamu adalah Samling AI Event Structurer & Auto-Repair Agent resmi DLH DKI Jakarta.
Tugasmu: Menganalisis teks pelaporan kegiatan/event dari PIC WhatsApp (yang mungkin tidak lengkap, typo, atau berupa cerita percakapan) dan mereparasinya menjadi JSON valid siap submit ke database backend DLH.

ATURAN REPARASI & AUTO-FILL:
1. "name": Nama acara/event. Jika di teks tidak jelas tapi ada default event dari panitia (${defaultEventName ? `"${defaultEventName}"` : 'tidak ada'}), gunakan default tersebut.
2. "category": Salah satu dari: ["Konser", "Event", "Olahraga", "Pameran", "Keagamaan", "Festival", "Pasar Rakyat"]. Pilih yang paling mendekati deskripsi acara. Default: "Event".
3. "venue_name": Lokasi/tempat acara (misal: "Depan Gedung DPR", "Stadion Utama GBK", "Monas").
4. "wilayah": Wajib salah satu dari 6 wilayah resmi DKI Jakarta: ["Jakarta Pusat", "Jakarta Barat", "Jakarta Selatan", "Jakarta Timur", "Jakarta Utara", "Kepulauan Seribu"].
   - Inferensikan dari lokasi jika user tidak menyebut wilayah (contoh: DPR/Monas/Senayan -> Jakarta Pusat; JIS/Ancol -> Jakarta Utara; Ragunan/Setu Babakan/Blok M -> Jakarta Selatan; Kota Tua/Grogol -> Jakarta Barat; TMII/Matraman -> Jakarta Timur).
5. "kecamatan": Kecamatan lokasi (jika tidak tahu, isi dengan nama kecamatan terdekat atau "-").
6. "visitor_quota": Angka bulat estimasi pengunjung (integer > 0).
   - Konversi format manusiawi seperti "20.000", "20 ribu", "20k", "dua puluh ribu" menjadi angka integer 20000.
7. "start_date": Format ISO YYYY-MM-DDTHH:mm:ss.
   - Konversi tanggal bahasa Indonesia (misal: "18 Oktober 2026" -> "2026-10-18T08:00:00").
   - Jika jam tidak disebut, gunakan 08:00:00.
8. "end_date": Format ISO YYYY-MM-DDTHH:mm:ss.
   - Jika tidak disebut, samakan tanggalnya dengan start_date pada pukul 22:00:00.
9. "description": Intisari ringkas deskripsi kegiatan.

OUTPUT HANYA JSON MURNI tanpa format markdown, tanpa backtick, tanpa teks pengantar atau penutup.
Format JSON persis:
{
  "name": "string",
  "category": "string",
  "venue_name": "string",
  "wilayah": "string",
  "kecamatan": "string",
  "visitor_quota": 20000,
  "start_date": "YYYY-MM-DDTHH:mm:ss",
  "end_date": "YYYY-MM-DDTHH:mm:ss",
  "description": "string"
}`;

        try {
            const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.ai.apiKey}`,
                    'HTTP-Referer': 'https://samling.naufalrafa.my.id',
                    'X-Title': 'Samling AI Event Auto-Repair'
                },
                body: JSON.stringify({
                    model: config.ai.model,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: `Teks Laporan PIC:\n${rawText}` }
                    ],
                    max_tokens: 1000,
                    temperature: 0.1,
                    stream: false
                })
            });

            if (!response.ok) return null;
            const responseText = await response.text();
            const { parseAIResponse } = require('./ai.cjs');
            const resData = await parseAIResponse(responseText);
            const content = resData?.choices?.[0]?.message?.content || resData?.choices?.[0]?.message?.reasoning_content || '';
            const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            const parsed = JSON.parse(jsonMatch[0]);

            // Validasi kelayakan minimal hasil AI repair
            if (parsed && parsed.name && parsed.venue_name && parsed.wilayah && parsed.visitor_quota && parsed.start_date) {
                return parsed;
            }
            return null;
        } catch (err) {
            console.error(chalk.yellow('[EventService] AI Auto-Repair error:'), err.message);
            return null;
        }
    }
}

module.exports = new EventService();
