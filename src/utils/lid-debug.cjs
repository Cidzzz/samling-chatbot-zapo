const util = require('util');

const PREFIX = '[LID-DEBUG]';

function deepLog(label, obj) {
    try {
        console.log(`${PREFIX} === ${label} ===`);
        console.log(util.inspect(obj, { depth: null, colors: true, compact: false }));
    } catch (e) {
        console.log(`${PREFIX} [ERROR logging ${label}]`, e.message);
    }
}

// 1. Log semua message details
function logMessageDetails(msg) {
    try {
        const key = msg.key || {};
        console.log(`${PREFIX} ─── MESSAGE RECEIVED ───`);
        console.log(`${PREFIX} key:`, JSON.stringify(key));
        console.log(`${PREFIX} remoteJid: ${key.remoteJid}`);
        console.log(`${PREFIX} participant: ${key.participant || 'N/A'}`);
        console.log(`${PREFIX} fromMe: ${key.fromMe}`);
        console.log(`${PREFIX} pushName: ${msg.pushName || 'N/A'}`);
        
        // Extract sender/author
        const sender = key.participant || key.remoteJid;
        console.log(`${PREFIX} sender: ${sender}`);
        
        // Check for LID pattern
        if (sender && sender.includes('@lid')) {
            console.log(`${PREFIX} ⚠️ LID DETECTED: ${sender}`);
        }
        
        console.log(`${PREFIX} messageTimestamp: ${msg.messageTimestamp}`);
        
        // Full message object
        deepLog('Full Message Object', msg);
        
        // messageStubParameters
        if (msg.messageStubParameters) {
            deepLog('messageStubParameters', msg.messageStubParameters);
        }
        
        // contextInfo
        const message = msg.message || {};
        const msgType = Object.keys(message)[0];
        if (msgType && message[msgType]?.contextInfo) {
            deepLog('contextInfo', message[msgType].contextInfo);
        }
        
        // quoted message
        if (msgType && message[msgType]?.contextInfo?.quotedMessage) {
            deepLog('quotedMessage', message[msgType].contextInfo.quotedMessage);
        }
        
        console.log(`${PREFIX} ─── END MESSAGE ───\n`);
    } catch (e) {
        console.log(`${PREFIX} [ERROR in logMessageDetails]`, e.message);
    }
}

// 2. Inspect sock object for internal properties
function inspectSockObject(sock) {
    try {
        console.log(`${PREFIX} ═══ INSPECTING SOCK OBJECT ═══`);
        
        const propsToCheck = [
            'signalRepository', 'lidMapping', 'repository', 
            'store', 'authState', 'creds', 'keys',
            'user', 'ev', 'ws'
        ];
        
        for (const prop of propsToCheck) {
            if (sock[prop] !== undefined) {
                console.log(`${PREFIX} ✅ sock.${prop} EXISTS`);
                if (typeof sock[prop] === 'object' && sock[prop] !== null) {
                    console.log(`${PREFIX} sock.${prop} keys:`, Object.keys(sock[prop]));
                    // For small objects, log full content
                    if (Object.keys(sock[prop]).length < 20) {
                        deepLog(`sock.${prop}`, sock[prop]);
                    }
                } else {
                    console.log(`${PREFIX} sock.${prop} =`, sock[prop]);
                }
            } else {
                console.log(`${PREFIX} ❌ sock.${prop} NOT FOUND`);
            }
        }
        
        // Check authState deeper
        if (sock.authState) {
            console.log(`${PREFIX} authState keys:`, Object.keys(sock.authState));
            if (sock.authState.creds) {
                deepLog('authState.creds', sock.authState.creds);
            }
            if (sock.authState.keys) {
                console.log(`${PREFIX} authState.keys type:`, typeof sock.authState.keys);
                console.log(`${PREFIX} authState.keys methods:`, 
                    Object.getOwnPropertyNames(Object.getPrototypeOf(sock.authState.keys) || {})
                );
            }
        }
        
        console.log(`${PREFIX} ═══ END SOCK INSPECTION ═══\n`);
    } catch (e) {
        console.log(`${PREFIX} [ERROR in inspectSockObject]`, e.message);
    }
}

// 3. Monkey patch functions
function monkeyPatchFunctions(sock) {
    try {
        const functionsToPath = [
            'getLIDForPN', 'getPNForLID', 'storeLIDPNMapping',
            'getSignalIdentity', 'getContact', 'getDevice',
            'decodeJid', 'encodeJid'
        ];
        
        console.log(`${PREFIX} ═══ MONKEY PATCHING ═══`);
        
        // Search in sock and its prototype chain
        const searchTargets = [sock, sock.authState, sock.authState?.keys, sock.store];
        
        for (const fn of functionsToPath) {
            let patched = false;
            
            for (const target of searchTargets) {
                if (!target) continue;
                
                if (typeof target[fn] === 'function') {
                    const original = target[fn].bind(target);
                    target[fn] = async function(...args) {
                        console.log(`${PREFIX} 🔧 CALL: ${fn}(${args.map(a => JSON.stringify(a)).join(', ')})`);
                        try {
                            const result = await original(...args);
                            const isPromise = result instanceof Promise;
                            console.log(`${PREFIX} 🔧 RETURN ${fn}: ${util.inspect(result, {depth: 2})} (Promise: ${isPromise})`);
                            return result;
                        } catch (e) {
                            console.log(`${PREFIX} 🔧 ERROR ${fn}:`, e.message);
                            throw e;
                        }
                    };
                    console.log(`${PREFIX} ✅ Patched: ${fn} on ${target.constructor?.name || 'object'}`);
                    patched = true;
                    break;
                }
            }
            
            if (!patched) {
                console.log(`${PREFIX} ❌ Not found: ${fn}`);
            }
        }
        
        // Also search in node_modules baileys
        try {
            const baileysPath = require.resolve('@whiskeysockets/baileys');
            const baileys = require('@whiskeysockets/baileys');
            console.log(`${PREFIX} Baileys exports:`, Object.keys(baileys).filter(k => 
                k.toLowerCase().includes('lid') || 
                k.toLowerCase().includes('pn') || 
                k.toLowerCase().includes('jid') ||
                k.toLowerCase().includes('decode') ||
                k.toLowerCase().includes('encode')
            ));
        } catch (e) {
            console.log(`${PREFIX} Cannot inspect baileys module:`, e.message);
        }
        
        console.log(`${PREFIX} ═══ END MONKEY PATCHING ═══\n`);
    } catch (e) {
        console.log(`${PREFIX} [ERROR in monkeyPatchFunctions]`, e.message);
    }
}

// 4. Setup all event listeners
function setupEventListeners(sock) {
    try {
        console.log(`${PREFIX} ═══ SETTING UP EVENT LISTENERS ═══`);
        
        // Messages
        sock.ev.on('messages.upsert', ({ messages, type }) => {
            console.log(`${PREFIX} 📨 EVENT: messages.upsert (type: ${type}, count: ${messages.length})`);
            for (const msg of messages) {
                logMessageDetails(msg);
            }
        });
        
        sock.ev.on('messages.update', (updates) => {
            console.log(`${PREFIX} 📝 EVENT: messages.update (count: ${updates.length})`);
            deepLog('messages.update', updates);
        });
        
        // Contacts - CRITICAL for LID mapping
        sock.ev.on('contacts.upsert', (contacts) => {
            console.log(`${PREFIX} 👤 EVENT: contacts.upsert (count: ${contacts.length})`);
            for (const contact of contacts) {
                console.log(`${PREFIX} 👤 Contact: id=${contact.id}, name=${contact.name || contact.notify || 'N/A'}`);
                if (contact.id?.includes('@lid')) {
                    console.log(`${PREFIX} ⚠️ LID CONTACT: ${contact.id}`);
                }
                deepLog('Contact Detail', contact);
            }
        });
        
        sock.ev.on('contacts.update', (updates) => {
            console.log(`${PREFIX} 👤 EVENT: contacts.update (count: ${updates.length})`);
            deepLog('contacts.update', updates);
        });
        
        // Chats
        sock.ev.on('chats.upsert', (chats) => {
            console.log(`${PREFIX} 💬 EVENT: chats.upsert (count: ${chats.length})`);
            deepLog('chats.upsert', chats);
        });
        
        sock.ev.on('chats.update', (updates) => {
            console.log(`${PREFIX} 💬 EVENT: chats.update (count: ${updates.length})`);
            deepLog('chats.update', updates);
        });
        
        // Groups
        sock.ev.on('groups.update', (updates) => {
            console.log(`${PREFIX} 👥 EVENT: groups.update`);
            deepLog('groups.update', updates);
        });
        
        sock.ev.on('group-participants.update', (update) => {
            console.log(`${PREFIX} 👥 EVENT: group-participants.update`);
            deepLog('group-participants.update', update);
        });
        
        // Presence
        sock.ev.on('presence.update', (update) => {
            console.log(`${PREFIX} 🟢 EVENT: presence.update`);
            deepLog('presence.update', update);
        });
        
        // Connection
        sock.ev.on('connection.update', (update) => {
            console.log(`${PREFIX} 🔌 EVENT: connection.update`);
            deepLog('connection.update', update);
        });
        
        // Creds
        sock.ev.on('creds.update', () => {
            console.log(`${PREFIX} 🔑 EVENT: creds.update`);
        });
        
        // Catch ALL events via wildcard if supported
        try {
            if (sock.ev.on) {
                const originalEmit = sock.ev.emit?.bind(sock.ev);
                if (originalEmit) {
                    sock.ev.emit = function(event, ...args) {
                        if (!['messages.upsert', 'messages.update', 'contacts.upsert', 
                              'contacts.update', 'chats.upsert', 'chats.update',
                              'groups.update', 'group-participants.update', 'presence.update',
                              'connection.update', 'creds.update'].includes(event)) {
                            console.log(`${PREFIX} 🔔 UNKNOWN EVENT: ${event}`);
                            deepLog(`Unknown Event: ${event}`, args);
                        }
                        return originalEmit(event, ...args);
                    };
                    console.log(`${PREFIX} ✅ EventEmitter emit patched for unknown events`);
                }
            }
        } catch (e) {
            console.log(`${PREFIX} Cannot patch EventEmitter:`, e.message);
        }
        
        console.log(`${PREFIX} ═══ EVENT LISTENERS READY ═══\n`);
    } catch (e) {
        console.log(`${PREFIX} [ERROR in setupEventListeners]`, e.message);
    }
}

// 5. Log store contents
function logStoreContents(store) {
    try {
        if (!store) {
            console.log(`${PREFIX} Store not available`);
            return;
        }
        
        console.log(`${PREFIX} ═══ STORE CONTENTS ═══`);
        
        if (store.contacts) {
            const contacts = Object.entries(store.contacts);
            console.log(`${PREFIX} Contacts count: ${contacts.length}`);
            for (const [id, contact] of contacts.slice(0, 20)) {
                console.log(`${PREFIX} Contact: ${id} → ${contact.name || contact.notify || 'N/A'}`);
                if (id.includes('@lid')) {
                    console.log(`${PREFIX} ⚠️ LID IN STORE: ${id}`);
                    deepLog('LID Contact in Store', contact);
                }
            }
        }
        
        if (store.chats) {
            console.log(`${PREFIX} Chats count: ${store.chats?.length || Object.keys(store.chats).length}`);
        }
        
        if (store.messages) {
            console.log(`${PREFIX} Messages store type: ${typeof store.messages}`);
        }
        
        console.log(`${PREFIX} ═══ END STORE CONTENTS ═══\n`);
    } catch (e) {
        console.log(`${PREFIX} [ERROR in logStoreContents]`, e.message);
    }
}

// Main initialization function
function initLIDDebug(sock, store) {
    console.log(`${PREFIX} ╔══════════════════════════════════════╗`);
    console.log(`${PREFIX} ║  LID DEBUG LOGGER INITIALIZED       ║`);
    console.log(`${PREFIX} ╚══════════════════════════════════════╝`);
    
    inspectSockObject(sock);
    monkeyPatchFunctions(sock);
    setupEventListeners(sock);
    
    // Log store after 10 seconds (wait for sync)
    setTimeout(() => {
        console.log(`${PREFIX} ═══ POST-SYNC STORE DUMP ═══`);
        logStoreContents(store);
        inspectSockObject(sock); // Re-inspect after sync
    }, 10000);
    
    // Log store again after 30 seconds
    setTimeout(() => {
        console.log(`${PREFIX} ═══ 30s POST-SYNC STORE DUMP ═══`);
        logStoreContents(store);
    }, 30000);
}

module.exports = {
    initLIDDebug,
    logMessageDetails,
    inspectSockObject,
    logStoreContents,
    deepLog
};
