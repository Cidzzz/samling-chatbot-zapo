const fs = require('fs');
const config = require('../config.cjs');

if (global.botMode === undefined) global.botMode = config.botMode;
const plugins = require('../utils/PluginLoader.cjs');
const chalk = require('../../telegram/utils/chalkShim.cjs');
const readline = require('readline');
function getContentType(content) {
    if (!content) return undefined;
    const keys = Object.keys(content);
    const key = keys.find(k => (k === 'conversation' || k.endsWith('Message') || k.endsWith('V2') || k.endsWith('V3')) && k !== 'senderKeyDistributionMessage');
    return key;
}
const { sendButtons, sendListMessage, sendInteractiveMessage, sendButtonWithImage, sendInteractiveWithImage } = require('../utils/interactiveHelper.cjs');
const { fakeOrder } = require('../utils/fquoted.cjs');
const ai = require('../services/ai.cjs');
const getSystemPrompt = require('../services/ai-system-prompt.cjs');
const groupWhitelist = require('../services/group-whitelist.cjs');

const superOwnerLidCache = new Set();
const coOwnerLidCache = new Set();

const COOLDOWN_MS = 5000;
const COOLDOWN_EXEMPT = new Set([
    'menu', 'ping',
    'generalmenu', 'ownermenu', 'ffmpegmenu',
    'downloadmenu', 'toolsmenu', 'jadibotmenu',
    'funmenu', 'groupmenu',
    'afk', 'welcome', 'goodbye', 'antilink',
]);
const cooldownMap = new Map();

const welcomeGroups = new Map();
const goodbyeGroups = new Map();
const antilinkGroups = new Map();

global.welcomeGroups = welcomeGroups;
global.goodbyeGroups = goodbyeGroups;
global.antilinkGroups = antilinkGroups;

global.afkUsers = global.afkUsers || new Map();

setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of cooldownMap) {
        if (now - timestamp > COOLDOWN_MS) cooldownMap.delete(key);
    }
}, 5 * 60 * 1000);

async function resolveOwnerLids(Hanz) {
    const resolveList = [
        { numbers: [].concat(config.superOwner), cache: superOwnerLidCache, label: 'SUPER' },
        { numbers: [].concat(config.coOwner || []), cache: coOwnerLidCache, label: 'CO' },
    ];
    for (const { numbers, cache, label } of resolveList) {
        for (const nomor of numbers.map(n => n.replace(/\D/g, ''))) {
            try {
                const [result] = await Hanz.onWhatsApp(nomor);
                if (result?.exists && result?.lid) {
                    const lidNum = result.lid.replace(/\D/g, '').replace(/@.+$/, '').split(':')[0];
                    cache.add(lidNum);
                    console.log(chalk.cyan(`[${label}-OWNER-LID] ${nomor} -> ${lidNum}@lid`));
                }
            } catch (e) {
                console.log(chalk.yellow(`[${label}-OWNER-LID] Gagal resolve ${nomor}: ${e.message}`));
            }
        }
    }
}

function extractMessageText(message) {
    if (!message) return null;
    const type = getContentType(message);
    switch (type) {
        case 'conversation': return message.conversation;
        case 'extendedTextMessage': return message.extendedTextMessage?.text;
        case 'imageMessage': return message.imageMessage?.caption;
        case 'videoMessage': return message.videoMessage?.caption;
        case 'locationMessage': {
            const loc = message.locationMessage;
            return `!location_share ${loc.degreesLatitude},${loc.degreesLongitude}:${loc.name || ''}:${loc.address || ''}`;
        }
        case 'liveLocationMessage': {
            const loc = message.liveLocationMessage;
            return `!location_share ${loc.degreesLatitude},${loc.degreesLongitude}:${loc.caption || ''}`;
        }
        case 'buttonsResponseMessage': return message.buttonsResponseMessage?.selectedButtonId;
        case 'listResponseMessage': return message.listResponseMessage?.singleSelectReply?.selectedRowId;
        case 'templateButtonReplyMessage': return message.templateButtonReplyMessage?.selectedId;
        case 'interactiveResponseMessage': {
            const paramsJson = message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
            if (paramsJson) {
                try {
                    const parsed = JSON.parse(paramsJson);
                    return parsed.id;
                } catch {
                    return null;
                }
            }
            return null;
        }
        default: return null;
    }
}

// FIX 2026-07-17: Deteksi apakah text berasal dari button/interactive response.
// Button response message types: buttonsResponseMessage, listResponseMessage,
// templateButtonReplyMessage, interactiveResponseMessage.
// User-typed text: conversation, extendedTextMessage, imageMessage, videoMessage.
function isButtonResponseMessage(message) {
    if (!message) return false;
    const type = getContentType(message);
    return type === 'buttonsResponseMessage' ||
           type === 'listResponseMessage' ||
           type === 'templateButtonReplyMessage' ||
           type === 'interactiveResponseMessage';
}

function isGroup(jid) { return jid.endsWith('@g.us'); }
function isFromMe(msg) { return msg.key.fromMe; }

const lidMapper = require('../utils/lidMapper.cjs');

function getSenderNumber(sender, msg) {
    const candidates = [
        msg?.key?.participantPn,      // Prefer actual phone number over LID (Baileys mapping)
        msg?.key?.senderPn,
        msg?.key?.participantAlt,
        msg?.key?.remoteJidAlt,
        msg?.key?.participant,
        msg?.key?.remoteJid,
        sender,
    ];
    const raw = candidates.find(v => v && !v.endsWith('@lid')) || candidates.find(v => v) || '';
    const cleaned = raw.replace(/\D/g, '').replace(/@.+$/, '').split(':')[0];
    
    // Auto-detect & register jika ada nomor asli dan LID di message key
    const lidRaw = candidates.find(v => v && v.endsWith('@lid'));
    if (lidRaw && cleaned && cleaned.startsWith('62')) {
        lidMapper.registerLidMapping(lidRaw, cleaned);
    }
    
    // Jika masih berwujud LID, coba cari dari database mapper
    const mapped = lidMapper.getPhoneFromLid(cleaned);
    return mapped || cleaned;
}

function isSuperOwner(sender, msg) {
    const superOwners = [].concat(config.superOwner).map(n => n.replace(/\D/g, ''));
    const senderNumber = getSenderNumber(sender, msg);
    const fromMe = msg?.key?.fromMe || false;
    return superOwners.some(n => n === senderNumber) || superOwnerLidCache.has(senderNumber) || fromMe;
}

function isCoOwner(sender, msg) {
    const coOwners = [].concat(config.coOwner || []).map(n => n.replace(/\D/g, ''));
    const senderNumber = getSenderNumber(sender, msg);
    return coOwners.some(n => n === senderNumber) || coOwnerLidCache.has(senderNumber);
}

function isOwner(sender, msg) {
    return isSuperOwner(sender, msg) || isCoOwner(sender, msg);
}

function parseCommand(text, isFromButton = false) {
    if (!text) return null; // ponytail: null guard, crash jika WA kirim message tanpa text (image/sticker/etc)
    const { prefix } = config;

    if (text.startsWith(prefix)) {
        const args = text.slice(prefix.length).trim().split(/ +/);
        const name = args.shift().toLowerCase();
        return { name, args, fullArgs: args.join(' '), raw: text, hasPrefix: true };
    }

    // FIX 2026-07-17: Command manual WAJIB prefix '!'.
    // Tanpa prefix, hanya parse sebagai command jika berasal dari button/interactive response.
    // Pesan biasa user (ketik "menu", "samling", "lapor", dll) → jatuh ke AI chatbot fallback.
    if (!isFromButton) return null;

    const words = text.trim().split(/ +/);
    const name = words[0].toLowerCase();
    const args = words.slice(1);
    return { name, args, fullArgs: args.join(' '), raw: text, hasPrefix: false };
}

async function handleMessages(Hanz, m, isMain = true) {
    for (const msg of m.messages) {
        if (!msg.message) continue;

        const fromMe = isFromMe(msg);
        const sender = msg.key.remoteJid;
        const remoteJid = msg.key.remoteJid; // Explicit remoteJid for message sending (Baileys requirement)

        const checkOwner = isOwner(sender, msg);
        const checkSuperOwner = isSuperOwner(sender, msg);
        const checkCoOwner = isCoOwner(sender, msg);

        // Abaikan semua pesan yang dikirim oleh bot sendiri untuk mencegah loop / self-processing
        if (fromMe) continue;

        if (global.botMode === 'self' && !checkOwner) continue;

        // FIX 2026-07-14: Check media state BEFORE text extraction
        // Foto tanpa caption → extractMessageText returns null → message di-skip
        // Tapi jika user dalam media state, foto harus di-route ke lapor handler
        const { hasActiveMediaState } = require('../cmd_samling/lapor.cjs');
        const phoneNumber = getSenderNumber(sender, msg);
        const hasMediaState = hasActiveMediaState(phoneNumber);
        const msgHasImage = !!(
            msg.message?.imageMessage || 
            msg.message?.videoMessage || 
            msg.type === 'image' || 
            msg.raw?.message?.imageMessage
        );

        const text = extractMessageText(msg.message);
        
        // FIX 2026-07-14: Jangan skip jika user dalam media state dan kirim foto
        if (!text && !(hasMediaState && msgHasImage)) continue;

        if (!fromMe) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);

            console.log(
                chalk.blue(`[INBOUND] `) +
                chalk.cyan(sender) +
                chalk.white(`: ${text || '[IMAGE]'}`)
            );
        }

        if (config.autoRead) await Hanz.readMessages([msg.key]);
        if (config.autoTyping && !isGroup(sender)) await Hanz.sendPresenceUpdate('composing', sender);

        if (isGroup(sender) && global.antilinkGroups?.get(sender) && !checkOwner) {
            const linkRegex = /https?:\/\/|wa\.me\/|chat\.whatsapp\.com\/|bit\.ly\/|t\.me\//i;
            if (text && linkRegex.test(text)) {
                try {
                    await Hanz.sendMessage(sender, { delete: msg.key });
                    await Hanz.sendMessage(sender, {
                        text: `@${getSenderNumber(sender, msg)} dilarang mengirim link di grup ini!`,
                        mentions: [msg.key.participant || sender]
                    });
                } catch { }
                continue;
            }
        }

        if (isGroup(sender) && global.afkUsers?.size > 0) {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            for (const jid of mentioned) {
                const num = jid.split('@')[0];
                if (global.afkUsers.has(num)) {
                    const { reason, time } = global.afkUsers.get(num);
                    const elapsed = Math.floor((Date.now() - time) / 1000);
                    const dur = elapsed < 60 ? `${elapsed} detik` : elapsed < 3600 ? `${Math.floor(elapsed/60)} menit` : `${Math.floor(elapsed/3600)} jam`;
                    await Hanz.sendMessage(sender, {
                        text: `@${num} sedang AFK selama ${dur}\nAlasan: ${reason}`,
                        mentions: [jid]
                    });
                }
            }
        }

        if (!fromMe && global.afkUsers?.has(getSenderNumber(sender, msg))) {
            const num = getSenderNumber(sender, msg);
            global.afkUsers.delete(num);
            await Hanz.sendMessage(sender, {
                text: `Selamat datang kembali @${num}! Status AFK kamu telah dihapus.`,
                mentions: [msg.key.participant || sender]
            });
        }

        const command = text ? parseCommand(text, isButtonResponseMessage(msg.message)) : null;

        // ─── FAST-PATH AUTO-RESOLVE ROLE & INTENT (<1.0s) ───
        // 1. Deteksi Permintaan Template Timbangan: !timbangan / lapor timbangan / format lapor
        const isTPS3RTemplateRequest = text && /^(!timbangan|lapor\s+timbangan|format\s+timbangan|format\s+lapor)$/i.test(text.trim());
        if (isTPS3RTemplateRequest) {
            const tps3rHandler = require('../cmd_samling/tps3r.cjs');
            await tps3rHandler({
                Hanz, msg, sender,
                senderNumber: phoneNumber,
                pushname: msg.pushName || 'Petugas',
                command: { name: 'timbangan', args: [], fullArgs: '', raw: text, hasPrefix: false },
                text,
                reply: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                fakeOrder
            });
            continue;
        }

        // 2. Auto-detect update kerumunan Hari-H: format UPDATE# atau format form *UPDATE KONDISI PENGUNJUNG EVENT*
        const isEventLiveUpdate = text && (
            /^UPDATE#\d+#/i.test(text.trim()) ||
            /update\s+kondisi\s+pengunjung/i.test(text) ||
            (/tingkat\s*kerumunan\s*:/i.test(text) && /pengunjung\s*:/i.test(text))
        );
        if (isEventLiveUpdate) {
            const eventService = require('../services/eventService.cjs');
            let eventId = null;
            let actualAttendees = 0;
            let rawLevel = 'Sedang';
            let crowdCondition = 'Laporan langsung Hari-H oleh PIC';

            // Parser Format Delimiter: UPDATE#<id>#<kuota>#<level>#<keterangan>
            if (/^UPDATE#\d+#/i.test(text.trim())) {
                const parts = text.trim().split('#').map(p => p.trim());
                eventId = parseInt(parts[1], 10);
                actualAttendees = eventService.parseHumanQuota ? eventService.parseHumanQuota(parts[2]) : parseInt(String(parts[2]).replace(/\D/g, ''), 10);
                rawLevel = parts[3] || 'Sedang';
                crowdCondition = parts.slice(4).join('#').trim() || crowdCondition;
            } else {
                // Parser Format Form: *UPDATE KONDISI PENGUNJUNG EVENT*
                const cleanText = text.replace(/\*/g, '');
                const mPengunjung = cleanText.match(/(?:jumlah\s*pengunjung|pengunjung|peserta)\s*[:=]\s*([^\r\n,]+)/i);
                const mLevel = cleanText.match(/(?:tingkat\s*kerumunan|kerumunan|kondisi)\s*[:=]\s*([^\r\n,]+)/i);
                const mKet = cleanText.match(/(?:keterangan(?:\s*\(.*?\))?|catatan|deskripsi)\s*[:=]\s*([^\r\n]+)/i);
                const mEvent = cleanText.match(/^event\s*[:=]?\s*([^\r\n,]+)/im);

                if (mPengunjung) {
                    const qStr = mPengunjung[1].toLowerCase().trim();
                    const mRibu = qStr.match(/([\d.]+)\s*(?:ribu|rb|k\b)/i);
                    if (mRibu) actualAttendees = Math.round(parseFloat(mRibu[1]) * 1000);
                    else actualAttendees = parseInt(qStr.replace(/\D/g, ''), 10) || 0;
                }
                if (mLevel) rawLevel = mLevel[1].trim();
                if (mKet) crowdCondition = mKet[1].trim();

                // Cari target event ID
                const targetNameOrId = mEvent ? mEvent[1].trim() : '';
                const numMatch = targetNameOrId.match(/\b(\d+)\b/);
                if (numMatch) {
                    eventId = parseInt(numMatch[1], 10);
                } else {
                    // Cari dari active events hari ini untuk nomor PIC tersebut
                    try {
                        const activeList = await eventService.getActiveEventsToday();
                        const cleanPhone = eventService.normalizePhone(phoneNumber);
                        const matchedEvt = (activeList || []).find(e => {
                            const p = eventService.normalizePhone(e.pic_phone);
                            const matchPhone = p && p === cleanPhone;
                            const matchName = targetNameOrId && (e.name || '').toLowerCase().includes(targetNameOrId.toLowerCase());
                            return matchPhone || matchName;
                        });
                        if (matchedEvt) eventId = matchedEvt.id;
                    } catch (e) { }
                }
            }

            // Validasi & mapping tingkat kerumunan
            const lvl = (rawLevel || '').toLowerCase();
            let matchedLevel = 'Sedang';
            if (lvl.includes('sangat') || lvl.includes('parah') || lvl.includes('penuh')) matchedLevel = 'Sangat Padat';
            else if (lvl.includes('padat') || lvl.includes('ramai')) matchedLevel = 'Padat';
            else if (lvl.includes('rendah') || lvl.includes('sepi') || lvl.includes('lengang')) matchedLevel = 'Rendah';
            else if (lvl.includes('sedang') || lvl.includes('lancar')) matchedLevel = 'Sedang';

            if (!eventId) {
                // Fallback jika ID belum dapat dipastikan, ambil event aktif pertama untuk nomor PIC
                try {
                    const activeList = await eventService.getActiveEventsToday();
                    const cleanPhone = eventService.normalizePhone(phoneNumber);
                    const myEvent = (activeList || []).find(e => eventService.normalizePhone(e.pic_phone) === cleanPhone);
                    if (myEvent) eventId = myEvent.id;
                } catch (e) { }
            }

            if (!eventId) {
                await Hanz.sendMessage(sender, {
                    text: '⚠️ *ID Event Tidak Ditemukan*\n\nMohon sertakan Nama Event atau ID Event yang sedang berlangsung hari ini agar data dapat dicatat ke peta mitigasi.'
                }, { quoted: msg });
                continue;
            }

            await Hanz.sendMessage(sender, { text: `⏳ Mengirim update kondisi live event #${eventId} ke DLH...` }, { quoted: msg });
            try {
                const res = await eventService.updateEventHariH(eventId, {
                    actual_attendees: actualAttendees,
                    crowd_level: matchedLevel,
                    crowd_condition: crowdCondition,
                    pic_phone: phoneNumber
                });
                const d = res.data || {};
                await Hanz.sendMessage(sender, {
                    text: `✅ *LIVE UPDATE EVENT BERHASIL DICATAT*\n\n` +
                          `🆔 *ID Event:* #${d.id || eventId}\n` +
                          `🎪 *Nama Event:* ${d.name || '-'}\n` +
                          `👥 *Pengunjung Riil:* ${Number(d.actual_attendees || actualAttendees).toLocaleString('id-ID')} orang\n` +
                          `🔥 *Tingkat Kerumunan:* ${d.crowd_level || matchedLevel}\n` +
                          `📝 *Kondisi:* ${d.crowd_condition || crowdCondition}\n\n` +
                          `💡 Intensitas Heatmap Spasial DLH DKI Jakarta telah disesuaikan secara real-time.`
                }, { quoted: msg });
                continue;
            } catch (err) {
                console.error(chalk.red('[LIVE-UPDATE-ERROR]'), err.message);
                await Hanz.sendMessage(sender, { text: `❌ Gagal update event #${eventId}: ${err.message}` }, { quoted: msg });
                continue;
            }
        }

        // ─── 1. AUTO-DETECT LAPORAN TPS 3R FORMAT TEKS LANGSUNG (Prioritas Tinggi) ───
        const isTPS3RTextReport = text && (
            /laporan\s+kegiatan.*?rdf/i.test(text) ||
            /hasil\s+dustbin/i.test(text) ||
            /mesin\s+grandong/i.test(text) ||
            /cacahan\s+rdf/i.test(text) ||
            (/pemilahan\s+an-?organik/i.test(text) && /organik/i.test(text))
        );
        if (isTPS3RTextReport) {
            // Validasi otorisasi petugas terlebih dahulu
            const tps3rService = require('../services/tps3rService.cjs');
            const authRes = await tps3rService.verifyOfficer(phoneNumber);
            if (!authRes?.authorized && !authRes?.data?.authorized) {
                await Hanz.sendMessage(sender, {
                    text: `❌ *AKSES DITOLAK: BUKAN PETUGAS TPS 3R*\n\n` +
                          `Nomor WhatsApp Anda (+${phoneNumber}) belum terdaftar sebagai Petugas TPS 3R resmi di sistem Samling AI DLH Jakarta.\n\n` +
                          `📌 Pencatatan timbangan hanya untuk petugas resmi di lapangan.`
                }, { quoted: msg });
                continue;
            }

            const tps3rHandler = require('../cmd_samling/tps3r.cjs');
            try {
                await tps3rHandler({
                    Hanz, msg, sender,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'Petugas',
                    isGroup: isGroup(sender),
                    isOwner: checkOwner,
                    isSuperOwner: checkSuperOwner,
                    isCoOwner: checkCoOwner,
                    command: {
                        name: 'tps3r_input',
                        args: [],
                        fullArgs: text,
                        raw: text,
                        hasPrefix: false
                    },
                    text,
                    reply: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                    fakeOrder
                });
                continue;
            } catch (error) {
                console.error(chalk.red('[TPS3R-TEXT-REPORT-ERROR]'), error.message);
                await Hanz.sendMessage(sender, { text: '❌ Gagal memproses format laporan TPS 3R: ' + error.message });
                continue;
            }
        }

        // ─── 2. AUTO-DETECT FORMAT PELAPORAN EVENT PIC ───
        const hasTps3rKeywords = text && /rdf|dustbin|grandong|cacahan|an-?organik/i.test(text);
        const isEventFormReport = !hasTps3rKeywords && text && (
            /^EVENT#[^#]+#/i.test(text.trim()) ||
            /laporan\s+(?:event|acara)/i.test(text) ||
            ((/nama\s*(?:event|acara)\s*:/i.test(text) || /judul\s*acara\s*:/i.test(text)) &&
             (/wilayah|lokasi|venue|tempat|pengunjung|peserta|kuota|estimasi/i.test(text)))
        );
        if (isEventFormReport) {
            const eventPicHandler = require('../cmd_samling/event_pic.cjs');
            try {
                await eventPicHandler.execute({
                    Hanz, msg, sender,
                    senderNumber: phoneNumber,
                    text,
                    command: { name: 'lapor_event' }
                });
                continue;
            } catch (err) {
                console.error(chalk.red('[EVENT-FORM-REPORT-ERROR]'), err.message);
                await Hanz.sendMessage(sender, { text: `❌ Gagal memproses laporan event: ${err.message}` }, { quoted: msg });
                continue;
            }
        }

        // CRITICAL FIX: Include button commands (lapor_*, event_*) in routing condition
        const isLaporRelated = command && (
            command.name === 'lapor' || 
            command.name === 'laporan' ||
            command.name === 'lapor_event' ||
            command.name === 'kasih_form_event' ||
            command.name === 'form_event' ||
            command.name === 'format_event' ||
            (command.name.startsWith('lapor_') && command.name !== 'lapor_tps3r') ||
            command.name.startsWith('event_')
        );

        if (isLaporRelated || hasMediaState) {
            // Guard: Batasi fitur lapor_event secara dinamis via API backend DLH (PIC Event & Petugas TPS 3R)
            const senderNumClean = (phoneNumber || '').replace(/^0/, '62');
            const isEventCmd = command && (
                command.name === 'lapor_event' || 
                command.name === 'kasih_form_event' ||
                command.name === 'form_event' ||
                command.name === 'format_event' ||
                command.name.startsWith('event_')
            );

            // Alias cepat: jika tombol/command adalah permintaan formulir event, teruskan langsung ke event_pic
            if (command && ['kasih_form_event', 'form_event', 'format_event'].includes(command.name)) {
                const eventPicHandler = require('../cmd_samling/event_pic.cjs');
                try {
                    await eventPicHandler.execute({
                        Hanz, msg, sender,
                        senderNumber: phoneNumber,
                        pushname: msg.pushName || 'PIC',
                        text: '!lapor_event',
                        command: { name: 'lapor_event' }
                    });
                } catch (err) {
                    console.error('[EVENT-FORM-ERROR]', err);
                    await Hanz.sendMessage(sender, { text: '❌ Gagal memuat formulir event.' }, { quoted: msg });
                }
                continue;
            }

            if (isEventCmd) {
                let canReportEvent = false;
                try {
                    const eventService = require('../services/eventService.cjs');
                    const tps3rService = require('../services/tps3rService.cjs');
                    const [picRes, officerRes] = await Promise.all([
                        eventService.verifyPicSender(senderNumClean).catch(() => ({ authorized: false })),
                        tps3rService.verifyOfficer(senderNumClean).catch(() => ({ authorized: false }))
                    ]);
                    canReportEvent = Boolean(picRes?.authorized || officerRes?.authorized);
                } catch (e) {
                    canReportEvent = false;
                }

                if (!canReportEvent) {
                    await Hanz.sendMessage(sender, {
                        text: '⚠️ *Akses Terbatas*\n\nFitur pelaporan event/acara hanya diperuntukkan bagi *Panitia Acara Terdaftar* atau *Petugas*.\n\nMasyarakat umum dapat menggunakan layanan *!lapor* untuk melaporkan tumpukan sampah.'
                    }, { quoted: msg });
                    continue;
                }
            }

            const laporHandler = require('../cmd_samling/lapor.cjs');
            try {
                const resLapor = await laporHandler({
                    Hanz, msg, sender,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'Kak',
                    isGroup: isGroup(sender),
                    isOwner: checkOwner,
                    isSuperOwner: checkSuperOwner,
                    isCoOwner: checkCoOwner,
                    command, // ponytail: reuse null-safe command from line 238, was parseCommand(text) → crash on null text
                    text,
                    fromMe
                });
                if (resLapor !== 'BREAKOUT') {
                    continue;
                }
                // Jika user breakout dari upload mode dengan sapaan/command lain, lanjut ke router/AI di bawah!
            } catch (error) {
                console.error(chalk.red('[LAPOR-ERROR]'), error.message);
                console.error(chalk.red('[LAPOR-STACK]'), error.stack);
                await Hanz.sendMessage(sender, {
                    text: '❌ Terjadi kesalahan saat memproses laporan. Silakan coba lagi atau hubungi admin.\n\nError: ' + error.message
                });
            }
        }

        // Handle Group Whitelist Callbacks (wlist_add_*, wlist_remove_*)
        if (command && command.name.startsWith('wlist_')) {
            if (!checkSuperOwner) {
                await Hanz.sendMessage(sender, { text: '❌ Command ini hanya untuk Super Owner!' });
                continue;
            }

            if (command.name.startsWith('wlist_add_')) {
                const groupId = command.name.replace('wlist_add_', '');
                const added = groupWhitelist.addGroup(groupId);
                if (added) {
                    await Hanz.sendMessage(sender, {
                        text: `✅ Grup berhasil ditambahkan ke whitelist AI.\n\nAI sekarang dapat merespon di grup tersebut.`
                    });
                    console.log(chalk.green(`[WLIST] Group ${groupId} added to whitelist`));
                } else {
                    await Hanz.sendMessage(sender, { text: '⚠️ Grup sudah ada di whitelist.' });
                }
                continue;
            }

            if (command.name.startsWith('wlist_remove_')) {
                const groupId = command.name.replace('wlist_remove_', '');
                const removed = groupWhitelist.removeGroup(groupId);
                if (removed) {
                    await Hanz.sendMessage(sender, {
                        text: `❌ Grup dihapus dari whitelist AI.\n\nAI tidak akan merespon di grup tersebut lagi.`
                    });
                    console.log(chalk.yellow(`[WLIST] Group ${groupId} removed from whitelist`));
                } else {
                    await Hanz.sendMessage(sender, { text: '⚠️ Grup tidak ada di whitelist.' });
                }
                continue;
            }
        }

        if (command) {
            // ponytail: Manual routing for dynamic samling commands (before plugin lookup)
            // Handle kelurahan selection commands (kel_*)
            if (command.name.startsWith('kel_')) {
                const kelurahanHandler = require('../cmd_samling/daftar_wilayah/kelurahan_handler.cjs');
                try {
                    await kelurahanHandler({
                        Hanz, msg, sender,
                        senderNumber: getSenderNumber(sender, msg),
                        pushname: msg.pushName || 'Kak',
                        isGroup: isGroup(sender),
                        isOwner: checkOwner,
                        isSuperOwner: checkSuperOwner,
                        isCoOwner: checkCoOwner,
                        command, text,
                        fakeOrder,
                        reply: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                        sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, sender, content),
                    });
                } catch (error) {
                    console.error(chalk.red('[KEL-HANDLER-ERROR]'), error);
                    await Hanz.sendMessage(sender, { text: '❌ Terjadi kesalahan saat memproses permintaan.' });
                }
                continue; // Skip normal plugin routing
            }
            
            // Handle tps selection commands (tps_*)
            if (command.name.startsWith('tps_')) {
                const tpsHandler = require('../cmd_samling/daftar_wilayah/tps_handler.cjs');
                try {
                    await tpsHandler({
                        Hanz, msg, sender,
                        senderNumber: getSenderNumber(sender, msg),
                        pushname: msg.pushName || 'Kak',
                        isGroup: isGroup(sender),
                        isOwner: checkOwner,
                        isSuperOwner: checkSuperOwner,
                        isCoOwner: checkCoOwner,
                        command, text,
                        fakeOrder,
                        reply: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                        sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, sender, content),
                    });
                } catch (error) {
                    console.error(chalk.red('[TPS-HANDLER-ERROR]'), error);
                    await Hanz.sendMessage(sender, { text: '❌ Terjadi kesalahan saat memproses permintaan.' });
                }
                continue; // Skip normal plugin routing
            }

            // Direct route commands TPS 3R (target, rekap, riwayat, detail, lapor_tps3r)
            const tps3rCmds = new Set(['target', 'rekap', 'riwayat', 'detail', 'lapor_tps3r', 'tps3r_today', 'tps3r_weekly', 'tps3r_history', 'tps3r_detail', 'tps3r_report', 'tps3r_input']);
            if (tps3rCmds.has(command.name)) {
                const tps3rHandler = require('../cmd_samling/tps3r.cjs');
                try {
                    await tps3rHandler({
                        Hanz, msg, sender,
                        senderNumber: phoneNumber,
                        pushname: msg.pushName || 'Petugas',
                        isGroup: isGroup(sender),
                        isOwner: checkOwner,
                        isSuperOwner: checkSuperOwner,
                        isCoOwner: checkCoOwner,
                        command, text,
                        fakeOrder,
                        reply: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                        sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, sender, content),
                    });
                } catch (error) {
                    console.error(chalk.red('[TPS3R-ROUTER-ERROR]'), error);
                    await Hanz.sendMessage(sender, { text: '❌ Gagal memproses perintah TPS 3R: ' + error.message });
                }
                continue;
            }
            
            // Handle Share Location (Native Location Pin from WhatsApp)
            if (command.name === 'location_share') {
                const geoHelper = require('../utils/geoHelper.cjs');
                const rawParam = command.fullArgs || '';
                const [coordsPart, venuePart, addressPart] = rawParam.split(':');
                const [latStr, lonStr] = (coordsPart || '').split(',');
                const latitude = parseFloat(latStr);
                const longitude = parseFloat(lonStr);

                console.log(chalk.cyan(`[LOCATION-SHARE] Received GPS: ${latitude}, ${longitude}`));
                const geoData = await geoHelper.reverseGeocode(latitude, longitude);

                // Cek apakah user adalah PIC Event terdaftar
                const eventService = require('../services/eventService.cjs');
                const cleanPhone = eventService.normalizePhone(phoneNumber);
                const eventPicHandler = require('../cmd_samling/event_pic.cjs');

                // Jika ada draf event yang sedang menunggu lokasi (PIN GPS)
                if (eventPicHandler.pendingEventDrafts && eventPicHandler.pendingEventDrafts.has(cleanPhone)) {
                    const draft = eventPicHandler.pendingEventDrafts.get(cleanPhone);
                    eventPicHandler.pendingEventDrafts.delete(cleanPhone);

                    const venue = venuePart || geoData?.venue_name || 'Lokasi Terpilih';
                    const wilayah = geoData?.wilayah || 'Jakarta Pusat';
                    const kecamatan = geoData?.kecamatan || '-';

                    draft.parsed.venue_name = venue;
                    draft.parsed.wilayah = wilayah;
                    draft.parsed.kecamatan = kecamatan;

                    console.log(chalk.green(`[EventPic] Menggabungkan GPS ke draf event ${cleanPhone}:`), draft.parsed);

                    // Buat format form lengkap dan eksekusi pendaftaran otomatis
                    const completedForm = 
`*LAPORAN EVENT JAKARTA*
Nama Event: ${draft.parsed.name}
Deskripsi: ${draft.parsed.description || 'Laporan Event via GPS'}
Kategori: ${draft.parsed.category || 'Event'}
Tgl Mulai: ${draft.parsed.start_date || 'Besok'}
Tgl Selesai: ${draft.parsed.end_date || draft.parsed.start_date || 'Besok'}
Lokasi: ${venue}
Wilayah: ${wilayah}
Kecamatan: ${kecamatan}
Estimasi Pengunjung: ${draft.parsed.visitor_quota || 1000}`;

                    await eventPicHandler.execute({
                        Hanz, msg, sender,
                        senderNumber: phoneNumber,
                        pushname: msg.pushName || 'PIC',
                        text: completedForm,
                        command: { name: 'lapor_event' }
                    });
                    continue;
                }

                const verifyResult = await eventService.verifyPicSender(cleanPhone);
                if (verifyResult && verifyResult.authorized) {
                    const venue = venuePart || geoData?.venue_name || 'Lokasi Terpilih';
                    const wilayah = geoData?.wilayah || 'Jakarta Pusat';
                    const kecamatan = geoData?.kecamatan || '-';

                    const promptText = 
`📍 *LOKASI GPS BERHASIL DITERIMA*
────────────────────────────
• Gedung / Area: *${venue}*
• Kecamatan    : *${kecamatan}*
• Wilayah      : *${wilayah}*
• Koordinat    : \`${latitude}, ${longitude}\`

Lokasi ini telah dikaitkan dengan akun PIC Anda (*${verifyResult.pic_name}*). Silakan lanjutkan pengisian formulir acara atau ketik detail acaranya:

_Contoh:_
Nama Event: ${verifyResult.event_name || 'Festival Musik'}
Kategori: Festival
Waktu: 20 Oktober 2026
Estimasi Pengunjung: 10000`;

                    await Hanz.sendMessage(sender, { text: promptText }, { quoted: msg });
                } else {
                    await Hanz.sendMessage(sender, {
                        text: `📍 *Titik Lokasi Terdeteksi:* \`${latitude}, ${longitude}\`\nArea: *${geoData?.venue_name || 'DKI Jakarta'}* (${geoData?.wilayah || 'Jakarta'})\n\nJika ingin melaporkan tumpukan sampah di titik ini, kirimkan foto sampah dengan caption *!lapor* atau ceritakan langsung ke saya.`
                    }, { quoted: msg });
                }
                continue;
            }

            // Handle E-Waste & Bulky Waste commands
            if (['ewaste', 'e-waste', 'limbah_elektronik'].includes(command.name)) {
                const { handleSpecialWaste } = require('../cmd_samling/special_waste.cjs');
                await handleSpecialWaste({ Hanz, msg, sender, type: 'ewaste' });
                continue;
            }
            if (['bulky', 'bulkywaste', 'bulky_waste', 'sampah_besar'].includes(command.name)) {
                const { handleSpecialWaste } = require('../cmd_samling/special_waste.cjs');
                await handleSpecialWaste({ Hanz, msg, sender, type: 'bulky' });
                continue;
            }

            // Handle cek status & lihat_laporan command
            if (command.name === 'cekstatus' || command.name === 'lihat_laporan') {
                const cekStatusHandler = require('../cmd_samling/cek_status.cjs');
                // ponytail: lihat_laporan = alias cekstatus, rewrite command name
                const effectiveCommand = command.name === 'lihat_laporan'
                    ? { ...command, name: 'cekstatus' }
                    : command;
                try {
                    await cekStatusHandler({
                        Hanz, msg, sender,
                        senderNumber: getSenderNumber(sender, msg),
                        pushname: msg.pushName || 'Kak',
                        isGroup: isGroup(sender),
                        isOwner: checkOwner,
                        isSuperOwner: checkSuperOwner,
                        isCoOwner: checkCoOwner,
                        command: effectiveCommand, text,
                        reply: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                    });
                } catch (error) {
                    console.error(chalk.red('[CEKSTATUS-ERROR]'), error);
                    await Hanz.sendMessage(sender, { text: '❌ Terjadi kesalahan saat memproses cek status.' });
                }
                continue;
            }
            
            const handler = plugins.get(command.name);

            if (handler) {
                if (!checkSuperOwner && !checkOwner && !COOLDOWN_EXEMPT.has(command.name)) {
                    const cooldownKey = `${sender}:${command.name}`;
                    const lastUsed = cooldownMap.get(cooldownKey) || 0;
                    const remaining = COOLDOWN_MS - (Date.now() - lastUsed);

                    if (remaining > 0) {
                        await Hanz.sendMessage(sender, {
                            text: `⏳ Sabar dulu! Tunggu *${(remaining / 1000).toFixed(1)} detik* lagi sebelum pakai command ini.`
                        }, { quoted: msg });
                        continue;
                    }

                    cooldownMap.set(cooldownKey, Date.now());
                }

                const cmdArgs = command.args.length ? ' ' + command.args.join(' ') : '';

                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(
                    chalk.green(`[EXECUTE] `) +
                    chalk.yellow(`${command.name}${cmdArgs}`)
                );

                try {
                    await handler({
                        Hanz, msg, sender,
                        senderNumber: getSenderNumber(sender, msg),
                        pushname: msg.pushName || 'Kak',
                        isGroup: isGroup(sender),
                        isOwner: checkOwner,
                        isSuperOwner: checkSuperOwner,
                        isCoOwner: checkCoOwner,
                        command, text,
                        fakeOrder,
                        isMain,
                        reply: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                        replyFake: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content, { quoted: fakeOrder }),
                        send: (content) => Hanz.sendMessage(sender, typeof content === 'string' ? { text: content } : content),
                        sendButtons: (content) => sendButtons(Hanz, sender, content),
                        sendList: (content) => sendListMessage(Hanz, sender, content),
                        sendInteractive: (content) => sendInteractiveMessage(Hanz, sender, content),
                        sendButtonWithImage: (content) => sendButtonWithImage(Hanz, sender, content),
                        sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, sender, content),
                        react: (emoji) => Hanz.sendMessage(sender, { react: { text: emoji, key: msg.key } }),
                    });
                } catch (err) {
                    readline.clearLine(process.stdout, 0);
                    readline.cursorTo(process.stdout, 0);

                    console.error(
                        chalk.red(`[RUN-ERROR] `) +
                        chalk.yellow(`[${command.name}]: `) +
                        chalk.red(err.message)
                    );
                    await Hanz.sendMessage(sender, { text: '❌ Terjadi kesalahan saat menjalankan perintah.' });
                }
            } else {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(
                    chalk.magenta(`[NOT-FOUND] `) +
                    chalk.white(`Command `) +
                    chalk.yellow(`*${command.name}*`) +
                    chalk.white(` tidak terdaftar.`)
                );
                await Hanz.sendMessage(sender, { text: `❓ Command *${command.name}* tidak ditemukan.` });
            }
        }

        // AI Chatbot Fallback - responds to non-command messages
        // Skip if: command detected, bot message, or starts with prefix
        if (!command && text && !fromMe && !text.startsWith(config.prefix)) {
            // Group Whitelist Check: AI only responds in whitelisted groups or DM
            if (isGroup(sender) && !groupWhitelist.isWhitelisted(sender)) {
                console.log('[AI] Skipping non-whitelisted group:', sender);
                continue;
            }

            try {
                console.log('[AI] Processing message from', phoneNumber, ':', text.substring(0, 50));
                
                // Load custom persona if exists
                const aiPersona = require('../services/ai-persona.cjs');
                const personaData = aiPersona.getPersona(phoneNumber);
                
                // Ambil info role pengguna secara real-time untuk memperkaya system prompt AI
                let userRoleHint = 'Masyarakat / Warga Umum';
                let roleDetails = '';
                try {
                    const tps3rService = require('../services/tps3rService.cjs');
                    const eventService = require('../services/eventService.cjs');
                    const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
                    const [offCheck, picCheck] = await Promise.all([
                        tps3rService.verifyOfficer(cleanPhone).catch(() => ({ authorized: false })),
                        eventService.verifyPicSender(cleanPhone).catch(() => ({ authorized: false }))
                    ]);
                    if (offCheck?.authorized) {
                        userRoleHint = `Petugas TPS 3R Resmi (Nama: ${offCheck.name || '-'}, Fasilitas: ${offCheck.zone_name || '-'}, Zone ID: ${offCheck.zone_id || '-'})`;
                    } else if (picCheck?.authorized) {
                        userRoleHint = `Panitia / PIC Event Resmi Terverifikasi (Nama: ${picCheck.pic_name || '-'}, Agenda Terdaftar: ${picCheck.event_name || '-'}, Whitelist ID: ${picCheck.whitelist_id || '-'})`;
                    } else {
                        // Cek apakah pernah melapor atau status non-aktif
                        if (picCheck?.status === 'Sudah Melapor') {
                            roleDetails += `\n- Riwayat PIC Event: Pernah menjadi PIC untuk agenda "${picCheck.event_name || '-'}" dengan nama "${picCheck.pic_name || '-'}", namun statusnya saat ini SUDAH MELAPOR (tidak aktif lagi untuk mendaftar event baru tanpa izin/rekomendasi baru dari DLH).`;
                        } else {
                            roleDetails += `\n- Riwayat PIC Event: Nomor TIDAK TERDAFTAR di whitelist PIC event resmi DLH DKI Jakarta.`;
                        }
                        if (offCheck?.message) {
                            roleDetails += `\n- Status TPS 3R: Nomor TIDAK TERDAFTAR sebagai Petugas Lapangan TPS 3R resmi.`;
                        }
                    }
                } catch (e) {}

                // Generate system prompt with custom persona if available
                let customPrompt = personaData
                    ? getSystemPrompt(personaData.persona)
                    : getSystemPrompt();
                
                customPrompt += `\n\n[STATUS IDENTITAS USER SAAT INI]\n- Nomor WA: ${phoneNumber}\n- Peran Terverifikasi di Sistem: ${userRoleHint}${roleDetails}\n\n[ATURAN PENTING VALIDASI ROLE & RESPON NON-MONOTON]:
1. JIKA USER BUKAN PIC EVENT ATAU STATUSNYA 'Sudah Melapor', DAN USER MENYATAKAN INGIN LAPOR/DAFTAR EVENT:
   - JANGAN langsung lempar [ACTION:menu] tanpa teks penjelasan!
   - Jawab secara manusiawi, ramah, santai tapi tegas:
     * Jika statusnya "Sudah Melapor" pada agenda sebelumnya: jelaskan bahwa hak akses PIC untuk kegiatan tersebut sudah selesai/kedaluwarsa karena laporan telah disubmit sebelumnya. Jika ada kegiatan baru, arahkan untuk berkoordinasi dan mengajukan rekomendasi baru ke Dinas Lingkungan Hidup DKI Jakarta.
     * Jika belum pernah terdaftar: jelaskan bahwa nomornya belum terdaftar di whitelist panitia event resmi DLH, dan terangkan prosedur registrasi PIC ke DLH.
   - Di baris paling akhir pesan, sertakan tag [ACTION:menu] agar menu utama tetap ditampilkan di bawah pesan penjelasanmu sebagai panduan.

2. JIKA USER BUKAN PETUGAS TPS 3R, DAN USER MENYATAKAN INGIN LAPOR TIMBANGAN / TPS 3R:
   - JANGAN langsung lempar [ACTION:menu] tanpa teks penjelasan!
   - Jawab secara ramah dan manusiawi bahwa nomornya belum terdaftar sebagai Petugas Lapangan TPS 3R di sistem Samling DLH Jakarta. Terangkan bahwa fitur pencatatan timbangan limbah khusus bagi petugas fasilitas resmi yang ditugaskan, lalu arahkan bahwa warga biasa dapat melaporkan sampah liar via fitur !lapor.
   - Di baris paling akhir pesan, sertakan tag [ACTION:menu] agar menu utama tetap ditampilkan di bawah penjelasanmu.`;
                
                // Get custom temperature if available
                const temperature = personaData ? personaData.temperature : null;
                
                const aiReply = await ai.chat(phoneNumber, text, customPrompt, temperature);
                if (aiReply) {
                    // Parse action from AI response
                    const { text: aiText, action } = ai.parseActionFromResponse(aiReply);
                    
                    // Send AI text response
                    // Tetap kirimkan aiText jika ada penjelasan yang perlu dibaca pengguna (termasuk sebelum menu ditampilkan)
                    const isPureActionCard = ['lapor', 'lapor_sampah', 'tps3r_template'].includes(action?.name);
                    if (aiText && !isPureActionCard) {
                        await Hanz.sendMessage(remoteJid, { text: aiText }, { quoted: msg });
                        console.log('[AI] Reply sent to', phoneNumber);
                    }
                    
                    // Execute action if present
                    if (action) {
                        console.log('[AI-AGENT] Executing action:', action.name, action.param || '');
                        try {
                            await executeAIAction(action, msg, remoteJid, phoneNumber, Hanz, plugins);
                        } catch (actionError) {
                            console.error('[AI-AGENT] Action error:', actionError.message);
                        }
                    }
                }
            } catch (aiError) {
                console.error('[AI] Error:', aiError.message);
                // Don't crash - just skip AI response
            }
        }

        if (config.autoTyping && !isGroup(sender)) await Hanz.sendPresenceUpdate('paused', sender);
    }
}

async function handleGroupParticipants(Hanz, update) {
    const { id: groupJid, participants, action } = update;

    for (const jid of participants) {
        const number = jid.split('@')[0];

        if (action === 'add' && global.welcomeGroups?.get(groupJid)) {
            await Hanz.sendMessage(groupJid, {
                text: `Selamat datang @${number} di grup ini!`,
                mentions: [jid]
            });
        }

        if (action === 'remove' && global.goodbyeGroups?.get(groupJid)) {
            await Hanz.sendMessage(groupJid, {
                text: `Sampai jumpa @${number}, semoga sukses!`,
                mentions: [jid]
            });
        }
    }
}

/**
 * Execute AI-triggered actions
 * Called when AI response contains [ACTION:xxx] tag
 */
async function executeAIAction(action, msg, remoteJid, phoneNumber, Hanz, plugins) {
    switch (action.name) {
        case 'menu': {
            // Execute samling menu plugin
            const samlingPlugin = plugins.get('samling');
            if (samlingPlugin) {
                await samlingPlugin({
                    Hanz, msg, sender: remoteJid,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'Kak',
                    isGroup: isGroup(remoteJid),
                    isOwner: isOwner(remoteJid, msg),
                    isSuperOwner: isSuperOwner(remoteJid, msg),
                    isCoOwner: isCoOwner(remoteJid, msg),
                    command: { name: 'samling', args: [], fullArgs: '', raw: 'samling', hasPrefix: false },
                    text: 'samling',
                    fakeOrder,
                    reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                    send: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content),
                    sendInteractive: (content) => sendInteractiveMessage(Hanz, remoteJid, content),
                    sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, remoteJid, content),
                });
            }
            break;
        }
        case 'ewaste': {
            const { handleSpecialWaste } = require('../cmd_samling/special_waste.cjs');
            await handleSpecialWaste({ Hanz, msg, sender: remoteJid, type: 'ewaste' });
            break;
        }
        case 'bulky':
        case 'bulky_waste': {
            const { handleSpecialWaste } = require('../cmd_samling/special_waste.cjs');
            await handleSpecialWaste({ Hanz, msg, sender: remoteJid, type: 'bulky' });
            break;
        }
        case 'lapor':
        case 'lapor_sampah': {
            let kondisi = action.param || '';
            console.log('[AI-AGENT] Executing lapor/lapor_sampah with condition:', kondisi);
            
            // JIKA parameter dari AI hanya placeholder generik (seperti 'penumpukan_sampah' atau kosong)
            // padahal user baru bertanya "bagaimana caranya/langkahnya", jangan paksa isi 'penumpukan_sampah'!
            if (!kondisi || /^(penumpukan_sampah|sampah|lapor|aduan)$/i.test(kondisi.trim())) {
                kondisi = 'Penumpukan sampah liar di lokasi';
            }
            
            // Execute lapor plugin directly dengan kondisi dari AI
            const laporHandler = require('../cmd_samling/lapor.cjs');
            const modifiedCommand = {
                name: 'lapor',
                args: kondisi.split(' '),
                fullArgs: kondisi,
                raw: `!lapor ${kondisi}`,
                hasPrefix: true
            };
            
            try {
                await laporHandler({
                    Hanz, msg, sender: remoteJid,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'Kak',
                    isGroup: isGroup(remoteJid),
                    isOwner: isOwner(remoteJid, msg),
                    isSuperOwner: isSuperOwner(remoteJid, msg),
                    isCoOwner: isCoOwner(remoteJid, msg),
                    command: modifiedCommand,
                    text: `!lapor ${kondisi}`,
                    fromMe: false
                });
            } catch (error) {
                console.error('[AI-AGENT] Lapor execution error:', error.message);
                await Hanz.sendMessage(remoteJid, {
                    text: '❌ Terjadi kesalahan saat memproses laporan. Silakan coba lagi.'
                }, { quoted: msg });
            }
            break;
        }
        case 'tps3r_template': {
            console.log('[AI-AGENT] Checking permission for tps3r_template:', phoneNumber);
            const tps3rService = require('../services/tps3rService.cjs');
            const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
            const authRes = await tps3rService.verifyOfficer(cleanPhone);

            if (!authRes?.authorized && !authRes?.data?.authorized) {
                await Hanz.sendMessage(remoteJid, {
                    text: `❌ *AKSES DITOLAK: BUKAN PETUGAS TPS 3R*\n\n` +
                          `Mohon maaf, nomor WhatsApp Anda (+${phoneNumber}) belum terdaftar sebagai Petugas Lapangan TPS 3R resmi di sistem Samling AI DLH Jakarta.\n\n` +
                          `📌 Fitur pencatatan timbangan hanya untuk petugas lapangan. Warga masyarakat dapat menggunakan menu *!lapor* untuk pengaduan sampah.`
                }, { quoted: msg });
                break;
            }

            const tps3rHandler = require('../cmd_samling/tps3r.cjs');
            await tps3rHandler({
                Hanz, msg, sender: remoteJid,
                senderNumber: phoneNumber,
                pushname: msg.pushName || 'Petugas',
                command: { name: 'timbangan', args: [], fullArgs: '', raw: 'timbangan', hasPrefix: false },
                text: 'timbangan',
                reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                send: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content),
                fakeOrder
            });
            break;
        }
        case 'lapor_event':
        case 'lapor_kegiatan': {
            const deskripsi = action.param || '';
            console.log('[AI-AGENT] Checking permission for lapor_event:', phoneNumber);

            const eventService = require('../services/eventService.cjs');
            const cleanPhone = eventService.normalizePhone(phoneNumber);
            const verifyResult = await eventService.verifyPicSender(cleanPhone);

            if (!verifyResult || !verifyResult.authorized) {
                const reason = verifyResult?.message || 'Nomor WhatsApp Anda belum terdaftar di whitelist PIC Event DLH Jakarta.';
                await Hanz.sendMessage(remoteJid, {
                    text: `⚠️ *Akses Ditolak: Belum Terdaftar di Whitelist*\n\n` +
                          `${reason}\n\n` +
                          `📌 *Petunjuk:* Pastikan Anda telah berkoordinasi dan didaftarkan oleh admin/petugas Dinas Lingkungan Hidup (DLH) DKI Jakarta sebelum mendaftarkan event.`
                }, { quoted: msg });
                break;
            }

            const eventPicHandler = require('../cmd_samling/event_pic.cjs');
            try {
                await eventPicHandler.execute({
                    Hanz, msg, sender: remoteJid,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'PIC',
                    text: deskripsi ? `!lapor_event ${deskripsi}` : '!lapor_event',
                    command: { name: 'lapor_event' }
                });
            } catch (error) {
                console.error('[AI-AGENT] Lapor_event execution error:', error.message);
                await Hanz.sendMessage(remoteJid, {
                    text: '❌ Terjadi kesalahan saat memproses laporan event. Silakan coba lagi.'
                }, { quoted: msg });
            }
            break;
        }
        case 'event_live_update': {
            const eventService = require('../services/eventService.cjs');
            // param format: <id>:<attendees>:<level>:<notes>
            const [eventId, actualAttendees, rawLevel, ...notes] = (action.param || '').split(':');
            if (!eventId) {
                await Hanz.sendMessage(remoteJid, { text: '⚠️ ID event tidak ditemukan untuk update.' }, { quoted: msg });
                break;
            }
            const validLevels = ['Rendah', 'Sedang', 'Padat', 'Sangat Padat'];
            const matchedLevel = validLevels.find(l => l.toLowerCase() === (rawLevel || '').toLowerCase()) || 'Sedang';

            try {
                const res = await eventService.updateEventHariH(eventId, {
                    actual_attendees: parseInt(actualAttendees, 10) || 0,
                    crowd_level: matchedLevel,
                    crowd_condition: notes.join(':') || 'Update otomatis via AI assistant',
                    pic_phone: phoneNumber
                });
                const d = res.data || {};
                await Hanz.sendMessage(remoteJid, {
                    text: `✅ *LIVE UPDATE EVENT BERHASIL DICATAT*\n\n` +
                          `🆔 *ID Event:* #${d.id || eventId}\n` +
                          `🎪 *Nama Event:* ${d.name || '-'}\n` +
                          `👥 *Pengunjung Riil:* ${Number(d.actual_attendees || actualAttendees || 0).toLocaleString('id-ID')} orang\n` +
                          `🔥 *Tingkat Kerumunan:* ${d.crowd_level || matchedLevel}\n` +
                          `📝 *Kondisi:* ${d.crowd_condition || '-'}\n\n` +
                          `💡 Heatmap Spasial DLH telah diperbarui secara real-time.`
                }, { quoted: msg });
            } catch (err) {
                console.error('[AI-AGENT] event_live_update error:', err.message);
                await Hanz.sendMessage(remoteJid, { text: `❌ Gagal update event #${eventId}: ${err.message}` }, { quoted: msg });
            }
            break;
        }
        case 'daftar_wilayah': {
            const wilayahPlugin = plugins.get('daftar_wilayah');
            if (wilayahPlugin) {
                await wilayahPlugin({
                    Hanz, msg, sender: remoteJid,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'Kak',
                    isGroup: isGroup(remoteJid),
                    isOwner: isOwner(remoteJid, msg),
                    isSuperOwner: isSuperOwner(remoteJid, msg),
                    isCoOwner: isCoOwner(remoteJid, msg),
                    command: { name: 'daftar_wilayah', args: [], fullArgs: '', raw: 'daftar_wilayah', hasPrefix: false },
                    text: 'daftar_wilayah',
                    fakeOrder,
                    reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                    send: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content),
                    sendButtons: (content) => sendButtons(Hanz, remoteJid, content),
                    sendList: (content) => sendListMessage(Hanz, remoteJid, content),
                    sendInteractive: (content) => sendInteractiveMessage(Hanz, remoteJid, content),
                    sendButtonWithImage: (content) => sendButtonWithImage(Hanz, remoteJid, content),
                    sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, remoteJid, content),
                    react: (emoji) => Hanz.sendMessage(remoteJid, { react: { text: emoji, key: msg.key } }),
                });
            }
            break;
        }
        case 'daftar_tps': {
            // Safe redirect: data TPS harus melalui alur hierarki wilayah resmi
            const wilayahPlugin = plugins.get('daftar_wilayah') || plugins.get('daftar_tps');
            if (wilayahPlugin) {
                await wilayahPlugin({
                    Hanz, msg, sender: remoteJid,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'Kak',
                    isGroup: isGroup(remoteJid),
                    isOwner: isOwner(remoteJid, msg),
                    isSuperOwner: isSuperOwner(remoteJid, msg),
                    isCoOwner: isCoOwner(remoteJid, msg),
                    command: { name: 'daftar_wilayah', args: [], fullArgs: '', raw: 'daftar_wilayah', hasPrefix: false },
                    text: 'daftar_wilayah',
                    fakeOrder,
                    reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                    send: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content),
                    sendButtons: (content) => sendButtons(Hanz, remoteJid, content),
                    sendList: (content) => sendListMessage(Hanz, remoteJid, content),
                    sendInteractive: (content) => sendInteractiveMessage(Hanz, remoteJid, content),
                    sendButtonWithImage: (content) => sendButtonWithImage(Hanz, remoteJid, content),
                    sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, remoteJid, content),
                    react: (emoji) => Hanz.sendMessage(remoteJid, { react: { text: emoji, key: msg.key } }),
                });
            }
            break;
        }
        case 'daftar_tpa': {
            // Safe redirect: tampilkan info TPA resmi (TPST Bantar Gebang)
            const tpaPlugin = plugins.get('daftar_tpa_jkt') || plugins.get('daftar_tpa') || plugins.get('daftar_wilayah');
            if (tpaPlugin) {
                await tpaPlugin({
                    Hanz, msg, sender: remoteJid,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'Kak',
                    isGroup: isGroup(remoteJid),
                    isOwner: isOwner(remoteJid, msg),
                    isSuperOwner: isSuperOwner(remoteJid, msg),
                    isCoOwner: isCoOwner(remoteJid, msg),
                    command: { name: 'daftar_tpa_jkt', args: [], fullArgs: '', raw: 'daftar_tpa_jkt', hasPrefix: false },
                    text: 'daftar_tpa_jkt',
                    fakeOrder,
                    reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                    send: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content),
                    sendButtons: (content) => sendButtons(Hanz, remoteJid, content),
                    sendList: (content) => sendListMessage(Hanz, remoteJid, content),
                    sendInteractive: (content) => sendInteractiveMessage(Hanz, remoteJid, content),
                    sendButtonWithImage: (content) => sendButtonWithImage(Hanz, remoteJid, content),
                    sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, remoteJid, content),
                    react: (emoji) => Hanz.sendMessage(remoteJid, { react: { text: emoji, key: msg.key } }),
                });
            }
            break;
        }
        case 'cekstatus': {
            if (action.param) {
                // Execute cek status with ID
                const cekPlugin = require('../cmd_samling/cek_status.cjs');
                const modifiedCommand = {
                    name: 'cekstatus',
                    args: [action.param],
                    fullArgs: action.param,
                    raw: `cekstatus ${action.param}`,
                    hasPrefix: false
                };
                await cekPlugin({
                    Hanz, msg, sender: remoteJid,
                    senderNumber: phoneNumber,
                    pushname: msg.pushName || 'Kak',
                    isGroup: isGroup(remoteJid),
                    isOwner: isOwner(remoteJid, msg),
                    isSuperOwner: isSuperOwner(remoteJid, msg),
                    isCoOwner: isCoOwner(remoteJid, msg),
                    command: modifiedCommand,
                    text: `cekstatus ${action.param}`,
                    reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                });
            }
            break;
        }
        case 'tps3r_today':
        case 'tps3r_target': {
            const tps3rHandler = require('../cmd_samling/tps3r.cjs');
            await tps3rHandler({
                Hanz, msg, sender: remoteJid,
                senderNumber: phoneNumber,
                pushname: msg.pushName || 'Petugas',
                fakeOrder,
                isGroup: isGroup(remoteJid),
                isOwner: isOwner(remoteJid, msg),
                isSuperOwner: isSuperOwner(remoteJid, msg),
                isCoOwner: isCoOwner(remoteJid, msg),
                command: {
                    name: 'tps3r_today',
                    args: action.param ? [action.param] : [],
                    fullArgs: action.param || '',
                    raw: `tps3r_today ${action.param || ''}`.trim(),
                    hasPrefix: false
                },
                text: `tps3r_today ${action.param || ''}`.trim(),
                reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, remoteJid, content),
            });
            break;
        }
        case 'tps3r_weekly':
        case 'tps3r_rekap': {
            const tps3rHandler = require('../cmd_samling/tps3r.cjs');
            await tps3rHandler({
                Hanz, msg, sender: remoteJid,
                senderNumber: phoneNumber,
                pushname: msg.pushName || 'Petugas',
                fakeOrder,
                isGroup: isGroup(remoteJid),
                isOwner: isOwner(remoteJid, msg),
                isSuperOwner: isSuperOwner(remoteJid, msg),
                isCoOwner: isCoOwner(remoteJid, msg),
                command: {
                    name: 'tps3r_weekly',
                    args: action.param ? [action.param] : [],
                    fullArgs: action.param || '',
                    raw: `tps3r_weekly ${action.param || ''}`.trim(),
                    hasPrefix: false
                },
                text: `tps3r_weekly ${action.param || ''}`.trim(),
                reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, remoteJid, content),
            });
            break;
        }
        case 'tps3r_history':
        case 'tps3r_riwayat': {
            const tps3rHandler = require('../cmd_samling/tps3r.cjs');
            await tps3rHandler({
                Hanz, msg, sender: remoteJid,
                senderNumber: phoneNumber,
                pushname: msg.pushName || 'Petugas',
                fakeOrder,
                isGroup: isGroup(remoteJid),
                isOwner: isOwner(remoteJid, msg),
                isSuperOwner: isSuperOwner(remoteJid, msg),
                isCoOwner: isCoOwner(remoteJid, msg),
                command: {
                    name: 'tps3r_history',
                    args: action.param ? [action.param] : [],
                    fullArgs: action.param || '',
                    raw: `tps3r_history ${action.param || ''}`.trim(),
                    hasPrefix: false
                },
                text: `tps3r_history ${action.param || ''}`.trim(),
                reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                sendInteractiveWithImage: (content) => sendInteractiveWithImage(Hanz, remoteJid, content),
            });
            break;
        }
        case 'tps3r_detail': {
            const tps3rHandler = require('../cmd_samling/tps3r.cjs');
            await tps3rHandler({
                Hanz, msg, sender: remoteJid,
                senderNumber: phoneNumber,
                pushname: msg.pushName || 'Petugas',
                fakeOrder,
                isGroup: isGroup(remoteJid),
                isOwner: isOwner(remoteJid, msg),
                isSuperOwner: isSuperOwner(remoteJid, msg),
                isCoOwner: isCoOwner(remoteJid, msg),
                command: {
                    name: 'tps3r_detail',
                    args: action.param ? [action.param] : [],
                    fullArgs: action.param || '',
                    raw: `tps3r_detail ${action.param || ''}`.trim(),
                    hasPrefix: false
                },
                text: `tps3r_detail ${action.param || ''}`.trim(),
                reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
            });
            break;
        }
        case 'tps3r_input':
        case 'tps3r_report':
        case 'lapor_tps3r': {
            const tps3rHandler = require('../cmd_samling/tps3r.cjs');
            await tps3rHandler({
                Hanz, msg, sender: remoteJid,
                senderNumber: phoneNumber,
                pushname: msg.pushName || 'Petugas',
                isGroup: isGroup(remoteJid),
                isOwner: isOwner(remoteJid, msg),
                isSuperOwner: isSuperOwner(remoteJid, msg),
                isCoOwner: isCoOwner(remoteJid, msg),
                command: {
                    name: 'tps3r_input',
                    args: action.param ? [action.param] : [],
                    fullArgs: action.param || '',
                    raw: `tps3r_input ${action.param || ''}`.trim(),
                    hasPrefix: false
                },
                text: `tps3r_input ${action.param || ''}`.trim(),
                reply: (content) => Hanz.sendMessage(remoteJid, typeof content === 'string' ? { text: content } : content, { quoted: msg }),
                fakeOrder
            });
            break;
        }
        default:
            console.log('[AI-AGENT] Unknown action:', action.name);
    }
}

module.exports = handleMessages;
module.exports.resolveOwnerLids = resolveOwnerLids;
module.exports.handleGroupParticipants = handleGroupParticipants;