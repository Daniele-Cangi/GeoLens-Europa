import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertCumbriaAccessManifest } = require('../packages/evidence/dist');

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  readFileSync(
    path.join(
      repositoryRoot,
      'tests',
      'ground-truth',
      'cumbria-2015',
      'manifest.json',
    ),
    'utf8',
  ),
);
assertCumbriaAccessManifest(manifest);

const request = manifest.modelAccessRequest;
const modelCatalogue = requiredDataset('ea-flood-model-locations');
const modelById = new Map(
  modelCatalogue.floodModelCatalogAudit.coreModels.map((model) => [
    model.id,
    model,
  ]),
);
const requestedModels = request.modelGroupIds.map((id) => {
  const model = modelById.get(id);
  if (!model || model.temporalUse !== 'pre_event_lineage_only') {
    throw new Error(`Model group ${id} is not qualified pre-event lineage`);
  }
  return model;
});
for (const id of request.explicitlyExcludedModelGroupIds) {
  const model = modelById.get(id);
  if (!model || model.temporalUse !== 'post_event_excluded') {
    throw new Error(`Excluded model group ${id} is not qualified post-event material`);
  }
}

const body = [
  `To: ${request.recipient}`,
  `Subject: ${request.subject}`,
  '',
  'Dear Environment Agency local team,',
  '',
  'I am writing on behalf of GeoLens, a non-commercial experimental research project that is testing whether a historical flood replay can be built from traceable environmental and hydraulic evidence without substituting missing data or using observed flood extents as model inputs.',
  '',
  `I would like to request Environment Agency Products ${request.products.map((product) => product.number).join(', ')} for the Carlisle, Cumbria model area:`,
  '',
  '- Product 5: available model and hydrology reports;',
  '- Product 6: model outputs supplied with the Product 5 reports;',
  '- Product 7: model input data supplied with the Product 5 reports.',
  '',
  'The Environment Agency Flood Model Locations catalogue identifies the following pre-event model groups relevant to the historical Carlisle domain:',
  '',
  ...requestedModels.map(
    (model) =>
      `- ${model.id} — ${model.name} — completed ${model.completionDate}${model.softwareAndVersion ? ` — ${model.softwareAndVersion}` : ''}`,
  ),
  '',
  'For each available archived model group, could you please provide or identify:',
  '',
  '- the native hydraulic model files and required software/version;',
  '- the hydrology and hydraulic reports;',
  '- the outputs for the supplied pre-event scenarios;',
  '- cross-section and topographic survey files;',
  '- boundary-condition definitions and their source records;',
  '- roughness parameters;',
  '- the represented defence and floodgate configuration;',
  '- model development and calibration logs;',
  '- horizontal CRS, vertical datum and unit metadata;',
  '- licence, attribution and reuse conditions.',
  '',
  'The official 2011 Carlisle SFRA describes four upstream watercourse limits and a downstream limit at Old Sandsfield. If those limits or their boundary definitions are stored separately from the model groups above, I would be grateful if those files or their archive references could also be included.',
  '',
  `For avoidance of doubt, I am not requesting Product 4 or post-event model groups ${request.explicitlyExcludedModelGroupIds.join(' and ')} at this stage. GeoLens keeps observed-event and hindsight material outside model input and calibration. If any requested pre-event package has been superseded, please provide the archived version associated with the catalogue group ID rather than silently substituting a later model.`,
  '',
  'If a requested component is unavailable, no longer runnable or subject to a separate licence or fee, a component-level availability statement would still be very useful. A secure download link is suitable for large files.',
  '',
  'Project repository:',
  'https://github.com/Daniele-Cangi/GeoLens-Europa',
  '',
  'Thank you for your assistance.',
  '',
  'Kind regards,',
  'Daniele Cangi',
  'GeoLens',
].join('\n');

process.stdout.write(`${body}\n`);

function requiredDataset(id) {
  const dataset = manifest.datasets.find((candidate) => candidate.id === id);
  if (!dataset) {
    throw new Error(`Missing dataset ${id}`);
  }
  return dataset;
}
