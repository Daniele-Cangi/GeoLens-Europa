import Link from 'next/link';

const evidenceSources = [
  {
    index: '01',
    label: 'Observation',
    name: 'IMERG precipitation',
    detail: 'Temporal window + granule provenance',
  },
  {
    index: '02',
    label: 'Terrain',
    name: 'Copernicus DEM',
    detail: 'Elevation + derived slope',
  },
  {
    index: '03',
    label: 'Surface',
    name: 'CORINE land cover',
    detail: 'Class + source resolution',
  },
] as const;

const methodSteps = [
  {
    number: '01',
    label: 'Acquire',
    title: 'Observe what is actually available.',
    copy: 'Providers return evidence with time, coverage, resolution and an explicit quality state. Failure never becomes a plausible zero.',
    output: 'Evidence<T>',
  },
  {
    number: '02',
    label: 'Compose',
    title: 'Place unlike sources on one spatial ledger.',
    copy: 'H3 connects rainfall, terrain, land cover and infrastructure while the native source resolution remains visible.',
    output: 'H3 bundle',
  },
  {
    number: '03',
    label: 'Derive',
    title: 'Turn observations into inspectable quantities.',
    copy: 'Deterministic models expose rainfall, slope, land cover, coefficients, runoff depth and represented volume.',
    output: 'Physical state',
  },
  {
    number: '04',
    label: 'Route',
    title: 'Move state only across defensible connections.',
    copy: 'Catchment attachment, topology and edge direction are validated independently. Unknown remains unknown.',
    output: 'Network state',
  },
] as const;

const refusalCards = [
  {
    mark: '≠ 0',
    title: 'No silent substitution',
    copy: 'Unavailable rainfall, elevation, slope or land cover is never converted into a valid-looking zero.',
  },
  {
    mark: '≠ AI',
    title: 'No generated certainty',
    copy: 'The core runs without an LLM. No confidence, recommendation or interpretation is invented after the fact.',
  },
  {
    mark: '≠ risk',
    title: 'No semantic shortcuts',
    copy: 'Hazard, susceptibility and risk are kept distinct. Physical quantities come before generic scores.',
  },
] as const;

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="landing-brand" href="/" aria-label="GeoLens home">
          <span className="landing-brand-mark" aria-hidden="true">GL</span>
          <span>GeoLens</span>
        </Link>
        <div className="landing-nav-links">
          <a href="#method">Method</a>
          <a href="#cases">Cases</a>
          <Link className="landing-nav-cta" href="/proof-zero">
            Open Proof 0
          </Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">
            Spatial evidence engine <span>·</span> Refoundation 2026
          </p>
          <h1>
            Environmental evidence,
            <span>made physical.</span>
          </h1>
          <p className="landing-lede">
            GeoLens composes real observations, terrain and infrastructure
            into traceable derived state—without turning missing data into
            certainty.
          </p>
          <div className="landing-actions">
            <Link className="landing-primary-action" href="/proof-zero">
              Inspect the engine
              <span aria-hidden="true">↗</span>
            </Link>
            <a className="landing-text-action" href="#method">
              Follow the evidence chain
            </a>
          </div>
          <div className="landing-claim">
            <span className="landing-claim-rule" aria-hidden="true" />
            <p>
              <strong>Missing is not zero.</strong> Every material value keeps
              its source, time, resolution, transformation and quality state.
            </p>
          </div>
        </div>

        <div className="landing-evidence-stage" aria-label="GeoLens evidence chain">
          <div className="landing-stage-grid" aria-hidden="true" />
          <div className="landing-stage-heading">
            <p>Evidence ledger</p>
            <span>Proof 0 / bounded system</span>
          </div>

          <div className="landing-source-stack">
            {evidenceSources.map((source) => (
              <article className="landing-source-row" key={source.index}>
                <span className="landing-source-index">{source.index}</span>
                <div>
                  <p>{source.label}</p>
                  <h2>{source.name}</h2>
                  <span>{source.detail}</span>
                </div>
                <i aria-hidden="true" />
              </article>
            ))}
          </div>

          <div className="landing-flow">
            <div className="landing-flow-node">
              <span>H3</span>
              <p>spatial normalization</p>
            </div>
            <span className="landing-flow-line" aria-hidden="true" />
            <div className="landing-flow-output">
              <p>Derived state</p>
              <strong>runoff → catchment → network</strong>
              <span>Inspectable at every boundary</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-proof-strip" aria-label="Current system commitments">
        <p><span>01</span> Real evidence first</p>
        <p><span>02</span> Explicit uncertainty</p>
        <p><span>03</span> Physical quantities</p>
        <p><span>04</span> Full provenance</p>
      </section>

      <section className="landing-intro" id="method">
        <div className="landing-section-index" aria-hidden="true">01</div>
        <div className="landing-section-copy">
          <p className="landing-section-kicker">The operating idea</p>
          <h2>
            A result is only as credible as the chain that produced it.
          </h2>
        </div>
        <div className="landing-intro-body">
          <p>
            GeoLens is not another map of coloured scores. It is an evidence
            system for asking what was observed, how that observation was
            transformed and where the resulting physical state can move.
          </p>
          <p>
            Every step is designed to be inspected independently—from a NASA
            granule and a terrain pixel to runoff volume at a catchment and
            accumulation at a downstream node.
          </p>
        </div>
      </section>

      <section className="landing-method" aria-labelledby="method-heading">
        <div className="landing-method-header">
          <p className="landing-section-kicker">Evidence → state</p>
          <h2 id="method-heading">One chain. Five accountable boundaries.</h2>
          <p>
            Provenance travels with the value. It is not reconstructed after
            the model runs.
          </p>
        </div>
        <div className="landing-method-grid">
          {methodSteps.map((step) => (
            <article className="landing-method-card" key={step.number}>
              <div className="landing-method-meta">
                <span>{step.number}</span>
                <p>{step.label}</p>
              </div>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
              <code>{step.output}</code>
            </article>
          ))}
          <article className="landing-method-card landing-method-result">
            <div className="landing-method-meta">
              <span>05</span>
              <p>Explain</p>
            </div>
            <h3>Return the value and its evidence receipt.</h3>
            <p>
              Provider, dataset version, reference time, acquisition time,
              source resolution, transformation and missing state remain
              attached.
            </p>
            <code>Result + provenance</code>
          </article>
        </div>
      </section>

      <section className="landing-cases" id="cases" aria-labelledby="cases-heading">
        <div className="landing-cases-heading">
          <div>
            <p className="landing-section-kicker">Bounded proofs</p>
            <h2 id="cases-heading">Built to be challenged by reality.</h2>
          </div>
          <p>
            Three deliberately different experiments test completeness,
            infrastructure truth and independent historical comparison.
          </p>
        </div>

        <article className="landing-case landing-case-featured">
          <div className="landing-case-number">00</div>
          <div className="landing-case-title">
            <p>Trento · Proof 0</p>
            <h3>Can the complete chain remain traceable?</h3>
            <span className="landing-case-status" data-state="complete">
              Complete bounded proof
            </span>
          </div>
          <div className="landing-case-description">
            <p>
              Real IMERG, GLO-30 and CLC evidence flows through deterministic
              runoff, a bounded network fixture and mass-conserving downstream
              propagation.
            </p>
            <Link href="/proof-zero">Open the evidence inspector ↗</Link>
          </div>
          <dl className="landing-case-metrics">
            <div><dt>Rainfall</dt><dd>9.24 mm</dd></div>
            <div><dt>Runoff</dt><dd>2.957 m³</dd></div>
            <div><dt>Mass difference</dt><dd>0 m³</dd></div>
          </dl>
          <p className="landing-case-boundary">
            Boundary: environmental inputs are real; the stormwater network is
            a deterministic fixture, not surveyed infrastructure.
          </p>
        </article>

        <div className="landing-case-pair">
          <article className="landing-case">
            <div className="landing-case-number">01</div>
            <div className="landing-case-title">
              <p>Amsterdam · Urban drainage proof</p>
              <h3>Can the engine refuse an invented attachment?</h3>
              <span className="landing-case-status" data-state="bounded">
                Observed infrastructure
              </span>
            </div>
            <div className="landing-case-description">
              <p>
                Waternet topology, AHN4 terrain and BGT surfaces produce a
                traceable runoff source. Propagation stops because the public
                record does not prove the surface-to-pipe relationship.
              </p>
            </div>
            <dl className="landing-case-metrics">
              <div><dt>Observed nodes / pipes</dt><dd>47 / 47</dd></div>
              <div><dt>Known / ambiguous direction</dt><dd>26 / 21</dd></div>
              <div><dt>Derived source term</dt><dd>11.4145 m³</dd></div>
            </dl>
            <p className="landing-case-boundary">
              The missing authoritative crosswalk is visible—and remains a
              blocker instead of being replaced by a convenient guess.
            </p>
          </article>

          <article className="landing-case landing-case-negative">
            <div className="landing-case-number">02</div>
            <div className="landing-case-title">
              <p>Emilia-Romagna 2023 · Historical replay</p>
              <h3>Can a physical hypothesis survive independent ground truth?</h3>
              <span className="landing-case-status" data-state="research">
                Benchmark in progress
              </span>
            </div>
            <div className="landing-case-description">
              <p>
                A blind Forlì reconstruction keeps the official flood extent
                outside the model, then compares it with the frozen prediction.
                The first D8 baseline performed no better than chance.
              </p>
            </div>
            <dl className="landing-case-metrics">
              <div><dt>IMERG granules</dt><dd>96 / 96</dd></div>
              <div><dt>Evaluation grid</dt><dd>30 m</dd></div>
              <div><dt>Frozen ROC AUC</dt><dd>0.4916</dd></div>
            </dl>
            <p className="landing-case-boundary">
              Negative evidence is retained as a versioned result. GeoLens does
              not relabel it as inundation prediction or validation.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-refusals" aria-labelledby="refusals-heading">
        <div className="landing-refusals-copy">
          <p className="landing-section-kicker">Scientific discipline</p>
          <h2 id="refusals-heading">What the engine refuses to manufacture.</h2>
          <p>
            GeoLens is intentionally narrower than the product it replaces.
            That constraint is part of the architecture.
          </p>
        </div>
        <div className="landing-refusal-grid">
          {refusalCards.map((card) => (
            <article key={card.mark}>
              <span>{card.mark}</span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final-cta">
        <p className="landing-section-kicker">See the system, not the slogan</p>
        <h2>Inspect every boundary.</h2>
        <p>
          Open Proof 0 to follow source evidence through runoff, catchment
          contribution, network direction and downstream state.
        </p>
        <Link className="landing-primary-action" href="/proof-zero">
          Enter the evidence inspector
          <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <footer className="landing-footer">
        <Link className="landing-brand" href="/">
          <span className="landing-brand-mark" aria-hidden="true">GL</span>
          <span>GeoLens</span>
        </Link>
        <p>Spatial evidence → traceable physical state.</p>
        <div>
          <span>Experimental system</span>
          <span>Refoundation 2026</span>
        </div>
      </footer>
    </main>
  );
}
