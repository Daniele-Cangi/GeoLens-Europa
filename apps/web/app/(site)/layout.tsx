import type { ReactNode } from 'react';

import SiteFooter from '../_components/SiteFooter';
import SiteHeader from '../_components/SiteHeader';
import '../site.css';

export default function InstitutionalSiteLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="site-frame">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
