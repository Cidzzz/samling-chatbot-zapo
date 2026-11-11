// src/messageHandler.js

import chalk from 'chalk'
import path from 'path'
import { fileURLToPath } from 'url'
import { getContentType } from 'zapo-js'
import {
  serializeMessage,
  logPesanMasuk,
  logRawDebug,
  extractIdentityPair,
  normalizeJid,
  extractCommand
} from '../handler.js'
import { detectMediaType } from '../lib/utils.js'
import { loadPlugins, reloadGlobalPlugins } from '../lib/loadPlugins.js'
import { sendErrorToOwner } from '../lib/utils.js'
import { config } from '../settings.js'
import { saveRawMessage } from '../db/rawMessage.js'
import { saveOrUpdateContact } from '../db/contacts.js'
import { isLocked } from '../lib/lockState.js'
import { isTrustedFeature } from '../db/trustedFeatures.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGINS_DIR = path.join(__dirname, '..', 'plugins')

const TYPING_REFRESH = 8_000

function extractArgs(m) {
  if (!m.command) return []
  const stripped = m.text.slice(m.prefix.length + m.command.length).trim()
  return stripped ? stripped.split(/\s+/) : []
}

function serializeOutgoing(sendEvent, sock) {
  if (!sendEvent?.id || !sendEvent?.to) return null

  const messageType = getContentType(sendEvent.message)
  if (!messageType) return null

  const content = sendEvent.message[messageType]

  const text =
    sendEvent.message.conversation ??
    content?.text ??
    content?.caption ??
    null

  const mime = content?.mimetype || ''
  const senderJid = normalizeJid(sock.user?.id)
  const { prefix, command } = extractCommand(text)

  return {
    raw: sendEvent,
    id: sendEvent.id,
    chat: sendEvent.to,
    sender: senderJid,
    pushName: sock.user?.name || sock.user?.pushName || 'Bot',
    isGroup: sendEvent.to?.endsWith('@g.us') ?? false,
    isFromMe: true,
    type: messageType,
    prefix,
    command,
    text,
    isMedia: !!mime,
    mediaType: detectMediaType(mime)
  }
}

import { downloadTikTok } from '../plugins/tools/tiktok.js'
import { downloadInstagram } from '../plugins/tools/instagram.js'

async function handleAutoLinkDownload(m, sock) {
  if (!m || m.isBot || !m.text) return false
  const text = m.text.trim()
  if (text.startsWith('.') || text.startsWith('#') || text.startsWith('/') || text.startsWith('!')) return false

  // Deteksi TikTok (vt, vm, www, mobile, dll)
  const ttRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\/[^\s]+/i
  const ttMatch = text.match(ttRegex)
  if (ttMatch) {
    const data = await downloadTikTok(ttMatch[0])
    if (data && data.buffer) {
      await sock.message.send(m.chat, {
        type: 'video',
        media: data.buffer,
        mimetype: 'video/mp4',
        caption: `*TIKTOK DOWNLOADER*\n\n📌 *Judul:* ${data.title}\n© cidz raja • cidz assist`
      }, { quote: m.raw })
      return true
    }
  }

  // Deteksi Instagram (reel, p, tv, reels, share)
  const igRegex = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv|reels|share)\/[^\s]+/i
  const igMatch = text.match(igRegex)
  if (igMatch) {
    const data = await downloadInstagram(igMatch[0])
    if (data && data.buffers && data.buffers.length > 0) {
      for (const buf of data.buffers) {
        await sock.message.send(m.chat, {
          type: 'video',
          media: buf,
          mimetype: 'video/mp4',
          caption: `*INSTAGRAM DOWNLOADER*\n\n© cidz raja • cidz assist`
        }, { quote: m.raw })
      }
      return true
    }
  }

  return false
}

async function processCommand(m, sock) {
  // Cek auto-link download terlebih dahulu untuk pesan teks apapun (TikTok/IG)
  const isAutoLinkHandled = await handleAutoLinkDownload(m, sock).catch(() => false)
  if (isAutoLinkHandled) return

  if (!m.command) return

  const plugin = global.plugins?.get(m.command)
  if (!plugin) return

  const trusted = m.isGroup && (isTrustedFeature(m.chat, plugin.command) || isTrustedFeature(m.sender, plugin.command))

  // Mode: Private chat hanya untuk owner. Di grup terbuka untuk siapapun.
  if (!m.isGroup && !m.isOwner) return
  if (isLocked() && plugin.command !== 'lock') return

  // Proteksi Kategori Khusus: owner, chanel/channel, dan tools hanya untuk owner
  const restrictedCategories = ['owner', 'chanel', 'channel', 'tools']
  if (restrictedCategories.includes((plugin.category || '').toLowerCase()) && !m.isOwner) {
    return
  }

  const isGroupOnly = plugin.groupOnly || plugin.onlyGroup
  if (isGroupOnly && !m.isGroup) return m.reply(config.pesan.groupOnly)

  if (!m.isOwner && !trusted) {
    const isOwnerOnly = plugin.ownerOnly || plugin.onlyOwner
    const isPrivateOnly = plugin.privateOnly || plugin.onlyPrivate
    const isAdminOnly = plugin.adminOnly || plugin.onlyAdmin

    if (isOwnerOnly && !m.isOwner) return m.reply(config.pesan.ownerOnly)
    if (isPrivateOnly && m.isGroup) return m.reply(config.pesan.privateOnly)
    if (isAdminOnly && !m.isGroup) return m.reply(config.pesan.groupOnly)
    if (isAdminOnly && !m.isAdmin) return m.reply(config.pesan.adminOnly)
  }

  const args = extractArgs(m)
  m.args = args

  console.log(chalk.magenta(`[CMD] -> .${m.command} ${args.join(' ')}`.trim()))

  if (plugin.wait) await m.reply(config.pesan.wait)

  const context = { sock, args, plugins: global.plugins }

  let typingInterval = null

  if (plugin.typing) {
    await sock.presence.sendChatstate(m.chat, { state: 'composing' }).catch(() => { })
    typingInterval = setInterval(() => {
      sock.presence.sendChatstate(m.chat, { state: 'composing' }).catch(() => { })
    }, TYPING_REFRESH)
  }

  try {
    await plugin.execute(m, context)
  } finally {
    if (typingInterval) {
      clearInterval(typingInterval)
      typingInterval = null
      await sock.presence.sendChatstate(m.chat, { state: 'paused' }).catch(() => { })
    }
  }
}


import fsWatcher from "fs";

fsWatcher.watch(PLUGINS_DIR, { recursive: true }, (eventType, filename) => {
  if (filename && filename.endsWith(".js")) {
    console.log(chalk.yellow("[WATCHER] Plugin changed: " + filename + " -> reloading..."));
    reloadGlobalPlugins(PLUGINS_DIR).then(({ temp }) => {
      global.plugins = temp;
      console.log(chalk.green("[WATCHER] Plugins reloaded successfully."));
    }).catch(err => console.error("[WATCHER ERROR]", err));
  }
});

export async function messageHandler(sock) {
  const { temp: loadedPlugins } = await loadPlugins(PLUGINS_DIR)
  global.plugins = loadedPlugins

  sock.on('message', (event) => {
    if (config.eventMessage) {
      logRawDebug(event)
    }

    const m = serializeMessage(event, sock)
    if (!m) return

    const { lidJid, pnJid } = extractIdentityPair(event.key)
    const contactResult = saveOrUpdateContact({ lidJid, pnJid, pushName: event.pushName })

    if (m.isNewsletter) {
      logPesanMasuk(m, contactResult)
      saveRawMessage(m)
      return
    }

    processCommand(m, sock)
      .catch((err) => sendErrorToOwner(sock, err, m, m.command))
      .finally(() => {
        logPesanMasuk(m, contactResult)
        saveRawMessage(m)
      })
  })

  sock.on('message_send', (sendEvent) => {
    const outgoing = serializeOutgoing(sendEvent, sock)
    if (!outgoing) return

    saveRawMessage(outgoing)
  })
}
