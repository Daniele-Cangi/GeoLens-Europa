import type { Metadata } from 'next';

import CaseDetail from '../../../_components/CaseDetail';
import { researchCases } from '../../../_data/cases';

export const metadata: Metadata = {
  title: 'Case 01 — Amsterdam',
  description: researchCases.amsterdam.summary,
};

export default function AmsterdamCasePage() {
  return <CaseDetail researchCase={researchCases.amsterdam} />;
}
