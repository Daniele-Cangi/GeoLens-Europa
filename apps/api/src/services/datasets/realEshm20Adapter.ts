/**
 * Real ESHM20 Adapter - Bridge between DatasetAdapter interface and ESHM20Provider
 */

import { DatasetAdapter, AreaRequest, DatasetProvenance } from './types';
import { CellFeatures } from '@geo-lens/geocube';
import { h3ToLatLon } from '@geo-lens/core-geo';
import { ESHM20Provider } from './providers/eshm20';

export class RealEshm20Adapter implements DatasetAdapter {
    private provider: ESHM20Provider;

    constructor() {
        this.provider = new ESHM20Provider();
        console.log('[RealEshm20Adapter] Initialized with ESHM20 provider');
    }

    getProvenance(): DatasetProvenance {
        return {
            source: 'ESHM20 Seismic Hazard Model (PGA 475y)',
            isMock: false,
            datasetVersion: '2020'
        };
    }

    getMetadata(): { name: string; description: string } {
        return {
            name: 'ESHM20',
            description: 'European Seismic Hazard Model 2020'
        };
    }

    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        console.log('[RealEshm20Adapter] Coverage check:', {
            bbox: `${area.minLat},${area.minLon} - ${area.maxLat},${area.maxLon}`,
            provider: this.provider.getMetadata().name
        });
        return Promise.resolve();
    }

    async sampleFeaturesForH3Cells(
        area: AreaRequest,
        h3Indices: string[]
    ): Promise<Record<string, Partial<CellFeatures>>> {
        const results: Record<string, Partial<CellFeatures>> = {};

        console.log(`[RealEshm20Adapter] Fetching real seismic hazard (PGA) for ${h3Indices.length} cells`);

        const points = h3Indices.map(h3Index => {
            const { lat, lon } = h3ToLatLon(h3Index);
            return { lat, lon, h3Index };
        });

        const geoPoints = points.map(p => ({ lat: p.lat, lon: p.lon }));
        const geoData = await this.provider.fetchBatch(geoPoints);

        for (const point of points) {
            const key = `${point.lat}_${point.lon}`;
            const data = geoData.get(key);

            if (data) {
                results[point.h3Index] = {
                    hazardPGA: data.value
                };
            }
        }

        const successCount = Object.keys(results).length;
        const successRate = ((successCount / h3Indices.length) * 100).toFixed(1);

        console.log(`[RealEshm20Adapter] Successfully fetched ${successCount}/${h3Indices.length} cells (${successRate}%)`);

        return results;
    }
}
