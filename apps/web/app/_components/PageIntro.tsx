import Link from 'next/link';

interface PageIntroProps {
  readonly section: string;
  readonly title: string;
  readonly lede: string;
  readonly status?: string;
}

export default function PageIntro({
  section,
  title,
  lede,
  status,
}: PageIntroProps) {
  return (
    <section className="page-intro">
      <div className="page-breadcrumb">
        <Link href="/">GeoLens</Link>
        <span aria-hidden="true">/</span>
        <p>{section}</p>
      </div>
      <div className="page-intro-grid">
        <p className="site-overline">{section}</p>
        <div>
          <h1>{title}</h1>
          <p>{lede}</p>
          {status ? <span className="page-status">{status}</span> : null}
        </div>
      </div>
    </section>
  );
}
