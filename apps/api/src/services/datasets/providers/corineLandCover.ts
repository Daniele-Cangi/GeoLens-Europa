/**
 * Corine Land Cover Provider - Real land cover classification data
 *
 * Data Source: CORINE Land Cover (CLC) 2018
 * Provider: Copernicus Land Monitoring Service
 * Format: GeoTIFF
 * Coverage: Europe (EEA39 countries)
 * Resolution: 100m
 * Classes: 44 land cover categories (organized in 5 main groups)
 *
 * Download: https://land.copernicus.eu/pan-european/corine-land-cover/clc2018
 * Direct Data: https://land.copernicus.eu/pan-european/corine-land-cover/clc2018/view (registration required)
 *
 * Classification:
 * 1xx - Artificial surfaces (urban, industrial)
 * 2xx - Agricultural areas
 * 3xx - Forest and semi-natural areas
 * 4xx - Wetlands
 * 5xx - Water bodies
 *
 * Citation: European Environment Agency (EEA)
 */

import { BaseGeoProvider, GeoPoint, GeoData, BoundingBox, ProviderMetadata } from './base';
import { fromUrl, fromFile } from 'geotiff';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export class CorineLandCoverProvider extends BaseGeoProvider {
    // Note: Direct download URL requires EEA registration
    // For automated access, use Copernicus Data Space or local mirror
    private static readonly CLC_URL = process.env.CLC_DOWNLOAD_URL || '';

    // Path relative to project root (when running from root)
    private static readonly LOCAL_PATH = path.join(process.cwd(), 'data', 'raw', 'clc', 'CLC2018_100m.tif');

    private tiff: any = null;
    private image: any = null;
    private isLoaded = false;

    constructor() {
        super({
            cacheEnabled: true,
            cacheTTL: 86400 * 365, // 1 year (static dataset, updated every 3-6 years)
            retryAttempts: 3,
            retryDelay: 2000,
            timeout: 180000 // 3 minutes for large file
        });
    }

    getMetadata(): ProviderMetadata {
        return {
            name: 'CLC2018',
            source: 'Copernicus Land Monitoring Service',
            resolution: '100m',
            updateFrequency: 'static (updated every 3-6 years)',
            coverage: 'europe (EEA39)',
            latency: 'static'
        };
    }

    hasCoverage(point: GeoPoint): boolean {
        // EEA39 coverage (approximate)
        return (
            point.lat >= 27 &&
            point.lat <= 72 &&
            point.lon >= -32 &&
            point.lon <= 45
        );
    }

    async getLatestTimestamp(): Promise<string> {
        return '2018-01-01T00:00:00Z'; // CLC2018 reference year
    }

    /**
     * Ensure CLC dataset is available locally
     */
    private async ensureDataset(): Promise<void> {
        if (fs.existsSync(CorineLandCoverProvider.LOCAL_PATH)) {
            console.log(`[CLC] Using cached dataset: ${CorineLandCoverProvider.LOCAL_PATH}`);
            return;
        }

        if (!CorineLandCoverProvider.CLC_URL) {
            throw new Error(
                '[CLC] No download URL configured. Please:\n' +
                '  1. Register at https://land.copernicus.eu/\n' +
                '  2. Download CLC2018 GeoTIFF\n' +
                '  3. Place in data/raw/CLC2018_100m.tif\n' +
                '  OR set CLC_DOWNLOAD_URL environment variable'
            );
        }

        const dataDir = path.dirname(CorineLandCoverProvider.LOCAL_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        console.log(`[CLC] Downloading dataset (this may take several minutes)...`);

        try {
            const response = await axios({
                method: 'GET',
                url: CorineLandCoverProvider.CLC_URL,
                responseType: 'stream',
                timeout: this.config.timeout,
                maxRedirects: 5
            });

            const writer = fs.createWriteStream(CorineLandCoverProvider.LOCAL_PATH);
            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });

            console.log(`[CLC] Dataset downloaded successfully`);
        } catch (error) {
            console.error('[CLC] Failed to download dataset:', error);
            throw error;
        }
    }

    /**
     * Load CLC GeoTIFF into memory
     */
    private async loadDataset(): Promise<void> {
        if (this.isLoaded) return;

        await this.ensureDataset();

        console.log('[CLC] Loading GeoTIFF into memory...');

        try {
            this.tiff = await fromFile(CorineLandCoverProvider.LOCAL_PATH);
            this.image = await this.tiff.getImage();
            this.isLoaded = true;

            console.log('[CLC] Dataset loaded successfully');
            console.log(`[CLC] Image dimensions: ${this.image.getWidth()} x ${this.image.getHeight()}`);
        } catch (error) {
            console.error('[CLC] Failed to load dataset:', error);
            throw error;
        }
    }

    /**
     * Sample CLC class at specific coordinate
     */
    private async sampleClass(lat: number, lon: number): Promise<number | null> {
        await this.loadDataset();

        try {
            const bbox = this.image.getBoundingBox();
            const width = this.image.getWidth();
            const height = this.image.getHeight();

            // Calculate pixel coordinates
            const x = Math.floor(((lon - bbox[0]) / (bbox[2] - bbox[0])) * width);
            const y = Math.floor(((bbox[3] - lat) / (bbox[3] - bbox[1])) * height);

            // Bounds check
            if (x < 0 || x >= width || y < 0 || y >= height) {
                return null;
            }

            // Read pixel window (1x1)
            const window = [x, y, x + 1, y + 1];
            const data = await this.image.readRasters({ window });

            const clcClass = data[0][0];

            // Validate class range (1-44, plus some nodata values)
            if (clcClass < 1 || clcClass > 999) {
                return null;
            }

            // Filter out invalid/nodata classes
            if (clcClass > 44 && clcClass < 100) {
                return null;
            }

            // Return valid class (1-44)
            return clcClass <= 44 ? clcClass : null;
        } catch (error) {
            console.error(`[CLC] Error sampling class at ${lat}, ${lon}:`, error);
            return null;
        }
    }

    async fetchPoint(point: GeoPoint, timestamp?: string): Promise<GeoData | null> {
        if (!this.hasCoverage(point)) {
            return null;
        }

        return this.withRetry(async () => {
            const clcClass = await this.sampleClass(point.lat, point.lon);

            if (clcClass === null) {
                return null;
            }

            const ts = timestamp || await this.getLatestTimestamp();

            return {
                value: clcClass,
                lat: point.lat,
                lon: point.lon,
                timestamp: ts,
                source: this.metadata.source,
                quality: 0.95, // Very high quality official dataset
                unit: 'class'
            };
        }, `fetchPoint(${point.lat}, ${point.lon})`);
    }

    async fetchBatch(points: GeoPoint[], timestamp?: string): Promise<Map<string, GeoData>> {
        const results = new Map<string, GeoData>();
        const ts = timestamp || await this.getLatestTimestamp();

        await this.loadDataset();

        await Promise.all(
            points.map(async (point) => {
                if (!this.hasCoverage(point)) return;

                try {
                    const clcClass = await this.sampleClass(point.lat, point.lon);

                    if (clcClass !== null) {
                        const key = `${point.lat}_${point.lon}`;
                        results.set(key, {
                            value: clcClass,
                            lat: point.lat,
                            lon: point.lon,
                            timestamp: ts,
                            source: this.metadata.source,
                            quality: 0.95,
                            unit: 'class'
                        });
                    }
                } catch (error) {
                    console.warn(`[CLC] Failed to fetch point ${point.lat}, ${point.lon}:`, error);
                }
            })
        );

        console.log(`[CLC] Fetched ${results.size} data points for ${points.length} locations`);
        return results;
    }

    async fetchArea(bbox: BoundingBox, resolution: number, timestamp?: string): Promise<GeoData[]> {
        const results: GeoData[] = [];
        const ts = timestamp || await this.getLatestTimestamp();

        await this.loadDataset();

        for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += resolution) {
            for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += resolution) {
                if (!this.hasCoverage({ lat, lon })) continue;

                try {
                    const clcClass = await this.sampleClass(lat, lon);

                    if (clcClass !== null) {
                        results.push({
                            value: clcClass,
                            lat,
                            lon,
                            timestamp: ts,
                            source: this.metadata.source,
                            quality: 0.95,
                            unit: 'class'
                        });
                    }
                } catch (error) {
                    // Continue on error
                }
            }
        }

        return results;
    }

    /**
     * Get textual description of CLC class
     */
    static getClassDescription(clcClass: number): string {
        const descriptions: Record<number, string> = {
            // 1xx - Artificial surfaces
            111: 'Continuous urban fabric',
            112: 'Discontinuous urban fabric',
            121: 'Industrial or commercial units',
            122: 'Road and rail networks',
            123: 'Port areas',
            124: 'Airports',
            131: 'Mineral extraction sites',
            132: 'Dump sites',
            133: 'Construction sites',
            141: 'Green urban areas',
            142: 'Sport and leisure facilities',
            // 2xx - Agricultural areas
            211: 'Non-irrigated arable land',
            212: 'Permanently irrigated land',
            213: 'Rice fields',
            221: 'Vineyards',
            222: 'Fruit trees and berry plantations',
            223: 'Olive groves',
            231: 'Pastures',
            241: 'Annual crops',
            242: 'Complex cultivation patterns',
            243: 'Agriculture with natural vegetation',
            244: 'Agro-forestry areas',
            // 3xx - Forest and semi-natural
            311: 'Broad-leaved forest',
            312: 'Coniferous forest',
            313: 'Mixed forest',
            321: 'Natural grasslands',
            322: 'Moors and heathland',
            323: 'Sclerophyllous vegetation',
            324: 'Transitional woodland-shrub',
            331: 'Beaches, dunes, sands',
            332: 'Bare rocks',
            333: 'Sparsely vegetated areas',
            334: 'Burnt areas',
            335: 'Glaciers and perpetual snow',
            // 4xx - Wetlands
            411: 'Inland marshes',
            412: 'Peat bogs',
            421: 'Salt marshes',
            422: 'Salines',
            423: 'Intertidal flats',
            // 5xx - Water bodies
            511: 'Water courses',
            512: 'Water bodies',
            521: 'Coastal lagoons',
            522: 'Estuaries',
            523: 'Sea and ocean'
        };
        return descriptions[clcClass] || `Unknown class ${clcClass}`;
    }

    /**
     * Get main category from CLC class
     */
    static getMainCategory(clcClass: number): string {
        const firstDigit = Math.floor(clcClass / 100);
        const categories: Record<number, string> = {
            1: 'Artificial surfaces',
            2: 'Agricultural areas',
            3: 'Forest and semi-natural areas',
            4: 'Wetlands',
            5: 'Water bodies'
        };
        return categories[firstDigit] || 'Unknown';
    }
}
