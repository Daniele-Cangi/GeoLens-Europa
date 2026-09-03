import type { Metadata } from 'next';
import Link from 'next/link';

import PageIntro from '../../_components/PageIntro';
import {
  programmeRecords,
  programmeUpdatedAt,
} from '../../_data/programme';

export const metadata: Metadata = {
  title: 'Research Programme',
  description:
    'The public GeoLens record of verified results, open evidence gates and the next validation territory.',
};

const territoryCriteria = [
  ['Event evidence', 'A bounded historical event with a declared observation window and usable rainfall record.'],
  ['Physical inputs', 'Terrain, land cover, hydrography and material barriers available as machine-readable data.'],
  ['Independent truth', 'Observed extent, levels or infrastructure evidence kept outside model input until evaluation.'],
  ['Access', 'Stable public download or service access without depending on an unanswered institutional request.'],
  ['Licensing', 'Terms that permit reproducible research, derived artifacts and a public technical record.'],
  ['Scientific fit', 'A case that tests a missing capability instead of repeating a result already established.'],
] as const;

export default function ProgrammePage() {
  const verifiedCount = programmeRecords.filter(
    (record) => record.statusTone === 'verified',
  ).length;
  const evidenceGateCount = programmeRecords.filter(
    (record) => record.statusTone === 'evidence-gate',
  ).length;

  return (
    <main>
      <PageIntro
        section="Research programme"
        title="What is proven, what is blocked and what comes next."
        lede="GeoLens publishes its evidence boundaries as part of the product. A blocked inference and a negative benchmark remain visible results—not failures to hide."
        status={`Public programme record · updated ${programmeUpdatedAt}`}
      />

      <section className="programme-summary" aria-label="Programme summary">
        <div>
          <span>Cases on record</span>
          <strong>{programmeRecords.length}</strong>
          <p>Bounded research questions with distinct validation roles.</p>
        </div>
        <div>
          <span>Verified baseline</span>
          <strong>{verifiedCount}</strong>
          <p>A complete traceable transformation chain.</p>
        </div>
        <div>
          <span>Open evidence gates</span>
          <strong>{evidenceGateCount}</strong>
          <p>External evidence required; software work can continue.</p>
        </div>
        <div>
          <span>Next expansion</span>
          <strong>01</strong>
          <p>A territory selected for complete public-data access.</p>
        </div>
      </section>

      <section className="page-section programme-register-section">
        <div className="section-heading-row">
          <div>
            <p className="site-overline">Public status register</p>
            <h2>Every case has an evidence boundary.</h2>
          </div>
          <p>
            Status describes what the available evidence permits GeoLens to
            assert today. It is not a roadmap-completion percentage.
          </p>
        </div>

        <div className="programme-register">
          {programmeRecords.map((record) => (
            <article key={record.code}>
              <div className="programme-register-heading">
                <span>{record.code}</span>
                <span data-tone={record.statusTone}>{record.status}</span>
              </div>
              <p>{record.place}</p>
              <h3>{record.title}</h3>
              <dl>
                <div>
                  <dt>Established</dt>
                  <dd>{record.established}</dd>
                </div>
                <div>
                  <dt>Evidence boundary</dt>
                  <dd>{record.openGate}</dd>
                </div>
                <div>
                  <dt>Next decision</dt>
                  <dd>{record.nextDecision}</dd>
                </div>
              </dl>
              {record.href ? (
                <Link href={record.href}>Open the case record</Link>
              ) : (
                <span className="programme-record-pending">
                  Territory not yet selected
                </span>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="programme-selection">
        <div className="programme-selection-intro">
          <p className="site-overline">Case 03 evidence policy</p>
          <h2>Data access is a scientific requirement.</h2>
          <p>
            Cumbria was selected for the evidence it can support, not for name
            recognition. Source qualification remains separate from model
            adaptation and from the sealed evaluation references.
          </p>
        </div>
        <ol>
          {territoryCriteria.map(([title, description], index) => (
            <li key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="programme-next-step">
        <div>
          <p className="site-overline">Parallel work</p>
          <h2>The programme is waiting for evidence, not standing still.</h2>
        </div>
        <p>
          Amsterdam and Emilia-Romagna remain open evidence gates. In parallel,
          GeoLens is advancing the Cumbria public-only baseline while awaiting
          optional owner evidence. No open case is allowed to convert an absent
          dataset into a valid-looking result.
        </p>
        <div className="site-actions">
          <Link className="site-primary-action" href="/cases">
            Review current cases
          </Link>
          <Link className="site-secondary-action" href="/method">
            Read the verification method
          </Link>
        </div>
      </section>
    </main>
  );
}
