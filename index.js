// index.js (Samling AI on zapo-js engine)
import chalk from 'chalk';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { createSocket } from './src/createSocket.js';
import { connectionHandler } from './src/connectionHandler.js';
import { groupEventHandler } from './src/groupEventHandler.js';
import { serializeMessage } from './handler.js';
import { bridgeZapoMessage } from './zapo_bridge.js';

dotenv.config();
const require = createRequire(import.meta.url);

// Inisialisasi Telegram Dual-Bot
const { initTelegramBot } = require('./telegram/bot.cjs');

// Inisialisasi Webhook Server di testing port 3009 (tidak bentrok dengan cb 3008)
const { initWebhookServer } = require('./src/services/webhook-server.cjs');

// Inisialisasi Notification Poller (WhatsApp)
const notificationPoller = require('./src/services/notification-poller.cjs');

// Inisialisasi WhatsApp PluginLoader
const plugins = require('./src/utils/PluginLoader.cjs');
plugins.init();

let sock;

async function bootstrap() {
  console.log(chalk.cyan('================================================='));
  console.log(chalk.cyan(' • Samling AI Engine: zapo-js (Lightweight ESM)'));
  console.log(chalk.cyan(' • Role: Testing & Prototyping (cb2)'));
  console.log(chalk.cyan('================================================='));

  try {
    sock = createSocket();
    connectionHandler(sock);
    groupEventHandler(sock);

    // Event listener pesan masuk via zapo-js
    sock.on('message', async (event) => {
      try {
        const m = serializeMessage(event, sock);
        if (m) {
          await bridgeZapoMessage(sock, m);
        }
      } catch (err) {
        console.error(chalk.red('[ZAPO MESSAGE ERROR]:'), err?.message || err);
      }
    });

    // Jalankan connect zapo-js di background
    sock.connect().catch((err) => {
      console.error(chalk.red('[ZAPO CONNECT ERROR]:'), err?.message || err);
    });

    // Start Dual-Bot Telegram
    try {
      initTelegramBot();
      console.log(chalk.green('[TELEGRAM] Samling Telegram Bot online.'));
    } catch (tgErr) {
      console.error(chalk.yellow('[TELEGRAM] Warning start Telegram:'), tgErr?.message);
    }

    // Start WhatsApp Notification Poller
    try {
      const adapterSock = {
        user: sock.user || { id: 'bot' },
        sendMessage: async (jid, content) => {
          if (typeof content === 'string') return await sock.message.send(jid, content);
          if (content?.text) return await sock.message.send(jid, content.text);
          return await sock.message.send(jid, content);
        }
      };
      notificationPoller.setSocket(adapterSock);
      notificationPoller.start();
      console.log(chalk.green('[POLLER] WhatsApp Notification Poller aktif.'));
    } catch (pollerErr) {
      console.error(chalk.yellow('[POLLER] Warning start Poller:'), pollerErr?.message);
    }

    // Start Webhook Server (Port 3008 - sinkron dengan Cloudflare Tunnel samling-chatbot.dwiai.web.id)
    process.env.WEBHOOK_PORT = process.env.WEBHOOK_PORT || '3008';
    try {
      initWebhookServer({
        user: sock.user || { id: 'bot' },
        sendMessage: async (jid, content) => {
          if (typeof content === 'string') return await sock.message.send(jid, content);
          if (content?.text) return await sock.message.send(jid, content.text);
          return await sock.message.send(jid, content);
        }
      });
      console.log(chalk.green(`[WEBHOOK] Samling Webhook server running on port ${process.env.WEBHOOK_PORT}`));
    } catch (whErr) {
      console.error(chalk.yellow('[WEBHOOK] Warning start Webhook:'), whErr?.message);
    }

  } catch (err) {
    console.error(chalk.red('[SAMLING-ZAPO] Boot error:'), err?.stack || err?.message || err);
  }
}

bootstrap();
