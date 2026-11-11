/**
 * API Configuration
 * Centralized configuration untuk Samling API integration
 */

module.exports = {
    // Base URL API Samling (production)
    baseURL: process.env.API_BASE_URL || 'https://samling-api.ezzar.my.id/api/v1',
    
    // Timeout untuk request (10 detik)
    timeout: 10000,
    
    // Maximum retry attempts untuk network failures
    retryAttempts: 2,
    
    // Cache refresh interval (30 menit dalam milliseconds)
    cacheRefreshInterval: 30 * 60 * 1000,
    
    // API endpoints
    endpoints: {
        zones: '/zones',
        filterOptions: '/zones/filter-options',
        kecamatan: '/zones/kecamatan',
        webhook: '/webhook/whatsapp',
        tps3rReports: '/tps3r/reports',
        tps3rToday: '/tps3r/reports/today',
        tps3rWeekly: '/tps3r/reports/weekly'
    },
    
    // API Key / Secret Key for protected endpoints
    apiKey: process.env.SAMLING_API_KEY || process.env.SAMLING_SECRET_KEY || process.env.BACKEND_API_SECRET || 'samling-secret-bot-key-2026'
};
