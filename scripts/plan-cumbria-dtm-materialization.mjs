import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createCumbriaDtmMaterializationPlan } from '../packages/evidence/dist/index.js';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(
  repositoryRoot,
  'tests',
  'ground-truth',
  'cumbria-2015',
  'manifest.json',
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const execute = process.argv.includes('--execute');

const plan = createCumbriaDtmMaterializationPlan(manifest, { execute });

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: 'dry_run',
      networkRequests: 0,
      filesWritten: 0,
      ...plan,
    },
    null,
    2,
  ),
);
