const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../database');
const FILE_PATH = path.join(DATA_DIR, 'ai_group_whitelist.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load whitelist
function loadWhitelist() {
    try {
        if (fs.existsSync(FILE_PATH)) {
            const data = fs.readFileSync(FILE_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[GroupWhitelist] Error loading:', e.message);
    }
    return [];
}

// Save whitelist
function saveWhitelist(list) {
    try {
        fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2));
    } catch (e) {
        console.error('[GroupWhitelist] Error saving:', e.message);
    }
}

function isWhitelisted(groupId) {
    const list = loadWhitelist();
    return list.includes(groupId);
}

function addGroup(groupId) {
    const list = loadWhitelist();
    if (!list.includes(groupId)) {
        list.push(groupId);
        saveWhitelist(list);
        return true;
    }
    return false;
}

function removeGroup(groupId) {
    let list = loadWhitelist();
    if (list.includes(groupId)) {
        list = list.filter(id => id !== groupId);
        saveWhitelist(list);
        return true;
    }
    return false;
}

function getWhitelistedGroups() {
    return loadWhitelist();
}

module.exports = {
    isWhitelisted,
    addGroup,
    removeGroup,
    getWhitelistedGroups
};
