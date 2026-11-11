/**
 * AI Message Handler untuk Telegram Bot
 * 
 * Handler untuk non-command messages yang menggunakan AI chatbot sebagai fallback.
 * Logic:
 * - Private chat: selalu respond dengan AI
 * - Group chat: hanya respond jika group di-whitelist
 * - Skip: jika message adalah command (starts with /)
 * 
 * @author Zoo - Samling AI Team
 * @date 2026-07-17
 */

const ai = require('../../src/services/ai.cjs');
const getSystemPrompt = require('../../src/services/ai-system-prompt.cjs');
const personaManager = require('../../src/services/ai-persona.cjs');
const groupWhitelist = require('../../src/services/group-whitelist.cjs');
const chalk = require('../utils/chalkShim.cjs');

/**
 * Sanitasi output AI — hapus markdown symbols yang muncul literal di Telegram.
 * Safety net: walaupun system prompt sudah melarang, AI kadang tetap pakai markdown.
 * @param {string} text - Raw AI response
 * @returns {string} Clean text tanpa markdown symbols
 */
function sanitizeAIResponse(text) {
  if (!text) return text;
  return text
    // Hapus code block ```...```
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '').trim())
    // Hapus bold/italic/underline: **, *, __, _
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
    // Hapus inline code backtick
    .replace(/`([^`]+)`/g, '$1')
    // Split per baris untuk proses heading, blockquote, table, separator
    .split('\n')
    .map((line) => {
      return line
      // Hapus heading # di awal baris
      .replace(/^#{1,6}\s*/, '')
      // Hapus blockquote > di awal baris
      .replace(/^>\s*/, '')
      // Hapus separator --- atau ***
      .replace(/^(-{3,}|\*{3,}|_{3,})\s*$/, '')
      // Hapus table separator baris (|---|---|)
      .replace(/^\|?[\s-:|]+\|?\s*$/, '')
      // Hapus | di awal/akhir baris (table borders)
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      // Hapus | yang berdiri sendiri sebagai separator kolom
      .replace(/\s*\|\s*/g, ' ')
      .trim();
    })
    .join('\n')
    // Collapse multiple empty lines jadi max 1
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Register AI message handler untuk bot Telegram
 * @param {Telegraf} bot - Instance bot Telegram
 */
function handleMessage(bot) {
    bot.on('text', async (ctx) => {
        try {
            const text = ctx.message?.text;
            if (!text) return;
            
            const userId = String(ctx.from.id);
            const chatId = String(ctx.chat.id);
            const chatType = ctx.chat.type;
            
            // Skip commands (starts with /)
            if (text.startsWith('/')) return;
            
            // Check chat type
            const isPrivate = chatType === 'private';
            const isGroup = chatType === 'group' || chatType === 'supergroup';
            
            // Group whitelist check: AI hanya respond di grup yang di-whitelist atau DM
            if (isGroup && !groupWhitelist.isWhitelisted(chatId)) {
                console.log(chalk.gray(`[TG-AI] Skipping non-whitelisted group: ${chatId}`));
                return;
            }
            
            console.log(chalk.cyan(`[TG-AI] Processing from ${userId}: ${text.substring(0, 50)}...`));
            
            // Get user persona (custom AI personality)
            const personaData = typeof personaManager?.getUserPersona === 'function'
                ? personaManager.getUserPersona(userId)
                : (typeof personaManager?.getPersona === 'function' ? personaManager.getPersona(userId) : null);
            const systemPrompt = personaData 
                ? getSystemPrompt(personaData.persona)
                : getSystemPrompt();
            const temperature = personaData ? personaData.temperature : null;
            
            // Get AI response
            const aiReply = await ai.chat(userId, text, systemPrompt, temperature);
            if (!aiReply) {
                console.log(chalk.yellow('[TG-AI] No AI reply received'));
                return;
            }
            
            // Parse action tags dari AI response
            const { text: aiText, action } = ai.parseActionFromResponse(aiReply);
            
            // Send text response (sanitize markdown symbols sebagai safety net)
            if (aiText) {
                const cleanText = sanitizeAIResponse(aiText);
                await ctx.reply(cleanText);
                console.log(chalk.green(`[TG-AI] Reply sent to ${userId}`));
            }
            
            // Execute action jika ada
            if (action) {
                console.log(chalk.yellow(`[TG-AI-ACTION] Executing: ${action.name} ${action.param || ''}`));
                await executeAction(ctx, action);
            }
        } catch (error) {
            console.error(chalk.red('[TG-AI] Error:'), error.message);
            // Don't crash - just skip AI response
        }
    });
}

/**
 * Execute AI-triggered actions
 * Called when AI response contains [ACTION:xxx] tag
 * 
 * @param {Context} ctx - Telegraf context
 * @param {Object} action - Parsed action object { name, param }
 */
async function executeAction(ctx, action) {
    try {
        switch (action.name) {
            case 'menu': {
                // Trigger samling menu command
                // Import dan execute samling command handler
                try {
                    const samlingCommand = require('../commands/samlingCommand.cjs');
                    if (typeof samlingCommand === 'function') {
                        // If it's a registration function, we need to trigger differently
                        // For now, send command hint
                        await ctx.reply('Menampilkan menu Samling...');
                        await ctx.reply('/samling');
                    } else if (samlingCommand.execute) {
                        await samlingCommand.execute(ctx);
                    }
                } catch (err) {
                    console.error(chalk.red('[TG-AI-ACTION] Menu error:'), err.message);
                    await ctx.reply('Silakan ketik /samling untuk melihat menu.');
                }
                break;
            }
            
            case 'lapor': {
                // Trigger lapor command dengan kondisi dari AI
                const kondisi = action.param || 'Laporan sampah menumpuk';
                console.log(chalk.yellow(`[TG-AI-ACTION] Lapor with: ${kondisi}`));
                
                try {
                    const laporCommand = require('../commands/laporCommand.cjs');
                    // Pass kondisi via state untuk digunakan oleh lapor handler
                    ctx.state = ctx.state || {};
                    ctx.state.aiCondition = kondisi;
                    
                    if (typeof laporCommand === 'function') {
                        await ctx.reply('Memproses laporan...');
                        await ctx.reply(`/lapor ${kondisi}`);
                    } else if (laporCommand.execute) {
                        await laporCommand.execute(ctx);
                    }
                } catch (err) {
                    console.error(chalk.red('[TG-AI-ACTION] Lapor error:'), err.message);
                    await ctx.reply(`Silakan ketik /lapor untuk melaporkan kondisi: ${kondisi}`);
                }
                break;
            }
            
            case 'lapor_event': {
                // Trigger lapor event dengan deskripsi dari AI
                const deskripsi = action.param || 'Laporan event/acara';
                console.log(chalk.yellow(`[TG-AI-ACTION] Lapor event with: ${deskripsi}`));
                
                try {
                    const laporCommand = require('../commands/laporCommand.cjs');
                    ctx.state = ctx.state || {};
                    ctx.state.aiEventDescription = deskripsi;
                    
                    if (typeof laporCommand === 'function') {
                        await ctx.reply('Memproses laporan event...');
                        await ctx.reply(`/lapor_event ${deskripsi}`);
                    } else if (laporCommand.executeEvent) {
                        await laporCommand.executeEvent(ctx);
                    }
                } catch (err) {
                    console.error(chalk.red('[TG-AI-ACTION] Lapor event error:'), err.message);
                    await ctx.reply(`Silakan ketik /lapor_event untuk melaporkan: ${deskripsi}`);
                }
                break;
            }
            
            case 'daftar_wilayah': {
                try {
                    const daftarWilayahCommand = require('../commands/daftarWilayahCommand.cjs');
                    if (typeof daftarWilayahCommand === 'function') {
                        await ctx.reply('/daftar_wilayah');
                    } else if (daftarWilayahCommand.execute) {
                        await daftarWilayahCommand.execute(ctx);
                    }
                } catch (err) {
                    console.error(chalk.red('[TG-AI-ACTION] Daftar wilayah error:'), err.message);
                    await ctx.reply('Silakan ketik /daftar_wilayah untuk melihat daftar wilayah.');
                }
                break;
            }
            
            case 'daftar_tps': {
                try {
                    const daftarTpsCommand = require('../commands/daftarTpsCommand.cjs');
                    if (typeof daftarTpsCommand === 'function') {
                        await ctx.reply('/daftar_tps');
                    } else if (daftarTpsCommand.execute) {
                        await daftarTpsCommand.execute(ctx);
                    }
                } catch (err) {
                    console.error(chalk.red('[TG-AI-ACTION] Daftar TPS error:'), err.message);
                    await ctx.reply('Silakan ketik /daftar_tps untuk melihat daftar TPS.');
                }
                break;
            }
            
            case 'daftar_tpa': {
                try {
                    const daftarTpaCommand = require('../commands/daftarTpaCommand.cjs');
                    if (typeof daftarTpaCommand === 'function') {
                        await ctx.reply('/daftar_tpa');
                    } else if (daftarTpaCommand.execute) {
                        await daftarTpaCommand.execute(ctx);
                    }
                } catch (err) {
                    console.error(chalk.red('[TG-AI-ACTION] Daftar TPA error:'), err.message);
                    await ctx.reply('Silakan ketik /daftar_tpa untuk melihat informasi TPA.');
                }
                break;
            }
            
            case 'cekstatus': {
                if (action.param) {
                    try {
                        const ticketId = action.param.replace(/\D/g, '');
                        if (ticketId) {
                            ctx.message = { text: `/cekstatus ${ticketId}` };
                            const cekStatusCommand = require('../commands/cekStatusCommand.cjs');
                            const bot = ctx.telegram;
                            // Execute command logic directly
                            const axios = require('axios');
                            const apiConfig = require('../../src/config/api.config.cjs');
                            const BACKEND_URL = apiConfig.baseURL || 'https://samling-api.ezzar.my.id/api/v1';
                            const res = await axios.get(`${BACKEND_URL}/citizen-reports/${ticketId}`, { timeout: 10000 });
                            const report = res.data?.data;
                            if (report) {
                                const STATUS_MAP = {
                                    'baru': '🔴 Baru (Menunggu Antrean Armada)',
                                    'sedang ditangani': '🟡 Sedang Ditangani (Petugas/Driver menuju lokasi)',
                                    'selesai': '🟢 Selesai (Sampah telah diangkut & TPS bersih)'
                                };
                                const stKey = (report.status || '').toLowerCase();
                                const statusFormatted = STATUS_MAP[stKey] || report.status;
                                const out = `📋 *STATUS PENGADUAN WARGA*\n════════════════════════\n🎫 *Nomor Tiket:* #${report.id}\n📌 *Lokasi TPS:* ${report.zone?.name || '-'}\n📍 *Kecamatan:* ${report.kecamatan || report.zone?.kecamatan || '-'}\n💬 *Isi Keluhan:* "${report.report_content}"\n\n📊 *Status Penanganan:* \n👉 *${statusFormatted}*\n════════════════════════`;
                                await ctx.reply(out, { parse_mode: 'Markdown' });
                            } else {
                                await ctx.reply(`🔍 Tiket #${ticketId} tidak ditemukan.`);
                            }
                        } else {
                            await ctx.reply('⚠️ Format tiket tidak valid.');
                        }
                    } catch (err) {
                        console.error(chalk.red('[TG-AI-ACTION] Cek status error:'), err.message);
                        await ctx.reply(`🔍 Tiket #${action.param} tidak ditemukan atau terjadi kesalahan.`);
                    }
                } else {
                    await ctx.reply('Nomor tiket tidak ditemukan. Silakan ketik /cekstatus <nomor_tiket>');
                }
                break;
            }

            case 'tps3r_today': {
                const zoneId = parseInt(action.param, 10) || 89;
                ctx.message = { text: `/target ${zoneId}` };
                const tps3rService = require('../../src/services/tps3rService.cjs');
                const data = await tps3rService.getTodayTargetStatus(zoneId);
                if (data) {
                    const pct = data.completion_percentage ?? data.achievement_pct ?? 0;
                    const progressBar = tps3rService.generateProgressBar(pct);
                    const out = `🎯 *STATUS TARGET OPERASIONAL HARI INI*\n════════════════════════\n🏢 *Fasilitas:* ${data.zone_name || `TPS 3R #${zoneId}`}\n📅 *Tanggal:* ${data.day_name || '-'}, ${data.report_date || '-'}\n👷 *Petugas:* ${data.officer_name || '-'}\n\n📊 *PROGRES CAPAIAN DUSTBIN:*\n${progressBar} *${Number(pct).toFixed(1)}%*\n• Terolah: *${data.dustbin_count ?? 0} / ${data.target_dustbin ?? 10} Dustbin*\n• Sisa Target: *${data.remaining_dustbins ?? 0} Dustbin*\n• Status: *${data.target_status_label || '-'}*\n════════════════════════`;
                    await ctx.reply(out, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply(`ℹ️ Belum ada data operasional hari ini untuk TPS 3R #${zoneId}.`);
                }
                break;
            }

            case 'tps3r_weekly': {
                const zoneId = parseInt(action.param, 10) || 89;
                ctx.message = { text: `/rekap ${zoneId}` };
                const tps3rService = require('../../src/services/tps3rService.cjs');
                const data = await tps3rService.getWeeklySummary(zoneId);
                if (data) {
                    const bd = data.breakdown || {};
                    const out = `📊 *REKAPITULASI 7 HARI TERAKHIR TPS 3R*\n════════════════════════\n🏢 *Fasilitas:* ${data.zone_name || `TPS 3R #${zoneId}`}\n🗓️ *Periode:* ${data.period_start || '-'} s.d. ${data.period_end || '-'}\n\n📈 *RINGKASAN OPERASIONAL:*\n• Total Dustbin: *${data.total_dustbins ?? 0} / ${data.target_dustbins_period ?? 70} Dustbin* (${data.weekly_achievement_pct ?? 0}%)\n• Total Timbangan: *${Number(data.total_waste_kg || 0).toFixed(1)} KG*\n• Rata-rata Harian: *${Number(data.daily_average_kg || 0).toFixed(1)} KG/hari*\n════════════════════════`;
                    await ctx.reply(out, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply(`ℹ️ Belum ada rekap mingguan untuk TPS 3R #${zoneId}.`);
                }
                break;
            }

            case 'tps3r_history': {
                const tps3rService = require('../../src/services/tps3rService.cjs');
                const data = await tps3rService.getReportsHistory(null, 5, 1);
                const reports = data?.reports || (Array.isArray(data) ? data : []);
                if (reports.length > 0) {
                    let listText = `📋 *RIWAYAT 5 LAPORAN TERAKHIR TPS 3R*\n════════════════════════\n`;
                    reports.forEach((r) => {
                        listText += `🔹 *ID #${r.id}* | ${r.day_name || '-'}, ${r.report_date || '-'}\n`;
                        listText += `   Lokasi: ${r.zone_name || `Zone #${r.zone_id}`}\n`;
                        listText += `   Timbangan: *${Number(r.total_waste_kg || 0).toFixed(1)} KG* (${r.dustbin_count || 0} Dustbin)\n\n`;
                    });
                    listText += `════════════════════════`;
                    await ctx.reply(listText, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply('ℹ️ Belum ada riwayat timbangan laporan TPS 3R.');
                }
                break;
            }

            case 'tps3r_detail': {
                const reportId = parseInt(action.param, 10);
                if (reportId) {
                    const tps3rService = require('../../src/services/tps3rService.cjs');
                    const d = await tps3rService.getReportDetailById(reportId);
                    if (d && d.id) {
                        const out = `📄 *DETAIL LAPORAN TPS 3R #${d.id}*\n════════════════════════\n🏢 *Fasilitas:* ${d.zone_name || '-'}\n📅 *Tanggal:* ${d.day_name || '-'}, ${d.report_date || '-'}\n👷 *Petugas:* ${d.officer_name || '-'}\n\n📥 *INPUT MASUK:*\n• Dustbin: *${d.dustbin_count || 0} / ${d.target_dustbin || 10} Dustbin*\n• Armada: *${d.cart_count || 0} Unit* (${d.cart_type || '-'})\n\n⚖️ *TOTAL TIMBANGAN: ${Number(d.total_waste_kg || 0).toFixed(2)} KG*\n════════════════════════`;
                        await ctx.reply(out, { parse_mode: 'Markdown' });
                    } else {
                        await ctx.reply(`🔍 Laporan TPS 3R #${reportId} tidak ditemukan.`);
                    }
                }
                break;
            }

            case 'tps3r_input': {
                if (action.param) {
                    const tps3rService = require('../../src/services/tps3rService.cjs');
                    const payload = tps3rService.parseTPS3RReportText(action.param);
                    if (payload.zone_id) {
                        payload.officer_name = ctx.from?.first_name || 'Petugas Lapangan';
                        payload.whatsapp_number = String(ctx.from?.id || '');
                        payload.mode = 'accumulate';
                        payload.notes = 'Auto-executed via AI Agent (Telegram)';
                        const result = await tps3rService.submitTPS3RReport(payload);
                        const out = `✅ *LAPORAN TPS 3R BERHASIL DICATAT OLEH AI!*\n════════════════════════\n🏢 *Fasilitas:* ${result.zone_name || `TPS 3R #${result.zone_id || payload.zone_id}`}\n📅 *Tanggal:* ${result.report_date || '-'}\n👷 *Petugas:* ${result.officer_name || payload.officer_name}\n\n📥 *INPUT MASUK:*\n• Dustbin: *${result.dustbin_count ?? payload.dustbin_count} Dustbin*\n• Grandong: *${result.cart_count ?? payload.cart_count} Unit*\n\n📊 *Total Timbangan:* *${Number(result.total_waste_kg ?? 0).toFixed(1)} KG*\n🎯 *Capaian Target:* *${result.achievement_pct ?? 0}%*\n════════════════════════`;
                        await ctx.reply(out, { parse_mode: 'Markdown' });
                    }
                }
                break;
            }
            
            default:
                console.log(chalk.yellow(`[TG-AI-ACTION] Unknown action: ${action.name}`));
                break;
        }
    } catch (error) {
        console.error(chalk.red('[TG-AI-ACTION] Execution error:'), error.message);
    }
}

module.exports = { handleMessage };
