/**
 * Real DEM Adapter - Bridge between DatasetAdapter interface and CopernicusDEMProvider
 */

import { DatasetAdapter, AreaRequest, DatasetProvenance } from './types';
import { CellFeatures } from '@geo-lens/geocube';
import { h3ToLatLon } from '@geo-lens/core-geo';
import * as fs from 'fs';
import { CopernicusDEMProvider } from './providers/copernicusDEM';

export class RealDemAdapter implements DatasetAdapter {
    private provider: CopernicusDEMProvider;
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
        this.provider = new CopernicusDEMProvider();
        console.log('[RealDemAdapter] Initialized with Copernicus DEM GLO-30 provider');
    }

    getProvenance(): DatasetProvenance {
        return {
            source: 'Copernicus DEM GLO-30',
            isMock: false,
            datasetVersion: 'GLO-30'
        };
    }

    getMetadata(): { name: string; description: string } {
        return {
            name: 'Copernicus DEM',
            description: 'Digital Elevation Model GLO-30'
        };
    }

    async verify(): Promise<boolean> {
        try {
            await fs.promises.access(this.filePath);
            return true;
        } catch {
            return false;
        }
    }

    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        console.log('[RealDemAdapter] Coverage check:', {
            bbox: `${area.minLat},${area.minLon} - ${area.maxLat},${area.maxLon}`,
            provider: this.provider.getMetadata().name
        });
        // Coverage is global, no pre-download needed for AWS S3 access
        return Promise.resolve();
    }

    async sampleFeaturesForH3Cells(
        area: AreaRequest,
        h3Indices: string[]
    ): Promise<Record<string, Partial<CellFeatures>>> {
        const results: Record<string, Partial<CellFeatures>> = {};

        console.log(`[RealDemAdapter] Fetching real elevation data for ${h3Indices.length} cells`);

        // Convert H3 indices to lat/lon points
        const points = h3Indices.map(h3Index => {
            const { lat, lon } = h3ToLatLon(h3Index);
            return { lat, lon, h3Index };
        });

        // Batch fetch from provider
        let geoData = new Map<string, { value: number; source: string }>();
        const geoPoints = points.map(p => ({ lat: p.lat, lon: p.lon }));
        geoData = await this.provider.fetchBatch(geoPoints);

        // Map results back to H3 indices
        for (const point of points) {
            const elevationKey = `${point.lat}_${point.lon}`;
            const slopeKey = `${point.lat}_${point.lon}_slope`;

            const elevationData = geoData.get(elevationKey);
            const slopeData = geoData.get(slopeKey);

            if (elevationData || slopeData) {
                results[point.h3Index] = {
                    elevation: elevationData?.value ?? undefined,
                    slope: slopeData?.value ?? undefined
                };
            }
        }

        const successCount = Object.keys(results).length;
        const successRate = ((successCount / h3Indices.length) * 100).toFixed(1);

        console.log(`[RealDemAdapter] Successfully fetched ${successCount}/${h3Indices.length} cells (${successRate}%)`);

        return results;
    }
}
