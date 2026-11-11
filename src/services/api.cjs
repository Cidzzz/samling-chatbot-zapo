/**
 * Samling API Client
 * HTTP client wrapper dengan error handling dan retry mechanism
 */

const axios = require('axios');
const config = require('../config/api.config.cjs');

class SamlingAPI {
    constructor() {
        this.client = axios.create({
            baseURL: config.baseURL,
            timeout: config.timeout
            // CRITICAL FIX 2026-07-13: Hapus default Content-Type header
            // agar tidak konflik dengan multipart/form-data untuk upload gambar
            // Content-Type akan di-set per-request basis
        });

        // Response interceptor untuk unwrap standard response format
        this.client.interceptors.response.use(
            response => response.data, // Extract data dari wrapper {success, message, data}
            error => Promise.reject(error)
        );
    }

    /**
     * Generic GET request dengan retry mechanism
     * @param {string} endpoint - API endpoint path
     * @param {object} params - Query parameters
     * @returns {Promise<object>} Response data
     */
    async get(endpoint, params = {}, customHeaders = {}) {
        return this._requestWithRetry('get', endpoint, { params }, {
            headers: { 'Content-Type': 'application/json', ...customHeaders }
        });
    }

    /**
     * Generic POST request dengan retry mechanism
     * @param {string} endpoint - API endpoint path
     * @param {object} data - Request body
     * @param {object} customHeaders - Custom headers
     * @returns {Promise<object>} Response data
     */
    async post(endpoint, data = {}, customHeaders = {}) {
        return this._requestWithRetry('post', endpoint, { data }, {
            headers: { 'Content-Type': 'application/json', ...customHeaders }
        });
    }

    /**
     * Internal method untuk execute request dengan retry logic
     * @private
     */
    async _requestWithRetry(method, endpoint, options = {}, requestConfig = {}, attempt = 1) {
        try {
            // CRITICAL FIX 2026-07-13: Properly handle axios method signatures
            // GET: axios.get(url, config) -> config = { params, headers, etc }
            // POST: axios.post(url, data, config) -> data as body, config separate
            let response;
            
            if (method === 'get') {
                // Merge options dan requestConfig untuk GET request
                response = await this.client.get(endpoint, {
                    ...options,      // { params: {...} }
                    ...requestConfig // { headers: {...} }
                });
            } else {
                // POST: data sebagai body (param 2), config sebagai param 3
                response = await this.client.post(endpoint,
                    options.data,    // Request body
                    requestConfig    // Config (headers, etc)
                );
            }
            
            // ponytail: response sudah di-unwrap oleh interceptor
            return response;

        } catch (error) {
            const isNetworkError = !error.response; // No response = network issue
            const shouldRetry = isNetworkError && attempt < config.retryAttempts;

            if (shouldRetry) {
                console.log(`[API] Retry ${attempt}/${config.retryAttempts} for ${endpoint}`);
                await this._sleep(1000 * attempt); // Exponential backoff
                return this._requestWithRetry(method, endpoint, options, requestConfig, attempt + 1);
            }

            // Format error untuk consistent error handling
            throw this._formatError(error, endpoint);
        }
    }

    /**
     * Format error menjadi consistent structure
     * @private
     */
    _formatError(error, endpoint) {
        if (error.response) {
            // Server responded dengan error status
            return {
                success: false,
                message: error.response.data?.message || 'API Error',
                statusCode: error.response.status,
                endpoint
            };
        } else if (error.request) {
            // Request dibuat tapi tidak ada response (network error)
            return {
                success: false,
                message: 'Network error - tidak dapat terhubung ke server',
                statusCode: 0,
                endpoint
            };
        } else {
            // Error lain (config, dll)
            return {
                success: false,
                message: error.message || 'Unknown error',
                statusCode: -1,
                endpoint
            };
        }
    }

    /**
     * Helper untuk delay (sleep)
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== SPECIFIC ENDPOINTS ====================

    /**
     * Get hierarchical zones data (4 levels: Wilayah → Kecamatan → Kelurahan → TPS)
     * GET /zones/hierarchy
     * @returns {Promise<object>} Hierarchical zones structure
     */
    async getZonesHierarchy() {
        try {
            const response = await this.get('/zones/hierarchy');
            return response.data || { provinsi: '', wilayah: [] };
        } catch (error) {
            console.error('[API] getZonesHierarchy error:', error.message);
            throw error;
        }
    }

    /**
     * Get all zones data (LEGACY - untuk backward compatibility)
     * GET /zones
     * @returns {Promise<Array>} Array of zones
     */
    async getZones() {
        try {
            const response = await this.get(config.endpoints.zones);
            return response.data || []; // Extract array dari {success, message, data: [...]}
        } catch (error) {
            console.error('[API] getZones error:', error.message);
            throw error;
        }
    }

    /**
     * Get filter options (wilayah, kecamatan lists)
     * GET /zones/filter-options
     * @returns {Promise<object>} Filter options {wilayah: [...], kecamatan: [...]}
     */
    async getFilterOptions() {
        try {
            const response = await this.get(config.endpoints.filterOptions);
            return response.data || { wilayah: [], kecamatan: [] };
        } catch (error) {
            console.error('[API] getFilterOptions error:', error.message);
            throw error;
        }
    }

    /**
     * Get zones by kecamatan
     * GET /zones/kecamatan/{kecamatan}
     * @param {string} kecamatan - Nama kecamatan
     * @returns {Promise<Array>} Array of zones in that kecamatan
     */
    async getZonesByKecamatan(kecamatan) {
        try {
            const endpoint = `${config.endpoints.kecamatan}/${encodeURIComponent(kecamatan)}`;
            const response = await this.get(endpoint);
            return response.data || [];
        } catch (error) {
            console.error(`[API] getZonesByKecamatan(${kecamatan}) error:`, error.message);
            throw error;
        }
    }

    /**
     * Submit citizen report dengan multipart/form-data (support image upload)
     * POST /citizen-reports
     * @param {FormData} formData - Multipart form with whatsapp_number, report_content, zone_id, image
     * @returns {Promise<object>} Response with ticket ID
     */
    async submitCitizenReport(formData) {
        try {
            // CRITICAL FIX 2026-07-13: Properly handle multipart/form-data dengan boundary
            // Sesuai dokumentasi backend line 193-194: "biarkan library form-data mengatur boundaries-nya"
            
            // formData.getHeaders() menghasilkan: { 'content-type': 'multipart/form-data; boundary=...' }
            const headers = formData.getHeaders ? formData.getHeaders() : {
                'Content-Type': 'multipart/form-data'
            };
            
            const response = await this.client.post('/citizen-reports', formData, {
                headers: headers
            });
            
            return response; // Already unwrapped by interceptor
        } catch (error) {
            console.error('[API] submitCitizenReport error:', error.message);
            if (error.response) {
                console.error('[API] Response status:', error.response.status);
                console.error('[API] Response data:', error.response.data);
            }
            throw this._formatError(error, '/citizen-reports');
        }
    }

    /**
     * Get citizen report status by ID
     * GET /citizen-reports/{id}
     * @param {number} reportId - Report ticket ID
     * @returns {Promise<object>} Report detail dengan status
     */
    async getReportStatus(reportId) {
        try {
            const response = await this.get(`/citizen-reports/${reportId}`);
            return response.data || null;
        } catch (error) {
            console.error(`[API] getReportStatus(${reportId}) error:`, error.message);
            throw this._formatError(error, `/citizen-reports/${reportId}`);
        }
    }

    /**
     * Submit laporan warga via webhook (LEGACY - deprecated, use submitCitizenReport)
     * POST /webhook/whatsapp
     * @param {object} reportData - Data laporan {phone, name, zone_id, description, etc}
     * @returns {Promise<object>} Response from webhook
     */
    async submitReport(reportData) {
        try {
            const response = await this.post(config.endpoints.webhook, reportData);
            return response;
        } catch (error) {
            console.error('[API] submitReport error:', error.message);
            throw error;
        }
    }

    // ==================== TPS 3R OPERATIONAL ENDPOINTS ====================

    /**
     * Helper to get X-API-Key auth headers
     * @private
     */
    _getAuthHeaders() {
        return {
            'X-API-Key': config.apiKey || 'samling-secret-bot-key-2026'
        };
    }

    /**
     * Submit daily operational weighing report for TPS 3R
     * POST /tps3r/reports
     * @param {object} reportData - Report payload
     * @returns {Promise<object>} Created report
     */
    async submitTps3rReport(reportData) {
        try {
            const response = await this.post('/tps3r/reports', reportData, this._getAuthHeaders());
            return response;
        } catch (error) {
            console.error('[API] submitTps3rReport error:', error.message);
            throw error;
        }
    }

    /**
     * Get today's TPS 3R target & operational progress
     * GET /tps3r/reports/today
     * @param {number|string} zoneId - TPS Zone ID (optional if backend filters by token or param)
     * @returns {Promise<object>} Today's progress data
     */
    async getTps3rToday(zoneId = null) {
        try {
            const params = zoneId ? { zone_id: zoneId } : {};
            const response = await this.get('/tps3r/reports/today', params, this._getAuthHeaders());
            return response.data !== undefined ? response.data : response;
        } catch (error) {
            console.error('[API] getTps3rToday error:', error.message);
            throw error;
        }
    }

    /**
     * Get 7-day weekly summary aggregation for TPS 3R
     * GET /tps3r/reports/weekly
     * @param {number|string} zoneId - TPS Zone ID (optional)
     * @returns {Promise<object>} Weekly summary
     */
    async getTps3rWeekly(zoneId = null) {
        try {
            const params = zoneId ? { zone_id: zoneId } : {};
            const response = await this.get('/tps3r/reports/weekly', params, this._getAuthHeaders());
            return response.data !== undefined ? response.data : response;
        } catch (error) {
            console.error('[API] getTps3rWeekly error:', error.message);
            throw error;
        }
    }

    /**
     * List recent TPS 3R weighing reports history
     * GET /tps3r/reports
     * @param {object} params - Query params { page, limit, zone_id }
     * @returns {Promise<object>} Reports history list
     */
    async getTps3rReports(params = {}) {
        try {
            const response = await this.get('/tps3r/reports', params, this._getAuthHeaders());
            return response.data !== undefined ? response.data : response;
        } catch (error) {
            console.error('[API] getTps3rReports error:', error.message);
            throw error;
        }
    }

    /**
     * Get detail of a specific TPS 3R report
     * GET /tps3r/reports/{id}
     * @param {number|string} id - Report ID
     * @returns {Promise<object>} Report detail
     */
    async getTps3rReportDetail(id) {
        try {
            const response = await this.get(`/tps3r/reports/${id}`, {}, this._getAuthHeaders());
            return response.data !== undefined ? response.data : response;
        } catch (error) {
            console.error(`[API] getTps3rReportDetail(${id}) error:`, error.message);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new SamlingAPI();
