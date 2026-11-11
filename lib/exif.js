// lib/exif.js
import fs from 'fs';
import { tmpdir } from 'os';
import Crypto from 'crypto';
import ff from 'fluent-ffmpeg';
import webp from 'node-webpmux';
import path from 'path';

export async function imageToWebp(media) {
    const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);
    const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.jpg`);

    fs.writeFileSync(tmpFileIn, media);

    await new Promise((resolve, reject) => {
        ff(tmpFileIn)
            .on('error', reject)
            .on('end', () => resolve(true))
            .addOutputOptions([
                '-vcodec',
                'libwebp',
                '-vf',
                "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse"
            ])
            .toFormat('webp')
            .save(tmpFileOut);
    });

    const buff = fs.readFileSync(tmpFileOut);
    if (fs.existsSync(tmpFileOut)) fs.unlinkSync(tmpFileOut);
    if (fs.existsSync(tmpFileIn)) fs.unlinkSync(tmpFileIn);
    return buff;
}

export async function videoToWebp(media) {
    const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);
    const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.mp4`);

    fs.writeFileSync(tmpFileIn, media);

    await new Promise((resolve, reject) => {
        ff(tmpFileIn)
            .on('error', reject)
            .on('end', () => resolve(true))
            .addOutputOptions([
                '-vcodec',
                'libwebp',
                '-vf',
                "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
                '-loop',
                '0',
                '-ss',
                '00:00:00',
                '-t',
                '00:00:05',
                '-preset',
                'default',
                '-an',
                '-vsync',
                '0'
            ])
            .toFormat('webp')
            .save(tmpFileOut);
    });

    const buff = fs.readFileSync(tmpFileOut);
    if (fs.existsSync(tmpFileOut)) fs.unlinkSync(tmpFileOut);
    if (fs.existsSync(tmpFileIn)) fs.unlinkSync(tmpFileIn);
    return buff;
}

export async function addExif(webpSticker, packname = 'cidz raja', author = 'cidz assist', categories = ['🤖'], extra = {}) {
    const img = new webp.Image();
    const stickerPackId = Crypto.randomBytes(32).toString('hex');
    const json = {
        'sticker-pack-id': stickerPackId,
        'sticker-pack-name': packname,
        'sticker-pack-publisher': author,
        'emojis': categories,
        ...extra
    };
    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    await img.load(webpSticker);
    img.exif = exif;
    return await img.save(null);
}
