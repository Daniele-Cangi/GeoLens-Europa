
import { AreaRequest } from '../datasets/types';
import { getH3ScoresForArea } from '../tileOrchestrator';
import { latLngToCell } from 'h3-js';

// Asset Interfaces
export interface StormwaterAsset {
    id: string;
    type: 'pipe' | 'catchment';
    geometry: GeoJSON.Geometry;
    h3Cells: string[];
    properties: Record<string, any>;
}

export interface AssetRiskReport {
    assetId: string;
    maxRisk: number;
    meanRisk: number;
    cellCount: number;
    cells: Array<{ h3Index: string; risk: number; class: string }>;
    dataStatus: any;
}

// In-Memory Storage
const assetStore = new Map<string, StormwaterAsset>();

/**
 * Import Assets (GeoJSON FeatureCollection)
 */
export function importAssets(geojson: GeoJSON.FeatureCollection): string[] {
    const importedIds: string[] = [];

    geojson.features.forEach((feature, idx) => {
        const id = feature.id?.toString() || `asset_${Date.now()}_${idx}`;
        const geom = feature.geometry;

        // Simple GeoJSON -> H3 conversion (Centroid approach for MVP)
        // For Polygons/Lines, we should rasterize, but for MVP we pick a representative set.
        let cells: string[] = [];

        if (geom.type === 'Point') {
            const [lon, lat] = geom.coordinates;
            // High res for assets (Res 10 approx 60m edge)
            cells.push(latLngToCell(lat, lon, 10));
        } else if (geom.type === 'LineString') {
            // Sample start and end
            const c1 = geom.coordinates[0];
            const c2 = geom.coordinates[geom.coordinates.length - 1];
            cells.push(latLngToCell(c1[1], c1[0], 10));
            cells.push(latLngToCell(c2[1], c2[0], 10));
        } else {
            // Fallback for Polygons: use first coordinate
            // TODO: Proper polyfill
            const c = (geom as any).coordinates[0][0];
            cells.push(latLngToCell(c[1], c[0], 10));
        }

        // Dedupe
        cells = [...new Set(cells)];

        const asset: StormwaterAsset = {
            id,
            type: (feature.properties?.type === 'catchment') ? 'catchment' : 'pipe',
            geometry: geom,
            h3Cells: cells,
            properties: feature.properties || {}
        };

        assetStore.set(id, asset);
        importedIds.push(id);
    });

    return importedIds;
}

export function getAssetsByIds(ids: string[]): StormwaterAsset[] {
    return ids.map(id => assetStore.get(id)).filter(Boolean) as StormwaterAsset[];
}

/**
 * Calculate Risk for Asset
 */
export async function getAssetRisk(assetId: string): Promise<AssetRiskReport | null> {
    const asset = assetStore.get(assetId);
    if (!asset) return null;

    // Use current location of cells to query orchestrator
    // We treat "Area" as the bounding box of these cells
    // Simplification: We query orchestrator one by one or batch if close?
    // Orchestrator takes BBOX. Let's compute bbox of cells.
    // For MVP, if cells are few, we can just fetch them individually? 
    // BUT orchestrator works on BBOX. 
    // Let's create a bbox around the first cell for now (simplification).
    // Or just invoke orchestrator for a generic area that covers them.

    // Better: Reuse logic but we need Orchestrator to support list of indices? 
    // Orchestrator signature: getH3ScoresForArea(area).
    // We can fake an area around the asset.

    // Let's use h3-js to get lat/lon of first cell
    const { cellToLatLng } = require('h3-js'); // Dynamic import or require
    const [lat, lon] = cellToLatLng(asset.h3Cells[0]);

    const area: AreaRequest = {
        minLat: lat - 0.05,
        maxLat: lat + 0.05,
        minLon: lon - 0.05,
        maxLon: lon + 0.05,
        resolution: 10
    };

    // CALL ORCHESTRATOR with PROFILE=STORMWATER
    // This enforces strict checks!
    const results = await getH3ScoresForArea(area, { profile: 'stormwater' });

    // Filter results for our asset cells
    const relevantRecords = results.filter(r => asset.h3Cells.includes(r.h3Index));

    if (relevantRecords.length === 0) {
        // Maybe failed strictly? Or just no coverage? 
        // If strict fail, orchestrator throws, so we catch it in route.
        return {
            assetId,
            maxRisk: 0,
            meanRisk: 0,
            cellCount: 0,
            cells: [],
            dataStatus: {}
        };
    }

    let maxRisk = 0;
    let sumRisk = 0;
    const cellRisks = relevantRecords.map(r => {
        // Safe access (v1 cache structure vs v2 vs new)
        const risk = (r.water as any).stormwater?.riskScore || 0;
        const rClass = (r.water as any).stormwater?.riskClass || 'N/A';

        if (risk > maxRisk) maxRisk = risk;
        sumRisk += risk;

        return { h3Index: r.h3Index, risk, class: rClass };
    });

    return {
        assetId,
        maxRisk,
        meanRisk: sumRisk / relevantRecords.length,
        cellCount: relevantRecords.length,
        cells: cellRisks,
        dataStatus: relevantRecords[0].data_status // Representative status
    };
}
