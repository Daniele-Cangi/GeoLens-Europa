import { DatasetAdapter, AreaRequest, DatasetProvenance } from './types';
import { CellFeatures } from '@geo-lens/geocube';
import { h3ToLatLon } from '@geo-lens/core-geo';

export class DemAdapter implements DatasetAdapter {
    getProvenance(): DatasetProvenance {
        return {
            source: 'Synthetic Terrain Generator (Perlin Noise)',
            isMock: true,
            layer: 'dem'
        };
    }

    getMetadata() {
        return {
            name: 'Mock DEM',
            description: 'Generated synthetic elevation data'
        };
    }

    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        // In a real implementation, this would check if we have the DEM tiles for the BBOX
        // and download them if missing.
        // For MVP/On-Demand, we'll assume we either have them or use a mock generator.
        console.log('[DemAdapter] Ensuring coverage for', area);
        return Promise.resolve();
    }

    async sampleFeaturesForH3Cells(area: AreaRequest, h3Indices: string[]): Promise<Record<string, Partial<CellFeatures>>> {
        const results: Record<string, Partial<CellFeatures>> = {};

        h3Indices.forEach(h3Index => {
            const { lat, lon } = h3ToLatLon(h3Index);

            // Generate deterministic mock values based on location
            const elevation = Math.max(0, (Math.sin(lat * 0.1) + Math.cos(lon * 0.1)) * 1000 + Math.random() * 50);
            const slope = Math.abs(Math.sin(lat * 10) * 45); // Mock slope

            results[h3Index] = {
                elevation,
                slope
            };
        });

        return results;
    }
}
