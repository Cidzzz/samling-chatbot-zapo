// lib/extraOwners.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'data', 'extra_owners.json');

function getStore() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const dir = path.dirname(DB_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(DB_PATH, JSON.stringify([]));
            return [];
        }
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
        return [];
    }
}

export function getExtraOwners() {
    return getStore();
}

export function addExtraOwner(number) {
    const clean = String(number).replace(/[^0-9]/g, '');
    if (!clean) return false;
    const store = getStore();
    if (!store.includes(clean)) {
        store.push(clean);
        fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2));
    }
    return true;
}

export function delExtraOwner(number) {
    const clean = String(number).replace(/[^0-9]/g, '');
    const store = getStore();
    const filtered = store.filter(n => n !== clean);
    fs.writeFileSync(DB_PATH, JSON.stringify(filtered, null, 2));
    return true;
}

export function isExtraOwner(number) {
    if (!number) return false;
    const clean = String(number).replace(/[^0-9]/g, '');
    const store = getStore();
    return store.some(o => clean.startsWith(o) || o.startsWith(clean));
}
