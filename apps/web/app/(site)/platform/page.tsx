import type { Metadata } from 'next';
import Link from 'next/link';

import PageIntro from '../../_components/PageIntro';

export const metadata: Metadata = {
  title: 'Platform',
  description: 'The active GeoLens architecture, evidence contract and operational boundaries.',
};

const evidenceStates = [
  'available', 'missing', 'stale', 'out_of_coverage', 'auth_required',
  'rate_limited', 'upstream_error', 'invalid_response',
  'incomplete_window', 'synthetic_fixture',
] as const;

export default function PlatformPage() {
  return (
    <main>
      <PageIntro
        section="Platform"
        title="A spatial evidence engine with accountable boundaries."
        lede="GeoLens separates acquisition, spatial composition, physical derivation and network state so that each transformation can be verified independently."
      />

      <section className="page-section platform-definition">
        <div className="section-heading-row">
          <div><p className="site-overline">System definition</p><h2>What the active platform provides</h2></div>
          <p>The architecture is deliberately smaller than the historical product. AI, mineral prospectivity and generic multi-hazard scoring are outside the active runtime.</p>
        </div>
        <div className="platform-capability-grid">
          <article><span>01</span><h3>Evidence contract</h3><p>A common return model for values, provenance, space, time and quality state.</p></article>
          <article><span>02</span><h3>Real providers</h3><p>Canonical paths for IMERG, Copernicus terrain, land cover, AHN, BGT and observed infrastructure.</p></article>
          <article><span>03</span><h3>Physical derivation</h3><p>Inspectable runoff parameters and deterministic quantities instead of generic risk scores.</p></article>
          <article><span>04</span><h3>Typed network state</h3><p>Topology, catchment attachment, direction evidence and propagation remain separate concerns.</p></article>
        </div>
      </section>

      <section className="platform-architecture">
        <div className="section-heading-row">
          <div><p className="site-overline">Active architecture</p><h2>From providers to inspection</h2></div>
          <p>Operational behavior may differ by provider. Returned evidence semantics are common.</p>
        </div>
        <div className="architecture-stack">
          <div><span>External evidence</span><strong>NASA IMERG · Copernicus DEM · CLC · AHN · BGT · Waternet</strong></div>
          <i aria-hidden="true" />
          <div><span>Provider boundary</span><strong>Authentication · acquisition · validation · explicit failure state</strong></div>
          <i aria-hidden="true" />
          <div><span>Spatial composition</span><strong>Native resolution retained · H3 normalization made explicit</strong></div>
          <i aria-hidden="true" />
          <div><span>Domain models</span><strong>Runoff · contributing area · topology · direction · propagation</strong></div>
          <i aria-hidden="true" />
          <div><span>Public interface</span><strong>Evidence API · Proof 0 inspector · reproducible tests</strong></div>
        </div>
      </section>

      <section className="page-section evidence-contract-section">
        <div className="section-heading-row">
          <div><p className="site-overline">Canonical semantics</p><h2>Missing data is part of the result</h2></div>
          <p>Provider failures are not collapsed into one generic flag and cannot silently become valid-looking measurements.</p>
        </div>
        <div className="evidence-state-list">
          {evidenceStates.map((state) => <code key={state}>{state}</code>)}
        </div>
        <div className="evidence-contract-grid">
          <article><h3>Value</h3><p>Nullable physical or categorical observation with its stated unit.</p></article>
          <article><h3>Spatial</h3><p>Coordinates, H3 identity and original source resolution.</p></article>
          <article><h3>Temporal</h3><p>Observed time, requested and actual window, and acquisition time.</p></article>
          <article><h3>Provenance</h3><p>Provider, dataset, version, transformation and sampling method.</p></article>
          <article><h3>Quality</h3><p>Operational status, source quality and a machine-readable missing reason.</p></article>
        </div>
      </section>

      <section className="platform-boundary-band">
        <div><p className="site-overline">Current boundary</p><h2>Proof 0 is an inspectable runoff system—not a flood model.</h2></div>
        <ul>
          <li>No pipe capacity, surcharge or sewer overflow probability.</li>
          <li>No flood depth, probability or operational forecast.</li>
          <li>No AI-generated assessment, recommendation or confidence.</li>
          <li>No continent-scale real-time claim.</li>
        </ul>
        <Link className="site-secondary-action" href="/method">Review the scientific method</Link>
      </section>
    </main>
  );
}
