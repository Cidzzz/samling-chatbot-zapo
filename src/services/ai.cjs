const fs = require('fs');
const path = require('path');
const config = require('../config.cjs');

const CHAT_DB_DIR = path.join(__dirname, '../database/chat');
const MAX_LINES = 1000;
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 3600000 ms (60 minutes)

// Per-user conversation history
const conversations = new Map();

/**
 * Sanitize userId to prevent directory traversal
 */
function sanitizeUserId(userId) {
    return String(userId || 'unknown').replace(/[^a-zA-Z0-9_@.-]/g, '_');
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Append entry to user's chat history file and trim if > MAX_LINES
 */
function logChatToFile(userId, role, content) {
    try {
        if (!userId) return;
        const safeUser = sanitizeUserId(userId);
        const userDir = path.join(CHAT_DB_DIR, safeUser);
        ensureDir(userDir);

        const filePath = path.join(userDir, 'history.jsonl');
        const contextPath = path.join(userDir, 'context.json');
        const now = new Date().toISOString();
        const entry = JSON.stringify({ role, content, timestamp: now }) + '\n';

        fs.appendFileSync(filePath, entry, 'utf8');

        // Check line count and trim if > MAX_LINES
        pruneFileLines(filePath, MAX_LINES);

        // Also update context.json formatted structure
        updateContextJson(contextPath, safeUser, role, content, now);
    } catch (err) {
        console.error(`[AI:ChatLog] Error writing chat log for ${userId}:`, err.message);
    }
}

/**
 * Update context.json per user
 */
function updateContextJson(contextPath, userId, role, content, timestamp) {
    try {
        let data = { userId, messages: [] };
        if (fs.existsSync(contextPath)) {
            data = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
            if (!Array.isArray(data.messages)) data.messages = [];
        }
        data.messages.push({ role, content, timestamp });
        // Keep context reasonable
        if (data.messages.length > 500) {
            data.messages = data.messages.slice(-500);
        }
        fs.writeFileSync(contextPath, JSON.stringify(data, null, 2), 'utf8');
        // Prune context.json if line count exceeds MAX_LINES
        pruneJsonLines(contextPath, MAX_LINES);
    } catch (e) {
        // Non-blocking
    }
}

/**
 * Prune a JSON line-formatted file to max lines
 */
function pruneJsonLines(filePath, maxLines) {
    try {
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        if (lines.length > maxLines) {
            const data = JSON.parse(content);
            if (Array.isArray(data.messages)) {
                while (data.messages.length > 50 && JSON.stringify(data, null, 2).split('\n').length > maxLines) {
                    data.messages.splice(0, Math.ceil(data.messages.length / 4));
                }
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            }
        }
    } catch (e) {}
}

/**
 * Prune text/jsonl file to max lines (keeping newest)
 */
function pruneFileLines(filePath, maxLines) {
    try {
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        if (lines.length > maxLines) {
            const trimmed = lines.slice(-maxLines);
            fs.writeFileSync(filePath, trimmed.join('\n') + '\n', 'utf8');
        }
    } catch (err) {
        console.error(`[AI:ChatLog] Error pruning file ${filePath}:`, err.message);
    }
}

/**
 * Inspect all chat files in chat DB directory and prune any exceeding max lines
 */
function cleanupChatLogs() {
    try {
        if (!fs.existsSync(CHAT_DB_DIR)) return;
        const entries = fs.readdirSync(CHAT_DB_DIR, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(CHAT_DB_DIR, entry.name);
            if (entry.isDirectory()) {
                const files = fs.readdirSync(fullPath);
                for (const file of files) {
                    const filePath = path.join(fullPath, file);
                    if (file.endsWith('.jsonl') || file.endsWith('.log')) {
                        pruneFileLines(filePath, MAX_LINES);
                    } else if (file.endsWith('.json')) {
                        pruneJsonLines(filePath, MAX_LINES);
                    }
                }
            } else if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.log'))) {
                pruneFileLines(fullPath, MAX_LINES);
            }
        }
    } catch (err) {
        console.error('[AI:ChatLog] Periodic cleanup error:', err.message);
    }
}

// Start periodic cleanup timer running every 60 minutes
setInterval(cleanupChatLogs, CLEANUP_INTERVAL);

/**
 * Parse AI API response with robust error handling
 * Handles: direct JSON, SSE format, malformed responses
 */
async function parseAIResponse(responseText) {
    // Try direct JSON parse first
    try {
        return JSON.parse(responseText);
    } catch (e) {
        // Handle SSE format: data: {...}\n\ndata: {...}\n\n
        if (responseText.includes('data: ')) {
            const lines = responseText.split('\n');
            let fullContent = '';
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const chunk = JSON.parse(line.slice(6));
                        const delta = chunk.choices?.[0]?.delta?.content || '';
                        fullContent += delta;
                    } catch (parseErr) {
                        // Skip unparseable chunks
                    }
                }
            }
            if (fullContent) {
                return { choices: [{ message: { content: fullContent } }] };
            }
        }
        
        // Try to extract first valid JSON object
        const jsonMatch = responseText.match(/\{[\s\S]*?"choices"[\s\S]*?\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e2) {}
        }
        
        console.error('[AI] Cannot parse response:', responseText.substring(0, 200));
        return null;
    }
}

// Cleanup expired conversations periodically
setInterval(() => {
    const now = Date.now();
    for (const [userId, conv] of conversations) {
        if (now - conv.lastActivity > config.ai.historyTTL) {
            conversations.delete(userId);
        }
    }
}, 5 * 60 * 1000); // cleanup every 5 min

function getConversation(userId) {
    if (!conversations.has(userId)) {
        conversations.set(userId, {
            messages: [],
            lastActivity: Date.now()
        });
    }
    const conv = conversations.get(userId);
    conv.lastActivity = Date.now();
    return conv;
}

function addMessage(userId, role, content) {
    const conv = getConversation(userId);
    conv.messages.push({ role, content });
    // Trim to limit
    if (conv.messages.length > config.ai.historyLimit) {
        conv.messages = conv.messages.slice(-config.ai.historyLimit);
    }
    // Persistent file logging
    logChatToFile(userId, role, content);
}

async function chat(userId, userMessage, systemPrompt, temperatureOverride = null) {
    try {
        if (!config.ai.apiKey) {
            return null; // AI disabled
        }
        
        addMessage(userId, 'user', userMessage);
        
        const messages = [
            { role: 'system', content: systemPrompt },
            ...getConversation(userId).messages
        ];
        
        // Use custom temperature if provided, otherwise use default
        const temperature = temperatureOverride !== null ? temperatureOverride : config.ai.temperature;
        
        if (temperatureOverride !== null) {
            console.log(`[AI] Using custom temperature ${temperature} for user ${userId}`);
        }
        
        const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.ai.apiKey}`,
                'HTTP-Referer': 'https://samling.naufalrafa.my.id',
                'X-Title': 'Samling AI Chatbot'
            },
            body: JSON.stringify({
                model: config.ai.model,
                messages,
                max_tokens: config.ai.maxTokens,
                temperature: temperature,
                stream: false  // Ensure non-streaming response
            })
        });
        
        if (!response.ok) {
            console.error('[AI] API error:', response.status, await response.text());
            return null;
        }
        
        // Get raw response text for debugging and robust parsing
        const responseText = await response.text();
        console.log('[AI] Raw response (first 500 chars):', responseText.substring(0, 500));
        
        // Parse response with robust error handling
        const data = await parseAIResponse(responseText);
        if (!data) {
            console.error('[AI] Failed to parse response');
            return null;
        }
        
        // Extract reply - check content first, then reasoning_content as fallback
        const message = data.choices?.[0]?.message;
        const reply = message?.content || message?.reasoning_content || null;
        
        if (reply) {
            addMessage(userId, 'assistant', reply);
        }
        
        return reply;
    } catch (error) {
        console.error('[AI] Error:', error.message);
        return null;
    }
}

function clearHistory(userId) {
    conversations.delete(userId);
}

/**
 * Parse action tags from AI response
 * Extracts [ACTION:xxx] or [ACTION:xxx:param] from response
 * Returns { text: cleanedText, action: { name, param } }
 */
function parseActionFromResponse(response) {
    if (!response) return { text: response, action: null };
    
    // Match [ACTION:xxx] or [ACTION:xxx:param]
    const actionMatch = response.match(/\[ACTION:([^\]]+)\]/);
    
    if (!actionMatch) return { text: response, action: null };
    
    // Remove action tag from visible text
    const text = response.replace(/\[ACTION:[^\]]+\]/g, '').trim();
    
    // Parse action and params
    const actionParts = actionMatch[1].split(':');
    const actionName = actionParts[0];
    const actionParam = actionParts.slice(1).join(':') || null;
    
    return {
        text,
        action: { name: actionName, param: actionParam }
    };
}

module.exports = {
    chat,
    clearHistory,
    getConversation,
    addMessage,
    parseActionFromResponse,
    parseAIResponse,
    logChatToFile,
    pruneFileLines,
    cleanupChatLogs,
    CHAT_DB_DIR,
    MAX_LINES
};
