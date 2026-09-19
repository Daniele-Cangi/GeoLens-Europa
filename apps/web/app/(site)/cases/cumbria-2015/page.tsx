import type { Metadata } from 'next';
import Image from 'next/image';

import CaseDetail from '../../../_components/CaseDetail';
import CumbriaBenchmarkInspector from '../../../_components/CumbriaBenchmarkInspector';
import { researchCases } from '../../../_data/cases';

export const metadata: Metadata = {
  title: 'Case 03 — Cumbria 2015',
  description: researchCases.cumbria.summary,
};

export default function CumbriaCasePage() {
  return (
    <CaseDetail researchCase={researchCases.cumbria}>
      <section className="page-section cumbria-diagnostic">
        <div className="section-heading-row">
          <div>
            <p className="site-overline">Frozen diagnostic</p>
            <h2>Where the public-only model disagreed with observed flooding</h2>
          </div>
          <p>
            Orange cells are false positives, blue cells are false negatives,
            teal cells agree and dark grey remains outside the evaluation
            domain—not observed dry ground.
          </p>
        </div>
        <figure>
          <Image
            src="/images/cumbria-blind-evaluation.png"
            alt="Three-panel comparison of the frozen Cumbria prediction against Environment Agency and Copernicus flood references"
            width={1344}
            height={540}
            sizes="(max-width: 900px) 100vw, 1200px"
          />
          <figcaption>
            Publication image SHA-256 4d374162…10fc82. It is derived only
            from frozen masks and performs no new evaluation.
          </figcaption>
        </figure>
      </section>
      <CumbriaBenchmarkInspector />
    </CaseDetail>
  );
}
