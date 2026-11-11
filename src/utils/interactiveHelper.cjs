// cb2/src/utils/interactiveHelper.cjs

async function sendInteractiveNative(Hanz, jid, { headerTitle = '', text = '', footer = '', buttons = [], imageSource = null, quoted = null }) {
    console.log(`[INTERACTIVE DEBUG] Sending native interactive message to ${jid} with ${buttons.length} button(s)`);

    const sock = Hanz?.rawSock;

    // Persiapkan header: dukung lampiran gambar resmi WhatsApp (imageMessage) di header card
    let headerObj = {
        title: headerTitle || 'SAMLING DLH DKI JAKARTA',
        hasMediaAttachment: false
    };

    if (imageSource && sock?.message?.upload) {
        try {
            let imgBuffer = null;
            if (Buffer.isBuffer(imageSource)) {
                imgBuffer = imageSource;
            } else if (imageSource?.url) {
                const axios = require('axios');
                const resp = await axios.get(imageSource.url, { responseType: 'arraybuffer' });
                imgBuffer = Buffer.from(resp.data);
            }

            if (imgBuffer) {
                console.log('[INTERACTIVE DEBUG] Uploading header image via sock.message.upload...');
                const up = await sock.message.upload(imgBuffer, { type: 'image', mimetype: 'image/png' });
                if (up && (up.directPath || up.url)) {
                    headerObj = {
                        hasMediaAttachment: true,
                        imageMessage: {
                            url: up.url,
                            directPath: up.directPath,
                            mediaKey: up.mediaKey,
                            fileSha256: up.fileSha256,
                            fileEncSha256: up.fileEncSha256,
                            fileLength: up.fileLength,
                            mediaKeyTimestamp: up.mediaKeyTimestamp,
                            mimetype: 'image/png'
                        }
                    };
                    console.log('[INTERACTIVE DEBUG] ✅ BERHASIL menyatukan gambar ke header interactive card!');
                }
            }
        } catch (mediaErr) {
            console.warn('[INTERACTIVE DEBUG] Gagal upload imageMessage untuk header card:', mediaErr.message);
        }
    }

    const interactiveMessage = {
        header: headerObj,
        body: { text },
        footer: { text: footer || 'Dinas Lingkungan Hidup DKI Jakarta' },
        nativeFlowMessage: {
            buttons: buttons || []
        }
    };

    if (sock?.message?.send) {
        try {
            console.log('[INTERACTIVE DEBUG] Attempting sock.message.send...');
            const res = await sock.message.send(jid, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage
                    }
                }
            }, {
                quote: quoted,
                disableDirectEphemeralAutoInject: true,
                disableGroupEphemeralAutoInject: true
            });
            console.log('[INTERACTIVE DEBUG] sock.message.send SUCCESS');
            return res;
        } catch (err) {
            console.error('[INTERACTIVE DEBUG ERROR sock.message.send]:', err?.stack || err?.message || err);
        }
    } else {
        console.warn('[INTERACTIVE DEBUG] Hanz.rawSock.message.send not available!');
    }

    // Fallback pesan teks rapi jika gagal interactive
    console.log('[INTERACTIVE DEBUG] Falling back to structured text menu');
    let fallbackText = `${text}\n\n*PILIHAN MENU:*`;
    for (const btn of buttons) {
        if (btn.name === 'single_select') {
            try {
                const params = JSON.parse(btn.buttonParamsJson || '{}');
                for (const sec of (params.sections || [])) {
                    fallbackText += `\n\n*-- ${sec.title} --*`;
                    for (const r of (sec.rows || [])) {
                        fallbackText += `\n• *!${r.id}* : ${r.title}${r.description ? ` (${r.description})` : ''}`;
                    }
                }
            } catch { }
        } else if (btn.name === 'quick_reply') {
            try {
                const p = JSON.parse(btn.buttonParamsJson || '{}');
                fallbackText += `\n• *!${p.id}* : ${p.display_text}`;
            } catch { }
        } else if (btn.name === 'cta_url') {
            try {
                const p = JSON.parse(btn.buttonParamsJson || '{}');
                fallbackText += `\n• 🔗 [${p.display_text}]: ${p.url}`;
            } catch { }
        }
    }
    if (footer) fallbackText += `\n\n_${footer}_`;

    if (typeof Hanz?.sendMessage === 'function') {
        return await Hanz.sendMessage(jid, { text: fallbackText }, { quoted });
    }
}

async function sendButtons(Hanz, jid, content) {
    const { text, footer = '', buttons = [], quoted } = content;
    const zapoButtons = buttons.map(btn => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: btn.text, id: btn.id })
    }));

    return sendInteractiveNative(Hanz, jid, {
        text,
        footer,
        buttons: zapoButtons,
        quoted
    });
}

async function sendListMessage(Hanz, jid, content) {
    const { text, footer = '', buttonTitle = '📂 Pilih Layanan', sections = [], quoted } = content;
    const zapoButtons = [{
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
            title: buttonTitle,
            sections: sections.map(sec => ({
                title: sec.title,
                rows: sec.rows.map(row => ({
                    header: row.title,
                    title: row.title,
                    description: row.description || '',
                    id: row.id
                }))
            }))
        })
    }];

    return sendInteractiveNative(Hanz, jid, {
        text,
        footer,
        buttons: zapoButtons,
        quoted
    });
}

async function sendInteractiveMessage(Hanz, jid, content) {
    const { text, footer = '', buttons = [], quoted } = content;
    return sendInteractiveNative(Hanz, jid, {
        text,
        footer,
        buttons,
        quoted
    });
}

async function sendButtonWithImage(Hanz, jid, content) {
    const { text, footer = '', buttons = [], imageUrl, quoted } = content;
    return sendInteractiveNative(Hanz, jid, {
        text,
        footer,
        buttons,
        imageSource: imageUrl ? { url: imageUrl } : null,
        quoted
    });
}

async function sendInteractiveWithImage(Hanz, jid, content) {
    const { text, footer = '', buttons = [], imageSource, quoted } = content;
    return sendInteractiveNative(Hanz, jid, {
        text,
        footer,
        buttons,
        imageSource,
        quoted
    });
}

module.exports = {
    sendButtons,
    sendListMessage,
    sendInteractiveMessage,
    sendButtonWithImage,
    sendInteractiveWithImage
};
