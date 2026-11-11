const axios = require('axios');
const config = require('../config/api.config.cjs');

const BACKEND_URL = config.baseURL || 'https://samling-api.ezzar.my.id/api/v1';
const API_KEY = config.apiKey || 'samling-secret-bot-key-2026';

const apiClient = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  },
  timeout: 10000
});

// In-memory cache ber-TTL 2 menit untuk optimasi respon dan update cepat
const officerCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000;

function clearOfficerCache(phone = null) {
  if (phone) {
    officerCache.delete(cleanPhoneNumber(phone));
  } else {
    officerCache.clear();
  }
}

function cleanPhoneNumber(raw) {
  if (!raw) return '';
  let clean = String(raw).replace(/\D/g, '');
  if (clean.startsWith('0')) clean = '62' + clean.slice(1);
  return clean;
}

/**
 * Verifikasi Otorisasi Petugas TPS 3R (Whitelist) dengan Fast-Path In-Memory Cache
 */
async function verifyOfficer(phone) {
  const clean = cleanPhoneNumber(phone);
  if (!clean) {
    return {
      success: false,
      message: 'Nomor telepon tidak valid.',
      data: { authorized: false, role: 'unregistered' }
    };
  }

  // Fast-path: cek cache
  const cached = officerCache.get(clean);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const res = await apiClient.get('/tps3r/officers/verify', {
      params: { phone: clean }
    });
    const result = res.data?.data || res.data || {};
    if (res.data?.success !== undefined && result.authorized === undefined) {
      result.authorized = false;
    }
    // Simpan di cache
    officerCache.set(clean, {
      data: result,
      timestamp: Date.now()
    });
    return result;
  } catch (err) {
    console.error('[tps3rService] verifyOfficer error:', err.response?.data || err.message);
    return {
      authorized: false,
      role: 'unregistered',
      message: err.response?.data?.message || 'Gagal memverifikasi status petugas TPS 3R.'
    };
  }
}

/**
 * Regex parser for WhatsApp TPS 3R report text
 */
function parseTPS3RReportText(text) {
  const normalized = String(text || '').replace(/,/g, '.');

  const dustbinMatch = normalized.match(/(?:hasil\s+dustbin|dustbin|dasbin|bak)\s*[:=]?\s*(\d+)/i);
  const dustbin_count = dustbinMatch ? parseInt(dustbinMatch[1], 10) : 0;

  const cartMatch = normalized.match(/(?:gerobak.*?grandong|gerobak|armada)\s*[:=]?\s*(\d+)/i);
  const cart_count = cartMatch ? parseInt(cartMatch[1], 10) : 0;

  const cartTypeMatch = normalized.match(/\(([^)]*gerobak[^)]*)\)/i);
  const cart_type = cartTypeMatch ? cartTypeMatch[1].trim() : (cart_count > 0 ? `${cart_count} gerobak dorong` : null);

  const anorgValMatch = normalized.match(/(?:an-?\s*organik.*?ber-?\s*val+u?e|anorganik\s+val+u?e|ber-?\s*val+u?e).*?[:=]?\s*([\d.]+)/i);
  const anorganic_valuable_kg = anorgValMatch ? parseFloat(anorgValMatch[1]) : 0.0;

  const anorgNonValMatch = normalized.match(/(?:an-?\s*organik.*?(?:tidak\s+ber-?\s*val+u?e|non\s*val+u?e)|tidak\s+ber-?\s*val+u?e|non\s*val+u?e|residu).*?[:=]?\s*([\d.]+)/i);
  const anorganic_non_valuable_kg = anorgNonValMatch ? parseFloat(anorgNonValMatch[1]) : 0.0;

  const orgGrandongMatch = normalized.match(/(?:hasil\s+organik\s+grandong|organik\s+grandong|organik.*?mesin\s*grandong).*?[:=]?\s*([\d.]+)/i);
  const organic_grandong_kg = orgGrandongMatch ? parseFloat(orgGrandongMatch[1]) : 0.0;

  const rdfBgMatch = normalized.match(/(?:cacahan\s+rdf\s+bg|rdf\s+bg|rdf\s+karung)\s*[:=]?\s*(\d+)/i);
  const rdf_bag_count = rdfBgMatch ? parseInt(rdfBgMatch[1], 10) : 0;

  const rdfKgMatch = normalized.match(/(?:cacahan\s+rdf\s+kg|rdf\s+kg|rdf)\s*[:=]?\s*([\d.]+)/i);
  const rdf_weight_kg = rdfKgMatch ? parseFloat(rdfKgMatch[1]) : 0.0;

  // Extract explicit zone_id if present
  const zoneMatch = normalized.match(/(?:zone|tps3r|tps)[_\s:#]+(\d+)/i);
  const zone_id = zoneMatch ? parseInt(zoneMatch[1], 10) : null;

  // Sanitasi & boundary limit keamanan
  const sanitizeMetric = (val, max = 10000) => {
    if (typeof val !== 'number' || isNaN(val) || val < 0) return 0;
    return Math.min(val, max);
  };

  return {
    zone_id,
    dustbin_count: sanitizeMetric(dustbin_count, 1000),
    cart_count: sanitizeMetric(cart_count, 1000),
    cart_type,
    anorganic_valuable_kg: sanitizeMetric(anorganic_valuable_kg, 10000),
    anorganic_non_valuable_kg: sanitizeMetric(anorganic_non_valuable_kg, 10000),
    organic_grandong_kg: sanitizeMetric(organic_grandong_kg, 10000),
    rdf_bag_count: sanitizeMetric(rdf_bag_count, 5000),
    rdf_weight_kg: sanitizeMetric(rdf_weight_kg, 10000)
  };
}

async function submitTPS3RReport(payload) {
  const res = await apiClient.post('/tps3r/reports', payload);
  return res.data?.data || res.data || res;
}

async function getTodayTargetStatus(zoneId) {
  const res = await apiClient.get(`/tps3r/reports/today?zone_id=${zoneId}`);
  return res.data?.data || res.data || res;
}

async function getWeeklySummary(zoneId, endDate = null) {
  const url = endDate ? `/tps3r/reports/weekly?zone_id=${zoneId}&end_date=${endDate}` : `/tps3r/reports/weekly?zone_id=${zoneId}`;
  const res = await apiClient.get(url);
  return res.data?.data || res.data || res;
}

async function getReportsHistory(zoneId = null, limit = 5, page = 1) {
  const url = zoneId ? `/tps3r/reports?zone_id=${zoneId}&limit=${limit}&page=${page}` : `/tps3r/reports?limit=${limit}&page=${page}`;
  const res = await apiClient.get(url);
  return res.data?.data || res.data || res;
}

async function getReportDetailById(reportId) {
  const res = await apiClient.get(`/tps3r/reports/${reportId}`);
  return res.data?.data || res.data || res;
}

function generateProgressBar(pct) {
  const totalBars = 10;
  const numPct = typeof pct === 'number' ? pct : parseFloat(pct) || 0;
  const filled = Math.min(totalBars, Math.max(0, Math.round((numPct / 100) * totalBars)));
  return '🟩'.repeat(filled) + '⬜'.repeat(totalBars - filled);
}

module.exports = {
  clearOfficerCache,
  verifyOfficer,
  parseTPS3RReportText,
  parseTPS3RReportText,
  submitTPS3RReport,
  getTodayTargetStatus,
  getWeeklySummary,
  getReportsHistory,
  getReportDetailById,
  generateProgressBar
};
