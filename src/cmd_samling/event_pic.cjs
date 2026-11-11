/**
 * Plugin Command: !lapor_event / !event
 * Khusus PIC Penyelenggara Event yang terdaftar di Whitelist DLH Jakarta
 */

const eventService = require('../services/eventService.cjs');
const config = require('../config.cjs');
const chalk = require('../../telegram/utils/chalkShim.cjs');

// In-memory cache penampung draf event sementara yang menunggu Share Location WhatsApp (TTL 15 menit)
const pendingEventDrafts = new Map();

const VALID_CATEGORIES = ['Konser', 'Event', 'Olahraga', 'Pameran', 'Keagamaan', 'Festival', 'Pasar Rakyat'];
const VALID_WILAYAH = ['Jakarta Pusat', 'Jakarta Utara', 'Jakarta Barat', 'Jakarta Selatan', 'Jakarta Timur', 'Kepulauan Seribu'];

// Bulan bahasa Indonesia ke index 01-12
const INDO_MONTHS = {
    januari: '01', jan: '01',
    februari: '02', feb: '02',
    maret: '03', mar: '03',
    april: '04', apr: '04',
    mei: '05',
    juni: '06', jun: '06',
    juli: '07', jul: '07',
    agustus: '08', agu: '08', ags: '08',
    september: '09', sep: '09',
    oktober: '10', okt: '10',
    november: '11', nov: '11',
    desember: '12', des: '12'
};

function parseIndoDateToIso(str, defaultHour = '08:00:00') {
    if (!str) return null;
    const clean = String(str).trim();
    if (clean.includes('T')) return clean;

    // Pattern: 18 Oktober 2026 atau 18-10-2026 atau 2026-10-18
    const dmyWord = clean.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?/i);
    if (dmyWord) {
        const day = dmyWord[1].padStart(2, '0');
        const monthKey = dmyWord[2].toLowerCase();
        const month = INDO_MONTHS[monthKey];
        const year = dmyWord[3];
        const time = dmyWord[4] ? `${dmyWord[4].padStart(2, '0')}:${dmyWord[5]}:00` : defaultHour;
        if (month) return `${year}-${month}-${day}T${time}`;
    }

    const ymd = clean.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2})[:.](\d{2}))?/);
    if (ymd) {
        const time = ymd[4] ? `${ymd[4].padStart(2, '0')}:${ymd[5]}:00` : defaultHour;
        return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}T${time}`;
    }

    const dmy = clean.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?/);
    if (dmy) {
        const time = dmy[4] ? `${dmy[4].padStart(2, '0')}:${dmy[5]}:00` : defaultHour;
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T${time}`;
    }

    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d.toISOString().split('.')[0];
}

function parseHumanQuota(str) {
    if (!str) return 0;
    const s = String(str).toLowerCase().trim();

    // 1. Pola dengan satuan kata: 10 ribu, 20.5 rb, 15k, 1.2 juta
    const matchRibu = s.match(/([\d.,]+)\s*(?:ribu|rb|k\b)/i);
    if (matchRibu) {
        const rawNum = matchRibu[1].replace(',', '.');
        const num = parseFloat(rawNum);
        if (!isNaN(num)) return Math.round(num * 1000);
    }
    const matchJuta = s.match(/([\d.,]+)\s*(?:juta|jt\b)/i);
    if (matchJuta) {
        const rawNum = matchJuta[1].replace(',', '.');
        const num = parseFloat(rawNum);
        if (!isNaN(num)) return Math.round(num * 1000000);
    }

    // 2. Angka dengan pemisah ribuan Indonesia/Internasional: 20.000 atau 20,000
    const matchThousand = s.match(/\b\d{1,3}(?:[.,]\d{3})+\b/);
    if (matchThousand) {
        const cleanDigits = matchThousand[0].replace(/\D/g, '');
        const val = parseInt(cleanDigits, 10);
        if (!isNaN(val) && val > 0) return val;
    }

    // 3. Digit murni dari sisa string
    const digitsOnly = s.replace(/\D/g, '');
    return parseInt(digitsOnly, 10) || 0;
}

/**
 * Parser teks bebas / key-value untuk formulir event
 * Mendukung baris baru (\n), tanda bintang (*), koma inline, dan variasi penulisan bahasa Indonesia
 */
function parseEventFormText(text) {
    const data = {};
    if (!text) return data;

    // Bersihkan teks tips / instruksi agar tidak mengotori nilai field
    let cleanText = String(text)
        .replace(/_?📌\s*Tips\s*Lokasi[\s\S]*$/i, '')
        .replace(/_?Tips\s*Lokasi[\s\S]*$/i, '')
        .replace(/\*/g, '');

    const raw = cleanText;

    // 1. Ekstrak pasangan key: value multi-variasi
    const pattern = /(nama\s*(?:event|acara|kegiatan)|judul\s*acara|acara|event|kategori|jenis\s*(?:event|acara)|tipe\s*(?:acara|event)|tgl\s*mulai|tanggal\s*mulai|waktu\s*mulai|mulai|start\s*date|start|tgl\s*selesai|tanggal\s*selesai|waktu\s*selesai|selesai|end\s*date|end|lokasi|venue|tempat|gedung|alamat|wilayah\s*dki|wilayah|kota|kecamatan|kec|estimasi\s*pengunjung|jumlah\s*pengunjung|target\s*pengunjung|total\s*pengunjung|pengunjung|estimasi\s*peserta|peserta|estimasi\s*kuota|kuota|kapasitas|estimasi|deskripsi|keterangan|catatan)\s*[:=]\s*([^:\n\r]+?)(?=(?:,\s*(?:nama\s*(?:event|acara|kegiatan)|judul\s*acara|acara|event|kategori|jenis\s*(?:event|acara)|tipe\s*(?:acara|event)|tgl\s*mulai|tanggal\s*mulai|waktu\s*mulai|mulai|start\s*date|start|tgl\s*selesai|tanggal\s*selesai|waktu\s*selesai|selesai|end\s*date|end|lokasi|venue|tempat|gedung|alamat|wilayah\s*dki|wilayah|kota|kecamatan|kec|estimasi\s*pengunjung|jumlah\s*pengunjung|target\s*pengunjung|total\s*pengunjung|pengunjung|estimasi\s*peserta|peserta|estimasi\s*kuota|kuota|kapasitas|estimasi|deskripsi|keterangan|catatan)\s*[:=]|$|\n))/gi;

    let match;
    while ((match = pattern.exec(raw)) !== null) {
        const key = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        const val = match[2].trim().replace(/^[,\s]+|[,\s]+$/g, '');

        if (anyMatch(key, ['nama', 'acara', 'event', 'judul']) && !anyMatch(key, ['kategori', 'jenis'])) {
            if (!data.name) data.name = val;
        } else if (anyMatch(key, ['kategori', 'jenis', 'tipe'])) {
            if (!data.category) data.category = val;
        } else if (anyMatch(key, ['mulai', 'start']) || key === 'tgl' || key === 'tanggal') {
            if (!data.start_date) data.start_date = val;
        } else if (anyMatch(key, ['selesai', 'end', 'berakhir', 'sampai'])) {
            if (!data.end_date) data.end_date = val;
        } else if (anyMatch(key, ['lokasi', 'venue', 'tempat', 'gedung', 'alamat'])) {
            if (!data.venue_name) data.venue_name = val;
        } else if (anyMatch(key, ['wilayah', 'kota'])) {
            if (!data.wilayah) data.wilayah = val;
        } else if (key.includes('kecamatan') || key === 'kec') {
            if (!data.kecamatan) data.kecamatan = val;
        } else if (anyMatch(key, ['pengunjung', 'kuota', 'peserta', 'kapasitas', 'estimasi', 'audiens', 'target'])) {
            if (!data.visitor_quota) data.visitor_quota = val;
        } else if (anyMatch(key, ['deskripsi', 'keterangan', 'catatan'])) {
            if (!data.description) data.description = val;
        }
    }

    // 2. Line by line fallback untuk field-field yang belum terisi
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const m = line.match(/^([^:=]+)[:=]\s*(.*)$/);
        if (m) {
            const key = m[1].toLowerCase().replace(/[^a-z0-9]/g, '');
            const val = m[2].trim();
            if (anyMatch(key, ['nama', 'acara', 'event', 'judul']) && !anyMatch(key, ['kategori', 'jenis']) && !data.name) {
                data.name = val;
            } else if (anyMatch(key, ['kategori', 'jenis', 'tipe']) && !data.category) {
                data.category = val;
            } else if ((anyMatch(key, ['mulai', 'start']) || key === 'tgl' || key === 'tanggal') && !data.start_date) {
                data.start_date = val;
            } else if (anyMatch(key, ['selesai', 'end', 'berakhir', 'sampai']) && !data.end_date) {
                data.end_date = val;
            } else if (anyMatch(key, ['lokasi', 'venue', 'tempat', 'gedung', 'alamat']) && !data.venue_name) {
                data.venue_name = val;
            } else if (anyMatch(key, ['wilayah', 'kota']) && !data.wilayah) {
                data.wilayah = val;
            } else if ((key.includes('kecamatan') || key === 'kec') && !data.kecamatan) {
                data.kecamatan = val;
            } else if (anyMatch(key, ['pengunjung', 'kuota', 'peserta', 'kapasitas', 'estimasi', 'audiens', 'target']) && !data.visitor_quota) {
                data.visitor_quota = val;
            } else if (anyMatch(key, ['deskripsi', 'keterangan', 'catatan']) && !data.description) {
                data.description = val;
            }
        }
    }

    // 3. Heuristic fallback untuk estimasi kuota pengunjung jika belum terisi
    if (!data.visitor_quota) {
        const quotaRegex = /(?:estimasi|pengunjung|peserta|kuota|kapasitas|audiens|target|sekitar|kurang\s*lebih)\s*(?:mencapai|sebanyak|sekitar|:|=|\s)?\s*([0-9.,]+\s*(?:ribu|rb|k\b|juta|jt\b)?(?:\s*(?:orang|peserta|jiwa|pengunjung))?)/i;
        const qm = raw.match(quotaRegex);
        if (qm) {
            data.visitor_quota = qm[1].trim();
        }
    }

    // 4. Heuristic fallback untuk wilayah DKI Jakarta jika belum terisi
    if (!data.wilayah) {
        const wilayahMap = [
            { patterns: [/jakarta\s*pusat/i, /\bjakpus\b/i], official: 'Jakarta Pusat' },
            { patterns: [/jakarta\s*selatan/i, /\bjaksel\b/i], official: 'Jakarta Selatan' },
            { patterns: [/jakarta\s*barat/i, /\bjakbar\b/i], official: 'Jakarta Barat' },
            { patterns: [/jakarta\s*timur/i, /\bjaktim\b/i], official: 'Jakarta Timur' },
            { patterns: [/jakarta\s*utara/i, /\bjakut\b/i], official: 'Jakarta Utara' },
            { patterns: [/kepulauan\s*seribu/i, /\bpulau\s*seribu\b/i], official: 'Kepulauan Seribu' }
        ];
        for (const w of wilayahMap) {
            if (w.patterns.some(p => p.test(raw))) {
                data.wilayah = w.official;
                break;
            }
        }
    }

    // 5. Heuristic fallback untuk kategori jika belum terisi
    if (!data.category) {
        const catMap = ['Konser', 'Olahraga', 'Pameran', 'Festival', 'Pasar Rakyat', 'Keagamaan'];
        for (const c of catMap) {
            if (new RegExp('\\b' + c + '\\b', 'i').test(raw)) {
                data.category = c;
                break;
            }
        }
    }

    // 6. Delimiter pagar (#) fallback jika ada format compact EVENT#nama#kategori#...
    if (!data.name && text.includes('#')) {
        const parts = text.split('#').map(p => p.trim());
        let p = parts;
        if (['EVENT', 'LAPOR_EVENT', 'FORM_EVENT'].includes(p[0].toUpperCase())) {
            p = p.slice(1);
        }
        if (p.length >= 7) {
            data.name = p[0];
            data.category = p[1];
            data.start_date = p[2];
            data.end_date = p[3];
            data.venue_name = p[4];
            data.wilayah = p[5];
            data.kecamatan = p[6];
            data.visitor_quota = p[7];
            data.description = p.slice(8).join(' ');
        }
    }

    return data;
}

function anyMatch(str, words) {
    return words.some(w => str.includes(w));
}

module.exports = {
    name: 'lapor_event',
    alias: ['event', 'laporkegiatan', 'event_report'],
    category: 'samling',
    desc: 'Pelaporan formulir event oleh PIC Whitelist DLH',

    execute: async ({ Hanz, msg, sender, senderNumber, args, text, command }) => {
        const reply = async (txt) => Hanz.sendMessage(sender, { text: txt }, { quoted: msg });
        const cleanPhone = eventService.normalizePhone(senderNumber);

        // 1. Verifikasi PIC Whitelist via Backend
        const verifyResult = await eventService.verifyPicSender(cleanPhone);
        if (!verifyResult || !verifyResult.authorized) {
            // Failsafe: Jika teks memuat atribut timbangan TPS 3R, teruskan ke tps3rHandler
            if (/rdf|dustbin|grandong|cacahan|an-?organik|timbangan/i.test(text || '')) {
                const tps3rHandler = require('./tps3r.cjs');
                return await tps3rHandler({
                    Hanz, msg, sender,
                    senderNumber,
                    command: { name: 'tps3r_input', args: [], fullArgs: text, raw: text, hasPrefix: false },
                    text,
                    reply
                });
            }

            const reason = verifyResult?.message || 'Nomor WhatsApp Anda belum terdaftar dalam whitelist PIC event DLH DKI Jakarta.';
            return reply(
                `⚠️ *Akses Ditolak: Belum Terdaftar di Whitelist*\n\n` +
                `${reason}\n\n` +
                `📌 *Petunjuk:* Pastikan Anda telah berkoordinasi dan didaftarkan oleh admin/petugas Dinas Lingkungan Hidup (DLH) DKI Jakarta sebelum mendaftarkan event.`
            );
        }

        const rawBody = (text || '').trim();
        const stripped = rawBody.replace(/^!(lapor_event|event|laporkegiatan|event_report)\s*/i, '').trim();

        // 2. Format & Parse Field Form
        const parsed = parseEventFormText(text);

        // Bersihkan field Lokasi jika berisi URL Google Maps mentah
        if (parsed.venue_name && parsed.venue_name.match(/https?:\/\//i)) {
            delete parsed.venue_name;
        }
        // Form dianggap terisi riil jika selain nama event, minimal ada lokasi/venue ATAU wilayah ATAU tanggal
        const hasMinimalData = parsed.name && (parsed.venue_name || parsed.wilayah || parsed.start_date);

        if (!stripped || !hasMinimalData) {
            // Chat 1: Penjelasan pembuka yang ramah, informatif, dan menyertakan list kategori & wilayah
            const openingMsg = 
                `🎪 *Layanan Pelaporan Event DLH DKI Jakarta*\n\n` +
                `Halo Sdr/i *${verifyResult.pic_name || 'PIC Penyelenggara'}*!\n` +
                `Nomor WhatsApp Anda telah terverifikasi resmi dalam whitelist sistem DLH untuk agenda: *${verifyResult.event_name || 'Event Baru'}*.\n\n` +
                `Anda dapat mengisi data event secara leluasa — baik menggunakan template form di bawah ini, maupun menceritakan detail event Anda secara langsung kepada saya. Saya akan membantu memvalidasi dan mencatatnya ke peta mitigasi kebersihan sampah DLH.\n\n` +
                `📋 *Pilihan Kategori:*\n` +
                `${VALID_CATEGORIES.map(c => `• ${c}`).join('\n')}\n\n` +
                `📍 *Pilihan Wilayah:*\n` +
                `${VALID_WILAYAH.map(w => `• ${w}`).join('\n')}\n\n` +
                `Berikut template formulirnya (bisa langsung Anda salin dan isi):`;

            await reply(openingMsg);

            // Chat 2: Format form bersih sesuai urutan wajib tanpa teks tambahan
            const formTemplate = 
`*LAPORAN EVENT JAKARTA*
Nama Event: ${verifyResult.event_name || ''}
Deskripsi: 
Kategori: 
Tgl Mulai: 
Tgl Selesai: 
Lokasi: 
Wilayah: 
Kecamatan: 
Estimasi Pengunjung: 

_📌 Tips Lokasi: Pada baris "Lokasi", Anda bisa isi nama gedung/alamat, cantumkan link Google Maps, ATAU kosongkan baris Lokasi/Wilayah/Kecamatan jika ingin langsung kirim Share Location (PIN GPS) setelah mengirim form ini._`;

            await Hanz.sendMessage(sender, { text: formTemplate });
            return;
        }

        // 2.5 Resolve Google Maps Link di field Lokasi / Deskripsi / seluruh teks jika ada
        const geoHelper = require('../utils/geoHelper.cjs');
        const gmapsMatch = (text || '').match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|maps\.google\.com)[^\s]+/i);
        if (gmapsMatch) {
            console.log(chalk.cyan('[EventPic] Terdeteksi link Google Maps:'), gmapsMatch[0]);
            const geoRes = await geoHelper.parseGoogleMapsUrl(gmapsMatch[0]);
            if (geoRes) {
                if (geoRes.fromTextPlace) {
                    parsed.venue_name = geoRes.venue_name;
                    parsed.wilayah = geoRes.wilayah;
                    if (!parsed.kecamatan || parsed.kecamatan === '-') parsed.kecamatan = geoRes.kecamatan;
                    console.log(chalk.green('[EventPic] Berhasil ekstrak Alamat Lengkap dari URL GMaps:'), geoRes);
                } else if (geoRes.latitude && geoRes.longitude) {
                    console.log(chalk.green('[EventPic] Berhasil ekstrak koordinat GMaps:'), geoRes);
                    const geoData = await geoHelper.reverseGeocode(geoRes.latitude, geoRes.longitude);
                    if (geoData) {
                        parsed.venue_name = geoData.venue_name;
                        parsed.wilayah = geoData.wilayah;
                        if (!parsed.kecamatan || parsed.kecamatan === '-') parsed.kecamatan = geoData.kecamatan;
                        console.log(chalk.green('[EventPic] Auto-filled alamat dari Reverse Geocode GMaps:'), geoData);
                    }
                }
            }
        }

        // Cek apakah lokasi sengaja dikosongkan untuk Share Location via PIN GPS
        const isWaitingGps = !parsed.venue_name && !parsed.wilayah && parsed.name;
        if (isWaitingGps) {
            console.log(chalk.cyan(`[EventPic] Form event parsial diterima, menunggu Share Location GPS dari ${cleanPhone}`));
            pendingEventDrafts.set(cleanPhone, {
                parsed,
                verifyResult,
                createdAt: Date.now()
            });

            return reply(
                `📋 *DRAF FORMULIR EVENT TERSIMPAN*\n` +
                `────────────────────────────\n` +
                `🎪 *Acara:* ${parsed.name}\n` +
                `🏷️ *Kategori:* ${parsed.category || 'Event'}\n` +
                `📅 *Waktu:* ${parsed.start_date || '-'} s.d ${parsed.end_date || parsed.start_date || '-'}\n` +
                `👥 *Estimasi:* ${parsed.visitor_quota ? Number(parsed.visitor_quota).toLocaleString('id-ID') : '-'} orang\n\n` +
                `📍 *Langkah Terakhir: Kirimkan Lokasi Acara*\n` +
                `• Tekan tombol klip (📎) di WhatsApp -> Pilih *Lokasi (Share Location / PIN GPS)*\n` +
                `• _Atau kirim link Google Maps lokasi kegiatan Anda._\n\n` +
                `Laporan akan langsung otomatis didaftarkan setelah lokasi diterima!`
            );
        }

        // 3. Validasi & Auto-Repair Data (AI Agent Auto-Execute)
        // Toleransi awal: Jika end_date tidak diisi namun start_date ada, samakan dengan start_date
        if (!parsed.end_date && parsed.start_date) {
            parsed.end_date = parsed.start_date;
        }

        let isRepairedByAI = false;
        let missingFields = [];
        if (!parsed.name) missingFields.push('• *Nama Event*');
        if (!parsed.venue_name) missingFields.push('• *Lokasi / Gedung / Venue*');
        if (!parsed.wilayah) missingFields.push('• *Wilayah DKI*');
        if (!parsed.visitor_quota) missingFields.push('• *Estimasi Pengunjung / Kuota*');
        if (!parsed.start_date) missingFields.push('• *Waktu Mulai Acara*');

        // Jika ada field yang belum lengkap, coba Auto-Repair melalui AI Agent
        if (missingFields.length > 0) {
            console.log(chalk.cyan('[EventPic] Ada data kurang. Menjalankan AI Agent Auto-Repair & Structurer...'));
            const aiRepaired = await eventService.repairEventDataWithAI(text, verifyResult);
            if (aiRepaired) {
                console.log(chalk.green('[EventPic] AI Agent berhasil mereparasi data event:'), JSON.stringify(aiRepaired));
                parsed.name = parsed.name || aiRepaired.name;
                parsed.category = parsed.category || aiRepaired.category;
                parsed.venue_name = parsed.venue_name || aiRepaired.venue_name;
                parsed.wilayah = parsed.wilayah || aiRepaired.wilayah;
                parsed.kecamatan = parsed.kecamatan || aiRepaired.kecamatan;
                parsed.visitor_quota = parsed.visitor_quota || aiRepaired.visitor_quota;
                parsed.start_date = parsed.start_date || aiRepaired.start_date;
                parsed.end_date = parsed.end_date || aiRepaired.end_date;
                parsed.description = parsed.description || aiRepaired.description;
                isRepairedByAI = true;
            }
        }

        // Hitung ulang missing fields setelah upaya AI Auto-Repair
        missingFields = [];
        if (!parsed.name) missingFields.push('• *Nama Event*');
        if (!parsed.venue_name) missingFields.push('• *Lokasi / Gedung / Venue*');
        if (!parsed.wilayah) missingFields.push('• *Wilayah DKI* (Pusat/Utara/Barat/Selatan/Timur/Kepulauan Seribu)');
        if (!parsed.visitor_quota) missingFields.push('• *Estimasi Pengunjung / Kuota* (Contoh: 20.000 atau 10 ribu)');
        if (!parsed.start_date) missingFields.push('• *Waktu Mulai Acara* (Contoh: 18 Oktober 2026 atau 2026-06-20)');

        if (missingFields.length > 0) {
            return reply(
                `📝 *Data Formulir Belum Lengkap*\n\n` +
                `Terima kasih sudah mengirimkan informasi. Namun ada beberapa detail penting yang belum lengkap:\n\n` +
                `${missingFields.join('\n')}\n\n` +
                `Silakan kirimkan bagian yang kurang tersebut agar laporan dapat segera saya daftarkan.`
            );
        }

        // Validasi Kategori (Default: Festival/Event)
        const matchedCategory = VALID_CATEGORIES.find(c => c.toLowerCase() === (parsed.category || '').toLowerCase()) || 'Event';

        // Validasi Wilayah dengan toleransi singkatan
        const wRaw = (parsed.wilayah || '').toLowerCase();
        let matchedWilayah = null;
        if (wRaw.includes('pusat') || wRaw.includes('jakpus')) matchedWilayah = 'Jakarta Pusat';
        else if (wRaw.includes('selatan') || wRaw.includes('jaksel')) matchedWilayah = 'Jakarta Selatan';
        else if (wRaw.includes('barat') || wRaw.includes('jakbar')) matchedWilayah = 'Jakarta Barat';
        else if (wRaw.includes('timur') || wRaw.includes('jaktim')) matchedWilayah = 'Jakarta Timur';
        else if (wRaw.includes('utara') || wRaw.includes('jakut')) matchedWilayah = 'Jakarta Utara';
        else if (wRaw.includes('seribu') || wRaw.includes('pulau')) matchedWilayah = 'Kepulauan Seribu';
        else {
            matchedWilayah = VALID_WILAYAH.find(w => w.toLowerCase().includes(wRaw));
        }

        if (!matchedWilayah) {
            return reply(
                `⚠️ Wilayah *"${parsed.wilayah}"* tidak valid untuk DKI Jakarta.\n` +
                `Pilihan resmi: ${VALID_WILAYAH.join(', ')}`
            );
        }

        // Validasi Kuota (dengan parseHumanQuota: 20.000 -> 20000, 10 ribu -> 10000)
        const visitor_quota = parseHumanQuota(parsed.visitor_quota);
        if (isNaN(visitor_quota) || visitor_quota <= 0) {
            return reply(`⚠️ Estimasi pengunjung harus berupa angka (contoh: 20.000 atau 10 ribu orang).`);
        }

        // Normalisasi tanggal ISO (dengan parseIndoDateToIso: 18 Oktober 2026 -> 2026-10-18T08:00:00)
        const start_date = parseIndoDateToIso(parsed.start_date, '08:00:00');
        const end_date = parseIndoDateToIso(parsed.end_date, '17:00:00');

        if (!start_date || !end_date) {
            return reply(`⚠️ Format tanggal/waktu tidak valid: Mulai: "${parsed.start_date}", Selesai: "${parsed.end_date}". Gunakan format tanggal seperti: 18 Oktober 2026 atau YYYY-MM-DDTHH:mm`);
        }

        const payload = {
            pic_id: verifyResult.whitelist_id || null,
            pic_phone: cleanPhone,
            name: parsed.name,
            category: matchedCategory,
            start_date,
            end_date,
            venue_name: parsed.venue_name,
            wilayah: matchedWilayah,
            kecamatan: parsed.kecamatan || '-',
            visitor_quota,
            description: parsed.description || 'Laporan formulir event via Chatbot Samling',
            source: 'pic_chatbot'
        };

        await reply('⏳ Sedang memproses dan mendaftarkan event ke sistem DLH DKI Jakarta...');

        try {
            const result = await eventService.submitPicReport(payload);
            const savedData = result.data || {};

            return reply(
                `✅ *LAPORAN EVENT RESMI BERHASIL DICATAT*\n\n` +
                `🆔 *ID Event:* #${savedData.id || '-'}\n` +
                `🎪 *Nama Event:* ${savedData.name}\n` +
                `🏷️ *Kategori:* ${savedData.category}\n` +
                `📍 *Lokasi:* ${savedData.venue_name} (${savedData.wilayah})\n` +
                `📅 *Waktu:* ${savedData.start_date} s.d. ${savedData.end_date}\n` +
                `👥 *Estimasi Kuota:* ${Number(savedData.visitor_quota || visitor_quota).toLocaleString('id-ID')} orang\n` +
                `👤 *PIC:* ${verifyResult.pic_name || 'Penyelenggara'}\n\n` +
                `💡 Data event Anda telah langsung terhubung ke Dashboard Spasial Heatmap Sampah DLH DKI Jakarta untuk kesiapan rute armada & kontainer kebersihan.` +
                (isRepairedByAI ? `\n\n🤖 _Format & detail data yang kurang telah diselaraskan dan dilengkapi otomatis oleh Samling AI Agent._` : '')
            );
        } catch (err) {
            return reply(`❌ Gagal menyimpan laporan event: ${err.message}`);
        }
    },
    pendingEventDrafts
};
