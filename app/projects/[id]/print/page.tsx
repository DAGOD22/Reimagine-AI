import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { serializeProject } from "@/lib/server/projects";
import { ApiError } from "@/lib/server/errors";
import { Logo } from "@/components/logo";
import { PrintActions } from "@/components/print-actions";
import { formatMoney, titleCase } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectPrintPage({ params }: Props) {
  const user = await getCurrentUser();
  const id = (await params).id;
  if (!user) redirect(`/sign-in?next=/projects/${id}/print`);
  let project;
  try { project = serializeProject(id, user.id); } catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }
  const original = project.images.filter((image) => image.kind === "original").at(-1);
  const final = project.versions.at(-1);
  return (
    <main className="print-page">
      <div className="print-actions no-print"><Logo /><PrintActions projectId={project.id} /></div>
      <article className="print-document">
        <header className="print-cover"><div><span>HEARTHFORM / PROJECT SUMMARY</span><h1>{project.name}</h1><p>{titleCase(project.roomType)} · Updated {new Date(project.updatedAt).toLocaleDateString()}</p></div><strong>See your space differently.</strong></header>
        {(original || final) && <section className="print-images">{original && <figure><img src={original.url} alt="Original space" /><figcaption>Original space</figcaption></figure>}{final && <figure><img src={final.imageUrl} alt="Final design" /><figcaption>Latest design · Version {final.number}</figcaption></figure>}</section>}
        <section className="print-intro"><span>Design direction</span><p>{project.instructions || "No written renovation direction saved."}</p></section>
        {project.analysis && <section className="print-section"><span className="print-number">01</span><div><h2>Space analysis</h2><p className="print-lead">{project.analysis.currentSpace.summary}</p><PrintList title="Architecture" items={project.analysis.architecture} /><PrintList title="Opportunities" items={project.analysis.opportunities} /><PrintList title="Constraints & preservation" items={[...project.analysis.constraints, ...project.analysis.preserve]} /></div></section>}
        {project.plan && <><section className="print-section"><span className="print-number">02</span><div><h2>{project.plan.designConcept}</h2><p className="print-lead">{project.plan.style.join(" · ")}</p><div className="print-palette">{project.plan.colorPalette.map((color) => <div key={color.hex}><i style={{ background: color.hex }} /><strong>{color.name}</strong><span>{color.hex}</span><p>{color.usage}</p></div>)}</div><h3>Materials</h3><div className="print-materials">{project.plan.materials.map((material) => <div key={`${material.material}-${material.application}`}><strong>{material.material}</strong><span>{material.application}</span><p>{material.rationale}</p></div>)}</div><PrintList title="Layout recommendations" items={project.plan.layoutRecommendations} /><PrintList title="Lighting" items={project.plan.lighting} /></div></section><section className="print-section"><span className="print-number">03</span><div><h2>Renovation sequence</h2><ol className="print-steps">{project.plan.renovationSteps.sort((a,b) => a.order-b.order).map((step) => <li key={`${step.order}-${step.title}`}><span>{String(step.order).padStart(2,"0")}</span><div><strong>{step.title}</strong><p>{step.detail}</p>{step.trade && <small>{step.trade}</small>}</div></li>)}</ol><PrintList title="Potential issues" items={project.plan.potentialIssues} /><PrintList title="Assumptions" items={project.plan.assumptions} /></div></section></>}
        {project.budget && <section className="print-section"><span className="print-number">04</span><div><h2>Budget estimate</h2><p className="print-budget-total">{formatMoney(project.budget.estimatedLow, project.budget.currency)} – {formatMoney(project.budget.estimatedHigh, project.budget.currency)}</p><p className="print-lead">Includes {project.budget.contingencyPercent}% contingency. Estimate only.</p><table><thead><tr><th>Category</th><th>Range</th><th>Assumption</th></tr></thead><tbody>{project.budget.categories.map((category) => <tr key={category.name}><td>{category.name}</td><td>{formatMoney(category.low, project.budget!.currency)} – {formatMoney(category.high, project.budget!.currency)}</td><td>{category.notes}</td></tr>)}</tbody></table><p className="print-disclaimer">{project.budget.disclaimer}</p></div></section>}
        {project.notes && <section className="print-section"><span className="print-number">05</span><div><h2>Project notes</h2><p className="pre-line">{project.notes}</p></div></section>}
        <footer className="print-footer"><strong>HEARTHFORM</strong><p>Visual concepts and estimates must be verified by qualified designers, engineers, trades, and local authorities before construction.</p></footer>
      </article>
    </main>
  );
}

function PrintList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <div className="print-list"><h3>{title}</h3><ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>;
}
