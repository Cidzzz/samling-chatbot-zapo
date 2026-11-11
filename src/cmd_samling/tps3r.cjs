const api = require('../services/api.cjs');
const tps3rService = require('../services/tps3rService.cjs');
const zoneCache = require('../services/zone_cache.cjs');
const config = require('../config.cjs');
const { getImage } = require('../utils/helper.cjs');

function extractZoneId(arg) {
    if (!arg) return null;
    const str = String(arg).trim();

    // 1. Jika argumen murni angka (misal: '1122' atau '#1122' dari perintah !target 1122)
    const pureNumMatch = str.match(/^#?(\d+)$/);
    if (pureNumMatch) {
        return parseInt(pureNumMatch[1], 10);
    }

    // 2. Jika dalam teks kalimat, WAJIB ada kata kunci zone, tps3r, atau id (tidak boleh angka acak tanggal/jam)
    const match = str.match(/\b(?:zone|tps\s*3r|tps3r|id\s*zone|id)\s*[:#]?\s*(\d+)\b/i);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return null;
}

async function promptSelectTps(m, actionType = 'today') {
    try {
        let allZones = zoneCache.getAllZones();
        if (!allZones || allZones.length === 0) {
            await zoneCache.initialize().catch(() => {});
            allZones = zoneCache.getAllZones();
        }

        let tpsList = (allZones || []).filter(z => (z.jenis_tps || z.type || '').toLowerCase().includes('3r'));
        if (tpsList.length === 0) {
            tpsList = (allZones || []).slice(0, 10);
        } else {
            tpsList = tpsList.slice(0, 10);
        }

        const actionTitles = {
            today: '🎯 Status Target Hari Ini',
            weekly: '📈 Rekap 7 Hari Terakhir',
            history: '📑 Riwayat Timbangan',
            input: '📝 Input Laporan Timbangan'
        };
        const titleLabel = actionTitles[actionType] || '📊 Data Operasional TPS 3R';

        if (typeof m.sendInteractiveWithImage === 'function' && tpsList.length > 0) {
            const rows = tpsList.map(z => ({
                title: z.name || `TPS 3R #${z.id}`,
                description: `${z.kecamatan ? `${z.kecamatan}, ` : ''}${z.wilayah || ''} (ID: ${z.id})`.trim(),
                id: actionType === 'input' ? `!lapor_tps3r ${z.id}` : `!${actionType === 'today' ? 'target' : (actionType === 'weekly' ? 'rekap' : 'riwayat')} ${z.id}`
            }));

            await m.sendInteractiveWithImage({
                imageSource: getImage(),
                text: `📍 *PILIH FASILITAS TPS 3R*\n\nSilakan pilih lokasi TPS 3R untuk *${titleLabel}*:`,
                footer: config.footerTxt || 'Samling AI - Sistem Operasional TPS 3R',
                quoted: m.fakeOrder,
                buttons: [
                    {
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: '『 Daftar TPS 3R 』',
                            sections: [{
                                title: 'Lokasi TPS 3R Aktif',
                                rows
                            }]
                        })
                    }
                ]
            });
            return;
        }

        let fallbackText = `📍 *PILIH FASILITAS TPS 3R*\n\nSilakan sertakan ID TPS 3R untuk melihat *${titleLabel}*:\n`;
        if (tpsList.length > 0) {
            tpsList.forEach(z => {
                fallbackText += `• *ID ${z.id}*: ${z.name || `TPS ${z.id}`} (${z.kecamatan || z.wilayah || '-'})\n`;
            });
        }
        fallbackText += `\n💡 Contoh: *!${actionType === 'weekly' ? 'rekap' : (actionType === 'today' ? 'target' : (actionType === 'input' ? 'lapor_tps3r' : 'riwayat'))} 89*`;
        await m.reply(fallbackText);
    } catch (err) {
        console.error('[promptSelectTps] Error:', err);
        await m.reply(`⚠️ Harap sertakan ID Fasilitas TPS 3R.\nContoh: *!target 89* atau *!rekap 89*`);
    }
}

const handler = async (m) => {
    const { command } = m;
    const cmdName = (command.name || '').toLowerCase();
    const rawArg = command.fullArgs || (command.args && command.args.join(' ')) || '';
    let zoneId = extractZoneId(rawArg);
    const senderNumber = getCleanSenderNumber(m);

    // Auto-fallback: Jika petugas tidak menyebut zoneId, gunakan zone_id fasilitas terdaftarnya
    if (!zoneId) {
        try {
            const authRes = await tps3rService.verifyOfficer(senderNumber);
            if (authRes?.authorized && authRes?.data?.zone_id) {
                zoneId = authRes.data.zone_id;
            } else if (authRes?.zone_id) {
                zoneId = authRes.zone_id;
            }
        } catch (e) { }
    }

    switch (cmdName) {
        case 'timbangan':
        case 'lapor_timbangan':
        case 'format_timbangan': {
            await handleTps3rTemplate(m);
            break;
        }

        case 'target':
        case 'tps3r_today':
        case 'tps3r_target': {
            await handleTps3rToday(m, zoneId);
            break;
        }

        case 'rekap':
        case 'tps3r_weekly':
        case 'tps3r_rekap': {
            await handleTps3rWeekly(m, zoneId);
            break;
        }

        case 'riwayat':
        case 'tps3r_history':
        case 'tps3r_riwayat': {
            await handleTps3rHistory(m, zoneId);
            break;
        }

        case 'detail':
        case 'tps3r_detail': {
            const reportId = command.args && command.args[0] ? command.args[0] : null;
            if (!reportId) {
                return await m.reply(`⚠️ *Format Salah*\n\nGunakan: !detail <id_laporan>\n📝 Contoh: *!detail 14*`);
            }
            await handleTps3rDetail(m, reportId);
            break;
        }

        case 'tps3r_report':
        case 'tps3r_input':
        case 'lapor_tps3r': {
            const rawPayload = command.fullArgs || (command.args && command.args.join(' ')) || '';
            const isTextReport = rawPayload && /hasil\s+dustbin|dasbin|grandong|anorganik|rdf/i.test(rawPayload);
            if (!isTextReport) {
                await handleTps3rTemplate(m);
            } else {
                await handleTps3rInput(m, rawPayload);
            }
            break;
        }
    }
};

async function handleTps3rToday(m, zoneId = null) {
    if (!zoneId) {
        return await promptSelectTps(m, 'today');
    }
    try {
        const data = await tps3rService.getTodayTargetStatus(zoneId);
        if (!data) {
            return await m.reply(`ℹ️ Belum ada data operasional hari ini untuk TPS 3R #${zoneId}.`);
        }

        const pct = data.completion_percentage ?? data.achievement_pct ?? 0;
        const progressBar = tps3rService.generateProgressBar(pct);
        const totalKg = Number(data.total_waste_kg ?? 0).toFixed(1);

        const breakdown = data.breakdown_kg || {
            anorganic_valuable: data.anorganic_valuable_kg || 0,
            anorganic_non_valuable: data.anorganic_non_valuable_kg || 0,
            organic_grandong: data.organic_grandong_kg || 0,
            rdf_weight: data.rdf_weight_kg || 0,
            rdf_bag_count: data.rdf_bag_count || 0
        };

        const msgText = `🎯 *STATUS TARGET OPERASIONAL HARI INI*
════════════════════════
🏢 *Fasilitas:* ${data.zone_name || `TPS 3R #${zoneId}`}
📅 *Tanggal:* ${data.day_name || '-'}, ${data.report_date || '-'}
👷 *Petugas:* ${data.officer_name || '-'}

📊 *PROGRES CAPAIAN DUSTBIN:*
${progressBar} *${Number(pct).toFixed(1)}%*
• Terolah: *${data.dustbin_count ?? 0} / ${data.target_dustbin ?? 10} Dustbin*
• Sisa Target: *${data.remaining_dustbins ?? Math.max(0, (data.target_dustbin ?? 10) - (data.dustbin_count ?? 0))} Dustbin*
• Status: *${data.target_status_label || (pct >= 100 ? 'Target Tercapai' : 'Belum Tercapai')}*

⚖️ *RINCIAN TIMBANGAN TERKINI:*
• Total Sampah: *${totalKg} KG*
• Organik Grandong: *${Number(breakdown.organic_grandong || 0).toFixed(1)} KG*
• Anorganik Ber-value: *${Number(breakdown.anorganic_valuable || 0).toFixed(1)} KG*
• Anorganik Non-value: *${Number(breakdown.anorganic_non_valuable || 0).toFixed(1)} KG*
• Cacahan RDF: *${Number(breakdown.rdf_weight || 0).toFixed(1)} KG* (${breakdown.rdf_bag_count || 0} Bag)
• Gerobak Masuk: *${data.cart_count ?? 0} Unit* (${data.cart_type || '-'})
════════════════════════
${data.has_reported_today !== false ? '✅ Data hari ini sudah tercatat.' : '⚠️ Belum ada catatan timbangan hari ini.'}`;

        await m.reply(msgText);
    } catch (error) {
        console.error('[tps3r_today] Error:', error);
        const errMsg = error.response?.data?.message || error.message || 'Server error';
        await m.reply(`❌ Gagal mengambil status target TPS 3R #${zoneId}: ${errMsg}`);
    }
}

async function handleTps3rWeekly(m, zoneId = null) {
    if (!zoneId) {
        return await promptSelectTps(m, 'weekly');
    }
    try {
        const data = await tps3rService.getWeeklySummary(zoneId);
        if (!data) {
            return await m.reply(`ℹ️ Belum ada rekap mingguan untuk TPS 3R #${zoneId}.`);
        }

        let dailyListText = '';
        if (Array.isArray(data.daily_reports) && data.daily_reports.length > 0) {
            data.daily_reports.forEach((d) => {
                dailyListText += `• *${d.day_name || '-'} (${(d.date || '').slice(5)}):* ${d.dustbins_processed ?? d.dustbin_count ?? 0} Dustbin | ${Number(d.total_waste_kg || 0).toFixed(0)} kg\n`;
            });
        }

        const bd = data.breakdown || {};
        const comp = data.composition_pct || {};

        const msgText = `📊 *REKAPITULASI 7 HARI TERAKHIR TPS 3R*
════════════════════════
🏢 *Fasilitas:* ${data.zone_name || `TPS 3R #${zoneId}`}
🗓️ *Periode:* ${data.period_start || '-'} s.d. ${data.period_end || '-'}

📈 *RINGKASAN OPERASIONAL:*
• Total Dustbin: *${data.total_dustbins ?? 0} / ${data.target_dustbins_period ?? 70} Dustbin* (${data.weekly_achievement_pct ?? 0}%)
• Total Gerobak Grandong: *${data.total_cart_count ?? 0} Unit*
• Total Timbangan: *${Number(data.total_waste_kg || 0).toFixed(1)} KG*
• Rata-rata Harian: *${Number(data.daily_average_kg || 0).toFixed(1)} KG/hari*

📦 *KOMPOSISI HASIL PENGOLAHAN:*
🌱 Organik Grandong: *${Number(bd.organic_grandong_kg || 0).toFixed(1)} KG* (${comp.organic_grandong ?? 0}%)
♻️ Anorganik Ber-value: *${Number(bd.anorganic_valuable_kg || 0).toFixed(1)} KG* (${comp.anorganic_valuable ?? 0}%)
🗑️ Anorganik Non-value: *${Number(bd.anorganic_non_valuable_kg || 0).toFixed(1)} KG* (${comp.anorganic_non_valuable ?? 0}%)
🔥 Cacahan RDF: *${Number(bd.rdf_weight_kg || 0).toFixed(1)} KG* (${bd.rdf_bag_count || 0} Bag)

📅 *RINCIAN HARIAN:*
${dailyListText || '• Belum ada catatan harian.\n'}════════════════════════
_Gunakan perintah *!riwayat ${zoneId}* untuk melihat daftar ID laporan._`;

        await m.reply(msgText);
    } catch (error) {
        console.error('[tps3r_weekly] Error:', error);
        const errMsg = error.response?.data?.message || error.message || 'Server error';
        await m.reply(`❌ Gagal mengambil rekap mingguan TPS 3R #${zoneId}: ${errMsg}`);
    }
}

async function handleTps3rHistory(m, zoneId = null) {
    try {
        const data = await tps3rService.getReportsHistory(zoneId, 5, 1);
        const reports = data?.reports || (Array.isArray(data) ? data : []);

        if (!reports || reports.length === 0) {
            return await m.reply(`ℹ️ Belum ada riwayat timbangan laporan ${zoneId ? `untuk TPS 3R #${zoneId}` : 'TPS 3R'}.`);
        }

        let listText = `📋 *RIWAYAT 5 LAPORAN TERAKHIR TPS 3R*\n════════════════════════\n`;
        reports.forEach((r) => {
            listText += `🔹 *ID #${r.id}* | ${r.day_name || '-'}, ${r.report_date || '-'}\n`;
            listText += `   Lokasi: ${r.zone_name || `Zone #${r.zone_id}`}\n`;
            listText += `   Petugas: ${r.officer_name || '-'}\n`;
            listText += `   Timbangan: *${Number(r.total_waste_kg || 0).toFixed(1)} KG* (${r.dustbin_count || 0} Dustbin - ${r.achievement_pct ?? 0}%)\n`;
            listText += `   Ketik *!detail ${r.id}* untuk rincian lengkap.\n\n`;
        });
        listText += `════════════════════════`;

        await m.reply(listText);
    } catch (error) {
        console.error('[tps3r_history] Error:', error);
        const errMsg = error.response?.data?.message || error.message || 'Server error';
        await m.reply(`❌ Gagal mengambil riwayat timbangan TPS 3R: ${errMsg}`);
    }
}

async function handleTps3rDetail(m, reportId) {
    try {
        const d = await tps3rService.getReportDetailById(reportId);
        if (!d || !d.id) {
            return await m.reply(`🔍 *Laporan TPS 3R #${reportId} Tidak Ditemukan.*`);
        }

        const msgText = `📄 *DETAIL LAPORAN TPS 3R #${d.id}*
════════════════════════
🏢 *Fasilitas:* ${d.zone_name || '-'} (${d.kecamatan || '-'}, ${d.wilayah || '-'})
📅 *Tanggal:* ${d.day_name || '-'}, ${d.report_date || '-'} (${d.operating_hours || '08:00 - Selesai'})
👷 *Petugas:* ${d.officer_name || '-'} (${d.whatsapp_number || '-'})

📥 *INPUT MASUK:*
• Dustbin Terolah: *${d.dustbin_count || 0} / ${d.target_dustbin || 10} Dustbin* (${d.achievement_pct ?? 0}%)
• Status Capaian: *${d.target_status_label || '-'}*
• Armada: *${d.cart_count || 0} Unit* (${d.cart_type || '-'})

⚖️ *RINCIAN TIMBANGAN (KG):*
• Anorganik Ber-value: *${Number(d.anorganic_valuable_kg || 0).toFixed(2)} KG*
• Anorganik Non-value: *${Number(d.anorganic_non_valuable_kg || 0).toFixed(2)} KG*
• Organik Grandong: *${Number(d.organic_grandong_kg || 0).toFixed(2)} KG*
• Cacahan RDF: *${d.rdf_bag_count || 0} Bag* (${Number(d.rdf_weight_kg || 0).toFixed(2)} KG)
────────────────────────
📊 *Total Timbangan:* *${Number(d.total_waste_kg || 0).toFixed(2)} KG*
📝 *Catatan:* ${d.notes || '-'}
════════════════════════`;

        await m.reply(msgText);
    } catch (error) {
        console.error('[tps3r_detail] Error:', error);
        await m.reply(`❌ Laporan #${reportId} tidak ditemukan.`);
    }
}

const lidMapper = require('../utils/lidMapper.cjs');

function getCleanSenderNumber(m) {
    const raw = String(m.senderNumber || m.sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const mapped = lidMapper.getPhoneFromLid(raw);
    return mapped || raw;
}

async function handleTps3rTemplate(m) {
    const senderNumber = getCleanSenderNumber(m);
    const authRes = await tps3rService.verifyOfficer(senderNumber);

    if (!authRes.authorized && !authRes.data?.authorized) {
        return await m.reply(
            `❌ *AKSES DITOLAK: BUKAN PETUGAS TPS 3R*\n\n` +
            `Mohon maaf, nomor WhatsApp Anda (+${senderNumber}) belum terdaftar sebagai Petugas TPS 3R resmi di sistem Samling AI DLH Jakarta.\n\n` +
            `📌 Silakan hubungi administrator DLH jika Anda bertugas di fasilitas TPS 3R.`
        );
    }

    const officer = authRes.data || authRes;
    const zoneName = officer.zone_name || `TPS 3R #${officer.zone_id}`;
    const todayStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    // Chat 1: Penjelasan pembuka, verifikasi resmi, dan catatan penting operasional
    const openingMsg =
        `🏢 *Layanan Operasional Timbangan TPS 3R DLH DKI Jakarta*\n\n` +
        `Halo Bpk/Ibu *${officer.name || 'Petugas'}*!\n` +
        `Nomor WhatsApp Anda telah terverifikasi resmi sebagai Petugas Lapangan untuk fasilitas: *${zoneName}*.\n\n` +
        `Silakan gunakan template laporan di bawah ini untuk mencatat hasil operasional harian (dustbin, gerobak, anorganik ber-value/non-value, organik grandong, dan cacahan RDF).\n\n` +
        `📌 *Catatan Pengisian:*\n` +
        `• Cukup salin template formulir dan langsung ketikkan angka/jumlah di sebelah tanda titik dua (:).\n` +
        `• Timbangan anorganik & organik akan otomatis mengakumulasi progres capaian target harian (10 Dustbin).\n\n` +
        `Berikut format template formulir siap salin:`;

    // Chat 2: Template formulir bersih siap copy-paste tanpa teks tambahan
    const formTemplate =
`Laporan kegiatan RDF ${zoneName}
Tanggal: ${todayStr}
Jam: 08:00 S/d Selesai

-Hasil Dustbin : 

-Gerobak yang masuk ke mesin Grandong : 

-Pemilahan An-Organik Ber-value : 

-Pemilahan An-Organik tidak Ber-value : 

-Hasil Organik mesin Grandong : 

-Hasil cacahan RDF BG : 

-Hasil cacahan RDF KG : 

-Catatan: 
Operasional lancar`;

    await m.reply(openingMsg);
    if (m.send) {
        await m.send(formTemplate);
    } else {
        await m.reply(formTemplate);
    }
}

async function handleTps3rInput(m, payloadInput) {
    try {
        let payload = {};
        const text = String(payloadInput || '');
        const senderNumber = getCleanSenderNumber(m);
        const pushName = m.pushname || 'Petugas Lapangan';

        // 1. Verifikasi otorisasi Petugas TPS 3R terlebih dahulu
        const authRes = await tps3rService.verifyOfficer(senderNumber);
        const isAuth = !!(authRes?.authorized || authRes?.data?.authorized);
        if (!isAuth) {
            return await m.reply(
                `❌ *AKSES DITOLAK: BUKAN PETUGAS TPS 3R*\n\n` +
                `Nomor WhatsApp Anda (+${senderNumber}) belum terdaftar sebagai Petugas TPS 3R resmi di sistem Samling AI DLH Jakarta.\n\n` +
                `Fitur pelaporan timbangan hanya diperuntukkan bagi petugas lapangan resmi. Warga masyarakat dapat menggunakan menu *!lapor* untuk aduan sampah.`
            );
        }

        const officer = authRes.data || authRes;

        if (typeof payloadInput === 'string' && payloadInput.trim().startsWith('{')) {
            try {
                payload = JSON.parse(payloadInput);
            } catch (e) {
                payload = tps3rService.parseTPS3RReportText(text);
            }
        } else {
            payload = tps3rService.parseTPS3RReportText(text);
        }

        // Prioritas utama: gunakan zone_id dari profil petugas resmi.
        // Hanya ditimpa jika ada penulisan eksplisit misal 'zone: 89' di pesan
        const explicitZone = extractZoneId(text);
        payload.zone_id = explicitZone || officer.zone_id;

        if (!payload.zone_id) {
            return await m.reply(`⚠️ *ID Fasilitas TPS 3R Belum Ditentukan*\n\nMohon sertakan ID TPS 3R dalam teks laporan atau hubungi admin DLH untuk set zone default Anda.`);
        }

        // Injeksi identitas petugas resmi hasil verifikasi agar backend tidak fallback ke petugas pertama di zona tersebut
        payload.officer_name = officer.name || pushName;
        payload.whatsapp_number = officer.whatsapp_number || senderNumber;

        // Deteksi mode akumulasi vs revisi/replace
        const isReplaceMode = /revisi|koreksi|replace|timpa|ganti\s+laporan/i.test(text);
        payload.mode = isReplaceMode ? 'replace' : (payload.mode || 'accumulate');
        payload.notes = payload.notes || (isReplaceMode ? 'Revisi/Koreksi data operasional TPS 3R' : 'Tercatat via WhatsApp Bot Samling AI');

        // Ambil data hari ini SEBELUM submit (jika mode akumulasi) untuk melihat baseline riwayat sebelumnya
        let prevData = null;
        if (!isReplaceMode) {
            try {
                prevData = await tps3rService.getTodayTargetStatus(payload.zone_id);
            } catch (e) { }
        }

        const result = await tps3rService.submitTPS3RReport(payload);

        // Siapkan ringkasan data yang baru saja diinput
        const isAccumulate = payload.mode === 'accumulate';
        const inputSign = isAccumulate ? '+' : '';

        // Rincian baseline sebelum input ini
        const prevDustbin = prevData?.dustbin_count ?? 0;
        const prevTotalKg = Number(prevData?.total_waste_kg ?? 0).toFixed(1);

        let previousSummarySection = '';
        if (isAccumulate && prevData && prevDustbin > 0) {
            previousSummarySection = 
`📋 *CATATAN SEBELUMNYA HARI INI:*
• Dustbin: *${prevDustbin} Dustbin*
• Total Timbangan: *${prevTotalKg} KG*
────────────────────────\n`;
        }

        const replyMessage = `✅ *LAPORAN TPS 3R BERHASIL DICATAT!*
════════════════════════
🏢 *Fasilitas:* ${result.zone_name || officer.zone_name || `TPS 3R #${result.zone_id || payload.zone_id}`}
📅 *Tanggal:* ${result.report_date || '-'}
👷 *Petugas:* ${result.officer_name || officer.name || pushName}
⚙️ *Mode:* ${isReplaceMode ? '🔄 Revisi (Data Ditimpa)' : '➕ Akumulasi Tambahan'}
────────────────────────
${previousSummarySection}📥 *DATA BARU YANG DIINPUT:*
• Dustbin: *${inputSign}${payload.dustbin_count} Dustbin*
• Gerobak: *${inputSign}${payload.cart_count} Unit* (${payload.cart_type || '-'})
• Anorganik Ber-value: *${inputSign}${Number(payload.anorganic_valuable_kg || 0).toFixed(1)} KG*
• Anorganik Non-value: *${inputSign}${Number(payload.anorganic_non_valuable_kg || 0).toFixed(1)} KG*
• Organik Grandong: *${inputSign}${Number(payload.organic_grandong_kg || 0).toFixed(1)} KG*
• Cacahan RDF: *${inputSign}${payload.rdf_bag_count} Bag* (${inputSign}${Number(payload.rdf_weight_kg || 0).toFixed(1)} KG)
────────────────────────
📊 *HASIL AKHIR AKUMULASI HARI INI:*
• Total Dustbin: *${result.dustbin_count ?? payload.dustbin_count} / ${result.target_dustbin ?? 10} Dustbin* (${result.achievement_pct ?? 0}%)
• Gerobak Grandong: *${result.cart_count ?? payload.cart_count} Unit*
• Total Timbangan: *${Number(result.total_waste_kg ?? 0).toFixed(1)} KG*
• Cacahan RDF Total: *${result.rdf_bag_count ?? payload.rdf_bag_count} Bag* (${Number(result.rdf_weight_kg ?? payload.rdf_weight_kg).toFixed(1)} KG)
════════════════════════
💡 *Catatan:* Jika laporan ini bukan tambahan melainkan ingin mengganti/koreksi total hari ini, kirim ulang dengan kata *revisi* di awal (contoh: *revisi laporan...*).
_Ketik *!target ${payload.zone_id}* untuk cek status target, atau *!rekap ${payload.zone_id}* untuk rekap mingguan._ 🙏`;

        await m.reply(replyMessage);
    } catch (error) {
        console.error('[tps3r_input] Error:', error);
        const errMsg = error.response?.data?.message || error.message || 'Gagal menyimpan laporan ke server.';
        await m.reply(`❌ *Gagal Mencatat Laporan TPS 3R:* ${errMsg}`);
    }
}

handler.help = ['target', 'rekap', 'riwayat', 'detail <id>', 'lapor_tps3r', 'timbangan'];
handler.tags = ['samling', 'tps3r'];
handler.command = [
    'target', 'rekap', 'riwayat', 'detail',
    'tps3r_today', 'tps3r_weekly', 'tps3r_history', 'tps3r_detail',
    'tps3r_report', 'tps3r_input', 'tps3r_target', 'tps3r_rekap', 'tps3r_riwayat', 'lapor_tps3r'
];

module.exports = handler;
