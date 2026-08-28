import type { Metadata } from 'next';

import CaseDetail from '../../../_components/CaseDetail';
import { researchCases } from '../../../_data/cases';

export const metadata: Metadata = {
  title: 'Case 00 — Trento Proof 0',
  description: researchCases.trento.summary,
};

export default function TrentoCasePage() {
  return <CaseDetail researchCase={researchCases.trento} />;
}
