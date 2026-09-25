"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Bot,
  BoxSelect,
  Camera,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileText,
  FileUp,
  Fullscreen,
  ImagePlus,
  Images,
  Layers3,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  Menu,
  MessageCircleQuestion,
  MoreHorizontal,
  NotebookPen,
  PackageSearch,
  PaintBucket,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Replace,
  Save,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
  ZoomIn,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { BeforeAfter } from "@/components/before-after";
import { DevelopmentStatus, ErrorNotice } from "@/components/workspace/status-panel";
import { ProgressOverlay } from "@/components/workspace/progress-overlay";
import { apiFetch, ClientApiError } from "@/lib/client/api";
import { CURRENCIES, STYLE_SUGGESTIONS } from "@/lib/constants";
import { formatMoney, titleCase } from "@/lib/utils";
import type {
  AiStatus,
  BudgetPlan,
  ColorEstimate,
  ProductCategory,
  ProjectDetail,
  ProjectImage,
  ProjectFile,
  RenovationPlan,
  SpaceAnalysis,
  UserSafe,
  Version,
} from "@/lib/types";

type Tool = "design" | "analysis" | "plan" | "references" | "budget" | "products" | "color" | "notes" | "status";
type Operation = { task: string; startedAt: number; controller: AbortController };
type Pointer = { x: number; y: number; label?: string };

const tools: Array<{ id: Tool; label: string; icon: typeof Sparkles }> = [
  { id: "design", label: "Design", icon: WandSparkles },
  { id: "analysis", label: "Analysis", icon: ScanSearch },
  { id: "plan", label: "Plan", icon: Layers3 },
  { id: "references", label: "References", icon: Images },
  { id: "budget", label: "Budget", icon: BadgeDollarSign },
  { id: "products", label: "Products", icon: PackageSearch },
  { id: "color", label: "Color", icon: PaintBucket },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "status", label: "Status", icon: Bot },
];

export function Workspace({ initialProject, user }: { initialProject: ProjectDetail; user: UserSafe }) {
  const searchParams = useSearchParams();
  const [project, setProject] = useState(initialProject);
  const [activeTool, setActiveTool] = useState<Tool>(initialProject.plan ? "design" : "analysis");
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileTools, setMobileTools] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState(initialProject.versions.at(-1)?.id || "");
  const [viewMode, setViewMode] = useState<"image" | "compare">(initialProject.versions.length ? "compare" : "image");
  const [instructions, setInstructions] = useState(initialProject.instructions || "");
  const [editInstructions, setEditInstructions] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [pointer, setPointer] = useState<Pointer | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [forceStatus, setForceStatus] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; considerations: string[]; nextSteps: string[] } | null>(null);
  const [color, setColor] = useState<ColorEstimate | null>(null);
  const [budgetInput, setBudgetInput] = useState({ currency: "USD", budget: 35000, workMode: "professional", finishLevel: "medium" });
  const [privacyMode, setPrivacyMode] = useState<"standard" | "strict">("standard");
  const [notes, setNotes] = useState(initialProject.notes || "");
  const [notesSaved, setNotesSaved] = useState(true);
  const [uploading, setUploading] = useState(false);
  const autoAnalysis = useRef(false);
  const primaryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const originals = project.images.filter((image) => image.kind === "original");
  const original = originals.at(-1);
  const references = project.images.filter((image) => image.kind === "reference");
  const selectedVersion = selectedVersionId === "__original__"
    ? undefined
    : project.versions.find((version) => version.id === selectedVersionId) || project.versions.at(-1);
  const currentUrl = selectedVersion?.imageUrl || original?.url;
  const statuses = project.aiStatuses;

  async function refreshProject() {
    const data = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${project.id}`);
    setProject(data.project);
    if (
      selectedVersionId !== "__original__" &&
      data.project.versions.length &&
      !data.project.versions.some((version) => version.id === selectedVersionId)
    ) {
      setSelectedVersionId(data.project.versions.at(-1)!.id);
    }
    return data.project;
  }

  async function execute<T>(task: string, action: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    const controller = new AbortController();
    setOperation({ task, startedAt: Date.now(), controller });
    setError(null);
    try {
      return await action(controller.signal);
    } catch (caught) {
      if (controller.signal.aborted) return null;
      setError(caught instanceof ClientApiError ? caught : new ClientApiError("The request could not be completed."));
      return null;
    } finally {
      setOperation(null);
      try { await refreshProject(); } catch { /* Existing state remains usable. */ }
    }
  }

  async function runAnalysis() {
    const result = await execute("analysis", (signal) => apiFetch<{ analysis: SpaceAnalysis }>("/api/analyze", { method: "POST", body: JSON.stringify({ action: "analysis", projectId: project.id, instructions }), signal }));
    if (result) { setProject((current) => ({ ...current, analysis: result.analysis })); setActiveTool("analysis"); }
  }

  async function runPlan() {
    const result = await execute("plan", (signal) => apiFetch<{ plan: RenovationPlan }>("/api/analyze", { method: "POST", body: JSON.stringify({ action: "plan", projectId: project.id, instructions }), signal }));
    if (result) { setProject((current) => ({ ...current, plan: result.plan, instructions })); setActiveTool("plan"); }
  }

  async function runGenerate() {
    if (privacyMode === "strict" && !window.confirm("This will send the current project image and design brief to the configured external image-editing provider. Continue?")) return;
    const result = await execute("generate", (signal) => apiFetch<{ version: Version }>("/api/generate", { method: "POST", body: JSON.stringify({ projectId: project.id, instructions }), signal }));
    if (result) {
      setProject((current) => ({ ...current, versions: [...current.versions, result.version] }));
      setSelectedVersionId(result.version.id); setViewMode("compare"); setActiveTool("design");
    }
  }

  async function runEdit() {
    if (!selectedVersion || !editInstructions.trim()) return;
    if (privacyMode === "strict" && !window.confirm("This will send the current design image and edit instruction to the configured external image-editing provider. Continue?")) return;
    const result = await execute("edit", (signal) => apiFetch<{ version: Version }>("/api/edit", { method: "POST", body: JSON.stringify({ projectId: project.id, baseImageId: selectedVersion.imageId, instructions: editInstructions, point: pointer || undefined }), signal }));
    if (result) {
      setProject((current) => ({ ...current, versions: [...current.versions, result.version] }));
      setSelectedVersionId(result.version.id); setEditInstructions(""); setPointer(null); setSelectionMode(false); setViewMode("compare");
    }
  }

  async function runBudget() {
    const result = await execute("budget", (signal) => apiFetch<{ budget: BudgetPlan }>("/api/analyze", { method: "POST", body: JSON.stringify({ action: "budget", projectId: project.id, ...budgetInput, budget: Number(budgetInput.budget) }), signal }));
    if (result) setProject((current) => ({ ...current, budget: result.budget }));
  }

  async function runProducts() {
    const result = await execute("products", (signal) => apiFetch<{ products: ProductCategory[] }>("/api/analyze", { method: "POST", body: JSON.stringify({ action: "products", projectId: project.id }), signal }));
    if (result) setProject((current) => ({ ...current, products: result.products }));
  }

  async function runColor() {
    const imageId = selectedVersion?.imageId || original?.id;
    const result = await execute("color", (signal) => apiFetch<{ color: ColorEstimate }>("/api/analyze", { method: "POST", body: JSON.stringify({ action: "color", projectId: project.id, imageId, target: pointer?.label || (pointer ? `the surface near ${Math.round(pointer.x * 100)}% from left and ${Math.round(pointer.y * 100)}% from top` : "the most prominent painted wall") }), signal }));
    if (result) setColor(result.color);
  }

  async function askQuestion() {
    if (!question.trim()) return;
    const result = await execute("question", (signal) => apiFetch<{ response: { answer: string; considerations: string[]; nextSteps: string[] } }>("/api/ai/chat", { method: "POST", body: JSON.stringify({ projectId: project.id, question }), signal }));
    if (result) setAnswer(result.response);
  }

  async function uploadImages(files: FileList | File[], kind: "original" | "reference") {
    if (!files.length) return;
    setUploading(true); setError(null);
    const form = new FormData(); form.append("kind", kind);
    Array.from(files).forEach((file) => form.append("images", file));
    try {
      await apiFetch(`/api/projects/${project.id}/images`, { method: "POST", body: form });
      await refreshProject();
      if (kind === "original") { setSelectedVersionId("__original__"); setPointer(null); setSelectionMode(false); setViewMode("image"); await runAnalysis(); }
      else setActiveTool("references");
    } catch (caught) { setError(caught instanceof ClientApiError ? caught : new ClientApiError("The image could not be uploaded.")); }
    finally { setUploading(false); }
  }

  async function uploadReferenceAssets(items: FileList | File[]) {
    const selected = Array.from(items);
    const imageFiles = selected.filter((file) => file.type.startsWith("image/"));
    const documents = selected.filter((file) => !file.type.startsWith("image/"));
    if (!selected.length) return;
    setUploading(true); setError(null);
    try {
      if (imageFiles.length) {
        const imageForm = new FormData(); imageForm.append("kind", "reference");
        imageFiles.forEach((file) => imageForm.append("images", file));
        await apiFetch(`/api/projects/${project.id}/images`, { method: "POST", body: imageForm });
      }
      if (documents.length) {
        const fileForm = new FormData();
        documents.forEach((file) => fileForm.append("files", file));
        await apiFetch(`/api/projects/${project.id}/files`, { method: "POST", body: fileForm });
      }
      await refreshProject();
      setActiveTool("references");
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught : new ClientApiError("The reference could not be uploaded."));
    } finally { setUploading(false); }
  }

  async function removeReference(image: ProjectImage) {
    try { await apiFetch(`/api/projects/${project.id}/images?imageId=${image.id}`, { method: "DELETE" }); await refreshProject(); }
    catch (caught) { setError(caught instanceof ClientApiError ? caught : new ClientApiError("The reference could not be removed.")); }
  }

  async function removeProjectFile(file: ProjectFile) {
    try { await apiFetch(`/api/projects/${project.id}/files?fileId=${file.id}`, { method: "DELETE" }); await refreshProject(); }
    catch (caught) { setError(caught instanceof ClientApiError ? caught : new ClientApiError("The project file could not be removed.")); }
  }

  async function saveNotes() {
    setNotesSaved(false);
    try { await apiFetch(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ notes }) }); setNotesSaved(true); }
    catch (caught) { setError(caught instanceof ClientApiError ? caught : new ClientApiError("Notes could not be saved.")); }
  }

  async function renameProject() {
    const name = prompt("Project name", project.name)?.trim();
    if (!name || name === project.name) return;
    try { const data = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name }) }); setProject(data.project); }
    catch (caught) { setError(caught instanceof ClientApiError ? caught : new ClientApiError("The project could not be renamed.")); }
  }

  function canvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!selectionMode || !selectedVersion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    setActiveTool("design"); setRightOpen(true);
  }

  async function exportComparison() {
    if (!original || !selectedVersion) return;
    const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
    try {
      const [before, after] = await Promise.all([load(original.url), load(selectedVersion.imageUrl)]);
      const width = 1800; const height = 1100;
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d")!;
      const drawCover = (image: HTMLImageElement, x: number, w: number) => {
        const scale = Math.max(w / image.naturalWidth, height / image.naturalHeight);
        const sw = w / scale; const sh = height / scale;
        context.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, 0, w, height);
      };
      drawCover(before, 0, width / 2); drawCover(after, width / 2, width / 2);
      context.fillStyle = "rgba(20,22,18,.78)"; context.fillRect(24, 24, 112, 42); context.fillRect(width / 2 + 24, 24, 104, 42);
      context.fillStyle = "white"; context.font = "600 20px sans-serif"; context.fillText("BEFORE", 42, 52); context.fillText("AFTER", width / 2 + 43, 52);
      context.fillStyle = "#f6f3ed"; context.fillRect(width / 2 - 2, 0, 4, height);
      const link = document.createElement("a"); link.download = `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-before-after.jpg`; link.href = canvas.toDataURL("image/jpeg", 0.92); link.click();
    } catch { setError(new ClientApiError("The before-and-after export could not be created.")); }
  }

  useEffect(() => {
    apiFetch<{ preferences: { currency: string; privacyMode: "standard" | "strict" } }>("/api/settings")
      .then(({ preferences }) => {
        setPrivacyMode(preferences.privacyMode);
        setBudgetInput((current) => ({ ...current, currency: preferences.currency }));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (autoAnalysis.current || searchParams.get("analyze") !== "1" || project.analysis || !original) return;
    autoAnalysis.current = true;
    window.history.replaceState({}, "", `/projects/${project.id}`);
    void runAnalysis();
    // Initial post-upload analysis is intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    if (!error) return;
    if (activeTool === "analysis") void runAnalysis();
    else if (activeTool === "plan") void runPlan();
    else if (activeTool === "budget") void runBudget();
    else if (activeTool === "products") void runProducts();
    else if (activeTool === "color") void runColor();
    else if (selectedVersion && editInstructions) void runEdit();
    else void runGenerate();
  };

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <div className="workspace-brand"><Link href="/dashboard" className="back-square" aria-label="Back to projects"><ArrowLeft size={18} /></Link><Logo compact /><span className="top-divider" /><button className="project-title-button" onClick={renameProject}><strong>{project.name}</strong><small>{titleCase(project.roomType)}</small><ChevronDown size={15} /></button></div>
        <div className={`workspace-save-state ${user.isGuest ? "demo" : ""}`}>{user.isGuest ? <><Sparkles size={14} /><span>Demo · one redesign</span></> : <><Check size={14} /><span>Saved privately</span></>}</div>
        <div className="workspace-top-actions">
          {selectedVersion && <a className="icon-button hide-mobile" href={`/api/media/${selectedVersion.imageId}?download=1`} title="Download design"><Download size={18} /></a>}
          {selectedVersion && <button className="icon-button hide-mobile" onClick={exportComparison} title="Export comparison"><Images size={18} /></button>}
          <Link className="button button-secondary button-sm hide-mobile" href={`/projects/${project.id}/print`} target="_blank"><FileText size={16} /> Export plan</Link>
          <button className="icon-button" onClick={() => setRightOpen((value) => !value)} aria-label="Toggle controls">{rightOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}</button>
          <button className="icon-button mobile-only" onClick={() => setMobileTools((value) => !value)} aria-label="Workspace tools"><Menu size={19} /></button>
        </div>
      </header>

      <div className={`workspace-grid ${rightOpen ? "right-open" : "right-closed"}`}>
        <nav className={`workspace-toolrail ${mobileTools ? "mobile-open" : ""}`} aria-label="Project tools">
          {tools.map((tool) => <button key={tool.id} className={activeTool === tool.id ? "active" : ""} onClick={() => { setActiveTool(tool.id); setRightOpen(true); setMobileTools(false); }}><tool.icon size={20} /><span>{tool.label}</span>{tool.id === "status" && statuses[0]?.status === "error" && <i />}</button>)}
        </nav>

        <section className="workspace-canvas-area">
          <div className="canvas-toolbar">
            <div className="segmented compact"><button className={viewMode === "image" ? "active" : ""} onClick={() => setViewMode("image")}>{selectedVersion ? "After" : "Image"}</button><button disabled={!selectedVersion} className={viewMode === "compare" ? "active" : ""} onClick={() => setViewMode("compare")}>Before ↔ After</button></div>
            <div className="canvas-actions">
              {selectedVersion && <button className={`tool-button ${selectionMode ? "active" : ""}`} onClick={() => { setSelectionMode((value) => !value); setViewMode("image"); }} title="Point to an area"><BoxSelect size={17} /> <span className="hide-mobile">Select area</span></button>}
              <button className="icon-button" onClick={() => canvasRef.current?.requestFullscreen?.()} title="Fullscreen"><Maximize2 size={17} /></button>
              {!user.isGuest && <button className="tool-button" onClick={() => primaryInput.current?.click()} disabled={uploading}><Replace size={17} /><span className="hide-mobile">Replace photo</span></button>}
              {!original && <button className="tool-button" onClick={() => cameraInput.current?.click()} disabled={uploading}><Camera size={17} /><span className="hide-mobile">Camera</span></button>}
            </div>
          </div>

          <div ref={canvasRef} className={`image-stage ${selectionMode ? "selecting" : ""}`} onClick={canvasClick}>
            {!currentUrl ? <div className="canvas-empty"><Upload size={30} /><h2>Add your space</h2><p>Upload a file, choose an image, or take a photo.</p><div className="canvas-empty-actions"><button className="button button-primary" onClick={() => primaryInput.current?.click()}><ImagePlus size={16} /> Choose image</button><button className="button button-light" onClick={() => cameraInput.current?.click()}><Camera size={16} /> Camera</button></div></div>
              : viewMode === "compare" && original && selectedVersion ? <BeforeAfter before={original.url} after={selectedVersion.imageUrl} controls />
              : <div className="single-image-wrap"><img src={currentUrl} alt={selectedVersion ? `Redesign version ${selectedVersion.number}` : "Original space"} /><span className="canvas-label">{selectedVersion ? `Version ${selectedVersion.number}` : "Original"}</span>{selectionMode && <span className="selection-instruction"><BoxSelect size={15} /> Click an object or area to target it</span>}{pointer && selectedVersion && <span className="selection-marker" style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}><i /></span>}</div>}
            {operation && <ProgressOverlay task={operation.task} startedAt={operation.startedAt} onCancel={() => operation.controller.abort()} />}
          </div>

          <div className="version-strip">
            <button className={!selectedVersion ? "version-thumb active" : "version-thumb"} onClick={() => { setSelectedVersionId("__original__"); setPointer(null); setSelectionMode(false); setViewMode("image"); }}>
              {original ? <img src={original.thumbnailUrl} alt="Original" /> : <span><ImagePlus size={19} /></span>}<small>Original</small>
            </button>
            {project.versions.map((version) => <button className={selectedVersion?.id === version.id ? "version-thumb active" : "version-thumb"} onClick={() => { setSelectedVersionId(version.id); setViewMode("image"); }} key={version.id}><img src={version.thumbnailUrl} alt={`Version ${version.number}`} /><small>V{version.number}</small></button>)}
            {project.plan && <button className="version-add" onClick={() => { setActiveTool("design"); setRightOpen(true); }}><Plus size={20} /><small>New edit</small></button>}
          </div>
          <input ref={primaryInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" onChange={(event) => event.target.files && void uploadImages(event.target.files, "original")} />
          <input ref={cameraInput} type="file" className="sr-only" accept="image/*" capture="environment" onChange={(event) => event.target.files && void uploadImages(event.target.files, "original")} />
        </section>

        {rightOpen && <aside className="workspace-panel">
          <div className="panel-scroll">
            {error && <ErrorNotice code={error.code} message={error.message} onRetry={retry} onOpenStatus={() => { setForceStatus(true); setActiveTool("status"); }} />}
            {activeTool === "design" && <DesignPanel project={project} isGuest={user.isGuest} instructions={instructions} setInstructions={setInstructions} editInstructions={editInstructions} setEditInstructions={setEditInstructions} selectedVersion={selectedVersion} pointer={pointer} setPointer={setPointer} selectionMode={selectionMode} setSelectionMode={setSelectionMode} onAnalyze={runAnalysis} onPlan={runPlan} onGenerate={runGenerate} onEdit={runEdit} busy={Boolean(operation)} />}
            {activeTool === "analysis" && <AnalysisPanel analysis={project.analysis} question={question} setQuestion={setQuestion} answer={answer} onAnalyze={runAnalysis} onAsk={askQuestion} busy={Boolean(operation)} />}
            {activeTool === "plan" && <PlanPanel plan={project.plan} onCreate={runPlan} onGenerate={runGenerate} busy={Boolean(operation)} />}
            {activeTool === "references" && <ReferencesPanel references={references} files={project.files} isGuest={user.isGuest} inputRef={referenceInput} onUpload={uploadReferenceAssets} onRemove={removeReference} onRemoveFile={removeProjectFile} uploading={uploading} />}
            {activeTool === "budget" && <BudgetPanel plan={project.plan} budget={project.budget} input={budgetInput} setInput={setBudgetInput} onCreate={runBudget} busy={Boolean(operation)} />}
            {activeTool === "products" && <ProductsPanel plan={project.plan} products={project.products} onCreate={runProducts} busy={Boolean(operation)} />}
            {activeTool === "color" && <ColorPanel imageAvailable={Boolean(currentUrl)} pointer={pointer} color={color} onIdentify={runColor} onSelect={() => { setSelectionMode(true); setViewMode("image"); }} busy={Boolean(operation)} />}
            {activeTool === "notes" && <NotesPanel notes={notes} setNotes={(value) => { setNotes(value); setNotesSaved(false); }} saved={notesSaved} onSave={saveNotes} />}
            {activeTool === "status" && <DevelopmentStatus statuses={statuses} forceOpen={forceStatus} />}
          </div>
          {activeTool !== "status" && <DevelopmentStatus statuses={statuses} />}
        </aside>}
      </div>
      <input ref={referenceInput} type="file" multiple className="sr-only" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json" onChange={(event) => event.target.files && void uploadReferenceAssets(event.target.files)} />
    </main>
  );
}

function PanelHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return <header className="panel-header"><span className="panel-eyebrow">{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</header>;
}

function DesignPanel(props: {
  project: ProjectDetail; isGuest: boolean; instructions: string; setInstructions: (value: string) => void; editInstructions: string; setEditInstructions: (value: string) => void;
  selectedVersion?: Version; pointer: Pointer | null; setPointer: (value: Pointer | null) => void; selectionMode: boolean; setSelectionMode: (value: boolean) => void;
  onAnalyze: () => void; onPlan: () => void; onGenerate: () => void; onEdit: () => void; busy: boolean;
}) {
  if (props.selectedVersion && props.isGuest) return <div className="panel-content demo-upgrade-panel">
    <span className="demo-complete-mark"><Check size={27} /></span>
    <PanelHeader eyebrow="Demo redesign complete" title="Your first transformation is ready." text="Create a free account to preserve this project, edit individual details, add more references, build version history, and export the full renovation package." />
    <div className="demo-unlock-list"><span><Layers3 size={16} /> Unlimited design versions</span><span><BoxSelect size={16} /> Object and area edits</span><span><FileText size={16} /> Plans, budgets, and exports</span></div>
    <Link className="button button-primary button-lg button-full" href="/sign-up">Save project & keep designing <ArrowRight size={17} /></Link>
    <Link className="button button-secondary button-full" href="/sign-in">I already have an account</Link>
    <small className="button-caption">Your demo project transfers to your account after sign-in.</small>
  </div>;
  if (props.selectedVersion) return <div className="panel-content"><PanelHeader eyebrow={`Version ${props.selectedVersion.number}`} title="Edit this design" text="The current version becomes the visual context. Your next edit will not restart from the original." />
    {props.pointer && <div className="target-card"><span className="target-dot" /><div><strong>Approximate area selected</strong><p>{Math.round(props.pointer.x * 100)}% from left · {Math.round(props.pointer.y * 100)}% from top</p></div><button className="icon-button" onClick={() => props.setPointer(null)}><X size={15} /></button></div>}
    <label className="field-label"><span>What should change?</span><textarea className="large-textarea" value={props.editInstructions} onChange={(event) => props.setEditInstructions(event.target.value)} placeholder="Make the cabinets darker. Keep everything else exactly the same." rows={6} maxLength={8000} /></label>
    <div className="quick-actions object-actions"><button onClick={() => props.setEditInstructions("Replace the selected object with a refined alternative that fits the current design. Keep everything else exactly the same.")}><Replace size={15} /> Replace</button><button onClick={() => props.setEditInstructions("Recolor the selected surface while preserving its texture, lighting, and every other element.")}><Palette size={15} /> Recolor</button><button onClick={() => props.setEditInstructions("Change the selected surface material to a realistic material that fits the current design. Keep the geometry unchanged.")}><Layers3 size={15} /> Material</button><button onClick={() => props.setEditInstructions("Adjust the selected light or local lighting to feel warmer and more natural. Keep everything else unchanged.")}><Lightbulb size={15} /> Lighting</button></div>
    <div className="honesty-note"><AlertCircle size={16} /><p><strong>Visual pointer, not pixel-perfect segmentation.</strong> Describe the object as well as selecting it for the most reliable edit.</p></div>
    {!props.pointer && <button className={`button button-secondary button-full ${props.selectionMode ? "active" : ""}`} onClick={() => props.setSelectionMode(!props.selectionMode)}><BoxSelect size={17} /> {props.selectionMode ? "Click the image now" : "Point to an object or area"}</button>}
    <button className="button button-primary button-lg button-full" disabled={props.busy || props.editInstructions.trim().length < 3} onClick={props.onEdit}>{props.busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />} Create version {props.project.versions.length + 1}</button>
    <p className="button-caption">Uses Version {props.selectedVersion.number} as the source image.</p>
  </div>;

  return <div className="panel-content"><PanelHeader eyebrow="Design direction" title="What would you like to change?" text="Be as specific as you like. Materials, lighting, layout, objects, and preservation requests all matter." />
    {props.isGuest && <div className="demo-meter-card"><div><Sparkles size={15} /><strong>Demo generation</strong></div><span>1 redesign remaining</span><i><b /></i></div>}
    <textarea className="large-textarea prompt-textarea" value={props.instructions} onChange={(event) => props.setInstructions(event.target.value)} placeholder="Make this room modern and warm. Replace the flooring with light oak, add built-in storage, repaint the walls in a warm white, add indirect lighting, and keep the existing windows and room layout." rows={8} maxLength={8000} />
    <div className="char-count">{props.instructions.length.toLocaleString()} / 8,000</div>
    <div className="suggestion-block"><span>Quick direction</span><div className="suggestion-chips">{STYLE_SUGGESTIONS.map((style) => <button key={style} onClick={() => props.setInstructions(`${props.instructions}${props.instructions ? " " : ""}Use a ${style.toLowerCase()} design language.`)}>{style}</button>)}</div></div>
    <div className="workflow-steps compact-steps"><div className={props.project.analysis ? "done" : "current"}><span>{props.project.analysis ? <Check size={14} /> : "1"}</span><p><strong>Analyze space</strong><small>Visible elements and constraints</small></p></div><div className={props.project.plan ? "done" : props.project.analysis ? "current" : ""}><span>{props.project.plan ? <Check size={14} /> : "2"}</span><p><strong>Build plan</strong><small>Materials, steps, image brief</small></p></div><div className={props.project.plan ? "current" : ""}><span>3</span><p><strong>Generate</strong><small>Real image-editing provider</small></p></div></div>
    {!props.project.analysis ? <button className="button button-primary button-lg button-full" disabled={props.busy} onClick={props.onAnalyze}><ScanSearch size={18} /> Analyze this space</button> : !props.project.plan ? <button className="button button-primary button-lg button-full" disabled={props.busy || props.instructions.trim().length < 3} onClick={props.onPlan}><Layers3 size={18} /> Create renovation plan</button> : <button className="button button-primary button-lg button-full" disabled={props.busy || props.instructions.trim().length < 3} onClick={props.onGenerate}><Sparkles size={18} /> Generate realistic redesign</button>}
    {props.project.plan && <button className="text-button center" onClick={props.onPlan}>Rebuild the plan first</button>}
  </div>;
}

function AnalysisPanel({ analysis, question, setQuestion, answer, onAnalyze, onAsk, busy }: { analysis: SpaceAnalysis | null; question: string; setQuestion: (value: string) => void; answer: { answer: string; considerations: string[]; nextSteps: string[] } | null; onAnalyze: () => void; onAsk: () => void; busy: boolean }) {
  if (!analysis) return <EmptyPanel icon={ScanSearch} eyebrow="AI space analysis" title="Let the space speak first." text="Hearthform will send the real uploaded photograph to the configured OpenRouter vision model and identify visible architecture, materials, objects, opportunities, and constraints." action="Analyze this space" onAction={onAnalyze} busy={busy} />;
  return <div className="panel-content"><PanelHeader eyebrow="AI space analysis" title={analysis.currentSpace.roomType} text={analysis.currentSpace.summary} />
    <div className="confidence-row"><span className={`confidence ${analysis.currentSpace.confidence}`}>{analysis.currentSpace.confidence} visual confidence</span><button className="text-button" onClick={onAnalyze}><RefreshCw size={14} /> Reanalyze</button></div>
    <AnalysisSection title="Architecture" items={analysis.architecture} />
    <section className="detail-section"><h3>Existing elements</h3><div className="element-list">{analysis.existingElements.map((item, index) => <div key={`${item.name}-${index}`}><strong>{item.name}</strong><p>{item.description}</p>{item.condition && <small>{item.condition}</small>}</div>)}</div></section>
    <AnalysisSection title="Opportunities" items={analysis.opportunities} accent />
    <AnalysisSection title="Constraints" items={analysis.constraints} />
    <AnalysisSection title="Preserve" items={analysis.preserve} />
    {analysis.uncertaintyNotes.length > 0 && <div className="uncertainty-card"><AlertCircle size={16} /><div><strong>What the image cannot confirm</strong>{analysis.uncertaintyNotes.map((item) => <p key={item}>{item}</p>)}</div></div>}
    <section className="ask-section"><h3><MessageCircleQuestion size={17} /> Ask about this space</h3><div className="inline-input"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Could this layout support an island?" onKeyDown={(event) => { if (event.key === "Enter") onAsk(); }} /><button onClick={onAsk} disabled={busy || question.trim().length < 2}>{busy ? <LoaderCircle className="spin" size={16} /> : <Bot size={16} />}</button></div>{answer && <div className="answer-card"><strong>Design response</strong><p>{answer.answer}</p>{answer.considerations.length > 0 && <ul>{answer.considerations.map((item) => <li key={item}>{item}</li>)}</ul>}</div>}</section>
  </div>;
}

function AnalysisSection({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  return <section className={`detail-section ${accent ? "accent" : ""}`}><h3>{title}</h3><ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>;
}

function PlanPanel({ plan, onCreate, onGenerate, busy }: { plan: RenovationPlan | null; onCreate: () => void; onGenerate: () => void; busy: boolean }) {
  if (!plan) return <EmptyPanel icon={Layers3} eyebrow="Renovation plan" title="Turn direction into decisions." text="Create a structured concept, palette, materials list, layout direction, work sequence, risks, and production-ready image brief." action="Create renovation plan" onAction={onCreate} busy={busy} />;
  return <div className="panel-content"><PanelHeader eyebrow="Renovation plan" title={plan.designConcept} text={plan.style.join(" · ")} />
    <div className="plan-summary-row"><span className={`difficulty ${plan.estimatedDifficulty}`}>{plan.estimatedDifficulty} difficulty</span><button className="text-button" onClick={onCreate}><RefreshCw size={14} /> Rebuild</button></div>
    <section className="detail-section"><h3>Color palette</h3><div className="palette-list">{plan.colorPalette.map((color) => <div key={color.hex}><span style={{ background: color.hex }} /><p><strong>{color.name}</strong><small>{color.hex} · {color.usage}</small></p></div>)}</div></section>
    <section className="detail-section"><h3>Materials</h3><div className="material-list">{plan.materials.map((item) => <div key={`${item.material}-${item.application}`}><strong>{item.material}</strong><span>{item.application}</span><p>{item.rationale}</p></div>)}</div></section>
    <AnalysisSection title="Layout" items={plan.layoutRecommendations} />
    <AnalysisSection title="Lighting" items={plan.lighting} />
    <section className="detail-section"><h3>Renovation sequence</h3><ol className="renovation-steps">{plan.renovationSteps.sort((a,b) => a.order-b.order).map((step) => <li key={`${step.order}-${step.title}`}><span>{String(step.order).padStart(2,"0")}</span><div><strong>{step.title}</strong><p>{step.detail}</p>{step.trade && <small>{step.trade}</small>}</div></li>)}</ol></section>
    <AnalysisSection title="Potential issues" items={plan.potentialIssues} />
    <div className="generation-brief"><strong>Image-editing brief</strong><p>{plan.imageGenerationInstructions}</p></div>
    <button className="button button-primary button-lg button-full" onClick={onGenerate} disabled={busy}><Sparkles size={18} /> Generate this redesign</button>
  </div>;
}

function ReferencesPanel({ references, files, isGuest, inputRef, onRemove, onRemoveFile, uploading }: { references: ProjectImage[]; files: ProjectFile[]; isGuest: boolean; inputRef: React.RefObject<HTMLInputElement | null>; onUpload: (files: FileList | File[]) => void; onRemove: (image: ProjectImage) => void; onRemoveFile: (file: ProjectFile) => void; uploading: boolean }) {
  const assetCount = references.length + files.length;
  return <div className="panel-content"><PanelHeader eyebrow="Reference inspiration" title="Show it—or attach it." text="Add furniture, palettes, materials, complete rooms, a PDF brief, floorplan notes, or a material schedule. The design brain uses these alongside the real space." />
    <button className="reference-drop" onClick={() => inputRef.current?.click()} disabled={uploading || (isGuest && assetCount >= 1)}><span>{uploading ? <LoaderCircle className="spin" size={22} /> : <FileUp size={22} />}</span><strong>{uploading ? "Uploading..." : isGuest && assetCount >= 1 ? "Demo reference added" : "Add inspiration images or project files"}</strong><small>{isGuest ? "Demo limit: 1 reference · 10 MB" : "Images, PDF, TXT, Markdown, CSV or JSON · max 10 MB each"}</small></button>
    {!assetCount ? <div className="reference-empty"><Images size={27} /><p>No references yet.</p><span>Your written direction still works without them.</span></div> : <>
      {references.length > 0 && <div className="reference-grid">{references.map((image, index) => <figure key={image.id}><img src={image.thumbnailUrl} alt={`Reference ${index + 1}`} /><figcaption>Image {index + 1}</figcaption><button onClick={() => onRemove(image)} aria-label={`Remove reference ${index + 1}`}><X size={14} /></button></figure>)}</div>}
      {files.length > 0 && <div className="project-file-list">{files.map((file) => <article key={file.id}><span><FileText size={18} /></span><div><strong>{file.filename}</strong><small>{file.mimeType} · {(file.sizeBytes / 1024).toFixed(0)} KB</small></div><a href={file.downloadUrl} aria-label={`Download ${file.filename}`}><Download size={14} /></a><button onClick={() => onRemoveFile(file)} aria-label={`Remove ${file.filename}`}><X size={14} /></button></article>)}</div>}
    </>}
    <div className="honesty-note"><AlertCircle size={16} /><p>References guide palette, material, furniture, and atmosphere. They do not override the primary image’s geometry. Measurements in documents remain unverified until checked on site.</p></div>
  </div>;
}

function BudgetPanel({ plan, budget, input, setInput, onCreate, busy }: { plan: RenovationPlan | null; budget: BudgetPlan | null; input: { currency: string; budget: number; workMode: string; finishLevel: string }; setInput: React.Dispatch<React.SetStateAction<{ currency: string; budget: number; workMode: string; finishLevel: string }>>; onCreate: () => void; busy: boolean }) {
  if (!plan) return <EmptyPanel icon={CircleDollarSign} eyebrow="Budget mode" title="Plan the design first." text="A renovation plan is needed before Hearthform can build relevant estimate categories and assumptions." />;
  return <div className="panel-content"><PanelHeader eyebrow="Budget mode" title="Shape the scope." text="These ranges organize decisions. They are estimates, not local contractor quotes." />
    <div className="budget-form"><label><span>Target budget</span><div className="money-input"><select value={input.currency} onChange={(event) => setInput((current) => ({ ...current, currency: event.target.value }))}>{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select><input type="number" min={100} max={1000000000} value={input.budget} onChange={(event) => setInput((current) => ({ ...current, budget: Number(event.target.value) }))} /></div></label><label><span>Who is doing the work?</span><select value={input.workMode} onChange={(event) => setInput((current) => ({ ...current, workMode: event.target.value }))}><option value="diy">Mostly DIY</option><option value="mixed">DIY + professionals</option><option value="professional">Professional trades</option></select></label><label><span>Finish level</span><select value={input.finishLevel} onChange={(event) => setInput((current) => ({ ...current, finishLevel: event.target.value }))}><option value="low">Budget-conscious</option><option value="medium">Mid-range</option><option value="premium">Premium</option></select></label></div>
    <button className="button button-primary button-full" onClick={onCreate} disabled={busy}><BadgeDollarSign size={17} /> {budget ? "Update estimate" : "Create budget estimate"}</button>
    {budget && <div className="budget-result"><div className="budget-total"><span>Estimated project range</span><strong>{formatMoney(budget.estimatedLow, budget.currency)} – {formatMoney(budget.estimatedHigh, budget.currency)}</strong><small>including {budget.contingencyPercent}% contingency</small></div><div className="budget-bars">{budget.categories.map((category) => <div key={category.name}><div><strong>{category.name}</strong><span>{formatMoney(category.low, budget.currency)} – {formatMoney(category.high, budget.currency)}</span></div><p>{category.notes}</p><i><span style={{ width: `${Math.min(100, (category.high / Math.max(budget.estimatedHigh, 1)) * 100)}%` }} /></i></div>)}</div><div className="uncertainty-card"><AlertCircle size={16} /><div><strong>Estimate assumptions</strong>{budget.assumptions.map((item) => <p key={item}>{item}</p>)}<p>{budget.disclaimer}</p></div></div></div>}
  </div>;
}

function ProductsPanel({ plan, products, onCreate, busy }: { plan: RenovationPlan | null; products: ProductCategory[] | null; onCreate: () => void; busy: boolean }) {
  if (!plan) return <EmptyPanel icon={PackageSearch} eyebrow="Product discovery" title="A design needs direction first." text="Create a renovation plan before building vendor-neutral product and material searches." />;
  return <div className="panel-content"><PanelHeader eyebrow="Product discovery" title="Find what fits." text="Hearthform recommends categories and search specifications—not invented stock, prices, or sellers." />
    {!products ? <button className="button button-primary button-full" onClick={onCreate} disabled={busy}><PackageSearch size={17} /> Build product searches</button> : <><button className="text-button panel-refresh" onClick={onCreate}><RefreshCw size={14} /> Refresh categories</button><div className="product-list">{products.map((product) => <article key={`${product.category}-${product.searchTerms}`}><span className="product-icon"><PackageSearch size={18} /></span><div><h3>{product.category}</h3><p>{product.description}</p><strong>Why it matches</strong><p>{product.whyItMatches}</p><ul>{product.specifications.map((spec) => <li key={spec}>{spec}</li>)}</ul><a href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(product.searchTerms)}`} target="_blank" rel="noreferrer">Search alternatives <ZoomIn size={14} /></a></div></article>)}</div><p className="product-disclaimer">Search results open a live third-party search. Verify dimensions, finish, seller, price, and availability yourself.</p></>}
  </div>;
}

function ColorPanel({ imageAvailable, pointer, color, onIdentify, onSelect, busy }: { imageAvailable: boolean; pointer: Pointer | null; color: ColorEstimate | null; onIdentify: () => void; onSelect: () => void; busy: boolean }) {
  return <div className="panel-content"><PanelHeader eyebrow="Identify a color" title="Estimate what you see." text="Image-based paint estimates are affected by lighting, white balance, reflections, and camera processing." />
    <div className="color-target-card"><PaintBucket size={21} /><div><strong>{pointer ? "Selected area" : "Most prominent painted wall"}</strong><p>{pointer ? `${Math.round(pointer.x * 100)}% from left · ${Math.round(pointer.y * 100)}% from top` : "Choose an area for a more focused estimate."}</p></div><button className="text-button" onClick={onSelect}>Select</button></div>
    <button className="button button-primary button-full" onClick={onIdentify} disabled={!imageAvailable || busy}><Palette size={17} /> Identify approximate color</button>
    {color && <div className="color-result"><div className="large-swatch" style={{ background: color.hex }}><span>{color.confidence} confidence</span></div><h3>{color.approximateName}</h3><div className="color-values"><span><small>HEX</small><strong>{color.hex}</strong></span><span><small>RGB</small><strong>{color.rgb.r}, {color.rgb.g}, {color.rgb.b}</strong></span></div><p><strong>Observed on:</strong> {color.observedOn}</p><div className="uncertainty-card"><AlertCircle size={16} /><p>{color.lightingCaveat}</p></div><a className="button button-secondary button-full" href={`https://www.google.com/search?q=${encodeURIComponent(color.searchTerms.join(" ") + " paint swatch")}`} target="_blank" rel="noreferrer">Find matching paints</a><small className="button-caption">No commercial brand match is claimed. Compare physical swatches in the real room.</small></div>}
  </div>;
}

function NotesPanel({ notes, setNotes, saved, onSave }: { notes: string; setNotes: (value: string) => void; saved: boolean; onSave: () => void }) {
  return <div className="panel-content"><PanelHeader eyebrow="Project notes" title="Keep the thinking together." text="Record measurements you have verified, contractor questions, product links, decisions, or site observations." /><textarea className="large-textarea notes-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add private project notes..." rows={16} maxLength={20000} /><button className="button button-primary button-full" onClick={onSave} disabled={saved}><Save size={17} /> {saved ? "Notes saved" : "Save notes"}</button></div>;
}

function EmptyPanel({ icon: Icon, eyebrow, title, text, action, onAction, busy }: { icon: typeof Sparkles; eyebrow: string; title: string; text: string; action?: string; onAction?: () => void; busy?: boolean }) {
  return <div className="panel-content empty-panel"><span className="empty-panel-icon"><Icon size={27} /></span><PanelHeader eyebrow={eyebrow} title={title} text={text} />{action && onAction && <button className="button button-primary button-lg button-full" onClick={onAction} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Icon size={18} />}{action}</button>}</div>;
}
