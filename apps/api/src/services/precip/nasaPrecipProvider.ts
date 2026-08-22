import { Evidence } from '@geo-lens/evidence';
import {
  ImergProviderResult,
  NasaImergClient,
} from '@geo-lens/providers';

const DEFAULT_SERVICE_URL =
  process.env.NASA_PRECIP_URL ?? 'http://127.0.0.1:8001';

export interface PrecipData {
  readonly rain24h_mm: number | null;
  readonly rain72h_mm: number | null;
  readonly rain24h: Evidence<number>;
  readonly rain72h: Evidence<number>;
}

export interface PrecipBatch {
  readonly cells: Readonly<Record<string, PrecipData>>;
  readonly providerResult: ImergProviderResult;
}

/**
 * Transitional legacy-API wrapper over the sole production IMERG client.
 *
 * It exposes nullable numbers only for old CellFeatures consumers. Canonical
 * evidence remains attached and no error or null is converted to zero.
 */
export class NasaPrecipProvider {
  private readonly baseUrl: string;
  private readonly client: NasaImergClient;

  constructor(baseUrl: string = DEFAULT_SERVICE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.client = new NasaImergClient({ baseUrl: this.baseUrl });
  }

  async healthCheck(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        return false;
      }

      const body = await response.json() as {
        readonly status?: unknown;
      };
      return body.status === 'healthy';
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getForH3Indices(
    h3Indices: readonly string[],
    referenceTime: Date = new Date(),
  ): Promise<PrecipBatch> {
    const providerResult = await this.client.getEvidence({
      h3Indices,
      referenceTime,
      windowHours: [24, 72],
    });
    const window24 = providerResult.windows[24];
    const window72 = providerResult.windows[72];

    if (window24 === undefined || window72 === undefined) {
      throw new Error(
        'Canonical IMERG client omitted a requested window',
      );
    }

    const cells = Object.fromEntries(
      h3Indices.map((h3) => {
        const rain24h = window24.cells[h3];
        const rain72h = window72.cells[h3];

        if (rain24h === undefined || rain72h === undefined) {
          throw new Error(
            `Canonical IMERG client omitted requested H3 ${h3}`,
          );
        }

        return [
          h3,
          {
            rain24h_mm: rain24h.value,
            rain72h_mm: rain72h.value,
            rain24h,
            rain72h,
          },
        ];
      }),
    );

    return {
      cells,
      providerResult,
    };
  }
}

let providerInstance: NasaPrecipProvider | null = null;

export function getNasaPrecipProvider(): NasaPrecipProvider {
  if (providerInstance === null) {
    providerInstance = new NasaPrecipProvider();
  }

  return providerInstance;
}

export function isNasaPrecipEnabled(): boolean {
  return process.env.USE_REAL_DATA === 'true';
}
