import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import CaseCard from '../_components/CaseCard';
import { researchCaseList } from '../_data/cases';
import { programmeRecords, programmeUpdatedAt } from '../_data/programme';

export const metadata: Metadata = {
  title: 'GeoLens — Environmental Evidence Infrastructure',
  description:
    'GeoLens composes real environmental observations, terrain and infrastructure into traceable derived physical state.',
};

const programmeStatus = [
  ['Verified baseline', 'Case 00 · complete chain'],
  ['Open evidence gates', '2 · externally dependent'],
  ['Next expansion', 'Public-data territory'],
  ['Core dependency', 'No AI service required'],
] as const;

export default function HomePage() {
  return (
    <main>
      <section className="institutional-hero">
        <div className="institutional-hero-media" aria-hidden="true">
          <Image
            src="/images/geolens-evidence-landscape.png"
            alt=""
            fill
            priority
            sizes="100vw"
          />
        </div>
        <div className="institutional-hero-copy">
          <p className="site-overline">Environmental evidence infrastructure</p>
          <h1>Environmental evidence that can be traced, tested and challenged.</h1>
          <p className="institutional-hero-lede">
            GeoLens is an open research programme connecting rainfall, terrain,
            land cover and infrastructure. It derives inspectable physical
            quantities while preserving where every value came from—and where
            evidence is still missing.
          </p>
          <div className="site-actions">
            <Link className="site-primary-action" href="/programme">
              View programme status
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
            <span>Updated {programmeUpdatedAt}</span>
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

      <section className="home-plain-language page-section">
        <div className="section-heading-row">
          <div>
            <p className="site-overline">GeoLens in plain language</p>
            <h2>It shows not only the result, but why the result exists.</h2>
          </div>
          <p>
            A map can look authoritative while hiding weak inputs. GeoLens keeps
            the observation, physical transformation and evidence limit together
            so that specialists can audit the chain and non-specialists can
            understand the claim.
          </p>
        </div>
        <div className="home-question-grid">
          <article>
            <span>Input</span>
            <h3>What was actually observed?</h3>
            <p>Dataset, provider, time, resolution and acquisition state remain attached to the value.</p>
          </article>
          <article>
            <span>Transformation</span>
            <h3>How did it become a physical quantity?</h3>
            <p>Model inputs, intermediate quantities and versions remain directly inspectable.</p>
          </article>
          <article>
            <span>Boundary</span>
            <h3>What can the evidence not prove?</h3>
            <p>Missing data, uncertain direction and blocked inference are shown instead of silently repaired.</p>
          </article>
        </div>
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

      <section className="home-programme-status">
        <div className="home-programme-heading">
          <div>
            <p className="site-overline">Live research boundary</p>
            <h2>A public record of progress and constraint.</h2>
          </div>
          <div>
            <p>Updated {programmeUpdatedAt}</p>
            <Link href="/programme">Open full programme register</Link>
          </div>
        </div>
        <div className="home-programme-records">
          {programmeRecords.map((record) => (
            <article key={record.code}>
              <span>{record.code}</span>
              <div>
                <p>{record.place}</p>
                <h3>{record.title}</h3>
              </div>
              <strong data-tone={record.statusTone}>{record.status}</strong>
              {record.href ? (
                <Link href={record.href} aria-label={`Open ${record.code}`}>
                  View
                </Link>
              ) : (
                <span>Pending selection</span>
              )}
            </article>
          ))}
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
