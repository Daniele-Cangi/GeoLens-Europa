import Link from 'next/link';
import type { ReactNode } from 'react';

import type { ResearchCase } from '../_data/cases';
import PageIntro from './PageIntro';

export default function CaseDetail({
  researchCase,
  children,
}: {
  readonly researchCase: ResearchCase;
  readonly children?: ReactNode;
}) {
  return (
    <main>
      <PageIntro
        section={`${researchCase.code} · ${researchCase.programme}`}
        title={researchCase.title}
        lede={researchCase.summary}
        status={researchCase.status}
      />

      <section className="case-question page-section">
        <div className="section-heading-compact">
          <p className="site-overline">Research question</p>
          <h2>{researchCase.question}</h2>
        </div>
        <dl className="case-register">
          <div><dt>Location</dt><dd>{researchCase.place}</dd></div>
          <div><dt>Programme</dt><dd>{researchCase.programme}</dd></div>
          <div><dt>Reference</dt><dd>{researchCase.period}</dd></div>
          <div><dt>Record status</dt><dd>{researchCase.status}</dd></div>
        </dl>
      </section>

      <section className="page-section case-evidence-section">
        <div className="section-heading-row">
          <div>
            <p className="site-overline">Evidence register</p>
            <h2>Inputs and operational role</h2>
          </div>
          <p>
            Source evidence and fixtures remain structurally distinguishable.
            H3 representation does not replace native source resolution.
          </p>
        </div>
        <div className="evidence-register">
          <div className="evidence-register-header">
            <span>Source</span><span>Role</span><span>Evidence state</span>
          </div>
          {researchCase.evidence.map((item) => (
            <div className="evidence-register-row" key={item.source}>
              <strong>{item.source}</strong>
              <p>{item.role}</p>
              <span>{item.state}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="case-result-band">
        <div className="case-result-heading">
          <p className="site-overline">Recorded result</p>
          <h2>{researchCase.resultTitle}</h2>
          <p>{researchCase.result}</p>
        </div>
        <dl className="case-metric-grid">
          {researchCase.metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              <span>{metric.note}</span>
            </div>
          ))}
        </dl>
      </section>

      {children}

      <section className="page-section case-boundaries">
        <div>
          <p className="site-overline">Interpretation boundary</p>
          <h2>What this case does not establish</h2>
          <ul>
            {researchCase.boundaries.map((boundary) => (
              <li key={boundary}>{boundary}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="site-overline">Next evidence gate</p>
          <h2>Required progression</h2>
          <ol>
            {researchCase.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <nav className="case-navigation" aria-label="Research case navigation">
        <Link href="/cases">← All research cases</Link>
        {researchCase.slug === 'trento' ? (
          <Link href="/proof-zero">Open the Proof 0 inspector →</Link>
        ) : (
          <Link href="/method">Review the verification method →</Link>
        )}
      </nav>
    </main>
  );
}
