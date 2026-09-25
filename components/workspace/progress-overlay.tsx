"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, X } from "lucide-react";

const stages: Record<string, string[]> = {
  analysis: ["Reading visible architecture", "Identifying materials and objects", "Mapping opportunities and constraints"],
  plan: ["Interpreting your direction", "Composing materials and palette", "Structuring the renovation sequence"],
  generate: ["Preparing a structure-aware edit", "Preserving geometry and perspective", "Rendering materials and light", "Storing the new version"],
  edit: ["Reading the current version", "Isolating the requested change", "Keeping everything else consistent", "Storing the next version"],
  budget: ["Reading the renovation scope", "Allocating estimate ranges", "Adding assumptions and contingency"],
  products: ["Reading the design language", "Building product categories", "Writing useful search specifications"],
  color: ["Sampling the visible surface", "Accounting for light and white balance", "Estimating a color range"],
  question: ["Reviewing the project context", "Inspecting the current image", "Preparing a grounded answer"],
};

export function ProgressOverlay({ task, startedAt, onCancel }: { task: string; startedAt: number; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const timer = setInterval(() => setElapsed(Date.now() - startedAt), 500); return () => clearInterval(timer); }, [startedAt]);
  const list = stages[task] || ["Working on your request"];
  const index = Math.min(Math.floor(elapsed / 7500), list.length - 1);
  const title = useMemo(() => task === "generate" ? "Generating your redesigned space..." : task === "edit" ? "Editing this design..." : task === "analysis" ? "Analyzing your space..." : task === "plan" ? "Creating your renovation plan..." : "Working with your project...", [task]);
  return (
    <div className="progress-overlay">
      <div className="progress-orbit"><span /><i /><LoaderCircle size={29} /></div>
      <h3>{title}</h3>
      <p>{list[index]}</p>
      <div className="progress-track"><span style={{ width: `${Math.min(92, 18 + (elapsed / (task === "generate" || task === "edit" ? 90000 : 45000)) * 74)}%` }} /></div>
      <small>{Math.floor(elapsed / 1000)}s elapsed · real provider request</small>
      <button className="text-button light-text" onClick={onCancel}><X size={14} /> Stop waiting</button>
    </div>
  );
}
