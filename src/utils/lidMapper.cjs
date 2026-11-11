const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../database/lid_mapping.json');
let mapping = {};

try {
    if (fs.existsSync(CACHE_FILE)) {
        mapping = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8') || '{}');
    }
} catch (e) {
    mapping = {};
}

function saveMapping() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(mapping, null, 2), 'utf8');
    } catch (e) {}
}

function registerLidMapping(lid, phone) {
    if (!lid || !phone) return;
    const cleanLid = String(lid).replace(/\D/g, '').split(':')[0];
    const cleanPhone = String(phone).replace(/\D/g, '').split(':')[0];
    if (cleanLid && cleanPhone && cleanLid !== cleanPhone && cleanPhone.startsWith('62')) {
        if (mapping[cleanLid] !== cleanPhone) {
            mapping[cleanLid] = cleanPhone;
            saveMapping();
        }
    }
}

function getPhoneFromLid(lid) {
    if (!lid) return null;
    const cleanLid = String(lid).replace(/\D/g, '').split(':')[0];
    return mapping[cleanLid] || null;
}

module.exports = {
    registerLidMapping,
    getPhoneFromLid
};
