import Link from 'next/link';

import SiteFooter from './_components/SiteFooter';
import SiteHeader from './_components/SiteHeader';
import './site.css';

export default function NotFound() {
  return (
    <div className="site-frame">
      <SiteHeader />
      <main className="not-found-page">
        <p className="site-overline">404 · Page not found</p>
        <h1>The requested record is not available.</h1>
        <p>
          Return to the programme overview or review the current research cases.
        </p>
        <div className="site-actions">
          <Link className="site-primary-action" href="/">GeoLens home</Link>
          <Link className="site-secondary-action" href="/cases">Research cases</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
