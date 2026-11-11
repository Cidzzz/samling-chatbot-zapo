/**
 * Zone Cache Manager
 * In-memory cache untuk data zones dengan auto-refresh
 */

const api = require('./api.cjs');
const config = require('../config/api.config.cjs');

class ZoneCache {
    constructor() {
        this.cache = {
            hierarchy: null,  // Hierarchical data dari /zones/hierarchy
            zones: [],        // Flattened zones untuk backward compatibility
            lastUpdate: null,
            refreshInterval: null
        };
        this.isInitialized = false;
    }

    /**
     * Initialize cache dan start auto-refresh
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            console.log('[ZoneCache] Initializing...');
            await this.refresh();
            this._startAutoRefresh();
            this.isInitialized = true;
            console.log(`[ZoneCache] Initialized with ${this.cache.zones.length} zones`);
        } catch (error) {
            console.error('[ZoneCache] Initialization failed:', error.message);
            console.error('[ZoneCache] Error details:', error);
            throw error;
        }
    }

    /**
     * Ensure cache is initialized - on-the-fly init jika belum ready
     * @returns {Promise<boolean>} True jika berhasil init/already initialized
     */
    async ensureInitialized() {
        if (this.isInitialized) {
            return true; // Already initialized
        }

        try {
            console.log('[ZoneCache] On-the-fly initialization attempt...');
            await this.initialize();
            return true;
        } catch (error) {
            console.error('[ZoneCache] On-the-fly init failed:', error.message);
            return false;
        }
    }

    /**
     * Manual refresh cache dari API (hierarchical endpoint)
     * @returns {Promise<void>}
     */
    async refresh() {
        try {
            console.log('[ZoneCache] Refreshing hierarchical data...');
            console.log('[ZoneCache] Calling API: /zones/hierarchy');
            const hierarchy = await api.getZonesHierarchy();
            
            console.log('[ZoneCache] API response received');
            this.cache.hierarchy = hierarchy;
            this.cache.zones = this._flattenHierarchy(hierarchy); // Backward compat
            this.cache.lastUpdate = new Date();
            
            console.log(`[ZoneCache] Refreshed: ${this.cache.zones.length} zones in hierarchy`);
        } catch (error) {
            console.error('[ZoneCache] Refresh failed:', error.message);
            console.error('[ZoneCache] Error details:', error);
            // ponytail: keep old data jika refresh gagal
            throw error;
        }
    }

    /**
     * Start auto-refresh timer
     * @private
     */
    _startAutoRefresh() {
        if (this.cache.refreshInterval) {
            clearInterval(this.cache.refreshInterval);
        }

        this.cache.refreshInterval = setInterval(async () => {
            try {
                await this.refresh();
            } catch (error) {
                console.error('[ZoneCache] Auto-refresh failed:', error.message);
                // ponytail: continue running, retry pada interval berikutnya
            }
        }, config.cacheRefreshInterval);

        console.log(`[ZoneCache] Auto-refresh enabled (every ${config.cacheRefreshInterval / 60000} minutes)`);
    }

    /**
     * Get all zones
     * @returns {Array} All zones
     */
    getAllZones() {
        return [...this.cache.zones]; // Return copy untuk avoid mutation
    }

    /**
     * Get zones by wilayah
     * @param {string} wilayah - Nama wilayah (e.g., "Jakarta Barat")
     * @returns {Array} Filtered zones
     */
    getZonesByWilayah(wilayah) {
        if (!wilayah) return [];
        
        const normalizedWilayah = this._normalize(wilayah);
        return this.cache.zones.filter(zone => 
            this._normalize(zone.wilayah) === normalizedWilayah
        );
    }

    /**
     * Get zones by kecamatan
     * @param {string} kecamatan - Nama kecamatan
     * @returns {Array} Filtered zones
     */
    getZonesByKecamatan(kecamatan) {
        if (!kecamatan) return [];
        
        const normalizedKecamatan = this._normalize(kecamatan);
        return this.cache.zones.filter(zone => 
            this._normalize(zone.kecamatan) === normalizedKecamatan
        );
    }

    /**
     * Get unique wilayah list
     * @returns {Array<string>} Sorted unique wilayah names
     */
    getUniqueWilayah() {
        const wilayahSet = new Set();
        
        this.cache.zones.forEach(zone => {
            if (zone.wilayah && !this._normalize(zone.wilayah).includes('tidak diketahui')) {
                wilayahSet.add(zone.wilayah);
            }
        });
        
        return Array.from(wilayahSet).sort();
    }

    /**
     * Get unique kecamatan list by wilayah
     * @param {string} wilayah - Filter by wilayah (optional)
     * @returns {Array<string>} Sorted unique kecamatan names
     */
    getKecamatanByWilayah(wilayah = null) {
        const kecamatanSet = new Set();
        
        // Filter zones by wilayah if specified
        const filteredZones = wilayah
            ? this.getZonesByWilayah(wilayah)
            : this.cache.zones;
        
        filteredZones.forEach(zone => {
            if (zone.kecamatan && !this._normalize(zone.kecamatan).includes('tidak diketahui')) {
                kecamatanSet.add(zone.kecamatan);
            }
        });
        
        return Array.from(kecamatanSet).sort();
    }

    /**
     * Get cache statistics (for debugging)
     * @returns {object} Cache stats
     */
    getStats() {
        const stats = {
            totalZones: this.cache.zones.length,
            uniqueWilayah: this.getUniqueWilayah().length,
            uniqueKecamatan: this.getKecamatanByWilayah().length,
            lastUpdate: this.cache.lastUpdate,
            isInitialized: this.isInitialized,
            autoRefreshEnabled: !!this.cache.refreshInterval
        };

        // Hitung zones per wilayah
        const zonesByWilayah = {};
        this.cache.zones.forEach(zone => {
            const wilayah = zone.wilayah || 'Unknown';
            zonesByWilayah[wilayah] = (zonesByWilayah[wilayah] || 0) + 1;
        });
        stats.zonesByWilayah = zonesByWilayah;

        return stats;
    }

    /**
     * Normalize string untuk comparison (case-insensitive, trim)
     * @private
     */
    _normalize(str) {
        return str.toString().toLowerCase().trim();
    }

    /**
     * Flatten hierarchical data ke flat zones array (backward compatibility)
     * @private
     */
    _flattenHierarchy(hierarchy) {
        const zones = [];
        if (!hierarchy || !hierarchy.wilayah) return zones;

        hierarchy.wilayah.forEach(w => {
            (w.kecamatan || []).forEach(k => {
                if (Array.isArray(k.tps)) {
                    k.tps.forEach(tps => {
                        zones.push({
                            ...tps,
                            wilayah: w.name,
                            kecamatan: k.name
                        });
                    });
                } else if (Array.isArray(k.kelurahan)) {
                    k.kelurahan.forEach(kel => {
                        (kel.tps || []).forEach(tps => {
                            zones.push({
                                ...tps,
                                wilayah: w.name,
                                kecamatan: k.name,
                                kelurahan: kel.name
                            });
                        });
                    });
                }
            });
        });
        return zones;
    }

    // ==================== HIERARCHICAL NAVIGATION METHODS ====================

    /**
     * Get list of wilayah (Level 1)
     * @returns {Array<string>} Wilayah names
     */
    getWilayahList() {
        if (!this.cache.hierarchy || !this.cache.hierarchy.wilayah) return [];
        return this.cache.hierarchy.wilayah
            .filter(w => !this._normalize(w.name).includes('tidak diketahui'))
            .map(w => w.name);
    }

    /**
     * Get list of kecamatan by wilayah (Level 2)
     * @param {string} selectedWilayah - Selected wilayah name
     * @returns {Array<string>} Kecamatan names
     */
    getKecamatanList(selectedWilayah) {
        if (!this.cache.hierarchy || !selectedWilayah) return [];
        
        const wilayah = this.cache.hierarchy.wilayah.find(w =>
            this._normalize(w.name) === this._normalize(selectedWilayah)
        );
        
        return wilayah
            ? (wilayah.kecamatan || [])
                .filter(k => !this._normalize(k.name).includes('tidak diketahui'))
                .map(k => k.name)
            : [];
    }

    /**
     * Get list of TPS by wilayah & kecamatan (Level 3 - 3-level hierarchy)
     * Supports both 3-level schema (wilayah -> kecamatan -> tps) and fallback 4-level
     * @param {string} selectedWilayah - Selected wilayah name
     * @param {string} selectedKecamatan - Selected kecamatan name
     * @param {string} [selectedKelurahan] - Optional kelurahan name
     * @returns {Array<object>} TPS objects with full details
     */
    getTpsList(selectedWilayah, selectedKecamatan, selectedKelurahan = null) {
        if (!this.cache.hierarchy || !selectedWilayah || !selectedKecamatan) return [];
        
        const wilayah = this.cache.hierarchy.wilayah.find(w =>
            this._normalize(w.name) === this._normalize(selectedWilayah)
        );
        if (!wilayah) return [];
        
        const kecamatan = (wilayah.kecamatan || []).find(k =>
            this._normalize(k.name) === this._normalize(selectedKecamatan)
        );
        if (!kecamatan) return [];

        if (Array.isArray(kecamatan.tps)) {
            return kecamatan.tps;
        }

        if (Array.isArray(kecamatan.kelurahan)) {
            if (selectedKelurahan) {
                const kel = kecamatan.kelurahan.find(kl =>
                    this._normalize(kl.name) === this._normalize(selectedKelurahan)
                );
                return kel ? (kel.tps || []) : [];
            }
            return kecamatan.kelurahan.flatMap(kl => kl.tps || []);
        }

        return [];
    }

    /**
     * Backward compatibility kelurahan getter
     */
    getKelurahanList(selectedWilayah, selectedKecamatan) {
        if (!this.cache.hierarchy || !selectedWilayah || !selectedKecamatan) return [];
        const wilayah = this.cache.hierarchy.wilayah.find(w =>
            this._normalize(w.name) === this._normalize(selectedWilayah)
        );
        if (!wilayah) return [];
        const kecamatan = (wilayah.kecamatan || []).find(k =>
            this._normalize(k.name) === this._normalize(selectedKecamatan)
        );
        return kecamatan && Array.isArray(kecamatan.kelurahan) ? kecamatan.kelurahan.map(kl => kl.name) : [];
    }

    /**
     * Get TPS by ID (dari flattened cache)
     * @param {number} zoneId - TPS zone ID
     * @returns {object|null} TPS object
     */
    getZoneById(zoneId) {
        return this.cache.zones.find(z => z.id === parseInt(zoneId)) || null;
    }

    /**
     * Stop auto-refresh (untuk cleanup)
     */
    destroy() {
        if (this.cache.refreshInterval) {
            clearInterval(this.cache.refreshInterval);
            this.cache.refreshInterval = null;
            console.log('[ZoneCache] Auto-refresh stopped');
        }
    }
}

// Export singleton instance
module.exports = new ZoneCache();
