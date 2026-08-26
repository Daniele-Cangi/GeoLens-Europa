import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Proof 0 Evidence Inspector',
  description:
    'Inspect the bounded GeoLens evidence-to-runoff-to-network transformation chain.',
};

export default function ProofZeroLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
