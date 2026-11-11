/**
 * Test Script untuk API Client & Zone Cache
 * Simple test untuk verifikasi koneksi dan functionality
 * 
 * Usage: node cb/src/services/__test_api.js
 */

const api = require('./api.cjs');
const zoneCache = require('./zone_cache.cjs');

// ponytail: simple console.log test, no test framework
const log = {
    section: (title) => console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`),
    success: (msg) => console.log('✅', msg),
    error: (msg) => console.error('❌', msg),
    info: (msg) => console.log('ℹ️ ', msg)
};

/**
 * Test 1: API Connection
 */
async function testAPIConnection() {
    log.section('TEST 1: API Connection');
    
    try {
        log.info('Testing GET /zones...');
        const zones = await api.getZones();
        
        if (Array.isArray(zones) && zones.length > 0) {
            log.success(`Connected! Fetched ${zones.length} zones`);
            log.info(`Sample zone: ${zones[0].zone_name || zones[0].nama_zone || 'N/A'}`);
            return true;
        } else {
            log.error('No zones data returned');
            return false;
        }
    } catch (error) {
        log.error(`Connection failed: ${error.message}`);
        if (error.statusCode) {
            log.info(`Status: ${error.statusCode}, Endpoint: ${error.endpoint}`);
        }
        return false;
    }
}

/**
 * Test 2: Filter Options
 */
async function testFilterOptions() {
    log.section('TEST 2: Filter Options');
    
    try {
        log.info('Testing GET /zones/filter-options...');
        const options = await api.getFilterOptions();
        
        log.success('Filter options fetched');
        log.info(`Wilayah: ${options.wilayah?.length || 0} items`);
        log.info(`Kecamatan: ${options.kecamatan?.length || 0} items`);
        
        if (options.wilayah?.length > 0) {
            log.info(`Sample wilayah: ${options.wilayah[0]}`);
        }
        
        return true;
    } catch (error) {
        log.error(`Filter options failed: ${error.message}`);
        return false;
    }
}

/**
 * Test 3: Zone Cache Initialization
 */
async function testZoneCacheInit() {
    log.section('TEST 3: Zone Cache Initialization');
    
    try {
        log.info('Initializing zone cache...');
        await zoneCache.initialize();
        
        log.success('Zone cache initialized');
        
        // Get stats
        const stats = zoneCache.getStats();
        log.info(`Total zones: ${stats.totalZones}`);
        log.info(`Unique wilayah: ${stats.uniqueWilayah}`);
        log.info(`Unique kecamatan: ${stats.uniqueKecamatan}`);
        log.info(`Last update: ${stats.lastUpdate?.toISOString() || 'N/A'}`);
        log.info(`Auto-refresh: ${stats.autoRefreshEnabled ? 'Enabled' : 'Disabled'}`);
        
        return true;
    } catch (error) {
        log.error(`Cache initialization failed: ${error.message}`);
        return false;
    }
}

/**
 * Test 4: Query Helpers
 */
async function testQueryHelpers() {
    log.section('TEST 4: Zone Cache Query Helpers');
    
    try {
        // Test getUniqueWilayah
        log.info('Testing getUniqueWilayah()...');
        const wilayahList = zoneCache.getUniqueWilayah();
        log.success(`Found ${wilayahList.length} unique wilayah`);
        if (wilayahList.length > 0) {
            log.info(`Sample: ${wilayahList.slice(0, 3).join(', ')}`);
        }
        
        // Test getZonesByWilayah (ambil wilayah pertama)
        if (wilayahList.length > 0) {
            const testWilayah = wilayahList[0];
            log.info(`\nTesting getZonesByWilayah('${testWilayah}')...`);
            const zones = zoneCache.getZonesByWilayah(testWilayah);
            log.success(`Found ${zones.length} zones in ${testWilayah}`);
        }
        
        // Test getKecamatanByWilayah
        if (wilayahList.length > 0) {
            const testWilayah = wilayahList[0];
            log.info(`\nTesting getKecamatanByWilayah('${testWilayah}')...`);
            const kecamatanList = zoneCache.getKecamatanByWilayah(testWilayah);
            log.success(`Found ${kecamatanList.length} kecamatan in ${testWilayah}`);
            if (kecamatanList.length > 0) {
                log.info(`Sample: ${kecamatanList.slice(0, 3).join(', ')}`);
            }
        }
        
        // Test getZonesByKecamatan
        if (wilayahList.length > 0) {
            const testWilayah = wilayahList[0];
            const kecamatanList = zoneCache.getKecamatanByWilayah(testWilayah);
            if (kecamatanList.length > 0) {
                const testKecamatan = kecamatanList[0];
                log.info(`\nTesting getZonesByKecamatan('${testKecamatan}')...`);
                const zones = zoneCache.getZonesByKecamatan(testKecamatan);
                log.success(`Found ${zones.length} zones in ${testKecamatan}`);
                if (zones.length > 0) {
                    log.info(`Sample zone: ${zones[0].zone_name || zones[0].nama_zone || 'N/A'}`);
                }
            }
        }
        
        return true;
    } catch (error) {
        log.error(`Query helpers failed: ${error.message}`);
        return false;
    }
}

/**
 * Test 5: Cache Statistics Detail
 */
function testCacheStats() {
    log.section('TEST 5: Cache Statistics Detail');
    
    try {
        const stats = zoneCache.getStats();
        
        log.info('Zones by Wilayah:');
        Object.entries(stats.zonesByWilayah || {}).forEach(([wilayah, count]) => {
            console.log(`  - ${wilayah}: ${count} zones`);
        });
        
        return true;
    } catch (error) {
        log.error(`Stats failed: ${error.message}`);
        return false;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('\n🧪 SAMLING API & CACHE TEST SUITE');
    console.log('Starting tests...\n');
    
    const results = {
        total: 5,
        passed: 0,
        failed: 0
    };
    
    try {
        // Test 1: API Connection
        if (await testAPIConnection()) results.passed++;
        else results.failed++;
        
        // Test 2: Filter Options
        if (await testFilterOptions()) results.passed++;
        else results.failed++;
        
        // Test 3: Cache Init
        if (await testZoneCacheInit()) results.passed++;
        else results.failed++;
        
        // Test 4: Query Helpers
        if (await testQueryHelpers()) results.passed++;
        else results.failed++;
        
        // Test 5: Cache Stats
        if (testCacheStats()) results.passed++;
        else results.failed++;
        
    } catch (error) {
        log.error(`Test suite error: ${error.message}`);
    } finally {
        // Cleanup
        zoneCache.destroy();
    }
    
    // Summary
    log.section('TEST SUMMARY');
    console.log(`Total: ${results.total}`);
    console.log(`Passed: ${results.passed} ✅`);
    console.log(`Failed: ${results.failed} ${results.failed > 0 ? '❌' : ''}`);
    console.log(`\nSuccess Rate: ${Math.round((results.passed / results.total) * 100)}%`);
    
    if (results.failed === 0) {
        log.success('\n🎉 All tests passed!');
    } else {
        log.error('\n⚠️  Some tests failed. Check errors above.');
    }
    
    process.exit(results.failed === 0 ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
    runTests().catch(error => {
        log.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { runTests };
