import fs from 'fs';
import path from 'path';
import { CellScore } from '@geo-lens/geocube';
import { RiskResult } from '@geo-lens/risk-engine';
import { CellFeatures } from '@geo-lens/geocube';
import { DatasetProvenance } from './datasets/types';

// V1 Cache File
const CACHE_FILE_V1 = path.resolve(__dirname, '../../../../data/intermediate/h3_cache.json');
// V2 Cache File
const CACHE_FILE_V2 = path.resolve(__dirname, '../../../../data/intermediate/h3_cache_v2.json');

// Ensure directory exists
const cacheDir = path.dirname(CACHE_FILE_V1);
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

// ============================================================================
// V1 CACHE (Legacy)
// ============================================================================

export interface H3CacheRecord extends CellScore {
    updatedAt: string;
    sourceHash: string;
    data_status?: {
        precipitation?: DatasetProvenance;
        clc?: DatasetProvenance;
        dem?: DatasetProvenance;
        elsus?: DatasetProvenance;
        eshm20?: DatasetProvenance;
    };
}

class H3CacheService {
    private cache: Map<string, H3CacheRecord>;
    private dirty: boolean = false;

    constructor() {
        this.cache = new Map();
        this.load();
        setInterval(() => this.save(), 60000);
    }

    private load() {
        if (fs.existsSync(CACHE_FILE_V1)) {
            try {
                const data = JSON.parse(fs.readFileSync(CACHE_FILE_V1, 'utf-8'));
                if (Array.isArray(data)) {
                    data.forEach((record: H3CacheRecord) => {
                        this.cache.set(record.h3Index, record);
                    });
                    console.log(`[H3CacheV1] Loaded ${this.cache.size} records.`);
                }
            } catch (e) {
                console.error('[H3CacheV1] Failed to load cache:', e);
            }
        }
    }

    private save() {
        if (!this.dirty) return;
        try {
            const data = Array.from(this.cache.values());
            fs.writeFileSync(CACHE_FILE_V1, JSON.stringify(data));
            this.dirty = false;
            console.log(`[H3CacheV1] Saved ${data.length} records.`);
        } catch (e) {
            console.error('[H3CacheV1] Failed to save cache:', e);
        }
    }

    public get(h3Index: string): H3CacheRecord | undefined {
        return this.cache.get(h3Index);
    }

    public set(h3Index: string, record: H3CacheRecord) {
        this.cache.set(h3Index, record);
        this.dirty = true;
    }

    public has(h3Index: string): boolean {
        return this.cache.has(h3Index);
    }

    public getMulti(h3Indices: string[]): (H3CacheRecord | undefined)[] {
        return h3Indices.map(index => this.cache.get(index));
    }

    /**
     * Clear entire cache (memory + file)
     */
    public clear() {
        const previousSize = this.cache.size;
        this.cache.clear();
        this.dirty = true;
        this.save();
        console.log(`[H3CacheV1] Cleared ${previousSize} records.`);
    }

    /**
     * Invalidate cache entries without NASA precipitation data
     * Call this when NASA provider becomes available
     */
    public invalidateWithoutPrecip() {
        let invalidated = 0;
        for (const [h3Index, record] of this.cache) {
            // Invalidate records that don't have NASA precipitation data
            if (record.sourceHash !== 'v3-nasa-imerg' ||
                record.water.rain24h === undefined ||
                record.water.rain24h === null) {
                this.cache.delete(h3Index);
                invalidated++;
            }
        }
        if (invalidated > 0) {
            this.dirty = true;
            console.log(`[H3CacheV1] Invalidated ${invalidated} records without NASA precipitation data.`);
        }
        return invalidated;
    }

    public size(): number {
        return this.cache.size;
    }
}

export const h3Cache = new H3CacheService();

// ============================================================================
// V2 CACHE (RiskDistribution)
// ============================================================================

export interface H3CacheRecordV2 {
    h3Index: string;
    timestamp: string;
    features: CellFeatures;
    risks: {
        landslide: RiskResult;
        seismic: RiskResult;
        water: RiskResult;
        mineral: RiskResult;
    };
    updatedAt: string;
    sourceHash: string;
}

class H3CacheServiceV2 {
    private cache: Map<string, H3CacheRecordV2>;
    private dirty: boolean = false;

    constructor() {
        this.cache = new Map();
        this.load();
        setInterval(() => this.save(), 60000);
    }

    private load() {
        if (fs.existsSync(CACHE_FILE_V2)) {
            try {
                const data = JSON.parse(fs.readFileSync(CACHE_FILE_V2, 'utf-8'));
                if (Array.isArray(data)) {
                    data.forEach((record: H3CacheRecordV2) => {
                        this.cache.set(record.h3Index, record);
                    });
                    console.log(`[H3CacheV2] Loaded ${this.cache.size} records.`);
                }
            } catch (e) {
                console.error('[H3CacheV2] Failed to load cache:', e);
            }
        }
    }

    private save() {
        if (!this.dirty) return;
        try {
            const data = Array.from(this.cache.values());
            fs.writeFileSync(CACHE_FILE_V2, JSON.stringify(data));
            this.dirty = false;
            console.log(`[H3CacheV2] Saved ${data.length} records.`);
        } catch (e) {
            console.error('[H3CacheV2] Failed to save cache:', e);
        }
    }

    public get(h3Index: string): H3CacheRecordV2 | undefined {
        return this.cache.get(h3Index);
    }

    public set(h3Index: string, record: H3CacheRecordV2) {
        this.cache.set(h3Index, record);
        this.dirty = true;
    }

    public getMulti(h3Indices: string[]): (H3CacheRecordV2 | undefined)[] {
        return h3Indices.map(index => this.cache.get(index));
    }
}

export const h3CacheV2 = new H3CacheServiceV2();
