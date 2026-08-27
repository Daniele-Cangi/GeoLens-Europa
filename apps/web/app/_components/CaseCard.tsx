import Link from 'next/link';

import type { ResearchCase } from '../_data/cases';

export default function CaseCard({
  researchCase,
}: {
  readonly researchCase: ResearchCase;
}) {
  return (
    <article className="research-case-card">
      <div className="research-case-card-meta">
        <span>{researchCase.code}</span>
        <span data-tone={researchCase.statusTone}>
          {researchCase.status}
        </span>
      </div>
      <p>{researchCase.place}</p>
      <h3>{researchCase.title}</h3>
      <p>{researchCase.summary}</p>
      <dl>
        {researchCase.metrics.slice(0, 2).map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/cases/${researchCase.slug}`}>
        Read case record
      </Link>
    </article>
  );
}
