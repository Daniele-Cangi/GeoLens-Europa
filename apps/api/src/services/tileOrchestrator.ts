import { AreaRequest } from './datasets/types';
import { createDataAdapters } from './datasets/adapterFactory';
import { h3Cache, H3CacheRecord } from './h3Cache';
import { getCellsForBbox } from '@geo-lens/core-geo';
import {
    CellFeatures,
    computeWaterScore,
    computeLandslideScore,
    computeSeismicScore,
    computeMineralScore
} from '@geo-lens/geocube';
import {
    getNasaPrecipProvider,
    isNasaPrecipEnabled,
    PrecipData
} from './precip/nasaPrecipProvider';

// NASA precipitation provider (replaces old precipitation adapter)
const nasaPrecipProvider = isNasaPrecipEnabled() ? getNasaPrecipProvider() : null;

// Track if NASA provider has been checked for availability
let nasaProviderChecked = false;
let nasaProviderHealthy = false;

/**
 * Check NASA provider health and invalidate stale cache entries
 * Called once on first request when NASA provider is enabled
 */
async function checkNasaProviderAndInvalidateCache(): Promise<void> {
    if (nasaProviderChecked || !nasaPrecipProvider) return;
    nasaProviderChecked = true;

    try {
        nasaProviderHealthy = await nasaPrecipProvider.healthCheck();
        if (nasaProviderHealthy) {
            // Invalidate cache entries without NASA data so they get re-fetched
            const invalidated = h3Cache.invalidateWithoutPrecip();
            if (invalidated > 0) {
                console.log(`[TileOrchestrator] NASA provider healthy - invalidated ${invalidated} stale cache entries`);
            }
        }
    } catch (error) {
        console.warn('[TileOrchestrator] Failed to check NASA provider health:', error);
    }
}

import { computeRunoffRisk } from './stormwater/runoffRisk';

interface OrchestratorOptions {
    profile?: string;
}

export async function getH3ScoresForArea(area: AreaRequest, options: OrchestratorOptions = {}): Promise<H3CacheRecord[]> {
    const { profile } = options;

    // 0. HARDENING: Request Budget (8s total)
    const REQUEST_BUDGET_MS = 8000;
    const ADAPTER_TIMEOUT_MS = 3000;
    const startTime = Date.now();

    const checkBudget = () => {
        if (Date.now() - startTime > REQUEST_BUDGET_MS) {
            const err: any = new Error('Request Timeout (Budget Exceeded)');
            err.statusCode = 504;
            throw err;
        }
    };

    // 1. Determine Required Layers
    // required_for_request = env_required ∪ profile_required
    const envRequired = (process.env.GEO_REQUIRED_LAYERS || '').split(',').map(s => s.trim()).filter(Boolean);
    const requiredLayers = new Set<string>(envRequired);

    if (profile === 'stormwater') {
        requiredLayers.add('precipitation');
        requiredLayers.add('clc');
        requiredLayers.add('dem');
    }

    // 2. Initialize Adapters
    const adapters = createDataAdapters(requiredLayers);
    const adapterMap: Record<string, any> = {
        dem: adapters.dem,
        elsus: adapters.elsus,
        eshm20: adapters.eshm20,
        clc: adapters.clc
    };

    // 3. HARDENING: Verify Required Layers (Fail Fast)
    // Only check "Real" adapters that are REQUIRED
    // (adapterFactory returns RealAdapter directly for required layers)
    await Promise.all(Array.from(requiredLayers).map(async (layer) => {
        if (adapterMap[layer] && adapterMap[layer].verify) {
            const isHealthy = await adapterMap[layer].verify();
            if (!isHealthy) {
                const err: any = new Error(`Required data verification failed: ${layer}`);
                err.statusCode = 503;
                err.details = {
                    failed_layer: layer,
                    reason: 'Pre-flight verification failed (File missing or Service down)'
                };
                throw err;
            }
        }
    }));

    checkBudget();

    // Check NASA provider health once and invalidate stale cache
    await checkNasaProviderAndInvalidateCache();

    // 4. Generate H3 indices
    const h3Indices = getCellsForBbox({
        west: area.minLon,
        south: area.minLat,
        east: area.maxLon,
        north: area.maxLat
    }, area.resolution);

    const results: H3CacheRecord[] = [];
    const missingIndices: string[] = [];

    // 5. Check Cache
    h3Indices.forEach(index => {
        const cached = h3Cache.get(index);
        if (cached) {
            results.push(cached);
        } else {
            missingIndices.push(index);
        }
    });

    if (missingIndices.length === 0) {
        return results;
    }

    checkBudget();

    // Helper: Timeout Wrapper
    const withTimeout = async <T>(promise: Promise<T>, ms: number, fallbackVal?: T): Promise<T> => {
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Adapter Timeout')), ms);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } catch (e: any) {
            if (fallbackVal !== undefined) return fallbackVal;
            throw e;
        } finally {
            // @ts-ignore
            clearTimeout(timer);
        }
    };

    // 6. Ensure Coverage (Parallel with Timeouts)
    const safeEnsure = async (name: string, adapter: any) => {
        try {
            await withTimeout(adapter.ensureCoverageForArea(area), ADAPTER_TIMEOUT_MS);
            return null; // Success
        } catch (err: any) {
            console.warn(`[TileOrchestrator] ensureCoverage failed for ${name}:`, err.message);
            return {
                name,
                error: err,
                provenance: {
                    source: 'RealData (Failed)',
                    isMock: true,
                    missingReason: err.message || 'Coverage Check Failed'
                }
            };
        }
    };

    const coverageResults = await Promise.all([
        safeEnsure('dem', adapterMap.dem),
        safeEnsure('elsus', adapterMap.elsus),
        safeEnsure('eshm20', adapterMap.eshm20),
        safeEnsure('clc', adapterMap.clc)
    ]);

    checkBudget();

    // 7. Provenance Collection & Strict Mode Pre-Check
    const dataStatus: Record<string, any> = {
        precipitation: { source: 'N/A', isMock: true } as any
    };

    ['dem', 'elsus', 'eshm20', 'clc'].forEach((name, idx) => {
        const res = coverageResults[idx];
        if (res) {
            dataStatus[name] = res.provenance;
        } else {
            dataStatus[name] = adapterMap[name].getProvenance();
        }
    });

    // 8. Sample Features (with Timeouts)
    const safeSample = async (name: string, adapter: any, indices: string[]) => {
        if (dataStatus[name].missingReason) return {};

        try {
            return await withTimeout(adapter.sampleFeaturesForH3Cells(area, indices), ADAPTER_TIMEOUT_MS);
        } catch (err: any) {
            console.warn(`[TileOrchestrator] sampleFeatures failed for ${name}:`, err.message);
            dataStatus[name] = {
                source: 'RealData (Runtime Fail)',
                isMock: true,
                missingReason: err.message
            };
            return {};
        }
    };

    const [demData, elsusData, eshmData, clcData] = await Promise.all([
        safeSample('dem', adapterMap.dem, missingIndices),
        safeSample('elsus', adapterMap.elsus, missingIndices),
        safeSample('eshm20', adapterMap.eshm20, missingIndices),
        safeSample('clc', adapterMap.clc, missingIndices)
    ]);

    checkBudget();

    // 9. Fetch NASA precipitation
    let precipData: Readonly<Record<string, PrecipData>> = {};

    if (nasaPrecipProvider) {
        try {
            const batch = await withTimeout(
                nasaPrecipProvider.getForH3Indices(missingIndices),
                ADAPTER_TIMEOUT_MS
            );
            precipData = batch.cells;
            const unavailable = Object.values(precipData).flatMap(cell =>
                [cell.rain24h, cell.rain72h]
            ).filter(evidence => evidence.value === null);

            dataStatus.precipitation = {
                source: 'NASA GPM IMERG',
                isMock: false,
                status: unavailable.length === 0
                    ? 'available'
                    : unavailable[0].quality.status,
                missingReason: unavailable[0]?.quality.missingReason
            };
        } catch (error) {
            console.error('[TileOrchestrator] Failed to fetch NASA precipitation:', error);
            dataStatus.precipitation = {
                source: 'NASA GPM IMERG',
                isMock: false,
                status: 'upstream_error',
                missingReason: error instanceof Error ? error.message : 'Fetch error'
            };
        }
    } else {
        dataStatus.precipitation = {
            source: 'NASA GPM IMERG',
            isMock: false,
            status: 'missing',
            missingReason: 'Provider disabled'
        };
    }

    // 10. Strict Mode / Profile Validation
    const isStrictMode = process.env.GEO_REALDATA_MODE === 'strict';
    const enforceStrict = isStrictMode || profile === 'stormwater';

    if (enforceStrict) {
        const violations: string[] = [];

        const checkLayer = (name: string, prov: any) => {
            const unavailable =
                prov.isMock ||
                (prov.status !== undefined && prov.status !== 'available');

            if (requiredLayers.has(name) && unavailable) {
                violations.push(name);
            }
        };

        checkLayer('dem', dataStatus.dem);
        checkLayer('clc', dataStatus.clc);
        checkLayer('precipitation', dataStatus.precipitation);
        checkLayer('elsus', dataStatus.elsus);
        checkLayer('eshm20', dataStatus.eshm20);

        if (violations.length > 0) {
            const error = new Error(`Strict Data Requirement Failed. Missing/Mock layers: ${violations.join(', ')}`) as any;
            error.statusCode = 503;
            error.code = 'REALDATA_REQUIRED_MISSING';
            error.details = {
                message: 'Required real data layers are missing or using mock fallbacks.',
                required_layers: Array.from(requiredLayers),
                missing_layers: violations,
                data_status: dataStatus,
                how_to_fix: {
                    clc: 'data/raw/clc/CLC2018_100m.tif',
                    elsus: 'data/raw/elsus/elsus_v2.tif',
                    eshm20: 'data/raw/eshm20/eshm20_pga_475.tif',
                    precip: 'run nasa-precip-engine, set EARTHDATA creds',
                    dem: 'verify Copernicus DEM provider access (AWS/S3)'
                }
            };
            throw error;
        }
    }

    // 11. Compute Scores & Update Cache
    const newRecords: H3CacheRecord[] = missingIndices.map(h3Index => {
        const dem = demData[h3Index] || {};
        const elsus = elsusData[h3Index] || {};
        const eshm = eshmData[h3Index] || {};
        const clc = clcData[h3Index] || {};
        const precip = precipData?.[h3Index];

        const features: CellFeatures = {
            h3Index,
            elevation: dem.elevation,
            slope: dem.slope,
            elsusClass: elsus.elsusClass,
            hazardPGA: eshm.hazardPGA,
            clcClass: clc.clcClass,
            rain24h: precip?.rain24h_mm ?? undefined,
            rain72h: precip?.rain72h_mm ?? undefined
        };

        const waterScore = computeWaterScore(features);
        const landslideScore = computeLandslideScore(features);
        const seismicScore = computeSeismicScore(features);
        const mineralScore = computeMineralScore(features);

        // Stormwater Computation
        let stormwaterRisk = undefined;
        if (
            profile === 'stormwater' &&
            typeof features.rain24h === 'number' &&
            typeof features.clcClass === 'number' &&
            typeof features.slope === 'number'
        ) {
            stormwaterRisk = computeRunoffRisk({
                rain24h_mm: features.rain24h,
                clcClass: features.clcClass,
                slope_deg: features.slope
            });
        }

        const record: H3CacheRecord = {
            h3Index,
            updatedAt: new Date().toISOString(),
            sourceHash: 'v4-multi-adapter',
            water: {
                stress: waterScore,
                recharge: 1 - waterScore,
                score: waterScore,
                rain24h: features.rain24h,
                rain72h: features.rain72h,
                ...(stormwaterRisk ? { stormwater: stormwaterRisk } : {})
            } as any,
            landslide: { susceptibility: landslideScore, history: false, score: landslideScore },
            seismic: { pga: features.hazardPGA || 0, class: (features.hazardPGA || 0) > 0.2 ? 'HIGH' : 'LOW', score: seismicScore },
            mineral: { prospectivity: mineralScore, type: mineralScore > 0.5 ? 'Potential' : 'None', score: mineralScore },
            metadata: {
                lat: 0,
                lon: 0,
                elevation: features.elevation || 0,
                biome: 'Unknown'
            },
            data_status: dataStatus
        };

        h3Cache.set(h3Index, record);
        return record;
    });

    return [...results, ...newRecords];
}

/**
 * Low-level batch fetch for specific cells (used by NetworkGraph)
 */
export async function getDataForCells(cellIds: string[], requiredLayers: string[] = []) {
    const adapters = createDataAdapters(new Set(requiredLayers)) as any;

    // Check verification if strict
    const hardFail = (process.env.GEO_REALDATA_MODE === 'strict');
    if (hardFail) {
        for (const layer of requiredLayers) {
            const adapter = adapters[layer];
            if (adapter && adapter.verify && !(await adapter.verify())) {
                throw {
                    status: 503,
                    error: `Required data verification failed: ${layer}`,
                    details: { failed_layer: layer, reason: "Pre-flight verification failed" }
                };
            }
        }
    }

    const tasks = cellIds.map(async (h3Index) => {
        const features: Partial<CellFeatures> = {};
        const prov: Record<string, any> = {};

        // Parallel fetch for all adapters
        await Promise.all(Object.entries(adapters).map(async ([key, adapter]) => {
            try {
                // Should pass AreaRequest? The adapter interface is sampleFeaturesForH3Cells(area, indices).
                // But mock adapters ignore area. Real adapters might need it if they look up files based on bbox?
                // RealDemAdapter uses indices directly if provided, ignoring area usually. 
                // Let's pass a dummy area for safety.
                const dummyArea = { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0, resolution: 11, type: "strict_point" as any };

                const data = await adapter.sampleFeaturesForH3Cells(dummyArea, [h3Index]);

                // sampleFeatures returns dictionary { h3: { features } }
                if (data && data[h3Index]) {
                    Object.assign(features, data[h3Index]);
                }

                if (adapter.getProvenance) {
                    prov[key] = adapter.getProvenance(h3Index);
                }
            } catch (e) {
                // Ignore
            }
        }));

        return { h3Index, ...features, provenance: prov };
    });

    return Promise.all(tasks);
}
