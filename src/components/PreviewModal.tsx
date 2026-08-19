import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../core/store";
import * as ld from "lucide-react";

export function PreviewModal() {
  const { state, closePreview } = useApp();
  const preview = state.preview;
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  const close = useCallback(() => {
    cancelRef.current = true;
    const el = containerRef.current;
    if (el) el.innerHTML = "";
    closePreview();
  }, [closePreview]);

  useEffect(() => {
    if (!preview || !preview.pdfUrl) return;
    let disposed = false;
    cancelRef.current = false;
    setError(null);

    const path = preview.pdfUrl;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const fs = await import("@tauri-apps/plugin-fs");
        let bytes: Uint8Array;
        if (state.engine.engineAvailable) {
          bytes = await fs.readFile(path);
        } else {
          const resp = await fetch(path);
          bytes = new Uint8Array(await resp.arrayBuffer());
        }
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        if (disposed || cancelRef.current) return;
        const el = containerRef.current;
        if (!el) return;
        for (let i = 1; i <= pdf.numPages; i++) {
          if (disposed || cancelRef.current) return;
          const pg = await pdf.getPage(i);
          const viewport = pg.getViewport({ scale: 1.6 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await pg.render({ canvas, viewport }).promise;
          const holder = document.createElement("div");
          holder.className = "pdf-page";
          holder.appendChild(canvas);
          el.appendChild(holder);
        }
      } catch (err) {
        if (!disposed) setError((err as Error).message);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [preview, state.engine.engineAvailable]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, preview]);

  if (!preview) return null;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="panel preview-panel">
        <header className="panel-header">
          <h2>Print preview</h2>
          <div className="panel-header-tools">
            <button className="tb-btn icon-only" onClick={close} aria-label="Close">
              <ld.X size={15} />
            </button>
          </div>
        </header>
        {error ? (
          <div className="preview-error">{error}</div>
        ) : (
          <div className="preview-scroll" ref={containerRef} />
        )}
      </div>
    </div>
  );
}