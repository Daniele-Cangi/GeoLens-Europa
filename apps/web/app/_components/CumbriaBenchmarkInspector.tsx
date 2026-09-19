'use client';

import { useEffect, useState } from 'react';

import {
  getCumbriaBenchmark,
  type CumbriaBenchmarkSnapshot,
} from '../lib/api';

function label(value: string): string {
  return value.replaceAll('_', ' ');
}

function decimal(value: number, digits = 4): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function squareKilometres(value: number): string {
  return `${decimal(value / 1_000_000, 3)} km²`;
}

export default function CumbriaBenchmarkInspector() {
  const [snapshot, setSnapshot] = useState<CumbriaBenchmarkSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    getCumbriaBenchmark(controller.signal)
      .then((result) => {
        setSnapshot(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Unknown API error.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <section
      className="emilia-inspector"
      id="cumbria-benchmark-inspector"
      aria-live="polite"
      aria-busy={loading}
      data-testid="cumbria-benchmark-inspector"
    >
      <div className="emilia-inspector-heading">
        <div>
          <p className="site-overline">API evidence inspector</p>
          <h2>The failed test remains a first-class scientific record</h2>
        </div>
        <p>
          This publication-safe snapshot exposes the frozen prediction,
          separate comparisons and revision gate. It contains no external file
          paths, source arrays or evaluation geometry.
        </p>
      </div>

      {loading ? <div className="emilia-inspector-message">Loading the frozen benchmark record…</div> : null}
      {error ? (
        <div className="emilia-inspector-message" data-tone="error">
          <strong>Benchmark API unavailable.</strong><span>{error}</span>
        </div>
      ) : null}

      {snapshot ? (
        <div className="emilia-snapshot">
          <div className="emilia-snapshot-register">
            <div><span>Manifest</span><strong>v{snapshot.manifestVersion}</strong></div>
            <div><span>Outcome</span><strong>{label(snapshot.state)}</strong></div>
            <div><span>Scenarios</span><strong>{snapshot.prediction.scenarioCount} / {snapshot.prediction.scenarioCount}</strong></div>
            <div><span>Revision gate</span><strong data-state="blocked_missing_required_evidence">Frozen</strong></div>
          </div>

          <div className="emilia-claim-notice">
            <span>Recorded scientific outcome</span>
            <strong>Low agreement and systematic overprediction</strong>
            <p>{snapshot.diagnosis.interpretation}</p>
          </div>

          <dl className="emilia-metric-strip">
            <div><dt>Predicted wet area</dt><dd>{squareKilometres(snapshot.prediction.predictedWetAreaM2)}</dd><span>Primary 20 m scenario</span></div>
            <div><dt>Evaluation domain</dt><dd>{snapshot.spatial.frozenEvaluationCells.toLocaleString('en-GB')}</dd><span>Cells with complete prediction evidence</span></div>
            <div><dt>Rainfall forcing</dt><dd>{snapshot.forcing.imerg.samples} / 144</dd><span>Native half-hour IMERG grids</span></div>
            <div><dt>Flow forcing</dt><dd>{snapshot.forcing.sheepmount.samples} / 288</dd><span>Sheepmount 15-minute observations</span></div>
          </dl>

          <section className="emilia-evidence-section" aria-labelledby="cumbria-comparison-title">
            <div className="emilia-section-heading">
              <div><p className="site-overline">Separate references</p><h3 id="cumbria-comparison-title">One prediction, three independent comparisons</h3></div>
              <p>No union, best-case selection or post-reference threshold change is permitted.</p>
            </div>
            <div className="emilia-evidence-table" role="region" aria-label="Cumbria comparison metrics" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">Reference</th><th scope="col">IoU</th><th scope="col">Precision</th><th scope="col">Recall</th><th scope="col">False-positive area</th></tr></thead>
                <tbody>
                  {snapshot.comparisons.map((comparison) => (
                    <tr key={comparison.referenceId}>
                      <th scope="row"><strong>{label(comparison.referenceId)}</strong><span>{comparison.observedWetCells.toLocaleString('en-GB')} observed wet cells</span></th>
                      <td>{decimal(comparison.intersectionOverUnion)}</td>
                      <td>{decimal(comparison.precision)}</td>
                      <td>{decimal(comparison.recall)}</td>
                      <td>{squareKilometres(comparison.falsePositiveAreaM2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="emilia-evidence-section" aria-labelledby="cumbria-hypothesis-title">
            <div className="emilia-section-heading">
              <div><p className="site-overline">Revision boundary</p><h3 id="cumbria-hypothesis-title">Four hypotheses, zero authorized corrections</h3></div>
              <p>A new holdout event or area is required before any future validation claim.</p>
            </div>
            <ol className="emilia-gate-list">
              {snapshot.revisionGate.hypotheses.map((hypothesis) => (
                <li key={hypothesis.id}>
                  <div><strong>{label(hypothesis.id)}</strong><span className="emilia-state" data-state="missing">Evidence blocked</span></div>
                  <p>{hypothesis.statement}</p>
                </li>
              ))}
            </ol>
          </section>

          <footer className="emilia-inspector-footer">
            <span>GET /api/benchmarks/cumbria-2015</span>
            <span>Physics frozen · Carlisle rerun blocked · validation claim blocked</span>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
