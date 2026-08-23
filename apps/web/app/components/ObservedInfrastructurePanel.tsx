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
  const coordinates = [
    ...pipes.flatMap((pipe) => pipe.path),
    ...nodes.map((node) => node.position),
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

  return {
    nodes,
    pipes,
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
            Invert orientation only - no
            catchment or flow asserted
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
                rainwater outfalls.
              </desc>
              <rect
                width="820"
                height="360"
                className="observed-map-background"
              />
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
                <dt>Ambiguity threshold</dt>
                <dd>
                  {formatNumber(
                    available.orientation
                      .minimumResolvableDropM,
                    2,
                    'm',
                  )}
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
              invert levels. The configured 0.05 m
              threshold is not a claim about source
              survey accuracy, and no hydraulic flow
              is asserted.
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
