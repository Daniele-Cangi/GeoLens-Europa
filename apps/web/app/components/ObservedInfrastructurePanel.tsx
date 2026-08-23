'use client';

import {
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';

import {
  type Evidence,
  type EvidenceStatus,
  type ObservedInfrastructureResult,
} from '../lib/api';

interface ObservedInfrastructurePanelProps {
  readonly result: ObservedInfrastructureResult | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

type DisplayStatus =
  | EvidenceStatus
  | 'unresolved_no_published_crosswalk'
  | 'not_requested';

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

function StatusPill({
  status,
}: {
  readonly status: DisplayStatus;
}) {
  return (
    <span className="status-pill" data-status={status}>
      <span
        className="status-dot"
        aria-hidden="true"
      />
      {statusLabel(status)}
    </span>
  );
}

function formatNumber(
  value: number | null | undefined,
  digits = 2,
  unit = '',
): string {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('en-GB', {
    maximumFractionDigits: digits,
  })}${unit ? ` ${unit}` : ''}`;
}

function conciseReason(
  value: string,
  maximumLength = 360,
): string {
  if (value.length <= maximumLength) {
    return value;
  }

  return value.slice(0, maximumLength - 1) + '…';
}

function formatRange(
  values: readonly number[],
  digits: number,
  unit: string,
): string {
  if (values.length === 0) {
    return '-';
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);

  if (Math.abs(maximum - minimum) < 1e-12) {
    return formatNumber(minimum, digits, unit);
  }

  return (
    formatNumber(minimum, digits, unit) +
    ' - ' +
    formatNumber(maximum, digits, unit)
  );
}

function formatClassCounts(
  values: readonly number[],
): string {
  if (values.length === 0) {
    return '-';
  }

  const counts = new Map<number, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([code, count]) => code + ' (' + count + ')')
    .join(' · ');
}
function evidenceText(
  evidence: Evidence<number> | undefined,
  digits = 2,
): string {
  if (!evidence || evidence.value === null) {
    return evidence
      ? statusLabel(evidence.quality.status)
      : '-';
  }

  return formatNumber(
    evidence.value,
    digits,
    evidence.unit,
  );
}

function metadataString(
  metadata:
    | Readonly<Record<string, unknown>>
    | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string'
    ? value
    : undefined;
}

function formatUtcTimestamp(
  value: string | undefined,
): string {
  if (!value) {
    return '-';
  }

  const instant = new Date(value);

  if (Number.isNaN(instant.getTime())) {
    return value;
  }

  return (
    instant.toLocaleString('en-GB', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' UTC'
  );
}

function activateOnKeyboard(
  event: KeyboardEvent<SVGGElement>,
  action: () => void,
): void {
  if (
    event.key === 'Enter' ||
    event.key === ' '
  ) {
    event.preventDefault();
    action();
  }
}

function buildMapModel(
  result: Extract<
    ObservedInfrastructureResult,
    { readonly status: 'available' }
  > | null,
) {
  const nodes = result
    ? Object.values(result.topology.nodes)
    : [];
  const pipes = result
    ? Object.values(result.topology.pipes)
    : [];
  const conditionedSurfaceCells =
    result?.conditionedSurfaceCatchmentProxy.result
      ? Object.values(
          result.conditionedSurfaceCatchmentProxy.result.cells,
        )
      : null;
  const surfaceCells = conditionedSurfaceCells
    ? conditionedSurfaceCells.map((cell) => ({
        h3: cell.h3,
        boundary: cell.boundary,
        termination: cell.termination,
        contributes:
          cell.contributesToConditionedOutfall,
        elevation: cell.hydrologicElevationM,
        surfaceClass:
          cell.surface.value?.surfaceClass ??
          'unclassified',
        conditioning:
          cell.terrainConditioning.method,
      }))
    : result?.surfaceCatchmentProxy.result
      ? Object.values(
          result.surfaceCatchmentProxy.result.cells,
        ).map((cell) => ({
          h3: cell.h3,
          boundary: cell.boundary,
          termination: cell.termination,
          contributes: cell.contributesToOutletProxy,
          elevation: cell.elevationM,
          surfaceClass: 'not_classified',
          conditioning: cell.flowMethod,
        }))
      : [];
  const coordinates = [
    ...pipes.flatMap((pipe) => pipe.path),
    ...nodes.map((node) => node.position),
    ...surfaceCells.flatMap((cell) =>
      cell.boundary.map(([lon, lat]) => ({ lon, lat })),
    ),
  ];
  let lonMin = Number.POSITIVE_INFINITY;
  let lonMax = Number.NEGATIVE_INFINITY;
  let latMin = Number.POSITIVE_INFINITY;
  let latMax = Number.NEGATIVE_INFINITY;

  for (const coordinate of coordinates) {
    lonMin = Math.min(lonMin, coordinate.lon);
    lonMax = Math.max(lonMax, coordinate.lon);
    latMin = Math.min(latMin, coordinate.lat);
    latMax = Math.max(latMax, coordinate.lat);
  }

  if (coordinates.length === 0) {
    lonMin = 0;
    lonMax = 1;
    latMin = 0;
    latMax = 1;
  }

  const lonSpan = Math.max(
    lonMax - lonMin,
    1e-9,
  );
  const latSpan = Math.max(
    latMax - latMin,
    1e-9,
  );
  const project = (
    lon: number,
    lat: number,
  ) => ({
    x:
      Math.round(
        (34 +
          ((lon - lonMin) / lonSpan) * 752) *
          10,
      ) / 10,
    y:
      Math.round(
        (326 -
          ((lat - latMin) / latSpan) * 292) *
          10,
      ) / 10,
  });
  const pipePoints = Object.fromEntries(
    pipes.map((pipe) => [
      pipe.id,
      pipe.path
        .map((point) => {
          const projected = project(
            point.lon,
            point.lat,
          );
          return `${projected.x},${projected.y}`;
        })
        .join(' '),
    ]),
  );
  const nodePoints = Object.fromEntries(
    nodes.map((node) => [
      node.id,
      project(
        node.position.lon,
        node.position.lat,
      ),
    ]),
  );
  const surfaceCellPoints = Object.fromEntries(
    surfaceCells.map((cell) => [
      cell.h3,
      cell.boundary
        .map(([lon, lat]) => {
          const projected = project(lon, lat);
          return `${projected.x},${projected.y}`;
        })
        .join(' '),
    ]),
  );

  return {
    nodes,
    pipes,
    surfaceCells,
    surfaceCellPoints,
    outfallCount: nodes.filter(
      (node) => node.type === 'outfall',
    ).length,
    pipePoints,
    nodePoints,
  };
}

export default function ObservedInfrastructurePanel({
  result,
  isLoading,
  error,
}: ObservedInfrastructurePanelProps) {
  const [selectedPipeId, setSelectedPipeId] =
    useState<string | null>(null);
  const available =
    result?.status === 'available'
      ? result
      : null;
  const mapModel = useMemo(
    () => buildMapModel(available),
    [available],
  );
  const selectedPipe =
    (selectedPipeId
      ? available?.topology.pipes[
          selectedPipeId
        ]
      : undefined) ??
    mapModel.pipes[0];
  const selectedDirection =
    selectedPipe && available
      ? available.orientation.directions[
          selectedPipe.id
        ]
      : undefined;
  const areaEnvelope =
    available?.outfallAreaContext;
  const areaContext = areaEnvelope?.result;
  const authoritativeAttachment =
    available?.authoritativeSurfaceNetworkAttachment;
  const surfaceEnvelope =
    available?.surfaceCatchmentProxy;
  const surfaceProxy = surfaceEnvelope?.result;
  const conditionedEnvelope =
    available?.conditionedSurfaceCatchmentProxy;
  const conditionedProxy = conditionedEnvelope?.result;
  const conditionedRunoffEnvelope =
    available?.conditionedSurfaceRunoff;
  const conditionedRunoff =
    conditionedRunoffEnvelope?.result;
  const conditionedEnvironmentalCells =
    conditionedRunoff
      ? Object.values(conditionedRunoff.environmental.cells)
      : [];
  const conditionedRunoffCells =
    conditionedRunoff?.catchmentContribution.cells ?? [];
  const rainfallValues = conditionedEnvironmentalCells
    .map((cell) => cell.rainfall24hMm.value)
    .filter(
      (value): value is number =>
        typeof value === 'number',
    );
  const slopeValues = conditionedEnvironmentalCells
    .map((cell) => cell.slopeDeg.value)
    .filter(
      (value): value is number =>
        typeof value === 'number',
    );
  const landCoverValues = conditionedEnvironmentalCells
    .map((cell) => cell.landCoverClass.value)
    .filter(
      (value): value is number =>
        typeof value === 'number',
    );
  const runoffDepthValues = conditionedRunoffCells
    .map((cell) => cell.runoff.output.value?.derivedRunoffMm)
    .filter(
      (value): value is number =>
        typeof value === 'number',
    );
  const firstConditionedEnvironmentalCell =
    conditionedEnvironmentalCells[0];
  const firstConditionedRunoffOutput =
    conditionedRunoffCells.find(
      (cell) => cell.runoff.output.value !== null,
    )?.runoff.output.value;
  const status =
    result?.status ?? 'not_requested';

  return (
    <section
      className="observed-infrastructure"
      aria-live="polite"
      aria-busy={isLoading}
      data-testid="observed-infrastructure"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            Observed public infrastructure
          </p>
          <h2>
            Waternet stormwater topology
          </h2>
        </div>
        <div className="panel-meta">
          <StatusPill status={status} />
          <span>
            Observed GWSW context, raw AHN, conditioned BGT/AHN
            and environmental runoff remain distinct - network
            propagation stops before unsupported attachment or direction
          </span>
        </div>
      </div>

      {isLoading && !result ? (
        <p className="observed-message">
          Acquiring the bounded official WFS
          response...
        </p>
      ) : null}

      {error ? (
        <p className="observed-message observed-error">
          {error}
        </p>
      ) : null}

      {result &&
      result.status !== 'available' ? (
        <div className="observed-unavailable">
          <p>
            <strong>
              Infrastructure unavailable:{' '}
              {statusLabel(result.status)}.
            </strong>
          </p>
          <p>{result.missingReason}</p>
          <dl className="observed-facts">
            <div>
              <dt>Provider</dt>
              <dd>{result.receipt.provider}</dd>
            </div>
            <div>
              <dt>Failed layer</dt>
              <dd>{result.failedLayer}</dd>
            </div>
            <div>
              <dt>Acquired</dt>
              <dd>
                {formatUtcTimestamp(
                  result.receipt.acquiredAt,
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {available ? (
        <div className="observed-layout">
          <div className="observed-map">
            <svg
              viewBox="0 0 820 360"
              role="img"
              aria-labelledby="observed-map-title observed-map-description"
            >
              <title id="observed-map-title">
                Imported Waternet stormwater
                topology
              </title>
              <desc id="observed-map-description">
                Observed nodes and active
                stormwater pipes imported from the
                bounded Amsterdam WFS response,
                including explicitly typed
                rainwater outfalls and a separate
                BGT/AHN-conditioned H3 surface proxy,
                separately marked from observed infrastructure.
              </desc>
              <rect
                width="820"
                height="360"
                className="observed-map-background"
              />
              {mapModel.surfaceCells.map((cell) => (
                <polygon
                  key={cell.h3}
                  points={
                    mapModel.surfaceCellPoints[cell.h3]
                  }
                  className="surface-proxy-cell"
                  data-contributes={
                    cell.contributes === null
                      ? 'unresolved'
                      : String(cell.contributes)
                  }
                  data-termination={cell.termination}
                >
                  <title>
                    {`${cell.h3} · ${statusLabel(cell.surfaceClass)} · ${statusLabel(cell.termination)} · ${statusLabel(cell.conditioning)} · ${evidenceText(cell.elevation, 2)}`}
                  </title>
                </polygon>
              ))}
              {mapModel.pipes.map((pipe) => {
                const selected =
                  selectedPipe?.id === pipe.id;
                const points =
                  mapModel.pipePoints[
                    pipe.id
                  ];

                return (
                  <g
                    key={pipe.id}
                    role="button"
                    tabIndex={0}
                    aria-label={
                      `Inspect observed pipe ${pipe.source.sourceRecordId}`
                    }
                    data-selected={
                      selected || undefined
                    }
                    data-direction-status={
                      available.orientation.directions[
                        pipe.id
                      ]?.status
                    }
                    data-outfall-boundary={
                      available.outfallConnectivity
                        .unresolvedBoundaryPipeIds
                        .includes(pipe.id) || undefined
                    }
                    className="observed-pipe"
                    onClick={() =>
                      setSelectedPipeId(
                        pipe.id,
                      )
                    }
                    onKeyDown={(event) =>
                      activateOnKeyboard(
                        event,
                        () =>
                          setSelectedPipeId(
                            pipe.id,
                          ),
                      )
                    }
                  >
                    <polyline
                      points={points}
                      className="observed-pipe-line"
                    />
                    <polyline
                      points={points}
                      className="observed-pipe-hit"
                    />
                  </g>
                );
              })}
              {mapModel.nodes.map((node) => {
                const point =
                  mapModel.nodePoints[node.id];

                return (
                  <g
                    key={node.id}
                    className="observed-node"
                    data-node-type={node.type}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="5"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="1.8"
                      className="observed-node-core"
                    />
                    {(conditionedProxy?.outfallAttachment.nodeId ??
                      surfaceProxy?.outfallAnchor.nodeId) === node.id ? (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="10"
                        className="surface-proxy-anchor-ring"
                      />
                    ) : null}
                  </g>
                );
              })}
            </svg>
            <div className="observed-map-meta">
              <span>
                {
                  available.import.counts
                    .importedNodes
                }
                {' nodes / '}
                {
                  available.import.counts
                    .importedPipes
                }
                {' pipes / '}
                {mapModel.outfallCount}
                {' outfalls'}
              </span>
              <span>
                {available.orientation.counts.known}
                {' known / '}
                {available.orientation.counts.ambiguous}
                {' ambiguous / '}
                {available.orientation.counts.unknown}
                {' unknown directions'}
              </span>
              <span>
                {
                  available.outfallConnectivity
                    .counts.knownUpstreamPaths
                }
                {' known outfall paths / '}
                {
                  available.outfallConnectivity
                    .counts
                    .blockedByUnresolvedDirection
                }
                {' direction-blocked'}
              </span>
              <span>
                {conditionedProxy?.counts.contributingCells ?? 0}
                {' conditioned cells / '}
                {statusLabel(
                  conditionedEnvelope?.status ?? 'not_requested',
                )}
              </span>
              <span>
                {'GWSW area: '}
                {statusLabel(
                  available.outfallAreaContext.status,
                )}
              </span>
              <span>
                Output{' '}
                {
                  available.import.source
                    .outputCrs
                }
              </span>
            </div>
          </div>

          <aside className="observed-receipt">
            <p className="eyebrow">
              Import receipt
            </p>
            <dl className="observed-facts">
              <div>
                <dt>Dataset</dt>
                <dd>
                  {
                    available.import.source
                      .dataset
                  }
                </dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>
                  {
                    available.import.source
                      .provider
                  }
                </dd>
              </div>
              <div>
                <dt>License</dt>
                <dd>
                  {available.import.source
                    .license ??
                    'Not stated'}
                </dd>
              </div>
              <div>
                <dt>
                  Source / output CRS
                </dt>
                <dd>
                  {
                    available.import.source
                      .sourceCrs
                  }
                  {' / '}
                  {
                    available.import.source
                      .outputCrs
                  }
                </dd>
              </div>
              <div>
                <dt>Delivery date</dt>
                <dd>
                  {available.import.deliveryDates.join(
                    ', ',
                  ) || 'Not stated'}
                </dd>
              </div>
              <div>
                <dt>
                  Boundary exclusions
                </dt>
                <dd>
                  {
                    available.import.counts
                      .skippedBoundaryPipes
                  }
                  {' pipes'}
                </dd>
              </div>
              <div>
                <dt>Endpoint linking</dt>
                <dd>
                  Geometry snap at{' '}
                  {
                    available.import
                      .endpointLinkPolicy
                      .snapToleranceM
                  }
                  {' m'}
                </dd>
              </div>
              <div>
                <dt>Direction evidence</dt>
                <dd>Pipe endpoint invert NAP</dd>
              </div>
              <div>
                <dt>Resolvable drop boundary</dt>
                <dd>
                  {formatNumber(
                    available.orientation
                      .minimumResolvableDropM,
                    2,
                    'm',
                  )}
                  {' inclusive'}
                </dd>
              </div>
              <div>
                <dt>Numeric comparison tolerance</dt>
                <dd>
                  {formatNumber(
                    available.orientation
                      .numericComparisonToleranceM,
                    6,
                    'm',
                  )}
                </dd>
              </div>
              <div>
                <dt>Outfall connectivity</dt>
                <dd>
                  {
                    available.outfallConnectivity
                      .counts.knownUpstreamPaths
                  }
                  {' known paths / '}
                  {
                    available.outfallConnectivity
                      .counts
                      .blockedByUnresolvedDirection
                  }
                  {' direction-blocked'}
                </dd>
              </div>
              <div>
                <dt>Pumping-area reference</dt>
                <dd>
                  {available.import
                    .pumpingAreaReferences
                    .identifiers.join(', ') ||
                    'Not stated'}
                  {' - identifier only, no polygon'}
                </dd>
              </div>
              <div>
                <dt>Catchments</dt>
                <dd>
                  Not provided by source
                </dd>
              </div>
            </dl>

            <section className="observed-selection surface-proxy-receipt">
              <div className="surface-proxy-heading">
                <div>
                  <p className="eyebrow">
                    Observed area context
                  </p>
                  <h3>PDOK / GWSW management area</h3>
                </div>
                <StatusPill
                  status={
                    areaEnvelope?.status ??
                    'not_requested'
                  }
                />
              </div>

              {areaContext ? (
                <>
                  <dl className="observed-facts">
                    <div>
                      <dt>Containing sewer area</dt>
                      <dd>
                        {areaContext
                          .containingRioleringsgebieden
                          .map((area) => area.name)
                          .join(', ') || 'None observed'}
                      </dd>
                    </div>
                    <div>
                      <dt>Spatial relation</dt>
                      <dd>
                        Point in observed multipolygon -
                        context only
                      </dd>
                    </div>
                    <div>
                      <dt>Waternet reference</dt>
                      <dd>
                        {areaContext
                          .waternetPumpingAreaReference
                          .value ?? 'Not stated'}
                        {' · crosswalk '}
                        {statusLabel(
                          areaContext
                            .waternetPumpingAreaReference
                            .gwswCrosswalk,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Provider / publisher</dt>
                      <dd>
                        {areaContext.acquisition.provider}
                        {' · '}
                        {areaContext.acquisition.publisher}
                      </dd>
                    </div>
                    <div>
                      <dt>Dataset / collection</dt>
                      <dd>
                        {areaContext.acquisition.dataset}
                        {' · '}
                        {areaContext.acquisition.collection}
                      </dd>
                    </div>
                    <div>
                      <dt>License</dt>
                      <dd>
                        {areaContext.acquisition.license}
                      </dd>
                    </div>
                    <div>
                      <dt>Response timestamp</dt>
                      <dd>
                        {formatUtcTimestamp(
                          areaContext.acquisition
                            .responseTimestamp ?? undefined,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Catchment attachment</dt>
                      <dd>Blocked · no relation published</dd>
                    </div>
                  </dl>
                  <p className="observed-warning">
                    {areaContext.attachment.reason}
                  </p>
                </>
              ) : (
                <p className="surface-proxy-missing">
                  {areaEnvelope?.missingReason ??
                    'GWSW area context not requested.'}
                </p>
              )}
            </section>

            <section className="observed-selection surface-proxy-receipt">
              <div className="surface-proxy-heading">
                <div>
                  <p className="eyebrow">
                    Authoritative attachment boundary
                  </p>
                  <h3>BGT Inlooptabel to observed pipe</h3>
                </div>
                <StatusPill
                  status={
                    authoritativeAttachment?.networkAttachments
                      .quality.status ?? 'not_requested'
                  }
                />
              </div>
              {authoritativeAttachment ? (
                <>
                  <dl className="observed-facts">
                    <div>
                      <dt>Standard</dt>
                      <dd>
                        <a
                          href={authoritativeAttachment.documentationUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {authoritativeAttachment.standard}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Destination evidence</dt>
                      <dd>
                        {statusLabel(
                          authoritativeAttachment
                            .destinationObservations.quality.status,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Exact pipe attachments</dt>
                      <dd>
                        {authoritativeAttachment.networkAttachments
                          .value?.length ?? 0}
                        {' · '}
                        {statusLabel(
                          authoritativeAttachment.networkAttachments
                            .quality.status,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Unresolved destinations</dt>
                      <dd>
                        {
                          authoritativeAttachment
                            .unresolvedNetworkDestinations.length
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>Sewer propagation</dt>
                      <dd>
                        {authoritativeAttachment.propagationEligible
                          ? 'Eligible from observed attachment'
                          : 'Blocked before propagation'}
                      </dd>
                    </div>
                    <div>
                      <dt>Matching rule</dt>
                      <dd>Exact asset identifier only</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{authoritativeAttachment.modelVersion}</dd>
                    </div>
                  </dl>
                  <p className="observed-warning">
                    {authoritativeAttachment.networkAttachments.quality
                      .missingReason ??
                      'Owner-published attachment is available and retained.'}
                  </p>
                </>
              ) : (
                <p className="surface-proxy-missing">
                  Authoritative attachment not requested.
                </p>
              )}
            </section>
            <section className="observed-selection surface-proxy-receipt conditioned-surface-receipt">
              <div className="surface-proxy-heading">
                <div>
                  <p className="eyebrow">
                    Conditioned physical interpretation
                  </p>
                  <h3>BGT + AHN priority-flood proxy</h3>
                </div>
                <StatusPill
                  status={
                    conditionedEnvelope?.status ??
                    'not_requested'
                  }
                />
              </div>

              {conditionedProxy ? (
                <>
                  <dl className="observed-facts">
                    <div>
                      <dt>Conditioned contributing area</dt>
                      <dd>
                        {evidenceText(
                          conditionedProxy.contributingAreaM2,
                          0,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>H3 representation</dt>
                      <dd>
                        r{conditionedProxy.coverage.h3Resolution}
                        {' · '}
                        {conditionedProxy.counts.targetCells}
                        {' target cells'}
                      </dd>
                    </div>
                    <div>
                      <dt>Observed BGT mosaic</dt>
                      <dd>
                        {conditionedEnvelope?.surfaceAcquisition
                          ?.featureCount ?? 0}
                        {' features · '}
                        {conditionedEnvelope?.surfaceAcquisition
                          ?.license ?? 'license unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>BGT surface classes</dt>
                      <dd>
                        {conditionedEnvelope?.surfaceCounts
                          ?.vegetated_terrain ?? 0}
                        {' vegetated · '}
                        {conditionedEnvelope?.surfaceCounts
                          ?.unvegetated_terrain ?? 0}
                        {' terrain · '}
                        {conditionedEnvelope?.surfaceCounts
                          ?.building ?? 0}
                        {' building · '}
                        {conditionedEnvelope?.surfaceCounts
                          ?.road ?? 0}
                        {' road'}
                      </dd>
                    </div>
                    <div>
                      <dt>Terrain elevation</dt>
                      <dd>
                        {conditionedProxy.counts
                          .observedElevationCells}
                        {' observed AHN · '}
                        {conditionedProxy.counts
                          .interpolatedElevationCells}
                        {' explicitly interpolated · '}
                        {conditionedProxy.counts
                          .unresolvedConditioningCells}
                        {' unresolved'}
                      </dd>
                    </div>
                    <div>
                      <dt>Excluded surfaces</dt>
                      <dd>
                        {conditionedProxy.counts
                          .excludedSurfaceWaterCells}
                        {' water · '}
                        {conditionedProxy.counts
                          .excludedStructuralBarrierCells}
                        {' wall / quay barrier'}
                      </dd>
                    </div>
                    <div>
                      <dt>Flow allocation</dt>
                      <dd>
                        {conditionedProxy.counts.contributingCells}
                        {' outfall · '}
                        {conditionedProxy.counts.analysisBboxExitCells}
                        {' bbox exit · '}
                        {conditionedProxy.counts
                          .observedSurfaceWaterExitCells}
                        {' surface water'}
                      </dd>
                    </div>
                    <div>
                      <dt>Depression conditioning</dt>
                      <dd>
                        {conditionedProxy.counts
                          .depressionRaisedCells}
                        {' raised cells · '}
                        {statusLabel(
                          conditionedProxy.conditioning
                            .depressionMethod,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Missing-elevation model</dt>
                      <dd>
                        {statusLabel(
                          conditionedProxy.conditioning
                            .interpolationMethod,
                        )}
                        {' · max '}
                        {conditionedProxy.conditioning
                          .interpolationMaxGridDistance}
                        {' H3 rings · min '}
                        {conditionedProxy.conditioning
                          .interpolationMinSamples}
                        {' samples'}
                      </dd>
                    </div>
                    <div>
                      <dt>Outfall attachment</dt>
                      <dd>
                        Conditioned, not observed ·{' '}
                        {statusLabel(
                          conditionedProxy.outfallAttachment
                            .method,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{conditionedProxy.modelVersion}</dd>
                    </div>
                    <div>
                      <dt>BGT requested / acquired</dt>
                      <dd>
                        {formatUtcTimestamp(
                          conditionedEnvelope?.surfaceAcquisition
                            ?.requestedAt,
                        )}
                        {' / '}
                        {formatUtcTimestamp(
                          conditionedEnvelope?.surfaceAcquisition
                            ?.acquiredAt,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Sewer propagation</dt>
                      <dd>
                        Blocked ·{' '}
                        {conditionedEnvelope?.networkUse?.reasons
                          .map(statusLabel)
                          .join(' · ') ?? 'not evaluated'}
                      </dd>
                    </div>
                  </dl>
                  <p className="observed-warning">
                    {conditionedProxy.outfallAttachment.reason}
                    {' '}
                    {conditionedProxy.limitations.slice(0, 3).join(' ')}
                  </p>
                </>
              ) : (
                <p className="surface-proxy-missing">
                  {conditionedEnvelope?.missingReason ??
                    'Conditioned surface proxy not requested.'}
                </p>
              )}
            </section>
            <section className="observed-selection surface-proxy-receipt conditioned-runoff-receipt">
              <div className="surface-proxy-heading">
                <div>
                  <p className="eyebrow">
                    Environmental source term
                  </p>
                  <h3>IMERG + CLC runoff over conditioned area</h3>
                </div>
                <StatusPill
                  status={
                    conditionedRunoffEnvelope?.status ??
                    'not_requested'
                  }
                />
              </div>

              {conditionedRunoff ? (
                <>
                  <dl className="observed-facts">
                    <div>
                      <dt>Bounded H3 selection</dt>
                      <dd>
                        {conditionedRunoff.selection.selectedCellCount}
                        {' / '}
                        {conditionedRunoff.selection.candidateCellCount}
                        {' cells · '}
                        {formatNumber(
                          conditionedRunoff.selection.representedAreaM2,
                          0,
                          'm2',
                        )}
                        {conditionedRunoff.selection
                          .coversAllConditionedContributingCells
                          ? ' · complete conditioned area'
                          : ' · bounded subset'}
                      </dd>
                    </div>
                    <div>
                      <dt>IMERG rainfall 24 h</dt>
                      <dd>
                        {formatRange(rainfallValues, 2, 'mm')}
                        {' · '}
                        {firstConditionedEnvironmentalCell
                          ?.rainfall24hMm.spatial
                          .sourceResolution ?? 'resolution unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>Observation window</dt>
                      <dd>
                        {formatUtcTimestamp(
                          firstConditionedEnvironmentalCell
                            ?.rainfall24hMm.temporal.windowStart,
                        )}
                        {' → '}
                        {formatUtcTimestamp(
                          firstConditionedEnvironmentalCell
                            ?.rainfall24hMm.temporal.windowEnd,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Rainfall source</dt>
                      <dd>
                        {
                          conditionedRunoff.environmental.sources
                            .rainfall.provider
                        }
                        {' · '}
                        {
                          conditionedRunoff.environmental.sources
                            .rainfall.dataset
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>CLC evidence</dt>
                      <dd>
                        {formatClassCounts(landCoverValues)}
                        {' · '}
                        {firstConditionedEnvironmentalCell
                          ?.landCoverClass.spatial
                          .sourceResolution ?? 'resolution unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>GLO-30 slope input</dt>
                      <dd>
                        {formatRange(slopeValues, 2, 'deg')}
                        {' · '}
                        {firstConditionedEnvironmentalCell
                          ?.slopeDeg.spatial.sourceResolution ??
                          'resolution unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>Derived runoff depth</dt>
                      <dd>
                        {formatRange(runoffDepthValues, 2, 'mm')}
                      </dd>
                    </div>
                    <div>
                      <dt>Aggregated runoff volume</dt>
                      <dd>
                        {evidenceText(
                          conditionedRunoff.catchmentContribution
                            .totalVolumeM3,
                          3,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Runoff parameters</dt>
                      <dd>
                        {firstConditionedRunoffOutput
                          ? formatNumber(
                              firstConditionedRunoffOutput
                                .runoffCoefficient,
                              3,
                            ) +
                            ' coefficient · ' +
                            formatNumber(
                              firstConditionedRunoffOutput
                                .imperviousnessProxy,
                              2,
                            ) +
                            ' imperviousness proxy'
                          : 'Unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>Models</dt>
                      <dd>
                        {conditionedRunoff.modelVersion}
                        {' · '}
                        {firstConditionedRunoffOutput?.modelVersion ??
                          'runoff unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>Surface attachment</dt>
                      <dd>
                        Conditioned, not observed · outfall{' '}
                        {conditionedRunoff.surfaceDefinition.outfallH3}
                      </dd>
                    </div>
                    <div>
                      <dt>Network propagation</dt>
                      <dd>
                        Stopped before propagation ·{' '}
                        {conditionedRunoffEnvelope
                          ?.networkPropagation.blockingReasons
                          .map(statusLabel)
                          .join(' · ') ?? 'not evaluated'}
                      </dd>
                    </div>
                  </dl>
                  <p className="observed-warning">
                    {conditionedRunoffEnvelope?.missingReason
                      ? conciseReason(
                          conditionedRunoffEnvelope.missingReason,
                        ) + ' '
                      : ''}
                    {conditionedRunoff.limitations.slice(0, 4).join(' ')}
                  </p>
                </>
              ) : (
                <p className="surface-proxy-missing">
                  {conditionedRunoffEnvelope?.missingReason ??
                    'Conditioned environmental runoff not requested.'}
                </p>
              )}
            </section>
            <section className="observed-selection surface-proxy-receipt">
              <div className="surface-proxy-heading">
                <div>
                  <p className="eyebrow">
                    Raw elevation experiment
                  </p>
                  <h3>AHN DTM unconditioned proxy</h3>
                </div>
                <StatusPill
                  status={
                    surfaceEnvelope?.status ??
                    'not_requested'
                  }
                />
              </div>

              {surfaceProxy ? (
                <>
                  <dl className="observed-facts">
                    <div>
                      <dt>Complete contributing area</dt>
                      <dd>
                        {evidenceText(
                          surfaceProxy.contributingAreaM2,
                          0,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Resolved partial area</dt>
                      <dd>
                        {formatNumber(
                          surfaceProxy.partialContributingAreaM2,
                          0,
                          'm2',
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Elevation model</dt>
                      <dd>
                        {statusLabel(
                          surfaceProxy.elevationModel.semantics,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>H3 representation</dt>
                      <dd>
                        r{surfaceProxy.coverage.h3Resolution}
                        {' · '}
                        {surfaceProxy.coverage.targetCellCount}
                        {' target / '}
                        {surfaceProxy.coverage.sampledCellCount}
                        {' sampled' }
                      </dd>
                    </div>
                    <div>
                      <dt>Elevation source</dt>
                      <dd>
                        {surfaceProxy.elevationSources.providers.join(
                          ', ',
                        )}
                        {' · '}
                        {surfaceProxy.elevationSources.datasets.join(
                          ', ',
                        )}
                        {' · '}
                        {surfaceProxy.elevationSources.datasetVersions.join(
                          ', ',
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Source resolution</dt>
                      <dd>
                        {surfaceProxy.elevationSources.sourceResolutions.join(
                          ', ',
                        ) || 'Not stated'}
                      </dd>
                    </div>
                    <div>
                      <dt>Elevation evidence</dt>
                      <dd>
                        {surfaceProxy.elevationSources.statuses.available}
                        {' available · '}
                        {surfaceProxy.elevationSources.statuses.missing}
                        {' missing'}
                      </dd>
                    </div>
                    <div>
                      <dt>Elevation aggregation</dt>
                      <dd>
                        {surfaceProxy.elevationModel
                          .samplingDescription}
                      </dd>
                    </div>
                    <div>
                      <dt>Contributing cells</dt>
                      <dd>
                        {surfaceProxy.counts.contributingCells}
                        {' / '}
                        {surfaceProxy.coverage.targetCellCount}
                      </dd>
                    </div>
                    <div>
                      <dt>Other terminations</dt>
                      <dd>
                        {surfaceProxy.counts.coverageExitCells}
                        {' exit · '}
                        {surfaceProxy.counts.localDepressionCells}
                        {' depression · '}
                        {surfaceProxy.counts.incompleteElevationCells}
                        {' incomplete'}
                      </dd>
                    </div>
                    <div>
                      <dt>Conditioned pour point</dt>
                      <dd>{surfaceProxy.outfallAnchor.h3}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{surfaceProxy.modelVersion}</dd>
                    </div>
                    <div>
                      <dt>Sewer propagation</dt>
                      <dd>
                        Blocked ·{' '}
                        {surfaceEnvelope?.networkUse?.reasons
                          .map(statusLabel)
                          .join(' · ') ?? 'not evaluated'}
                      </dd>
                    </div>
                    <div>
                      <dt>Elevation acquired</dt>
                      <dd>
                        {surfaceProxy.elevationSources.acquiredAt
                          .map(formatUtcTimestamp)
                          .join(', ')}
                      </dd>
                    </div>
                    {surfaceEnvelope?.elevationAcquisition ? (
                      <div>
                        <dt>WCS receipt</dt>
                        <dd>
                          {surfaceEnvelope.elevationAcquisition.coverageId}
                          {' · '}
                          {surfaceEnvelope.elevationAcquisition.sourceCrs}
                          {' + '}
                          {surfaceEnvelope.elevationAcquisition.verticalDatum}
                          {' · '}
                          {surfaceEnvelope.elevationAcquisition.responseWidth}
                          {' x '}
                          {surfaceEnvelope.elevationAcquisition.responseHeight}
                          {' px · '}
                          {formatNumber(
                            surfaceEnvelope.elevationAcquisition.responseBytes /
                              1024,
                            0,
                            'KiB',
                          )}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <p className="observed-warning">
                    {surfaceProxy.limitations.slice(0, 4).join(' ')}
                    {' No Waternet sewer catchment is asserted.'}
                  </p>
                </>
              ) : (
                <p className="surface-proxy-missing">
                  {surfaceEnvelope?.missingReason ??
                    'Surface proxy not requested.'}
                </p>
              )}
            </section>

            {selectedPipe ? (
              <section className="observed-selection">
                <p className="eyebrow">
                  Selected source record
                </p>
                <h3>
                  {
                    selectedPipe.source
                      .sourceRecordId
                  }
                </h3>
                <dl className="observed-facts">
                  <div>
                    <dt>Length</dt>
                    <dd>
                      {formatNumber(
                        selectedPipe.lengthM,
                        2,
                        'm',
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Diameter</dt>
                    <dd>
                      {formatNumber(
                        selectedPipe.diameterMm,
                        0,
                        'mm',
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Invert A / B</dt>
                    <dd>
                      {evidenceText(
                        selectedPipe
                          .invertLevelAM,
                        3,
                      )}
                      {' / '}
                      {evidenceText(
                        selectedPipe
                          .invertLevelBM,
                        3,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Invert-derived direction</dt>
                    <dd>
                      {selectedDirection?.status ===
                      'known'
                        ? selectedDirection.fromNodeId ===
                          selectedPipe.nodeAId
                          ? 'A → B'
                          : 'B → A'
                        : selectedDirection
                          ? statusLabel(
                              selectedDirection.reason,
                            )
                          : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt>Vertical drop</dt>
                    <dd>
                      {selectedDirection?.status ===
                      'known'
                        ? formatNumber(
                            selectedDirection.verticalDropM,
                            3,
                            'm',
                          )
                        : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt>Material</dt>
                    <dd>
                      {metadataString(
                        selectedPipe.source
                          .sourceAttributes,
                        'material',
                      ) ?? 'Not stated'}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <p className="observed-warning">
              Direction is derived only by
              comparing Waternet pipe endpoint
              invert levels. At this threshold,
              {' '}
              {
                available.outfallConnectivity
                  .counts.knownUpstreamPaths
              }
              {' of '}
              {
                available.outfallConnectivity
                  .counts.outfalls
              }
              {' outfalls have a known upstream path; '}
              {
                available.outfallConnectivity
                  .counts
                  .blockedByUnresolvedDirection
              }
              {' stop at an unresolved direction boundary. '}
              The configured 0.05 m threshold is not
              a claim about source survey accuracy,
              and no hydraulic flow is asserted.
            </p>
            <p className="observed-warning">
              Source endpoint UUIDs are
              self-referential in this response.
              GeoLens preserves that defect and
              uses only explicit geometry
              snapping.
            </p>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
