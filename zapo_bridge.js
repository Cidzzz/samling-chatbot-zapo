// cb2/zapo_bridge.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const config = require('./src/config.cjs');
const handleMessages = require('./src/handlers/messageHandler.cjs');
import { getContactByJid } from './db/contacts.js';
import { isLidJid } from 'zapo-js';

export async function bridgeZapoMessage(sock, m) {
  if (!m || m.isFromMe) return;

  // Resolusi pengirim LID ke nomor asli
  let rawSender = m.sender || m.chat || '';
  let cleanNum = rawSender.split('@')[0].split(':')[0];

  if (isLidJid(rawSender) || rawSender.endsWith('@lid')) {
    const contact = getContactByJid(rawSender);
    if (contact?.phoneNumber) {
      cleanNum = contact.phoneNumber;
    } else if (contact?.jid && !isLidJid(contact.jid)) {
      cleanNum = contact.jid.split('@')[0].split(':')[0];
    }
  }

  const senderJid = cleanNum.includes('@') ? cleanNum : `${cleanNum}@s.whatsapp.net`;
  const isSuperOwner = cleanNum.startsWith(config.superOwner || '62859195391196') || (config.ownerNumber && cleanNum.startsWith(config.ownerNumber));

  // Build Baileys-compatible m wrapper for Samling handlers
    const fakeM = {
    key: m.key,
    message: m.raw?.message || { conversation: m.text },
    chat: m.chat,
    from: m.chat,
    sender: senderJid,
    senderNumber: cleanNum,
    pushName: m.pushName || 'Warga',
    isGroup: m.isGroup,
    type: m.type,
    text: m.text || '',
    body: m.text || '',
    isOwner: isSuperOwner,
    isSuperOwner: isSuperOwner,
    reply: async (text, options = {}) => {
      if (typeof text === 'string') {
        return await m.reply(text);
      }
      return await sock.message.send(m.chat, text);
    },
    sendInteractiveWithImage: async (content) => {
      const { sendInteractiveWithImage } = require('./src/utils/interactiveHelper.cjs');
      return await sendInteractiveWithImage(fakeHanz, m.chat, content);
    },
    sendInteractive: async (content) => {
      const { sendInteractiveMessage } = require('./src/utils/interactiveHelper.cjs');
      return await sendInteractiveMessage(fakeHanz, m.chat, content);
    },
    download: async () => {
      if (typeof m.download === 'function') {
        const res = await m.download();
        return res ? Buffer.from(res) : null;
      }
      return null;
    },
  };

  // Fake Baileys Hanz socket with full mock compatibility
  const fakeHanz = {
    user: sock.user,
    rawSock: sock,
    sendMessage: async (jid, content, options = {}) => {
      if (typeof content === 'string') {
        return await sock.message.send(jid, content);
      }
      if (content?.text) {
        return await sock.message.send(jid, content.text);
      }
      if (content?.image) {
        return await sock.message.send(jid, {
          type: 'image',
          media: content.image,
          caption: content.caption || ''
        });
      }
      return await sock.message.send(jid, content);
    },
    relayMessage: async (jid, message, options = {}) => {
      return await sock.message.send(jid, message);
    },
    readMessages: async (keys) => {
      return true; // No-op safe stub
    },
    sendPresenceUpdate: async (type, jid) => {
      return true; // No-op safe stub
    },
    onWhatsApp: async (jid) => {
      const num = String(jid).replace(/\D/g, '');
      return [{ exists: true, jid: `${num}@s.whatsapp.net` }];
    }
  };

  try {
    await handleMessages(fakeHanz, { messages: [fakeM], type: 'notify' });
  } catch (err) {
    console.error('[ZAPO-SAMLING BRIDGE ERROR]:', err?.stack || err?.message || err);
  }
}
