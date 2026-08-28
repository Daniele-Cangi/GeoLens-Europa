import type { Metadata } from 'next';

import CaseDetail from '../../../_components/CaseDetail';
import EmiliaBenchmarkInspector from '../../../_components/EmiliaBenchmarkInspector';
import { researchCases } from '../../../_data/cases';

export const metadata: Metadata = {
  title: 'Case 02 — Emilia-Romagna 2023',
  description: researchCases.emilia.summary,
};

export default function EmiliaRomagnaCasePage() {
  return (
    <CaseDetail researchCase={researchCases.emilia}>
      <EmiliaBenchmarkInspector />
    </CaseDetail>
  );
}
