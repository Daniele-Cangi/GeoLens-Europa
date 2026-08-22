import * as dotenv from 'dotenv';

import { DatasetAdapter } from './types';
import { ClcAdapter } from './clcAdapter';
import { DemAdapter } from './demAdapter';
import { ElsusAdapter } from './elsusAdapter';
import { Eshm20Adapter } from './eshm20Adapter';
import { RealClcAdapter } from './realClcAdapter';
import { RealDemAdapter } from './realDemAdapter';
import { RealElsusAdapter } from './realElsusAdapter';
import { RealEshm20Adapter } from './realEshm20Adapter';

dotenv.config();

export interface DataAdapters {
  readonly dem: DatasetAdapter;
  readonly elsus: DatasetAdapter;
  readonly eshm20: DatasetAdapter;
  readonly clc: DatasetAdapter;
}

/**
 * Select one explicit runtime mode.
 *
 * Live mode never changes provider after construction. Synthetic adapters are
 * reachable only when USE_REAL_DATA is not true and are therefore an explicit
 * legacy fixture/demo runtime, not a fallback for provider failure.
 */
export function createDataAdapters(
  requiredLayers: ReadonlySet<string> = new Set(),
): DataAdapters {
  const useRealData = process.env.USE_REAL_DATA === 'true';

  console.log(
    `[AdapterFactory] mode=${useRealData ? 'live' : 'synthetic_fixture'} required=${[
      ...requiredLayers,
    ].join(',')}`,
  );

  if (useRealData) {
    return {
      dem: new RealDemAdapter(),
      elsus: new RealElsusAdapter(),
      eshm20: new RealEshm20Adapter(),
      clc: new RealClcAdapter(),
    };
  }

  return {
    dem: new DemAdapter(),
    elsus: new ElsusAdapter(),
    eshm20: new Eshm20Adapter(),
    clc: new ClcAdapter(),
  };
}
