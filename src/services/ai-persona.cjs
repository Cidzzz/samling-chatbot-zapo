const fs = require('fs');
const path = require('path');

const PERSONA_FILE = path.join(__dirname, '../../database/ai_personas.json');

/**
 * Load personas dari file JSON
 * @returns {Object} Object berisi mapping phoneNumber -> {persona, temperature}
 */
function loadPersonas() {
    try {
        if (!fs.existsSync(PERSONA_FILE)) {
            console.log('[AI-PERSONA] File tidak ditemukan, menggunakan sifat default untuk semua user');
            return {};
        }
        const data = fs.readFileSync(PERSONA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('[AI-PERSONA] Error loading personas:', error.message);
        console.log('[AI-PERSONA] Menggunakan sifat default untuk semua user');
        return {};
    }
}

/**
 * Ambil persona khusus untuk nomor tertentu
 * @param {string} phoneNumber - Nomor telepon (format: 628xxx)
 * @returns {Object|null} Object {persona: string, temperature: number} atau null jika tidak ada
 */
function getPersona(phoneNumber) {
    const personas = loadPersonas();
    const personaData = personas[phoneNumber];
    
    if (personaData) {
        console.log(`[AI-PERSONA] Custom persona loaded for ${phoneNumber} (temp: ${personaData.temperature})`);
        return personaData;
    }
    
    return null;
}

/**
 * Buat template file ai_personas.json dengan 3 contoh nomor
 * @returns {boolean} True jika berhasil, false jika gagal
 */
function createTemplate() {
    const template = {
        "6281234567890": {
            "persona": "Anda adalah petugas layanan pelanggan Samling yang ramah, sopan, dan sigap. Gunakan bahasa Indonesia baku dan komunikatif sesuai kaidah KBBI tanpa emoji berlebihan.",
            "temperature": 0.3
        },
        "6289876543210": {
            "persona": "Anda adalah konsultan lingkungan hidup resmi DKI Jakarta yang mengedukasi warga terkait pemilahan sampah dengan bahasa Indonesia formal, ilmiah, dan santun.",
            "temperature": 0.4
        },
        "6281122334455": {
            "persona": "Anda adalah asisten administrasi layanan persampahan Samling yang sangat profesional, ringkas, dan jelas dalam memandu pelaporan masyarakat.",
            "temperature": 0.2
        }
    };
    
    try {
        const dir = path.dirname(PERSONA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(PERSONA_FILE, JSON.stringify(template, null, 2));
        console.log('[AI-PERSONA] Template file created at:', PERSONA_FILE);
        return true;
    } catch (error) {
        console.error('[AI-PERSONA] Error creating template:', error.message);
        return false;
    }
}

// Auto-create template jika file belum ada
if (!fs.existsSync(PERSONA_FILE)) {
    console.log('[AI-PERSONA] File template belum ada, membuat template...');
    createTemplate();
}

module.exports = { getPersona, getUserPersona: getPersona, createTemplate, PERSONA_FILE };
