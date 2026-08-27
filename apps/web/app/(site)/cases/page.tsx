import type { Metadata } from 'next';

import CaseCard from '../../_components/CaseCard';
import PageIntro from '../../_components/PageIntro';
import { researchCaseList } from '../../_data/cases';

export const metadata: Metadata = {
  title: 'Research Cases',
  description: 'The bounded GeoLens proof and benchmark programme.',
};

export default function CasesPage() {
  return (
    <main>
      <PageIntro
        section="Research cases"
        title="Three cases. Three different evidence boundaries."
        lede="The GeoLens programme separates a complete transformation proof, an observed urban-infrastructure proof and an independently evaluated historical replay."
      />
      <section className="page-section cases-overview">
        <div className="section-heading-row">
          <div><p className="site-overline">Programme design</p><h2>Complementary validation questions</h2></div>
          <p>No single location can establish every part of the system. Each case is bounded to the question its evidence can answer.</p>
        </div>
        <div className="case-comparison">
          <div><span>Case 00</span><strong>Completeness</strong><p>Can the full evidence-to-network chain close?</p></div>
          <div><span>Case 01</span><strong>Infrastructure truth</strong><p>Can the system stop before inventing attachment?</p></div>
          <div><span>Case 02</span><strong>Independent reality</strong><p>Does a frozen hypothesis agree with observed extent?</p></div>
        </div>
      </section>
      <section className="cases-record-section">
        <div className="research-case-grid">
          {researchCaseList.map((researchCase) => (
            <CaseCard researchCase={researchCase} key={researchCase.slug} />
          ))}
        </div>
      </section>
      <section className="case-programme-notice">
        <h2>Research status</h2>
        <p>Case records describe verified repository behavior and known evidence boundaries. “Complete” applies only to the stated bounded proof; it is not a production-readiness claim.</p>
      </section>
    </main>
  );
}
