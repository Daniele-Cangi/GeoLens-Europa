/**
 * Adapter Factory - Centralized selection between mock and real data providers
 *
 * Environment variable USE_REAL_DATA controls which adapters to use:
 * - USE_REAL_DATA=true  -> Use real satellite/geospatial data providers
 * - USE_REAL_DATA=false -> Use mock data generators (faster, no external dependencies)
 */

import * as dotenv from 'dotenv';
import { DatasetAdapter } from './types';

// Load environment variables before checking USE_REAL_DATA
dotenv.config();

// Mock adapters
import { DemAdapter } from './demAdapter';
import { ElsusAdapter } from './elsusAdapter';
import { Eshm20Adapter } from './eshm20Adapter';
import { ClcAdapter } from './clcAdapter';

// Real adapters
import { RealDemAdapter } from './realDemAdapter';
import { RealElsusAdapter } from './realElsusAdapter';
import { RealEshm20Adapter } from './realEshm20Adapter';
import { RealClcAdapter } from './realClcAdapter';
import { RealPrecipitationAdapter } from './realPrecipitationAdapter';
import { GracefulAdapter } from './gracefulAdapter';

export interface DataAdapters {
    dem: DatasetAdapter;
    elsus: DatasetAdapter;
    eshm20: DatasetAdapter;
    clc: DatasetAdapter;
    precipitation?: DatasetAdapter; // Optional, only available with real data
}

/**
 * Create data adapters based on environment configuration
 */
export function createDataAdapters(requiredLayers: Set<string> = new Set()): DataAdapters {
    const useRealData = process.env.USE_REAL_DATA === 'true';
    const realDataMode = process.env.GEO_REALDATA_MODE || 'best_effort'; // strict | best_effort
    const isGlobalStrict = realDataMode === 'strict';

    console.log(`[AdapterFactory] Config: USE_REAL_DATA=${useRealData}, MODE=${realDataMode}, REQUIRED=${Array.from(requiredLayers).join(',')}`);

    if (useRealData) {
        console.log('🌍 [AdapterFactory] Initializing REAL geospatial data providers...');

        // Helper: If strict mode AND layer is required -> Use Real Adapter directly (Fail Fast)
        //         Else -> Use Graceful Adapter (Real -> Mock Fallback)
        const getAdapter = (layerName: string, real: DatasetAdapter, mock: DatasetAdapter) => {
            const isRequired = requiredLayers.has(layerName);

            // STRICT REQUIREMENT: If a layer is required (by env or profile), 
            // we MUST use the Real adapter directly. 
            // We do NOT wrap in GracefulAdapter because we want to fail hard/fast 
            // if the real data is missing, rather than silently falling back to mock.
            if (isRequired) {
                console.log(`[AdapterFactory] Enforcing REAL data for required layer: ${layerName}`);
                return real;
            }
            return new GracefulAdapter(real, mock);
        };

        return {
            dem: getAdapter('dem', new RealDemAdapter(), new DemAdapter()),
            elsus: getAdapter('elsus', new RealElsusAdapter(), new ElsusAdapter()),
            eshm20: getAdapter('eshm20', new RealEshm20Adapter(), new Eshm20Adapter()),
            clc: getAdapter('clc', new RealClcAdapter(), new ClcAdapter()),

            // Precip is microservice-based; Orchestrator handles its specific fallback logic
            precipitation: new RealPrecipitationAdapter()
        };
    } else {
        console.log('🔧 [AdapterFactory] Using MOCK data generators.');
        return {
            dem: new DemAdapter(),
            elsus: new ElsusAdapter(),
            eshm20: new Eshm20Adapter(),
            clc: new ClcAdapter()
        };
    }
}


/**
 * Get description of current data source mode
 */
export function getDataSourceInfo(): {
    mode: 'real' | 'mock';
    providers: string[];
    latency: string;
    coverage: string;
} {
    const useRealData = process.env.USE_REAL_DATA === 'true';

    if (useRealData) {
        return {
            mode: 'real',
            providers: [
                'Copernicus DEM GLO-30 (AWS S3)',
                'GPM IMERG Early Run (NASA GES DISC)',
                'ELSUS v2 (ESDAC/JRC)',
                'ESHM20 (EFEHR)',
                'CLC2018 (Copernicus Land Monitoring)'
            ],
            latency: '4-6 hours (precipitation), static (terrain/hazard)',
            coverage: 'Europe (35°N-72°N, -10°W-30°E) + Global DEM'
        };
    } else {
        return {
            mode: 'mock',
            providers: ['Synthetic data generators'],
            latency: 'instant',
            coverage: 'global (mock)'
        };
    }
}
