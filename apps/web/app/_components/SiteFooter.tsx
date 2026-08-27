import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-primary">
        <Link className="site-wordmark site-footer-wordmark" href="/">
          <span className="site-wordmark-mark" aria-hidden="true">GL</span>
          <span>
            <strong>GeoLens</strong>
            <small>Spatial Evidence Engine</small>
          </span>
        </Link>
        <p>
          A research system for composing environmental observations, terrain
          and infrastructure into traceable derived physical state.
        </p>
      </div>
      <div className="site-footer-links">
        <div>
          <h2>Programme</h2>
          <Link href="/platform">Platform</Link>
          <Link href="/method">Method</Link>
          <Link href="/cases">Research cases</Link>
        </div>
        <div>
          <h2>Resources</h2>
          <Link href="/proof-zero">Proof 0 inspector</Link>
          <a href="https://github.com/Daniele-Cangi/GeoLens-Europa">
            Source repository
          </a>
          <Link href="/about">Project status</Link>
        </div>
      </div>
      <div className="site-footer-notice">
        <p>
          GeoLens is experimental. It does not currently provide operational
          flood forecasts, hydraulic simulation or generic risk scores.
        </p>
        <span>Evidence before interpretation.</span>
      </div>
    </footer>
  );
}
