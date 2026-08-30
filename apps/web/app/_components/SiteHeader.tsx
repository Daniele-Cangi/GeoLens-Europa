import Link from 'next/link';

const navigation = [
  { href: '/programme', label: 'Programme' },
  { href: '/platform', label: 'Platform' },
  { href: '/method', label: 'Method' },
  { href: '/cases', label: 'Cases' },
  { href: '/about', label: 'About' },
] as const;

export default function SiteHeader() {
  return (
    <>
      <div className="site-utility-bar">
        <div>
          <span>GeoLens Research Programme</span>
          <span>Environmental evidence infrastructure</span>
        </div>
        <p>Experimental system · Refoundation 2026</p>
      </div>
      <header className="site-header">
        <Link className="site-wordmark" href="/" aria-label="GeoLens home">
          <span className="site-wordmark-mark" aria-hidden="true">GL</span>
          <span>
            <strong>GeoLens</strong>
            <small>Spatial Evidence Engine</small>
          </span>
        </Link>

        <nav className="site-navigation" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
          <Link className="site-navigation-action" href="/proof-zero">
            Open inspector
          </Link>
        </nav>

        <details className="site-mobile-navigation">
          <summary>Menu</summary>
          <div>
            {navigation.map((item) => (
              <Link href={item.href} key={item.href}>{item.label}</Link>
            ))}
            <Link href="/proof-zero">Open inspector</Link>
          </div>
        </details>
      </header>
    </>
  );
}
