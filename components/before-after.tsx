"use client";

import { useId, useRef, useState } from "react";
import { ArrowLeftRight, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { clamp, cn } from "@/lib/utils";

export function BeforeAfter({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  className,
  controls = false,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  controls?: boolean;
}) {
  const [position, setPosition] = useState(52);
  const [mode, setMode] = useState<"compare" | "before" | "after">("compare");
  const [zoom, setZoom] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = useId();

  function move(clientX: number) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  }

  const visiblePosition = mode === "before" ? 100 : mode === "after" ? 0 : position;
  return (
    <div className={cn("comparison-shell", className)}>
      {controls && (
        <div className="comparison-toolbar">
          <div className="segmented" role="group" aria-label="Comparison mode">
            {(["before", "compare", "after"] as const).map((value) => (
              <button key={value} onClick={() => setMode(value)} className={mode === value ? "active" : ""}>
                {value === "compare" ? "Before ↔ After" : value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <div className="tool-actions">
            <button className="icon-button" onClick={() => setZoom(clamp(zoom - 0.1, 1, 2))} aria-label="Zoom out"><ZoomOut size={17} /></button>
            <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
            <button className="icon-button" onClick={() => setZoom(clamp(zoom + 0.1, 1, 2))} aria-label="Zoom in"><ZoomIn size={17} /></button>
            <button className="icon-button" onClick={() => rootRef.current?.requestFullscreen?.()} aria-label="Fullscreen"><Maximize2 size={17} /></button>
          </div>
        </div>
      )}
      <div
        ref={rootRef}
        className={cn("comparison", mode !== "compare" && "comparison-static")}
        onPointerDown={(event) => { if (mode === "compare") { event.currentTarget.setPointerCapture(event.pointerId); move(event.clientX); } }}
        onPointerMove={(event) => { if (mode === "compare" && event.currentTarget.hasPointerCapture(event.pointerId)) move(event.clientX); }}
        style={{ "--position": `${visiblePosition}%`, "--zoom": zoom } as React.CSSProperties}
        aria-labelledby={label}
      >
        <span className="sr-only" id={label}>Interactive before and after comparison</span>
        <img src={after} alt={`${afterLabel} redesign`} draggable={false} className="comparison-img after-img" />
        <img
          src={before}
          alt={`${beforeLabel} space`}
          draggable={false}
          className="comparison-img before-img"
          style={{ clipPath: `inset(0 ${100 - visiblePosition}% 0 0)` }}
        />
        <span className="image-badge badge-before">{beforeLabel}</span>
        <span className="image-badge badge-after">{afterLabel}</span>
        {mode === "compare" && (
          <div className="comparison-handle" aria-hidden="true">
            <span><ArrowLeftRight size={18} /></span>
          </div>
        )}
      </div>
    </div>
  );
}
