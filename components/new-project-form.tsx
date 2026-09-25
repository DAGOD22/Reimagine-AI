"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { ROOM_TYPES } from "@/lib/constants";
import { apiFetch, ClientApiError } from "@/lib/client/api";
import { formatBytes } from "@/lib/utils";

export function NewProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState("living_room");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function choose(next: File | undefined) {
    if (!next) return;
    if (!next.type.startsWith("image/")) { setError("Choose a valid image file."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next); setPreview(URL.createObjectURL(next)); setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) { setError("Add a photograph of the space to continue."); return; }
    setPending(true); setError("");
    try {
      const created = await apiFetch<{ project: { id: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ name: name.trim() || `Untitled ${ROOM_TYPES.find((item) => item.value === roomType)?.label || "space"}`, roomType }) });
      const form = new FormData(); form.append("kind", "original"); form.append("images", file);
      await apiFetch(`/api/projects/${created.project.id}/images`, { method: "POST", body: form });
      router.push(`/projects/${created.project.id}?analyze=1${isDemo ? "&demo=1" : ""}`);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "The project could not be created.");
    } finally { setPending(false); }
  }

  return (
    <main className="new-project-page">
      <button className="back-link" onClick={() => router.back()}><ArrowLeft size={17} /> Back to projects</button>
      {isDemo && <div className="demo-onboarding-banner"><span><Camera size={18} /></span><div><strong>Your one-redesign studio pass</strong><p>Upload one real space photo, add up to one inspiration image in the workspace, and create one complete redesign. Sign in only when you want to keep iterating.</p></div><b>1 / 1</b></div>}
      <div className="new-project-heading"><span className="kicker">{isDemo ? "Free interactive demo" : "New renovation"}</span><h1>Start with the space<br />as it is today.</h1><p>A clear, well-lit photograph gives the design brain the strongest architectural context.</p></div>
      <form className="new-project-layout" onSubmit={submit}>
        <section className="upload-stage-card">
          {preview ? (
            <div className="upload-preview"><img src={preview} alt="Selected space" /><div className="upload-preview-actions"><button type="button" className="button button-light button-sm" onClick={() => inputRef.current?.click()}><ImagePlus size={16} /> Replace</button><button type="button" className="icon-button dark" onClick={() => { setFile(null); setPreview(""); }} aria-label="Remove"><X size={17} /></button></div><span className="file-caption">{file?.name} · {formatBytes(file?.size || 0)}</span></div>
          ) : (
            <div className={`drop-zone large ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()}>
              <span className="upload-icon"><Upload size={25} /></span><h2>Drop your space here</h2><p>or use a file, photo library, or camera</p>
              <div className="upload-source-actions">
                <button type="button" className="button button-secondary"><ImagePlus size={17} /> Choose image</button>
                <button type="button" className="button button-secondary" onClick={(event) => { event.stopPropagation(); cameraRef.current?.click(); }}><Camera size={17} /> Take photo</button>
              </div>
              <small>JPEG, PNG, WebP, AVIF or GIF · max 10 MB</small><span className="camera-hint"><Camera size={15} /> Rear-camera capture is available on supported phones and tablets</span>
            </div>
          )}
          <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" onChange={(event) => choose(event.target.files?.[0])} />
          <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => choose(event.target.files?.[0])} />
        </section>
        <aside className="project-basics-card">
          <span className="step-label">Project details</span>
          <label><span>Project name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="e.g. My kitchen" /></label>
          <label><span>Space type</span><select value={roomType} onChange={(event) => setRoomType(event.target.value)}>{ROOM_TYPES.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>
          <div className="photo-tips"><strong>For the best analysis</strong><ul><li>Include the floor, walls, and ceiling where possible.</li><li>Avoid heavy filters or extreme wide-angle distortion.</li><li>Use your reference slots later for inspiration images.</li></ul></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary button-lg button-full" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={19} /> Creating project...</> : <>Create project <ArrowRight size={18} /></>}</button>
        </aside>
      </form>
    </main>
  );
}
