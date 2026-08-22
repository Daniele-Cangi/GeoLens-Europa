import {
  CopernicusDemClient,
  DemProviderResult,
} from '@geo-lens/providers';
import { CellFeatures } from '@geo-lens/geocube';
import {
  AreaRequest,
  DatasetAdapter,
  DatasetProvenance,
} from './types';

export class RealDemAdapter implements DatasetAdapter {
  private readonly provider = new CopernicusDemClient();

  getProvenance(): DatasetProvenance {
    return {
      source: 'Copernicus DEM GLO-30',
      isMock: false,
      datasetVersion: 'GLO-30',
    };
  }

  getMetadata(): { name: string; description: string } {
    return {
      name: 'Copernicus DEM',
      description:
        'Canonical elevation and derived slope evidence from GLO-30',
    };
  }

  async verify(): Promise<boolean> {
    return true;
  }

  async ensureCoverageForArea(
    _area: AreaRequest,
  ): Promise<void> {
    return Promise.resolve();
  }

  async getEvidenceForH3Cells(
    h3Indices: string[],
  ): Promise<DemProviderResult> {
    return this.provider.getEvidence({ h3Indices });
  }

  async sampleFeaturesForH3Cells(
    _area: AreaRequest,
    h3Indices: string[],
  ): Promise<Record<string, Partial<CellFeatures>>> {
    const batch = await this.getEvidenceForH3Cells(h3Indices);
    const unavailable: string[] = [];
    const results: Record<string, Partial<CellFeatures>> = {};

    for (const h3 of h3Indices) {
      const cell = batch.cells[h3];
      const elevation = cell.elevationM.value;
      const slope = cell.slopeDeg.value;

      if (
        cell.elevationM.quality.status !== 'available' ||
        cell.slopeDeg.quality.status !== 'available' ||
        elevation === null ||
        slope === null
      ) {
        unavailable.push(
          `${h3}:elevation=${cell.elevationM.quality.status},slope=${cell.slopeDeg.quality.status}`,
        );
        continue;
      }

      results[h3] = {
        elevation,
        slope,
      };
    }

    if (unavailable.length > 0) {
      throw new Error(
        `Canonical DEM evidence unavailable for ${unavailable.join('; ')}`,
      );
    }

    return results;
  }
}
