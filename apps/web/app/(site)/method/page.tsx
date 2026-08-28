import type { Metadata } from 'next';
import Link from 'next/link';

import PageIntro from '../../_components/PageIntro';

export const metadata: Metadata = {
  title: 'Method',
  description: 'GeoLens evidence, derivation, verification and scientific-claim method.',
};

const verificationLevels = [
  ['Typecheck', 'Structural consistency across the active TypeScript system.'],
  ['Unit and fixture tests', 'Deterministic transformations and explicit synthetic-fixture semantics.'],
  ['Integration tests', 'Provider, evidence, hydrology and network boundaries working together.'],
  ['Runtime API tests', 'Actual request and response behavior at the public system boundary.'],
  ['Real-data tests', 'Opt-in external-provider verification with network and credentials when required.'],
  ['Independent benchmark', 'A frozen prediction compared with evidence excluded from model input.'],
] as const;

export default function MethodPage() {
  return (
    <main>
      <PageIntro
        section="Method"
        title="Evidence first. Derivation second. Claims last."
        lede="GeoLens treats provenance, missingness and interpretation limits as operational parts of the model rather than documentation added after execution."
      />

      <section className="page-section method-principles">
        <div className="section-heading-row">
          <div><p className="site-overline">Operating principles</p><h2>Five controls on every result</h2></div>
          <p>The method is designed to make overstatement difficult and missing evidence visible.</p>
        </div>
        <ol className="method-control-list">
          <li><span>01</span><div><h3>Identify the evidence</h3><p>Record provider, dataset, version, reference time, acquisition time and operational state.</p></div></li>
          <li><span>02</span><div><h3>Retain source resolution</h3><p>Use H3 for indexing and composition without implying H3-native measurement precision.</p></div></li>
          <li><span>03</span><div><h3>Expose transformation inputs</h3><p>Rainfall, slope, land cover, imperviousness and runoff parameters remain inspectable.</p></div></li>
          <li><span>04</span><div><h3>Validate topology independently</h3><p>Attachment, network connectivity and direction evidence are established before propagation.</p></div></li>
          <li><span>05</span><div><h3>Bound the scientific claim</h3><p>Results are labelled experimental, derived or proxy unless a separate validation procedure supports more.</p></div></li>
        </ol>
      </section>

      <section className="verification-section">
        <div className="section-heading-row">
          <div><p className="site-overline">Verification ladder</p><h2>Compilation is the first gate, not the last.</h2></div>
          <p>Fixture verification and real-data verification are kept distinct so that deterministic tests cannot masquerade as live evidence.</p>
        </div>
        <div className="verification-grid">
          {verificationLevels.map(([title, copy], index) => (
            <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className="page-section terminology-section">
        <div className="section-heading-row">
          <div><p className="site-overline">Terminology control</p><h2>Related concepts are not interchangeable</h2></div>
          <p>Scientific language is treated as part of the model interface.</p>
        </div>
        <div className="terminology-grid">
          <article><h3>Observation</h3><p>A measured or classified source value with identifiable provenance.</p></article>
          <article><h3>Derived quantity</h3><p>A deterministic transformation whose inputs and version are visible.</p></article>
          <article><h3>Hazard</h3><p>Evidence describing a potentially damaging physical phenomenon.</p></article>
          <article><h3>Susceptibility</h3><p>Evidence describing relative predisposition, not event probability.</p></article>
          <article><h3>Risk</h3><p>A concept requiring hazard, exposure and vulnerability—not a synonym for any one input.</p></article>
          <article><h3>Validation</h3><p>A separate procedure with independent reference evidence and declared metrics.</p></article>
        </div>
      </section>

      <section className="method-final-band">
        <div><p className="site-overline">Benchmark protocol</p><h2>The evaluation target cannot become a hidden model input.</h2></div>
        <p>The Emilia-Romagna historical replay freezes the input boundary, prediction, score and metrics before opening the official post-event flood extent. Its negative first result remains part of the record.</p>
        <Link className="site-secondary-action" href="/cases/emilia-romagna-2023">Review Case 02</Link>
      </section>
    </main>
  );
}
