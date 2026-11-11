const tps3rService = require('../../src/services/tps3rService.cjs');

function extractZoneId(text) {
    if (!text) return null;
    const match = text.match(/\b(?:zone|tps|tps3r)?\s*#?(\d+)\b/i) || text.match(/^(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
}

module.exports = (bot) => {
    // Command /target [zone_id]
    bot.command('target', async (ctx) => {
        const rawText = ctx.message.text.replace(/^\/target\s*/i, '').trim();
        const zoneId = extractZoneId(rawText) || 89; // Default ke fasilitas utama jika tanpa argumen

        try {
            const data = await tps3rService.getTodayTargetStatus(zoneId);
            if (!data) return ctx.reply(`ℹ️ Belum ada data operasional hari ini untuk TPS 3R #${zoneId}.`);

            const pct = data.completion_percentage ?? data.achievement_pct ?? 0;
            const progressBar = tps3rService.generateProgressBar(pct);
            const totalKg = Number(data.total_waste_kg ?? 0).toFixed(1);
            const bd = data.breakdown_kg || {};

            const msgText = `🎯 *STATUS TARGET OPERASIONAL HARI INI*
════════════════════════
🏢 *Fasilitas:* ${data.zone_name || `TPS 3R #${zoneId}`}
📅 *Tanggal:* ${data.day_name || '-'}, ${data.report_date || '-'}
👷 *Petugas:* ${data.officer_name || '-'}

📊 *PROGRES CAPAIAN DUSTBIN:*
${progressBar} *${Number(pct).toFixed(1)}%*
• Terolah: *${data.dustbin_count ?? 0} / ${data.target_dustbin ?? 10} Dustbin*
• Sisa Target: *${data.remaining_dustbins ?? 0} Dustbin*
• Status: *${data.target_status_label || '-'}*

⚖️ *RINCIAN TIMBANGAN TERKINI:*
• Total Sampah: *${totalKg} KG*
• Organik Grandong: *${Number(bd.organic_grandong || 0).toFixed(1)} KG*
• Anorganik Ber-value: *${Number(bd.anorganic_valuable || 0).toFixed(1)} KG*
• Anorganik Non-value: *${Number(bd.anorganic_non_valuable || 0).toFixed(1)} KG*
• Cacahan RDF: *${Number(bd.rdf_weight || 0).toFixed(1)} KG* (${bd.rdf_bag_count || 0} Bag)
• Gerobak Masuk: *${data.cart_count ?? 0} Unit*
════════════════════════`;
            await ctx.reply(msgText, { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply(`❌ Gagal mengambil target harian: ${err.message}`);
        }
    });

    // Command /rekap [zone_id]
    bot.command('rekap', async (ctx) => {
        const rawText = ctx.message.text.replace(/^\/rekap\s*/i, '').trim();
        const zoneId = extractZoneId(rawText) || 89;

        try {
            const data = await tps3rService.getWeeklySummary(zoneId);
            if (!data) return ctx.reply(`ℹ️ Belum ada rekap mingguan untuk TPS 3R #${zoneId}.`);

            const bd = data.breakdown || {};
            const comp = data.composition_pct || {};

            let dailyList = '';
            if (Array.isArray(data.daily_reports)) {
                data.daily_reports.forEach((d) => {
                    dailyList += `• *${d.day_name || '-'} (${(d.date || '').slice(5)}):* ${d.dustbins_processed ?? 0} Dustbin | ${Number(d.total_waste_kg || 0).toFixed(0)} kg\n`;
                });
            }

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
${dailyList || '• Belum ada catatan harian.\n'}════════════════════════`;
            await ctx.reply(msgText, { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply(`❌ Gagal mengambil rekap mingguan: ${err.message}`);
        }
    });

    // Command /riwayat [zone_id]
    bot.command('riwayat', async (ctx) => {
        const rawText = ctx.message.text.replace(/^\/riwayat\s*/i, '').trim();
        const zoneId = extractZoneId(rawText);

        try {
            const data = await tps3rService.getReportsHistory(zoneId, 5, 1);
            const reports = data?.reports || (Array.isArray(data) ? data : []);

            if (!reports || reports.length === 0) {
                return ctx.reply(`ℹ️ Belum ada riwayat timbangan laporan TPS 3R.`);
            }

            let listText = `📋 *RIWAYAT 5 LAPORAN TERAKHIR TPS 3R*\n════════════════════════\n`;
            reports.forEach((r) => {
                listText += `🔹 *ID #${r.id}* | ${r.day_name || '-'}, ${r.report_date || '-'}\n`;
                listText += `   Lokasi: ${r.zone_name || `Zone #${r.zone_id}`}\n`;
                listText += `   Petugas: ${r.officer_name || '-'}\n`;
                listText += `   Timbangan: *${Number(r.total_waste_kg || 0).toFixed(1)} KG* (${r.dustbin_count || 0} Dustbin - ${r.achievement_pct ?? 0}%)\n`;
                listText += `   Ketik */detail ${r.id}* untuk rincian lengkap.\n\n`;
            });
            listText += `════════════════════════`;
            await ctx.reply(listText, { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply(`❌ Gagal mengambil riwayat: ${err.message}`);
        }
    });

    // Command /detail <id>
    bot.command('detail', async (ctx) => {
        const rawText = ctx.message.text.replace(/^\/detail\s*/i, '').trim();
        const reportId = parseInt(rawText, 10);

        if (!reportId || isNaN(reportId)) {
            return ctx.reply('⚠️ Harap masukkan ID Laporan.\n\nContoh: `/detail 14`', { parse_mode: 'Markdown' });
        }

        try {
            const d = await tps3rService.getReportDetailById(reportId);
            if (!d || !d.id) return ctx.reply(`🔍 Laporan TPS 3R #${reportId} tidak ditemukan.`);

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
            await ctx.reply(msgText, { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply(`❌ Gagal mengambil detail: ${err.message}`);
        }
    });

    // Command /lapor_tps3r <format>
    bot.command('lapor_tps3r', async (ctx) => {
        const rawText = ctx.message.text.replace(/^\/lapor_tps3r\s*/i, '').trim();
        const senderName = ctx.from?.first_name || 'Petugas Lapangan';

        if (!rawText) {
            return ctx.reply(`📝 *PANDUAN LAPOR TIMBANGAN TPS 3R*\n\nFormat laporan dapat dikirimkan langsung berupa teks hasil timbangan:\nContoh:\n\`/lapor_tps3r zone 89, dustbin: 5, gerobak: 1, anorganik ber-value: 25.5 kg, non-value: 15 kg, grandong: 72.8 kg\``, { parse_mode: 'Markdown' });
        }

        try {
            const payload = tps3rService.parseTPS3RReportText(rawText);
            if (!payload.zone_id) {
                return ctx.reply('⚠️ Harap cantumkan nomor zona/TPS (misal: `zone 89`).', { parse_mode: 'Markdown' });
            }

            payload.officer_name = senderName;
            payload.whatsapp_number = String(ctx.from?.id || '');
            payload.mode = 'accumulate';
            payload.notes = 'Tercatat via Telegram Bot Samling AI';

            const result = await tps3rService.submitTPS3RReport(payload);
            const replyText = `✅ *LAPORAN TPS 3R BERHASIL DICATAT!*\n════════════════════════\n🏢 *Fasilitas:* ${result.zone_name || `TPS 3R #${result.zone_id || payload.zone_id}`}\n📅 *Tanggal:* ${result.report_date || '-'}\n👷 *Petugas:* ${result.officer_name || senderName}\n\n📥 *INPUT MASUK:*\n• Dustbin: *${result.dustbin_count ?? payload.dustbin_count} Dustbin*\n• Gerobak Grandong: *${result.cart_count ?? payload.cart_count} Unit*\n\n⚖️ *HASIL OLAHAN:*\n• Anorganik Ber-value: *${Number(result.anorganic_valuable_kg ?? payload.anorganic_valuable_kg).toFixed(1)} KG*\n• Organik Grandong: *${Number(result.organic_grandong_kg ?? payload.organic_grandong_kg).toFixed(1)} KG*\n────────────────────────\n📊 *Total Timbangan:* *${Number(result.total_waste_kg ?? 0).toFixed(1)} KG*\n🎯 *Capaian Target:* *${result.achievement_pct ?? 0}%* (${result.dustbin_count ?? payload.dustbin_count}/${result.target_dustbin ?? 10} Dustbin)\n════════════════════════`;
            await ctx.reply(replyText, { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply(`❌ Gagal mencatat laporan: ${err.message}`);
        }
    });
};
