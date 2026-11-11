// cb2/src/utils/geoHelper.cjs
const axios = require('axios');
const { exec } = require('child_process');

/**
 * Normalisasi nama wilayah DKI Jakarta
 */
function normalizeWilayahDKI(cityName) {
    if (!cityName) return 'Jakarta Pusat';
    const s = cityName.toLowerCase();
    if (s.includes('selatan') || s.includes('jaksel')) return 'Jakarta Selatan';
    if (s.includes('timur') || s.includes('jaktim')) return 'Jakarta Timur';
    if (s.includes('barat') || s.includes('jakbar')) return 'Jakarta Barat';
    if (s.includes('utara') || s.includes('jakut')) return 'Jakarta Utara';
    if (s.includes('seribu') || s.includes('pulau')) return 'Kepulauan Seribu';
    return 'Jakarta Pusat';
}

/**
 * Resolve URL Google Maps menggunakan curl IPv4 (-4) untuk menghindari IPv6 timeout di container
 */
function resolveUrlViaCurl(url) {
    return new Promise((resolve) => {
        const cleanUrl = url.replace(/["$`\\]/g, '');
        exec(`curl -4 -s -I --max-time 6 "${cleanUrl}"`, (err, stdout) => {
            if (err || !stdout) return resolve(null);
            const locMatch = stdout.match(/^location:\s*(.+)$/im);
            if (locMatch && locMatch[1]) {
                resolve(locMatch[1].trim());
            } else {
                resolve(null);
            }
        });
    });
}

/**
 * Ekstrak koordinat atau detail alamat dari link Google Maps (maps.app.goo.gl, goo.gl, maps.google.com)
 */
async function parseGoogleMapsUrl(url) {
    if (!url) return null;
    try {
        let finalUrl = url.trim();

        // 1. Handle shortlink redirect via curl IPv4
        if (finalUrl.includes('maps.app.goo.gl') || finalUrl.includes('goo.gl/maps')) {
            const redirectUrl = await resolveUrlViaCurl(finalUrl);
            if (redirectUrl) finalUrl = redirectUrl;
        }

        // 2. Pattern: /place/-6.154664,106.750683
        const placeCoordMatch = finalUrl.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (placeCoordMatch) {
            return { latitude: parseFloat(placeCoordMatch[1]), longitude: parseFloat(placeCoordMatch[2]) };
        }

        // 3. Pattern: /place/<Nama+Tempat>,+Jl...+Kec.+<Kecamatan>,+Kota+<Wilayah> (Teks Alamat Lengkap Google Maps)
        const placeTextMatch = finalUrl.match(/place\/([^/?#]+)/);
        if (placeTextMatch) {
            const rawPlace = decodeURIComponent(placeTextMatch[1].replace(/\+/g, ' '));
            const parts = rawPlace.split(',').map(p => p.trim()).filter(Boolean);
            if (parts.length > 0) {
                const venueName = parts[0];
                let kecamatan = '-';
                let rawCity = 'Jakarta Pusat';

                for (const part of parts) {
                    const low = part.toLowerCase();
                    if (low.includes('kec.') || low.includes('kecamatan')) {
                        kecamatan = part.replace(/^(?:kec\.?|kecamatan)\s*/i, '').trim();
                    }
                    if (low.includes('selatan') || low.includes('jaksel')) rawCity = 'Jakarta Selatan';
                    else if (low.includes('timur') || low.includes('jaktim')) rawCity = 'Jakarta Timur';
                    else if (low.includes('barat') || low.includes('jakbar')) rawCity = 'Jakarta Barat';
                    else if (low.includes('utara') || low.includes('jakut')) rawCity = 'Jakarta Utara';
                    else if (low.includes('seribu') || low.includes('pulau')) rawCity = 'Kepulauan Seribu';
                    else if (low.includes('pusat') || low.includes('jakpus')) rawCity = 'Jakarta Pusat';
                }

                // Fallback kecamatan jika tidak berawalan "Kec." tapi ada di daftar populer
                if (kecamatan === '-') {
                    const knownKec = ['tebet', 'gambir', 'menteng', 'cengkareng', 'kemayoran', 'tanah abang', 'senen', 'sawah besar', 'cilandak', 'pasar minggu', 'kebayoran baru', 'kebayoran lama', 'mampang prapatan', 'pancoran', 'jagakarsa', 'pesanggrahan', 'matraman', 'pulogadung', 'jatinegara', 'kramat jati', 'pasar rebo', 'cakung', 'duren sawit', 'makasar', 'ciracas', 'penjaringan', 'tanjung priok', 'koja', 'cilincing', 'pademangan', 'kelapa gading', 'grogol petamburan', 'kalideres', 'kebon jeruk', 'kembangan', 'palmerah', 'taman sari', 'tambora'];
                    for (const part of parts) {
                        const low = part.toLowerCase();
                        const found = knownKec.find(k => low.includes(k));
                        if (found) {
                            kecamatan = found.charAt(0).toUpperCase() + found.slice(1);
                            break;
                        }
                    }
                }

                const wilayah = normalizeWilayahDKI(rawCity);
                return {
                    name: venueName,
                    venue_name: venueName,
                    wilayah,
                    kecamatan,
                    display_name: rawPlace,
                    fromTextPlace: true
                };
            }
        }

        // 4. Pattern: @-6.123456,106.123456
        const atMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (atMatch) {
            return { latitude: parseFloat(atMatch[1]), longitude: parseFloat(atMatch[2]) };
        }

        // 5. Pattern: ?q=-6.123456,106.123456 atau ll=-6.123456,106.123456
        const qMatch = finalUrl.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (qMatch) {
            return { latitude: parseFloat(qMatch[1]), longitude: parseFloat(qMatch[2]) };
        }

        return null;
    } catch (err) {
        console.warn('[geoHelper] Error resolving Google Maps URL:', err.message);
        return null;
    }
}

/**
 * Reverse Geocode via OpenStreetMap Nominatim
 */
async function reverseGeocode(latitude, longitude) {
    if (!latitude || !longitude) return null;
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
        const resp = await axios.get(url, {
            headers: { 'User-Agent': 'SamlingBot-DLH-Jakarta/2.0 (lingkunganhidup.jakarta.go.id)' },
            timeout: 6000
        });

        const data = resp.data;
        if (!data || !data.address) return null;

        const addr = data.address;
        const venue = addr.amenity || addr.building || addr.road || data.name || 'Lokasi Terpilih';
        const kecamatan = addr.suburb || addr.city_district || addr.district || '-';
        const rawCity = addr.city_district || addr.city || addr.county || 'Jakarta Pusat';
        const wilayah = normalizeWilayahDKI(rawCity);

        return {
            name: venue,
            venue_name: venue,
            wilayah,
            kecamatan,
            display_name: data.display_name,
            latitude,
            longitude
        };
    } catch (err) {
        console.warn('[geoHelper] Reverse geocode error:', err.message);
        return null;
    }
}

module.exports = {
    parseGoogleMapsUrl,
    reverseGeocode,
    normalizeWilayahDKI
};
