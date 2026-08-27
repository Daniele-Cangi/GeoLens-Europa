import type { Metadata } from 'next';
import Link from 'next/link';

import CaseCard from '../_components/CaseCard';
import { researchCaseList } from '../_data/cases';

export const metadata: Metadata = {
  title: 'GeoLens — Environmental Evidence Infrastructure',
  description:
    'GeoLens composes real environmental observations, terrain and infrastructure into traceable derived physical state.',
};

const programmeStatus = [
  ['Programme phase', 'Refoundation'],
  ['Current proof', 'Stormwater evidence chain'],
  ['Validation mode', 'Bounded and reproducible'],
  ['Core dependency', 'No AI service required'],
] as const;

export default function HomePage() {
  return (
    <main>
      <section className="institutional-hero">
        <div className="institutional-hero-copy">
          <p className="site-overline">Environmental evidence infrastructure</p>
          <h1>Traceable physical state from real environmental evidence.</h1>
          <p className="institutional-hero-lede">
            GeoLens brings observations, terrain and infrastructure into one
            accountable spatial system. Every result retains its origin,
            transformation, resolution, time and missing-data state.
          </p>
          <div className="site-actions">
            <Link className="site-primary-action" href="/platform">
              Explore the platform
            </Link>
            <Link className="site-secondary-action" href="/proof-zero">
              Open Proof 0 inspector
            </Link>
          </div>
          <p className="institutional-disclaimer">
            GeoLens is an experimental research system. It is not an
            operational flood forecast or hydraulic sewer simulation.
          </p>
        </div>

        <aside className="institutional-status" aria-labelledby="status-title">
          <div className="institutional-status-heading">
            <p id="status-title">Programme status</p>
            <span>Public overview</span>
          </div>
          <dl>
            {programmeStatus.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="institutional-principle">
            <strong>Missing is not zero.</strong>
            <p>
              Unavailable evidence remains unavailable; it cannot silently
              become a valid measurement.
            </p>
          </div>
        </aside>
      </section>

      <section className="institutional-chain" aria-label="GeoLens evidence chain">
        <div>
          <span>01</span>
          <p>Environmental observations</p>
        </div>
        <i aria-hidden="true" />
        <div>
          <span>02</span>
          <p>Spatial evidence bundle</p>
        </div>
        <i aria-hidden="true" />
        <div>
          <span>03</span>
          <p>Derived physical state</p>
        </div>
        <i aria-hidden="true" />
        <div>
          <span>04</span>
          <p>Inspectable provenance</p>
        </div>
      </section>

      <section className="home-mission page-section">
        <div className="section-heading-row">
          <div>
            <p className="site-overline">Purpose</p>
            <h2>Evidence is the product boundary.</h2>
          </div>
          <p>
            GeoLens is being rebuilt around one coherent responsibility: to
            preserve the connection between environmental evidence and every
            physical quantity derived from it.
          </p>
        </div>
        <div className="home-principle-grid">
          <article>
            <span>01</span>
            <h3>Real evidence before interpretation</h3>
            <p>Provider, dataset, time, resolution and acquisition state precede every derived result.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Physical quantities before scores</h3>
            <p>Rainfall, elevation, slope, runoff and downstream accumulation remain directly inspectable.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Uncertainty remains operational</h3>
            <p>Missing inputs, ambiguous direction and incomplete windows can block the chain by design.</p>
          </article>
        </div>
      </section>

      <section className="home-platform-band">
        <div>
          <p className="site-overline">Platform scope</p>
          <h2>One accountable chain from observation to downstream state.</h2>
          <p>
            The active system combines a canonical evidence contract, real
            environmental providers, deterministic runoff, typed catchments,
            stormwater topology and an inspection API.
          </p>
          <Link className="site-secondary-action" href="/platform">Platform architecture</Link>
        </div>
        <ol>
          <li><span>01</span><strong>Acquire</strong><p>Real provider evidence with explicit failure states.</p></li>
          <li><span>02</span><strong>Normalize</strong><p>H3 connective tissue with native resolution retained.</p></li>
          <li><span>03</span><strong>Derive</strong><p>Deterministic, inspectable physical quantities.</p></li>
          <li><span>04</span><strong>Route</strong><p>Validated topology and explicit direction uncertainty.</p></li>
          <li><span>05</span><strong>Explain</strong><p>Result, provenance and missing state together.</p></li>
        </ol>
      </section>

      <section className="home-cases page-section">
        <div className="section-heading-row">
          <div>
            <p className="site-overline">Research programme</p>
            <h2>Complementary proofs, not repeated demonstrations.</h2>
          </div>
          <p>
            Each case tests a different boundary: complete transformation,
            observed infrastructure and independent historical comparison.
          </p>
        </div>
        <div className="research-case-grid">
          {researchCaseList.map((researchCase) => (
            <CaseCard researchCase={researchCase} key={researchCase.slug} />
          ))}
        </div>
        <div className="section-action-row">
          <Link className="site-primary-action" href="/cases">Review all case records</Link>
          <Link className="site-secondary-action" href="/method">Read the verification method</Link>
        </div>
      </section>

      <section className="home-public-commitment">
        <div>
          <p className="site-overline">Public commitment</p>
          <h2>Negative results remain results.</h2>
        </div>
        <p>
          GeoLens does not hide failed hypotheses, repair missing evidence with
          synthetic values or upgrade an experimental proxy into a validated
          scientific claim. The Emilia-Romagna baseline and Amsterdam attachment
          boundary remain visible for precisely this reason.
        </p>
      </section>
    </main>
  );
}
