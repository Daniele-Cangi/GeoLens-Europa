'use client';

import {
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import {
  PROOF_ZERO_NODE_POSITIONS,
  PROOF_ZERO_PIPES,
} from './lib/fixture';
import {
  runProofZero,
  type Evidence,
  type EvidenceStatus,
  type ProofZeroResult,
  type ProviderSummary,
} from './lib/api';

type Selection =
  | { readonly kind: 'catchment'; readonly id: string }
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'pipe'; readonly id: string };

type DisplayStatus = EvidenceStatus | 'not_requested';

const SOURCE_DEFAULTS = {
  rainfall: {
    provider: 'NASA GES DISC',
    dataset: 'GPM IMERG',
    sourceResolution: '0.1° source grid',
    layers: ['rainfall24h_mm'],
  },
  terrain: {
    provider: 'Copernicus Data Space Ecosystem',
    dataset: 'Copernicus DEM GLO-30',
    sourceResolution: '1 arc-second (~30 m at equator)',
    layers: ['elevation_m', 'slope_deg'],
  },
  landCover: {
    provider: 'Copernicus Land Monitoring Service',
    dataset: 'CORINE Land Cover',
    sourceResolution: '100 m source raster',
    layers: ['land_cover_class'],
  },
} as const;

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

function formatNumber(
  value: number | null | undefined,
  digits = 2,
  unit = '',
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return `${value.toLocaleString('en-GB', {
    maximumFractionDigits: digits,
  })}${unit ? ` ${unit}` : ''}`;
}

function evidenceText(
  evidence: Evidence<number> | undefined,
  digits = 2,
): string {
  if (!evidence || evidence.value === null) {
    return evidence
      ? statusLabel(evidence.quality.status)
      : '—';
  }

  return formatNumber(evidence.value, digits, evidence.unit);
}

function resolveSourceStatus(
  result: ProofZeroResult | null,
  source: ProviderSummary | undefined,
  layers: readonly string[],
): DisplayStatus {
  if (!result) {
    return 'not_requested';
  }

  const issue = result.environmental.issues.find((candidate) =>
    layers.includes(candidate.layer),
  );

  if (issue) {
    return issue.status;
  }

  return source?.status === 'upstream_error'
    ? 'upstream_error'
    : 'available';
}

function StatusPill({
  status,
}: {
  readonly status:
    | DisplayStatus
    | 'complete'
    | 'incomplete'
    | 'known'
    | 'unknown'
    | 'ambiguous';
}) {
  return (
    <span className="status-pill" data-status={status}>
      <span className="status-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function SourceCard({
  eyebrow,
  source,
  fallback,
  status,
}: {
  readonly eyebrow: string;
  readonly source?: ProviderSummary;
  readonly fallback: {
    readonly provider: string;
    readonly dataset: string;
    readonly sourceResolution: string;
  };
  readonly status: DisplayStatus;
}) {
  return (
    <article className="source-card">
      <div className="source-card-heading">
        <p className="eyebrow">{eyebrow}</p>
        <StatusPill status={status} />
      </div>
      <h3>{source?.dataset ?? fallback.dataset}</h3>
      <p>{source?.provider ?? fallback.provider}</p>
      <dl className="compact-facts">
        <div>
          <dt>Source resolution</dt>
          <dd>{fallback.sourceResolution}</dd>
        </div>
        <div>
          <dt>Acquired</dt>
          <dd>
            {source
              ? new Date(source.acquiredAt).toLocaleString('en-GB')
              : 'Not requested'}
          </dd>
        </div>
      </dl>
      {source?.missingReason ? (
        <p className="source-reason">{source.missingReason}</p>
      ) : null}
    </article>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function activateOnKeyboard(
  event: KeyboardEvent<SVGGElement>,
  action: () => void,
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

type ProofZeroNodeId =
  keyof typeof PROOF_ZERO_NODE_POSITIONS;

function positionForNode(nodeId: string) {
  return PROOF_ZERO_NODE_POSITIONS[
    nodeId as ProofZeroNodeId
  ];
}

function NetworkCanvas({
  result,
  selection,
  onSelect,
}: {
  readonly result: ProofZeroResult | null;
  readonly selection: Selection;
  readonly onSelect: (selection: Selection) => void;
}) {
  const catchment = result?.catchmentContributions[0];

  return (
    <div className="network-canvas">
      <svg
        viewBox="0 0 820 520"
        role="img"
        aria-labelledby="network-title network-description"
      >
        <title id="network-title">
          Proof 0 stormwater network
        </title>
        <desc id="network-description">
          One catchment connected to an inlet, manhole and
          outfall through two pipes.
        </desc>
        <defs>
          <pattern
            id="minor-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 32 0 L 0 0 0 32"
              className="grid-minor"
            />
          </pattern>
          <pattern
            id="major-grid"
            width="160"
            height="160"
            patternUnits="userSpaceOnUse"
          >
            <rect
              width="160"
              height="160"
              fill="url(#minor-grid)"
            />
            <path
              d="M 160 0 L 0 0 0 160"
              className="grid-major"
            />
          </pattern>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        <rect width="820" height="520" fill="url(#major-grid)" />

        <g
          role="button"
          tabIndex={0}
          aria-label="Inspect catchment A"
          className="catchment-shape"
          data-selected={
            selection.kind === 'catchment' || undefined
          }
          data-status={catchment?.status ?? 'not_requested'}
          onClick={() =>
            onSelect({ kind: 'catchment', id: 'catchment_A' })
          }
          onKeyDown={(event) =>
            activateOnKeyboard(event, () =>
              onSelect({
                kind: 'catchment',
                id: 'catchment_A',
              }),
            )
          }
        >
          <path d="M 92 84 L 344 102 L 370 246 L 192 292 L 72 206 Z" />
          <text x="104" y="124">
            CATCHMENT A
          </text>
          <text x="104" y="148" className="shape-detail">
            {catchment
              ? `${formatNumber(
                  catchment.representedAreaM2,
                  0,
                  'm²',
                )} represented`
              : 'Evidence not requested'}
          </text>
        </g>

        {PROOF_ZERO_PIPES.map((pipe) => {
          const direction =
            result?.orientedNetwork.directions[pipe.id];
          const known =
            direction?.status === 'known' ? direction : null;
          const fromId = known?.fromNodeId ?? pipe.from;
          const toId = known?.toNodeId ?? pipe.to;
          const from =
            positionForNode(fromId) ??
            PROOF_ZERO_NODE_POSITIONS[pipe.from];
          const to =
            positionForNode(toId) ??
            PROOF_ZERO_NODE_POSITIONS[pipe.to];
          const selected =
            selection.kind === 'pipe' &&
            selection.id === pipe.id;

          return (
            <g
              key={pipe.id}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${pipe.id}`}
              className="pipe-shape"
              data-selected={selected || undefined}
              data-status={
                direction?.status ?? 'not_requested'
              }
              onClick={() =>
                onSelect({ kind: 'pipe', id: pipe.id })
              }
              onKeyDown={(event) =>
                activateOnKeyboard(event, () =>
                  onSelect({ kind: 'pipe', id: pipe.id }),
                )
              }
            >
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                markerEnd={known ? 'url(#flow-arrow)' : undefined}
              />
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className="pipe-hit-area"
              />
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 16}
              >
                {direction?.status ?? 'unresolved'}
              </text>
            </g>
          );
        })}

        {Object.entries(PROOF_ZERO_NODE_POSITIONS).map(
          ([nodeId, position]) => {
            const node =
              result?.topology.nodes[nodeId];
            const evidenceStatus =
              node?.elevationM.quality.status ??
              'not_requested';
            const selected =
              selection.kind === 'node' &&
              selection.id === nodeId;

            return (
              <g
                key={nodeId}
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${position.label}`}
                className="node-shape"
                data-selected={selected || undefined}
                data-status={evidenceStatus}
                onClick={() =>
                  onSelect({ kind: 'node', id: nodeId })
                }
                onKeyDown={(event) =>
                  activateOnKeyboard(event, () =>
                    onSelect({
                      kind: 'node',
                      id: nodeId,
                    }),
                  )
                }
              >
                <circle
                  cx={position.x}
                  cy={position.y}
                  r="18"
                />
                <circle
                  cx={position.x}
                  cy={position.y}
                  r="6"
                  className="node-core"
                />
                <text
                  x={position.x}
                  y={position.y + 40}
                  textAnchor="middle"
                >
                  {position.label}
                </text>
                <text
                  x={position.x}
                  y={position.y + 58}
                  textAnchor="middle"
                  className="shape-detail"
                >
                  {node
                    ? evidenceText(node.elevationM, 1)
                    : 'elevation pending'}
                </text>
              </g>
            );
          },
        )}
      </svg>
      <div className="canvas-legend" aria-label="Network legend">
        <span><i className="legend-node" /> Node</span>
        <span><i className="legend-pipe" /> Pipe</span>
        <span><i className="legend-catchment" /> Catchment</span>
      </div>
    </div>
  );
}

function EvidenceDetail({
  label,
  evidence,
  value,
  emptyMessage,
}: {
  readonly label: string;
  readonly evidence?: Evidence<unknown>;
  readonly value?: string;
  readonly emptyMessage?: string;
}) {
  return (
    <section className="evidence-detail">
      <div className="detail-heading">
        <h4>{label}</h4>
        {evidence ? (
          <StatusPill status={evidence.quality.status} />
        ) : null}
      </div>
      <p className="detail-value">
        {value ??
          (evidence?.value === null ||
          evidence?.value === undefined
            ? evidence
              ? statusLabel(evidence.quality.status)
              : '—'
            : String(evidence.value))}
      </p>
      {evidence ? (
        <dl className="detail-grid">
          <div>
            <dt>Provider</dt>
            <dd>{evidence.provenance.provider}</dd>
          </div>
          <div>
            <dt>Dataset</dt>
            <dd>{evidence.provenance.dataset}</dd>
          </div>
          <div>
            <dt>Source resolution</dt>
            <dd>
              {evidence.spatial.sourceResolution ?? 'Not stated'}
            </dd>
          </div>
          <div>
            <dt>Transformation</dt>
            <dd>
              {evidence.provenance.transformation ??
                'Direct observation'}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="empty-copy">
          {emptyMessage ??
            'Run Proof 0 to inspect traceable evidence.'}
        </p>
      )}
      {evidence?.quality.missingReason ? (
        <p className="missing-reason">
          {evidence.quality.missingReason}
        </p>
      ) : null}
    </section>
  );
}

function Inspector({
  result,
  selection,
}: {
  readonly result: ProofZeroResult | null;
  readonly selection: Selection;
}) {
  if (selection.kind === 'catchment') {
    const contribution =
      result?.catchmentContributions.find(
        (candidate) => candidate.catchmentId === selection.id,
      );
    const firstCell = contribution?.cells[0];
    const runoff = firstCell?.runoff.output.value;

    return (
      <>
        <div className="inspector-heading">
          <p className="eyebrow">Catchment</p>
          <h2>{selection.id}</h2>
          {contribution ? (
            <StatusPill status={contribution.status} />
          ) : null}
        </div>
        <EvidenceDetail
          label="Total contribution"
          evidence={contribution?.totalVolumeM3}
          value={
            contribution
              ? evidenceText(contribution.totalVolumeM3, 3)
              : undefined
          }
        />
        <section className="model-card">
          <p className="eyebrow">Runoff model v0</p>
          <dl className="inspector-facts">
            <div>
              <dt>Rainfall input</dt>
              <dd>
                {runoff
                  ? formatNumber(runoff.rainfallMm, 2, 'mm')
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Land cover</dt>
              <dd>
                {runoff
                  ? `${runoff.landCoverClass} · ${runoff.landCoverGroup}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Imperviousness proxy</dt>
              <dd>
                {runoff
                  ? formatNumber(
                      runoff.imperviousnessProxy,
                      3,
                    )
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Runoff coefficient</dt>
              <dd>
                {runoff
                  ? formatNumber(
                      runoff.runoffCoefficient,
                      3,
                    )
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Derived runoff</dt>
              <dd>
                {runoff
                  ? formatNumber(
                      runoff.derivedRunoffMm,
                      2,
                      'mm',
                    )
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Model version</dt>
              <dd>{runoff?.modelVersion ?? '—'}</dd>
            </div>
          </dl>
        </section>
      </>
    );
  }

  if (selection.kind === 'node') {
    const node = result?.topology.nodes[selection.id];
    const accumulation =
      result?.propagation.status === 'complete'
        ? result.propagation.nodes[selection.id]
            ?.downstreamAccumulationM3
        : undefined;

    return (
      <>
        <div className="inspector-heading">
          <p className="eyebrow">Network node</p>
          <h2>{selection.id}</h2>
          {node ? (
            <StatusPill status={node.elevationM.quality.status} />
          ) : null}
        </div>
        <EvidenceDetail
          label="Elevation evidence"
          evidence={node?.elevationM}
          value={
            node ? evidenceText(node.elevationM, 2) : undefined
          }
        />
        <EvidenceDetail
          label="Downstream accumulation"
          evidence={accumulation}
          value={
            accumulation
              ? evidenceText(accumulation, 3)
              : undefined
          }
          emptyMessage={
            result && result.propagation.status !== 'complete'
              ? `Propagation ${statusLabel(
                  result.propagation.status,
                )}: ${result.propagation.reason}`
              : undefined
          }
        />
      </>
    );
  }

  const pipe = result?.topology.pipes[selection.id];
  const direction =
    result?.orientedNetwork.directions[selection.id];
  const transfer =
    result?.propagation.status === 'complete'
      ? result.propagation.pipes[selection.id]
          ?.transferredVolumeM3
      : undefined;

  return (
    <>
      <div className="inspector-heading">
        <p className="eyebrow">Network pipe</p>
        <h2>{selection.id}</h2>
        {direction ? (
          <StatusPill status={direction.status} />
        ) : null}
      </div>
      <section className="model-card">
        <dl className="inspector-facts">
          <div>
            <dt>Endpoints</dt>
            <dd>
              {pipe
                ? `${pipe.nodeAId} ↔ ${pipe.nodeBId}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>
              {pipe
                ? formatNumber(pipe.lengthM, 2, 'm')
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Direction state</dt>
            <dd>{direction?.status ?? '—'}</dd>
          </div>
          <div>
            <dt>Resolved flow</dt>
            <dd>
              {direction?.status === 'known'
                ? `${direction.fromNodeId} → ${direction.toNodeId}`
                : direction
                  ? statusLabel(direction.reason)
                  : '—'}
            </dd>
          </div>
          <div>
            <dt>Elevation drop</dt>
            <dd>
              {direction?.status === 'known'
                ? formatNumber(
                    direction.elevationDropM,
                    3,
                    'm',
                  )
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Grade</dt>
            <dd>
              {direction?.status === 'known'
                ? formatNumber(direction.grade, 4)
                : '—'}
            </dd>
          </div>
        </dl>
      </section>
      <EvidenceDetail
        label="Transferred volume"
        evidence={transfer}
        value={transfer ? evidenceText(transfer, 3) : undefined}
        emptyMessage={
          result && result.propagation.status !== 'complete'
            ? `Propagation ${statusLabel(
                result.propagation.status,
              )}: ${result.propagation.reason}`
            : undefined
        }
      />
    </>
  );
}

function EvidenceTable({
  result,
}: {
  readonly result: ProofZeroResult | null;
}) {
  const cells = result
    ? Object.values(result.environmental.cells)
    : [];

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">H3 index</th>
            <th scope="col">Rain 24 h</th>
            <th scope="col">Elevation</th>
            <th scope="col">Slope</th>
            <th scope="col">CLC class</th>
            <th scope="col">Runoff</th>
          </tr>
        </thead>
        <tbody>
          {cells.length > 0 ? (
            cells.map((cell) => {
              const runoff = result?.catchmentContributions
                .flatMap((item) => item.cells)
                .find((item) => item.h3 === cell.h3)
                ?.runoff.output;

              return (
                <tr key={cell.h3}>
                  <th scope="row">
                    <code>{cell.h3}</code>
                    <small>H3 representation</small>
                  </th>
                  <td>{evidenceText(cell.rainfall24hMm)}</td>
                  <td>{evidenceText(cell.elevationM, 1)}</td>
                  <td>{evidenceText(cell.slopeDeg, 2)}</td>
                  <td>
                    {evidenceText(
                      cell.landCoverClass,
                      0,
                    )}
                  </td>
                  <td>
                    {runoff?.value
                      ? formatNumber(
                          runoff.value.derivedRunoffMm,
                          2,
                          'mm',
                        )
                      : runoff
                        ? statusLabel(runoff.quality.status)
                        : '—'}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="table-empty">
                No environmental evidence requested yet.
                A true measured zero will be shown as 0;
                missing evidence keeps its explicit status.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [referenceTime, setReferenceTime] = useState(
    '2026-08-21T00:00',
  );
  const [result, setResult] =
    useState<ProofZeroResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({
    kind: 'catchment',
    id: 'catchment_A',
  });
  const [isPending, startTransition] = useTransition();

  const firstCell = result
    ? Object.values(result.environmental.cells)[0]
    : undefined;
  const firstContribution =
    result?.catchmentContributions[0];
  const firstRunoff =
    firstContribution?.cells[0]?.runoff.output.value;
  const outfallAccumulation =
    result?.propagation.status === 'complete'
      ? result.propagation.nodes.node_C_outfall
          ?.downstreamAccumulationM3
      : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const nextResult = await runProofZero(
          new Date(referenceTime).toISOString(),
        );
        setResult(nextResult);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Proof 0 request failed.',
        );
      }
    });
  }

  const rainfallSource =
    result?.environmental.sources.rainfall;
  const terrainSource =
    result?.environmental.sources.terrain;
  const landCoverSource =
    result?.environmental.sources.landCover;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            GL
          </span>
          <div>
            <p className="eyebrow">Spatial evidence engine</p>
            <h1>GeoLens</h1>
          </div>
        </div>

        <form className="run-controls" onSubmit={handleSubmit}>
          <label htmlFor="reference-time">
            Observation reference
          </label>
          <input
            id="reference-time"
            type="datetime-local"
            value={referenceTime}
            onChange={(event) =>
              setReferenceTime(event.target.value)
            }
            required
          />
          <button type="submit" disabled={isPending}>
            {isPending ? 'Composing evidence…' : 'Run Proof 0'}
          </button>
        </form>

        <div
          className="run-state"
          aria-live="polite"
          aria-atomic="true"
        >
          <StatusPill
            status={result?.status ?? 'not_requested'}
          />
          <span>
            {result
              ? `Proof ${result.proofVersion}`
              : 'Bounded Trento fixture'}
          </span>
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <strong>Request failed.</strong> {error}
        </div>
      ) : null}

      <main className="workspace">
        <aside className="source-rail" aria-label="Evidence sources">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Input evidence</p>
              <h2>Sources</h2>
            </div>
            <span>3 layers</span>
          </div>
          <SourceCard
            eyebrow="Precipitation"
            source={rainfallSource}
            fallback={SOURCE_DEFAULTS.rainfall}
            status={resolveSourceStatus(
              result,
              rainfallSource,
              SOURCE_DEFAULTS.rainfall.layers,
            )}
          />
          <SourceCard
            eyebrow="Terrain"
            source={terrainSource}
            fallback={SOURCE_DEFAULTS.terrain}
            status={resolveSourceStatus(
              result,
              terrainSource,
              SOURCE_DEFAULTS.terrain.layers,
            )}
          />
          <SourceCard
            eyebrow="Land cover"
            source={landCoverSource}
            fallback={SOURCE_DEFAULTS.landCover}
            status={resolveSourceStatus(
              result,
              landCoverSource,
              SOURCE_DEFAULTS.landCover.layers,
            )}
          />
          <div className="principle-note">
            <span aria-hidden="true">≠</span>
            <p>
              <strong>Missing is not zero.</strong>
              Provider failure remains explicit and cannot
              become a valid-looking measurement.
            </p>
          </div>
        </aside>

        <section className="analysis-column">
          <div className="metric-grid" aria-label="Physical quantities">
            <MetricCard
              label="Rainfall · 24 h"
              value={evidenceText(
                firstCell?.rainfall24hMm,
                2,
              )}
              detail="IMERG observation window"
            />
            <MetricCard
              label="Runoff coefficient"
              value={
                firstRunoff
                  ? formatNumber(
                      firstRunoff.runoffCoefficient,
                      3,
                    )
                  : '—'
              }
              detail="Inspectable model parameter"
            />
            <MetricCard
              label="Catchment contribution"
              value={evidenceText(
                firstContribution?.totalVolumeM3,
                3,
              )}
              detail="Derived water volume"
            />
            <MetricCard
              label="Outfall accumulation"
              value={evidenceText(
                outfallAccumulation,
                3,
              )}
              detail="No-loss propagation v0"
            />
          </div>

          <section className="network-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  Bounded stormwater network
                </p>
                <h2>Derived downstream state</h2>
              </div>
              <div className="panel-meta">
                <span>H3 nodes r11 · catchments r13</span>
                <span>
                  {result
                    ? new Date(
                        result.environmental.referenceTime,
                      ).toLocaleString('en-GB')
                    : 'Awaiting evidence'}
                </span>
              </div>
            </div>
            <NetworkCanvas
              result={result}
              selection={selection}
              onSelect={setSelection}
            />
          </section>

          <section className="evidence-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Spatial normalization</p>
                <h2>H3 evidence bundle</h2>
              </div>
              <span>
                {result
                  ? `${Object.keys(
                      result.environmental.cells,
                    ).length} indexed cell(s)`
                  : 'No bundle'}
              </span>
            </div>
            <EvidenceTable result={result} />
          </section>
        </section>

        <aside className="inspector-panel" aria-label="Evidence inspector">
          <Inspector result={result} selection={selection} />
        </aside>
      </main>

      <footer>
        <span>GeoLens refoundation · Proof 0</span>
        <span>
          Physical state, source resolution and provenance
          remain inspectable.
        </span>
      </footer>
    </div>
  );
}
