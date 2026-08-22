import {
  CorineLandCoverClient,
  LandCoverProviderResult,
} from '@geo-lens/providers';
import { CellFeatures } from '@geo-lens/geocube';
import * as fs from 'fs';
import * as path from 'path';
import {
  AreaRequest,
  DatasetAdapter,
  DatasetProvenance,
} from './types';

export class RealClcAdapter implements DatasetAdapter {
  private readonly filePath: string;
  private readonly provider: CorineLandCoverClient;

  constructor(
    filePath =
      process.env.CLC_RASTER_PATH ??
      path.join(
        process.cwd(),
        'data',
        'raw',
        'clc',
        'CLC2018_100m.tif',
      ),
  ) {
    this.filePath = filePath;
    this.provider = new CorineLandCoverClient({
      rasterLocation: filePath,
    });
  }

  getProvenance(): DatasetProvenance {
    return {
      source: 'CORINE Land Cover 2018',
      isMock: false,
      datasetVersion: 'CLC2018',
    };
  }

  getMetadata(): { name: string; description: string } {
    return {
      name: 'CORINE Land Cover 2018',
      description:
        'Canonical CLC level-3 class evidence at 100 m source resolution',
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

  async ensureCoverageForArea(
    _area: AreaRequest,
  ): Promise<void> {
    return Promise.resolve();
  }

  async getEvidenceForH3Cells(
    h3Indices: string[],
  ): Promise<LandCoverProviderResult> {
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
      const evidence = batch.cells[h3].classCode;
      const classCode = evidence.value;

      if (
        evidence.quality.status !== 'available' ||
        classCode === null
      ) {
        unavailable.push(
          `${h3}:landCover=${evidence.quality.status}`,
        );
        continue;
      }

      results[h3] = {
        clcClass: classCode,
      };
    }

    if (unavailable.length > 0) {
      throw new Error(
        `Canonical CLC evidence unavailable for ${unavailable.join('; ')}`,
      );
    }

    return results;
  }
}
