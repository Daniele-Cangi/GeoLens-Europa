'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import {
  getEmiliaRomagnaMapManifest,
  type EmiliaRomagnaMapManifest,
} from '../lib/api';

type MapLayer = EmiliaRomagnaMapManifest['layers'][number];

const CONTINUOUS_PALETTES = {
  terrain_contributing_area: [
    [232, 241, 241],
    [118, 165, 164],
    [21, 91, 111],
    [8, 35, 56],
  ],
  elevation: [
    [230, 239, 232],
    [143, 173, 151],
    [141, 111, 70],
    [73, 54, 43],
  ],
  event_runoff_concentration: [
    [247, 239, 214],
    [219, 167, 88],
    [184, 81, 61],
    [91, 33, 44],
  ],
} as const;

const LAND_COVER_COLOURS: Readonly<Record<number, string>> = {
  1: '#ad6c5a',
  2: '#d3bd70',
  3: '#4f7963',
  4: '#78958b',
  5: '#287d9b',
};

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

function decodeBase64(value: string): Uint8Array {
  const binary = window.atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function interpolateColour(
  palette: readonly (readonly [number, number, number])[],
  value: number,
): string {
  const bounded = Math.max(0, Math.min(1, value));
  const scaled = bounded * (palette.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(lowerIndex + 1, palette.length - 1);
  const fraction = scaled - lowerIndex;
  const lower = palette[lowerIndex];
  const upper = palette[upperIndex];
  const channels = lower.map((channel, index) =>
    Math.round(channel + (upper[index] - channel) * fraction),
  );
  return `rgb(${channels.join(', ')})`;
}

function cellColour(layer: MapLayer, encodedValue: number): string | null {
  if (!layer.data || encodedValue === layer.data.noData) {
    return null;
  }
  if (layer.id === 'land_cover') {
    return LAND_COVER_COLOURS[encodedValue] ?? '#dfe6e6';
  }
  if (layer.id === 'known_permanent_water') {
    return encodedValue === 1 ? '#0c7398' : '#e5eceb';
  }
  const palette =
    layer.id === 'elevation'
      ? CONTINUOUS_PALETTES.elevation
      : layer.id === 'event_runoff_concentration'
        ? CONTINUOUS_PALETTES.event_runoff_concentration
      : CONTINUOUS_PALETTES.terrain_contributing_area;
  return interpolateColour(palette, encodedValue / 254);
}

function decodedValue(layer: MapLayer, encodedValue: number): string {
  if (!layer.data || encodedValue === layer.data.noData) {
    return 'No data';
  }
  if (layer.data.categories) {
    return layer.data.categories[String(encodedValue)] ?? 'Unclassified';
  }
  if (!layer.data.domain) {
    return String(encodedValue);
  }

  const fraction = encodedValue / 254;
  const { minimum, maximum } = layer.data.domain;
  const value =
    layer.data.scale === 'log1p'
      ? Math.expm1(
          Math.log1p(minimum) +
            fraction * (Math.log1p(maximum) - Math.log1p(minimum)),
        )
      : minimum + fraction * (maximum - minimum);
  return `${value.toLocaleString('en-GB', {
    maximumFractionDigits: layer.unit === 'm²' ? 0 : 1,
  })}${layer.unit ? ` ${layer.unit}` : ''}`;
}

function selectedCellDetails(
  manifest: EmiliaRomagnaMapManifest,
  layer: MapLayer,
  selectedIndex: number | null,
  values: Uint8Array | null,
) {
  if (selectedIndex === null || !values || !layer.data) {
    return null;
  }
  const row = Math.floor(selectedIndex / manifest.displayGrid.width);
  const column = selectedIndex % manifest.displayGrid.width;
  const [minimumX, minimumY, maximumX, maximumY] =
    manifest.displayGrid.bounds;
  const x =
    minimumX +
    ((column + 0.5) / manifest.displayGrid.width) *
      (maximumX - minimumX);
  const y =
    maximumY -
    ((row + 0.5) / manifest.displayGrid.height) *
      (maximumY - minimumY);

  return {
    row,
    column,
    x,
    y,
    value: decodedValue(layer, values[selectedIndex]),
  };
}

function drawMap(
  canvas: HTMLCanvasElement,
  manifest: EmiliaRomagnaMapManifest,
  layer: MapLayer,
  values: Uint8Array | null,
  aoiCoverage: Uint8Array,
  selectedIndex: number | null,
): void {
  const bounds = canvas.getBoundingClientRect();
  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * devicePixelRatio));
  const height = Math.max(1, Math.round(bounds.height * devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#eef3f3';
  context.fillRect(0, 0, width, height);

  const cellWidth = width / manifest.displayGrid.width;
  const cellHeight = height / manifest.displayGrid.height;
  if (values && layer.data) {
    for (let index = 0; index < values.length; index += 1) {
      const coverage = aoiCoverage[index] / 254;
      if (coverage <= 0) continue;
      const colour = cellColour(layer, values[index]);
      if (!colour) continue;
      const row = Math.floor(index / manifest.displayGrid.width);
      const column = index % manifest.displayGrid.width;
      context.globalAlpha = Math.max(0.28, coverage);
      context.fillStyle = colour;
      context.fillRect(
        Math.floor(column * cellWidth),
        Math.floor(row * cellHeight),
        Math.ceil(cellWidth + 0.5),
        Math.ceil(cellHeight + 0.5),
      );
    }
  }

  context.globalAlpha = 1;
  context.strokeStyle = 'rgba(8, 35, 56, 0.12)';
  context.lineWidth = Math.max(1, devicePixelRatio * 0.5);
  for (let column = 0; column <= manifest.displayGrid.width; column += 5) {
    const x = Math.round(column * cellWidth);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let row = 0; row <= manifest.displayGrid.height; row += 5) {
    const y = Math.round(row * cellHeight);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  if (selectedIndex !== null && values) {
    const row = Math.floor(selectedIndex / manifest.displayGrid.width);
    const column = selectedIndex % manifest.displayGrid.width;
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(2, devicePixelRatio * 2);
    context.strokeRect(
      column * cellWidth + context.lineWidth / 2,
      row * cellHeight + context.lineWidth / 2,
      cellWidth - context.lineWidth,
      cellHeight - context.lineWidth,
    );
    context.strokeStyle = '#082338';
    context.lineWidth = Math.max(1, devicePixelRatio);
    context.strokeRect(
      column * cellWidth + context.lineWidth / 2,
      row * cellHeight + context.lineWidth / 2,
      cellWidth - context.lineWidth,
      cellHeight - context.lineWidth,
    );
  }
}

function MapLegend({ layer }: { readonly layer: MapLayer }) {
  if (!layer.data) return null;
  if (layer.data.categories) {
    return (
      <ul className="emilia-map-legend-categories">
        {Object.entries(layer.data.categories).map(([value, label]) => (
          <li key={value}>
            <i
              aria-hidden="true"
              style={{
                background:
                  layer.id === 'land_cover'
                    ? LAND_COVER_COLOURS[Number(value)]
                    : Number(value) === 1
                      ? '#0c7398'
                      : '#e5eceb',
              }}
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="emilia-map-legend-continuous">
      <div data-layer={layer.id} aria-hidden="true" />
      <span>{decodedValue(layer, 0)}</span>
      <span>{decodedValue(layer, 254)}</span>
    </div>
  );
}

export default function EmiliaSpatialInspector() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [manifest, setManifest] =
    useState<EmiliaRomagnaMapManifest | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string>(
    'terrain_contributing_area',
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    getEmiliaRomagnaMapManifest(controller.signal)
      .then((result) => {
        setManifest(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'The spatial manifest returned an unknown error.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const activeLayer = useMemo(
    () =>
      manifest?.layers.find((layer) => layer.id === activeLayerId) ??
      manifest?.layers[0] ??
      null,
    [activeLayerId, manifest],
  );
  const aoiCoverage = useMemo(
    () => (manifest ? decodeBase64(manifest.aoiCoverage.values) : null),
    [manifest],
  );
  const activeValues = useMemo(
    () =>
      activeLayer?.data ? decodeBase64(activeLayer.data.values) : null,
    [activeLayer],
  );
  const cellDetails = useMemo(
    () =>
      manifest && activeLayer
        ? selectedCellDetails(
            manifest,
            activeLayer,
            selectedIndex,
            activeValues,
          )
        : null,
    [activeLayer, activeValues, manifest, selectedIndex],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !manifest) return;
    const observer = new ResizeObserver(() => {
      setCanvasRevision((revision) => revision + 1);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [manifest]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !manifest || !activeLayer || !aoiCoverage) return;
    drawMap(
      canvas,
      manifest,
      activeLayer,
      activeValues,
      aoiCoverage,
      selectedIndex,
    );
  }, [
    activeLayer,
    activeValues,
    aoiCoverage,
    canvasRevision,
    manifest,
    selectedIndex,
  ]);

  function indexFromPointer(event: PointerEvent<HTMLCanvasElement>): number | null {
    if (!manifest || activeLayer?.renderState !== 'renderable') return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const column = Math.min(
      manifest.displayGrid.width - 1,
      Math.max(
        0,
        Math.floor(
          ((event.clientX - bounds.left) / bounds.width) *
            manifest.displayGrid.width,
        ),
      ),
    );
    const row = Math.min(
      manifest.displayGrid.height - 1,
      Math.max(
        0,
        Math.floor(
          ((event.clientY - bounds.top) / bounds.height) *
            manifest.displayGrid.height,
        ),
      ),
    );
    return row * manifest.displayGrid.width + column;
  }

  function moveSelection(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (!manifest || activeLayer?.renderState !== 'renderable') return;
    const width = manifest.displayGrid.width;
    const maximum = manifest.displayGrid.cellCount - 1;
    const current = selectedIndex ?? Math.floor(maximum / 2);
    const movement: Readonly<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -width,
      ArrowDown: width,
    };
    const offset = movement[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    setSelectedIndex(Math.max(0, Math.min(maximum, current + offset)));
  }

  return (
    <section
      className="emilia-spatial-inspector"
      aria-live="polite"
      aria-busy={isLoading}
      data-testid="emilia-spatial-inspector"
    >
      <header className="emilia-spatial-heading">
        <div>
          <p className="site-overline">Case 02 · Spatial inspector</p>
          <h2>The map shows evidence—and also what cannot be shown</h2>
        </div>
        <p>
          A bounded 300 m display projection derived from the verified 30 m
          analysis grid. Native resolution, aggregation and publication state
          remain attached to every layer.
        </p>
      </header>

      {isLoading ? (
        <div className="emilia-inspector-message">
          Loading the publication-safe spatial manifest…
        </div>
      ) : null}
      {error ? (
        <div className="emilia-inspector-message" data-tone="error">
          <strong>Spatial manifest unavailable.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {manifest && activeLayer ? (
        <div className="emilia-map-workspace">
          <nav className="emilia-layer-controls" aria-label="Spatial evidence layers">
            {manifest.layers.map((layer) => (
              <button
                type="button"
                key={layer.id}
                aria-pressed={layer.id === activeLayer.id}
                data-state={layer.evidenceStatus}
                data-render={layer.renderState}
                onClick={() => {
                  setActiveLayerId(layer.id);
                  setSelectedIndex(null);
                }}
              >
                <span>{layer.shortTitle}</span>
                <small>
                  {layer.renderState === 'withheld'
                    ? 'withheld'
                    : statusLabel(layer.evidenceStatus)}
                </small>
              </button>
            ))}
          </nav>

          <div className="emilia-map-layout">
            <div className="emilia-map-frame">
              <div className="emilia-map-north" aria-hidden="true">
                <span>N</span>
                <i />
              </div>
              <canvas
                ref={canvasRef}
                role="img"
                tabIndex={activeLayer.renderState === 'renderable' ? 0 : -1}
                aria-label={`${activeLayer.title}. Use arrow keys to inspect display cells.`}
                onPointerMove={(event) => {
                  const nextIndex = indexFromPointer(event);
                  if (nextIndex !== null && nextIndex !== selectedIndex) {
                    setSelectedIndex(nextIndex);
                  }
                }}
                onKeyDown={moveSelection}
              >
                {activeLayer.title} over the bounded Forlì analysis area.
              </canvas>
              {activeLayer.renderState === 'withheld' ? (
                <div className="emilia-map-withheld" role="status">
                  <span>Spatial values withheld</span>
                  <strong>{activeLayer.shortTitle}</strong>
                  <p>{activeLayer.missingReason}</p>
                </div>
              ) : null}
              <div className="emilia-map-coordinates" aria-hidden="true">
                <span>EPSG:32632</span>
                <span>10.05 × 12.60 km</span>
              </div>
            </div>

            <aside className="emilia-map-record" aria-label="Active layer record">
              <div className="emilia-map-record-heading">
                <p className="site-overline">Active record</p>
                <span
                  data-state={
                    activeLayer.renderState === 'withheld'
                      ? 'withheld'
                      : activeLayer.evidenceStatus
                  }
                >
                  {activeLayer.renderState === 'withheld'
                    ? `withheld · evidence ${statusLabel(activeLayer.evidenceStatus)}`
                    : statusLabel(activeLayer.evidenceStatus)}
                </span>
              </div>
              <h3>{activeLayer.title}</h3>
              <p className="emilia-map-interpretation">
                {activeLayer.interpretation}
              </p>

              {cellDetails ? (
                <dl className="emilia-map-cell-record">
                  <div>
                    <dt>Displayed value</dt>
                    <dd>{cellDetails.value}</dd>
                  </div>
                  <div>
                    <dt>Display cell</dt>
                    <dd>
                      r{cellDetails.row + 1} · c{cellDetails.column + 1}
                    </dd>
                  </div>
                  <div>
                    <dt>Approx. centre</dt>
                    <dd>
                      {Math.round(cellDetails.x)} E · {Math.round(cellDetails.y)} N
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="emilia-map-cell-empty">
                  {activeLayer.renderState === 'renderable'
                    ? 'Move across the map or use the arrow keys to inspect a display cell.'
                    : 'The layer remains registered, but no spatial values leave the evidence boundary.'}
                </p>
              )}

              <MapLegend layer={activeLayer} />

              <dl className="emilia-map-provenance">
                <div>
                  <dt>Provider</dt>
                  <dd>{activeLayer.provider}</dd>
                </div>
                <div>
                  <dt>Dataset / version</dt>
                  <dd>
                    {activeLayer.dataset} · {activeLayer.datasetVersion}
                  </dd>
                </div>
                <div>
                  <dt>Resolution</dt>
                  <dd>{activeLayer.sourceResolution}</dd>
                </div>
                <div>
                  <dt>Transformation</dt>
                  <dd>{activeLayer.transformation}</dd>
                </div>
                <div>
                  <dt>Publication</dt>
                  <dd>{statusLabel(activeLayer.publicationState)}</dd>
                </div>
              </dl>

              {activeLayer.missingReason ? (
                <p className="emilia-map-limitation">
                  <strong>Evidence boundary.</strong> {activeLayer.missingReason}
                </p>
              ) : null}
              <p className="emilia-map-attribution">{activeLayer.attribution}</p>
            </aside>
          </div>

          <footer className="emilia-map-footer">
            <span>
              34 × 42 display cells · nominal 300 m · edge blocks clipped
            </span>
            <span>
              Source grid 335 × 420 · 30 m · H3 r11 is representation only
            </span>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
