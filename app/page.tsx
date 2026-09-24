import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Blocks,
  Building2,
  Check,
  LampFloor,
  Layers3,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { BeforeAfter } from "@/components/before-after";
import { BRAND } from "@/lib/constants";

const capabilities = [
  { icon: Blocks, title: "Room redesign", text: "Transform an existing room while preserving its structure, perspective, and spatial character." },
  { icon: Building2, title: "Exterior redesign", text: "Rework façades, gardens, driveways, patios, and outdoor areas with grounded visual direction." },
  { icon: LampFloor, title: "Interior design", text: "Explore furniture, materials, lighting, colors, and layouts in the context of your real space." },
  { icon: Layers3, title: "Renovation planning", text: "Turn a visual idea into an ordered, detailed plan with constraints and practical considerations." },
  { icon: Search, title: "Product discovery", text: "Build vendor-neutral product and material searches that genuinely fit the proposed design." },
  { icon: BadgeDollarSign, title: "Budget planning", text: "Organize estimate ranges, finish levels, labour choices, and contingency without false precision." },
];

export default function HomePage() {
  return (
    <main>
      <SiteHeader />
      <section className="hero section-wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Renovation, made visible</div>
          <h1>Reimagine<br />your <em>space.</em></h1>
          <p>Upload a photo, describe your dream renovation, and turn your existing space into a realistic new design.</p>
          <div className="hero-actions">
            <Link href="/projects/new" className="button button-primary button-lg">Start redesigning <ArrowRight size={18} /></Link>
            <Link href="/dashboard" className="button button-secondary button-lg">Explore projects</Link>
          </div>
          <div className="hero-proof">
            <span><Check size={15} /> Real visual analysis</span>
            <span><Check size={15} /> Structure-aware editing</span>
            <span><Check size={15} /> Private projects</span>
          </div>
        </div>
        <div className="hero-visual">
          <BeforeAfter before="/images/hero-before.jpg" after="/images/hero-after.jpg" />
          <div className="hero-visual-caption">
            <div><span className="pulse-dot" /> Renovation study 01</div>
            <p>Warm contemporary · pale oak · soft limestone</p>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="section-wrap trust-inner">
          <p>One photograph. A considered plan. A space that still feels like yours.</p>
          <div className="trust-metrics">
            <span><strong>01</strong> Analyze</span><i />
            <span><strong>02</strong> Plan</span><i />
            <span><strong>03</strong> Visualize</span><i />
            <span><strong>04</strong> Refine</span>
          </div>
        </div>
      </section>

      <section className="capabilities section-wrap" id="capabilities">
        <div className="section-heading split-heading">
          <div><span className="kicker">What you can shape</span><h2>From first thought<br />to finished direction.</h2></div>
          <p>Hearthform brings visual intelligence, design reasoning, and project planning into one calm, focused renovation workspace.</p>
        </div>
        <div className="capability-grid">
          {capabilities.map((item, index) => (
            <article className="capability-card" key={item.title}>
              <span className="card-number">0{index + 1}</span>
              <item.icon size={24} strokeWidth={1.5} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="card-rule" />
            </article>
          ))}
        </div>
      </section>

      <section className="process-section" id="process">
        <div className="section-wrap process-grid">
          <div className="process-image-wrap">
            <img src="/images/hero-after.jpg" alt="Warm contemporary living room redesign" />
            <span className="process-note"><Sparkles size={17} /> Same architecture, new expression</span>
          </div>
          <div className="process-copy">
            <span className="kicker">A grounded workflow</span>
            <h2>Design with the space,<br />not around it.</h2>
            <p className="lead">Hearthform reads what is already there before proposing what comes next.</p>
            <ol className="process-list">
              <li><span><Upload size={18} /></span><div><strong>Upload the real space</strong><p>Add one primary photo and optional references for materials, furniture, or atmosphere.</p></div></li>
              <li><span><Blocks size={18} /></span><div><strong>Understand its constraints</strong><p>Review visible architecture, existing elements, opportunities, and uncertainty.</p></div></li>
              <li><span><Layers3 size={18} /></span><div><strong>Build the renovation plan</strong><p>Shape palette, materials, lighting, layout, phases, products, and budget.</p></div></li>
              <li><span><Sparkles size={18} /></span><div><strong>Generate and refine</strong><p>Compare before and after, then edit the current design without restarting.</p></div></li>
            </ol>
            <Link href="/projects/new" className="text-link">Begin a project <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="cta-section section-wrap">
        <div className="cta-panel">
          <span className="kicker">{BRAND.name}</span>
          <h2>Your next renovation<br />starts with one photograph.</h2>
          <p>{BRAND.tagline}</p>
          <Link href="/projects/new" className="button button-light button-lg">Create your first project <ArrowRight size={18} /></Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="section-wrap footer-inner">
          <div><strong>HEARTHFORM</strong><p>{BRAND.tagline}</p></div>
          <p>Visual renovation intelligence for real spaces.</p>
          <span>© {new Date().getFullYear()} Hearthform</span>
        </div>
      </footer>
    </main>
  );
}
