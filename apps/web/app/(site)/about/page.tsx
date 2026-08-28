import type { Metadata } from 'next';
import Link from 'next/link';

import PageIntro from '../../_components/PageIntro';

export const metadata: Metadata = {
  title: 'About',
  description: 'The GeoLens mission, refoundation scope and current programme status.',
};

export default function AboutPage() {
  return (
    <main>
      <PageIntro
        section="About"
        title="GeoLens is being refounded around evidence, not features."
        lede="The project preserves valuable spatial, provider and stormwater work while replacing the historical multi-product framing with one physically meaningful system."
        status="Experimental open-source research system"
      />

      <section className="page-section about-mission">
        <div className="section-heading-row">
          <div><p className="site-overline">Mission</p><h2>Build the smallest provenance-complete system that can be challenged by reality.</h2></div>
          <p>GeoLens is not a cleanup of the historical repository and is not trying to finish every legacy feature.</p>
        </div>
        <blockquote>
          GeoLens is a spatial evidence engine that composes real environmental
          observations, terrain and infrastructure into traceable derived
          physical state.
        </blockquote>
      </section>

      <section className="about-scope-band">
        <div>
          <p className="site-overline">Active scope</p>
          <h2>Evidence, hydrology and stormwater networks</h2>
          <ul>
            <li>Canonical evidence and provider failure semantics</li>
            <li>Real IMERG, terrain and land-cover paths</li>
            <li>Inspectable deterministic runoff</li>
            <li>Typed catchments, topology and direction state</li>
            <li>Bounded API and visual evidence inspector</li>
          </ul>
        </div>
        <div>
          <p className="site-overline">Parked scope</p>
          <h2>Outside the active runtime</h2>
          <ul>
            <li>AI analysis, chat, RAG and generated confidence</li>
            <li>Mineral prospectivity</li>
            <li>Generic multi-hazard scoring</li>
            <li>Elaborate 3D and continent-scale optimization</li>
            <li>Accounts, billing and collaboration features</li>
          </ul>
        </div>
      </section>

      <section className="page-section about-governance">
        <div className="section-heading-row">
          <div><p className="site-overline">Programme record</p><h2>Repository truth is ordered and reviewable</h2></div>
          <p>Current behavior and tests take precedence over legacy completion claims. Historical work remains preserved in the canonical snapshot.</p>
        </div>
        <ol>
          <li><span>01</span><strong>Operating contract</strong><p>AGENTS.md defines mission, principles and execution boundaries.</p></li>
          <li><span>02</span><strong>Refoundation plan</strong><p>Material phase state and evidence gates are maintained in one plan.</p></li>
          <li><span>03</span><strong>Verified behavior</strong><p>Runtime behavior and intended tests outrank old documentation.</p></li>
          <li><span>04</span><strong>Historical snapshot</strong><p>The pre-overhaul repository remains recoverable without constraining the new architecture.</p></li>
        </ol>
      </section>

      <section className="about-repository">
        <div><p className="site-overline">Open source</p><h2>Inspect the implementation and evidence gates.</h2></div>
        <p>The source repository contains the active architecture, tests, benchmark manifest and refoundation plan. Large research artifacts remain outside Git and are verified against the manifest.</p>
        <a className="site-primary-action" href="https://github.com/Daniele-Cangi/GeoLens-Europa">Open source repository</a>
        <Link className="site-secondary-action" href="/proof-zero">Open Proof 0 inspector</Link>
      </section>
    </main>
  );
}
