import { CellFeatures } from '@geo-lens/geocube';

export type AreaRequest = {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
    resolution: number;
};

export interface DatasetProvenance {
    source: string;
    isMock: boolean;
    datasetVersion?: string;
    missingReason?: string;
    latencyMs?: number;
    // Extended fields
    layer?: string;
    datasetId?: string;
    tRef?: string;
    retrievedAt?: string;
    cacheHit?: boolean;
    howToFix?: string;
}

export interface DatasetAdapter {
    getMetadata(): { name: string; description: string }; // Existing method usually? No, seems missing from file view but used in code. Wait, previous view didn't show getMetadata. Let's check usages.
    // Based on previous view, `getMetadata` wasn't there, but `realClcAdapter` used `this.provider.getMetadata()`. 
    // The ADAPTER interface might not have had it.
    // I will add getProvenance.

    getProvenance(): DatasetProvenance;

    ensureCoverageForArea(area: AreaRequest): Promise<void>;
    verify?(): Promise<boolean>; // Fast health/availability check
    sampleFeaturesForH3Cells(
        area: AreaRequest,
        h3Indices: string[]
    ): Promise<Record<string, Partial<CellFeatures>>>;
}
