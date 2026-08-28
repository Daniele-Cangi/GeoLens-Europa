import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const deploymentOrigin =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(deploymentOrigin),
  title: {
    default: 'GeoLens — Environmental Evidence Infrastructure',
    template: '%s · GeoLens',
  },
  description:
    'GeoLens composes real environmental observations, terrain and infrastructure into traceable derived physical state.',
  applicationName: 'GeoLens',
  keywords: [
    'spatial evidence',
    'environmental observations',
    'stormwater',
    'hydrology',
    'provenance',
  ],
  openGraph: {
    title: 'GeoLens — Environmental Evidence Infrastructure',
    description:
      'Real observations become inspectable physical state, with provenance and uncertainty intact.',
    type: 'website',
    siteName: 'GeoLens',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GeoLens — Environmental Evidence Infrastructure',
    description:
      'Real observations become inspectable physical state, with provenance and uncertainty intact.',
  },
};

export const viewport: Viewport = {
  themeColor: '#102a43',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
