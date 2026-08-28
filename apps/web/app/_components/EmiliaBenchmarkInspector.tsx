'use client';

import { useEffect, useState } from 'react';

import {
  getEmiliaRomagnaBenchmark,
  type EmiliaRomagnaBenchmarkSnapshot,
} from '../lib/api';

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatInteger(value: number): string {
  return value.toLocaleString('en-GB');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export default function EmiliaBenchmarkInspector() {
  const [snapshot, setSnapshot] =
    useState<EmiliaRomagnaBenchmarkSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    getEmiliaRomagnaBenchmark(controller.signal)
      .then((result) => {
        setSnapshot(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'The benchmark API returned an unknown error.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const availableGateCount = snapshot
    ? snapshot.conditionedReplay.requiredEvidence.filter(
        (item) => item.status === 'available',
      ).length
    : 0;

  return (
    <section
      className="emilia-inspector"
      id="benchmark-inspector"
      aria-live="polite"
      aria-busy={isLoading}
      data-testid="emilia-benchmark-inspector"
    >
      <div className="emilia-inspector-heading">
        <div>
          <p className="site-overline">API evidence inspector</p>
          <h2>A result record that exposes failure as evidence</h2>
        </div>
        <p>
          This view reads the compact, versioned checkpoint served by the
          GeoLens API. The 746 MB source archive remains outside Git; every
          displayed state is tied to the pinned manifest and verified receipts.
        </p>
      </div>

      {isLoading ? (
        <div className="emilia-inspector-message">
          Loading the verified benchmark checkpoint…
        </div>
      ) : null}

      {error ? (
        <div className="emilia-inspector-message" data-tone="error">
          <strong>Benchmark API unavailable.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {snapshot ? (
        <div className="emilia-snapshot">
          <div className="emilia-snapshot-register">
            <div>
              <span>Record</span>
              <strong>{snapshot.schemaVersion}</strong>
            </div>
            <div>
              <span>Manifest</span>
              <strong>v{snapshot.manifest.version}</strong>
            </div>
            <div>
              <span>Replay mode</span>
              <strong>{statusLabel(snapshot.replayMode)}</strong>
            </div>
            <div>
              <span>Hydraulic gate</span>
              <strong data-state={snapshot.conditionedReplay.status}>
                {statusLabel(snapshot.conditionedReplay.status)}
              </strong>
            </div>
          </div>

          <div className="emilia-claim-notice">
            <span>Recorded scientific outcome</span>
            <strong>{snapshot.evaluation.statement}</strong>
            <p>
              The event window is {formatDate(snapshot.event.windowStart)} to{' '}
              {formatDate(snapshot.event.windowEnd)} UTC. This is a retrospective
              reconstruction, not an operational forecast.
            </p>
          </div>

          <dl className="emilia-metric-strip">
            <div>
              <dt>Native-grid rainfall mean</dt>
              <dd>{formatNumber(snapshot.routing.rainfall.nativeGridMeanMm, 3)} mm</dd>
              <span>
                {snapshot.routing.rainfall.granules} /{' '}
                {snapshot.routing.rainfall.expectedGranules} IMERG granules
              </span>
            </div>
            <div>
              <dt>Derived local runoff</dt>
              <dd>{formatNumber(snapshot.routing.runoff.localVolumeM3, 2)} m³</dd>
              <span>{formatInteger(snapshot.routing.counts.sourceLandCells)} source cells</span>
            </div>
            <div>
              <dt>ROC AUC</dt>
              <dd>{formatNumber(snapshot.evaluation.rocAuc, 6)}</dd>
              <span>Near-random spatial ranking</span>
            </div>
            <div>
              <dt>Average precision</dt>
              <dd>{formatNumber(snapshot.evaluation.averagePrecision, 6)}</dd>
              <span>
                Observed prevalence {formatNumber(snapshot.evaluation.observedPrevalence, 6)}
              </span>
            </div>
          </dl>

          <div className="emilia-evidence-flow" aria-label="Benchmark evidence flow">
            <div data-state="available">
              <span>01</span>
              <strong>Real forcing</strong>
              <p>IMERG, GLO-30 and CLC</p>
            </div>
            <i aria-hidden="true" />
            <div data-state={snapshot.routing.status}>
              <span>02</span>
              <strong>Derived runoff</strong>
              <p>Inspectable coefficient proxy</p>
            </div>
            <i aria-hidden="true" />
            <div data-state="available">
              <span>03</span>
              <strong>D8 routing</strong>
              <p>Mass-conserving concentration</p>
            </div>
            <i aria-hidden="true" />
            <div data-state={snapshot.evaluation.status}>
              <span>04</span>
              <strong>Blind evaluation</strong>
              <p>Observed extent opened post-freeze</p>
            </div>
            <i aria-hidden="true" />
            <div data-state={snapshot.conditionedReplay.status}>
              <span>05</span>
              <strong>Hydraulic replay</strong>
              <p>Blocked before unsupported inference</p>
            </div>
          </div>

          <section className="emilia-evidence-section" aria-labelledby="emilia-evidence-title">
            <div className="emilia-section-heading">
              <div>
                <p className="site-overline">Source register</p>
                <h3 id="emilia-evidence-title">Evidence, role and native resolution</h3>
              </div>
              <p>
                H3 r{snapshot.spatial.h3RepresentationResolution} and the 30 m
                metric grid are representation choices. They do not replace a
                provider&apos;s native resolution.
              </p>
            </div>
            <div className="emilia-evidence-table" role="region" aria-label="Evidence source table" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Operational use</th>
                    <th scope="col">Native resolution</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.evidence.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">
                        <strong>{item.dataset}</strong>
                        <span>{item.provider} · {item.datasetVersion}</span>
                      </th>
                      <td>
                        <strong>{statusLabel(item.use)}</strong>
                        <span>{item.note}</span>
                      </td>
                      <td>{item.sourceResolution}</td>
                      <td>
                        <span className="emilia-state" data-state={item.status}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="emilia-inspector-grid">
            <section aria-labelledby="emilia-station-title">
              <p className="site-overline">Independent comparison</p>
              <h3 id="emilia-station-title">IMERG against ARPAE gauges</h3>
              <div className="emilia-station-list">
                {snapshot.stationComparison.rainfall.map((station) => (
                  <article key={station.station}>
                    <strong>{station.station}</strong>
                    <dl>
                      <div><dt>Gauge</dt><dd>{formatNumber(station.gaugeTotalMm, 1)} mm</dd></div>
                      <div><dt>IMERG</dt><dd>{formatNumber(station.imergTotalMm, 2)} mm</dd></div>
                      <div><dt>Difference</dt><dd>{formatNumber(station.imergMinusGaugeMm, 2)} mm</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
              <p className="emilia-method-note">{snapshot.stationComparison.note}</p>
            </section>

            <section aria-labelledby="emilia-gate-title">
              <div className="emilia-gate-heading">
                <div>
                  <p className="site-overline">Conditioned replay gate</p>
                  <h3 id="emilia-gate-title">Missing stays missing</h3>
                </div>
                <span>{availableGateCount} / {snapshot.conditionedReplay.requiredEvidence.length} available</span>
              </div>
              <ol className="emilia-gate-list">
                {snapshot.conditionedReplay.requiredEvidence.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{statusLabel(item.id)}</strong>
                      <span className="emilia-state" data-state={item.status}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    {item.blocker ? <p>{item.blocker}</p> : <p>Evidence gate satisfied by the pinned forcing record.</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <footer className="emilia-inspector-footer">
            <span>GET /api/benchmarks/emilia-romagna-2023</span>
            <span>
              {snapshot.manifest.artifactCount} artifacts ·{' '}
              {formatInteger(snapshot.manifest.artifactBytes)} bytes · SHA-256
            </span>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
