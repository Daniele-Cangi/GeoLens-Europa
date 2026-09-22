import type { Metadata } from 'next';
import Link from 'next/link';

import PageIntro from '../../_components/PageIntro';
import {
  programmeObjectives,
  programmeRecords,
  programmeUpdatedAt,
  programmeWorkstreams,
} from '../../_data/programme';

export const metadata: Metadata = {
  title: 'Research Programme',
  description:
    'The public GeoLens record of verified results, open evidence gates and the next validation territory.',
};

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
          <span>Active workstreams</span>
          <strong>{programmeWorkstreams.length}</strong>
          <p>Review, public communication and evidence controls.</p>
        </div>
      </section>

      <section className="programme-work page-section">
        <div className="section-heading-row">
          <div>
            <p className="site-overline">Work in progress</p>
            <h2>Focused work, with expansion deliberately paused.</h2>
          </div>
          <p>
            The programme is not adding new territories or major physical
            models. Current work qualifies external evidence, strengthens the
            public product and preserves the frozen experimental record.
          </p>
        </div>
        <div className="programme-work-grid">
          {programmeWorkstreams.map((workstream) => (
            <article key={workstream.code}>
              <div>
                <span>{workstream.code}</span>
                <strong>{workstream.status}</strong>
              </div>
              <h3>{workstream.title}</h3>
              <p>{workstream.description}</p>
              <dl>
                <dt>Expected outcome</dt>
                <dd>{workstream.outcome}</dd>
              </dl>
            </article>
          ))}
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

      <section className="programme-selection programme-objectives">
        <div className="programme-selection-intro">
          <p className="site-overline">Programme objectives</p>
          <h2>Progress means stronger claims, not more features.</h2>
          <p>
            The immediate objective is to determine what the received owner
            evidence legitimately permits GeoLens to test while keeping the
            original architecture and negative result independently visible.
          </p>
        </div>
        <ol>
          {programmeObjectives.map((objective) => (
            <li key={objective.code}>
              <span>{objective.code}</span>
              <div>
                <strong>{objective.title}</strong>
                <p>{objective.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="programme-next-step">
        <div>
          <p className="site-overline">Current decision boundary</p>
          <h2>Receipt is established. Scientific usability is not.</h2>
        </div>
        <p>
          The 46.7 GB Environment Agency package is content-addressed and safely
          registered outside Git. Its model files, surveys and reports remain
          under controlled review. Until lineage, licence, units, datum and
          model identity pass, they cannot alter the Carlisle replay.
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
