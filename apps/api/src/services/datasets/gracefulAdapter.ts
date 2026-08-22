import { DatasetAdapter, AreaRequest, DatasetProvenance } from './types';
import { CellFeatures } from '@geo-lens/geocube';

export class GracefulAdapter implements DatasetAdapter {
    private currentAdapter: DatasetAdapter;
    private realAdapter: DatasetAdapter;
    private mockAdapter: DatasetAdapter;
    private isFallbackActive: boolean = false;
    private checkComplete: boolean = false;
    private usingMock: boolean = false;

    constructor(realAdapter: DatasetAdapter, mockAdapter: DatasetAdapter) {
        this.realAdapter = realAdapter;
        this.mockAdapter = mockAdapter;
        this.currentAdapter = realAdapter; // Optimistically start with real
    }

    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        if (this.checkComplete && this.isFallbackActive) {
            return this.mockAdapter.ensureCoverageForArea(area);
        }

        try {
            await this.realAdapter.ensureCoverageForArea(area);
            this.checkComplete = true;
        } catch (error) {
            console.warn(`[GracefulAdapter] Real adapter ${this.realAdapter.constructor.name} failed. Falling back to ${this.mockAdapter.constructor.name}. Error:`, error);
            this.currentAdapter = this.mockAdapter;
            this.isFallbackActive = true;
            this.checkComplete = true;
            this.usingMock = true; // Mark as using mock
            // Ensure mock is ready
            await this.mockAdapter.ensureCoverageForArea(area);
        }
    }



    getMetadata(): { name: string; description: string } {
        return this.realAdapter.getMetadata();
    }

    getProvenance(): DatasetProvenance {
        // If we are currently in a fallback state (usingMock=true), return mock provenance
        if (this.usingMock) {
            const prov = this.mockAdapter.getProvenance();
            prov.missingReason = 'Real adapter failed (Graceful fallback)';
            prov.howToFix = 'Check logs for Real adapter failure details';
            return prov;
        }
        // Otherwise try to get real provenance
        return this.realAdapter.getProvenance();
    }

    async sampleFeaturesForH3Cells(area: AreaRequest, h3Indices: string[]): Promise<Record<string, Partial<CellFeatures>>> {
        try {
            return await this.currentAdapter.sampleFeaturesForH3Cells(area, h3Indices);
        } catch (error) {
            if (!this.isFallbackActive) {
                console.warn(`[GracefulAdapter] Runtime failure in real adapter. Switching to mock.`);
                this.isFallbackActive = true;
                this.usingMock = true;
                this.currentAdapter = this.mockAdapter;
                return this.mockAdapter.sampleFeaturesForH3Cells(area, h3Indices);
            }
            throw error;
        }
    }
}
