"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Copy, FolderOpen, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch, ClientApiError } from "@/lib/client/api";
import { titleCase } from "@/lib/utils";

type ProjectCard = { id: string; name: string; roomType: string; status: string; updatedAt: string; createdAt: string; versionCount: number; thumbnailUrl: string | null };

export function DashboardClient() {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setProjects((await apiFetch<{ projects: ProjectCard[] }>("/api/projects")).projects); }
    catch (caught) { setError(caught instanceof ClientApiError ? caught.message : "Projects could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function remove(project: ProjectCard) {
    if (!confirm(`Delete “${project.name}”? This removes its plans and versions.`)) return;
    try { await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" }); setProjects((items) => items.filter((item) => item.id !== project.id)); }
    catch (caught) { setError(caught instanceof ClientApiError ? caught.message : "Project could not be deleted."); }
  }
  async function duplicate(project: ProjectCard) {
    try { await apiFetch(`/api/projects/${project.id}/duplicate`, { method: "POST", body: "{}" }); await load(); }
    catch (caught) { setError(caught instanceof ClientApiError ? caught.message : "Project could not be duplicated."); }
  }
  async function rename(project: ProjectCard) {
    const name = prompt("Project name", project.name)?.trim();
    if (!name || name === project.name) return;
    try { await apiFetch(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name }) }); await load(); }
    catch (caught) { setError(caught instanceof ClientApiError ? caught.message : "Project could not be renamed."); }
  }

  const visible = projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div><span className="kicker">Private design studio</span><h1>My Projects</h1><p>Every space, plan, and iteration in one place.</p></div>
        <Link href="/projects/new" className="button button-primary"><Plus size={18} /> New project</Link>
      </header>
      {error && <div className="inline-error"><div><strong>Projects could not be loaded</strong><p>{error}</p></div><button className="button button-secondary button-sm" onClick={load}><RefreshCw size={15} /> Try again</button></div>}
      {loading ? (
        <div className="project-grid">{[1,2,3].map((item) => <div key={item} className="project-card skeleton-card"><span /><i /><i /></div>)}</div>
      ) : projects.length === 0 ? (
        <section className="empty-projects">
          <div className="empty-visual"><div className="plan-line line-one" /><div className="plan-line line-two" /><div className="plan-door" /><span>+</span></div>
          <span className="kicker">An empty canvas, for now</span>
          <h2>Your next renovation starts here.</h2>
          <p>Upload a space and turn your ideas into a realistic design, grounded in what is already there.</p>
          <Link href="/projects/new" className="button button-primary button-lg">Create your first project <ArrowRight size={18} /></Link>
        </section>
      ) : (
        <>
          <div className="project-toolbar"><p><strong>{projects.length}</strong> {projects.length === 1 ? "project" : "projects"}</p><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects" /></div>
          <div className="project-grid">
            {visible.map((project) => (
              <article className="project-card" key={project.id}>
                <Link href={`/projects/${project.id}`} className="project-image">
                  {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" loading="lazy" /> : <div className="project-placeholder"><FolderOpen size={30} /><span>Awaiting a space</span></div>}
                  <span className="project-status">{project.status}</span>
                </Link>
                <div className="project-info">
                  <div><span>{titleCase(project.roomType)}</span><h2><Link href={`/projects/${project.id}`}>{project.name}</Link></h2></div>
                  <button className="icon-button" onClick={() => setMenu(menu === project.id ? null : project.id)} aria-label={`Actions for ${project.name}`}><MoreHorizontal size={19} /></button>
                  {menu === project.id && <div className="card-menu"><Link href={`/projects/${project.id}`}><FolderOpen size={16} /> Open</Link><button onClick={() => rename(project)}><Pencil size={16} /> Rename</button><button onClick={() => duplicate(project)}><Copy size={16} /> Duplicate</button><button className="danger" onClick={() => remove(project)}><Trash2 size={16} /> Delete</button></div>}
                </div>
                <div className="project-meta"><span>Edited {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span><span>{project.versionCount} {project.versionCount === 1 ? "version" : "versions"}</span></div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
