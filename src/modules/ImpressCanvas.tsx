import { useState } from "react";
import type { DocModel, ImpressDoc, ImpressSlide } from "../core/types";
import { useApp } from "../core/store";
import { uid } from "../core/model";
import * as ld from "lucide-react";

export function ImpressCanvas({ tabId, doc }: { tabId: string; doc: DocModel }) {
  const { updateDoc } = useApp();
  const p = doc as ImpressDoc;
  const [selIdx, setSelIdx] = useState(0);
  const slide = p.slides[selIdx] ?? null;

  const mutate = (next: ImpressDoc) => updateDoc(tabId, next);

  const addSlide = () => {
    const s: ImpressSlide = { id: uid("s"), title: `Slide ${p.slides.length + 1}`, body: "" };
    mutate({ ...p, slides: [...p.slides, s] });
    setSelIdx(p.slides.length);
  };

  const removeSlide = (idx: number) => {
    if (p.slides.length <= 1) return;
    const slides = p.slides.filter((_, i) => i !== idx);
    mutate({ ...p, slides });
    setSelIdx(Math.max(0, Math.min(idx, slides.length - 1)));
  };

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const slides = [...p.slides];
    const target = idx + dir;
    if (target < 0 || target >= slides.length) return;
    [slides[idx], slides[target]] = [slides[target], slides[idx]];
    mutate({ ...p, slides });
    setSelIdx(target);
  };

  const patchSlide = (idx: number, patch: Partial<ImpressSlide>) => {
    mutate({ ...p, slides: p.slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  };

  return (
    <div className="module impress">
      <div className="module-toolbar">
        <div className="tool-group">
          <button className="tb-btn" onClick={addSlide}>
            <ld.Plus size={14} /> Add slide
          </button>
          {p.slides.length > 1 && (
            <>
              <button className="tb-btn icon-only" title="Move up" onClick={() => moveSlide(selIdx, -1)}>
                <ld.ArrowUp size={14} />
              </button>
              <button className="tb-btn icon-only" title="Move down" onClick={() => moveSlide(selIdx, 1)}>
                <ld.ArrowDown size={14} />
              </button>
              <button className="tb-btn icon-only danger" title="Delete slide" onClick={() => removeSlide(selIdx)}>
                <ld.Trash2 size={14} />
              </button>
            </>
          )}
        </div>
        <div className="tool-group">
          <span className="tool-label">{p.slides.length} slide{p.slides.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className="impress-body">
        <aside className="slide-list">
          {p.slides.map((s, i) => (
            <button
              key={s.id}
              className={`slide-thumb ${i === selIdx ? "active" : ""}`}
              onClick={() => setSelIdx(i)}
            >
              {s.title || `Slide ${i + 1}`}
            </button>
          ))}
        </aside>
        <div className="slide-stage">
          {slide ? (
            <div className="slide-card">
              <div className="slide-card-title">
                <input
                  className="slide-title-input"
                  value={slide.title}
                  placeholder="Title"
                  onChange={(e) => patchSlide(selIdx, { title: e.target.value })}
                />
              </div>
              <div className="slide-card-body">
                <textarea
                  className="slide-body-input"
                  value={slide.body}
                  placeholder="Body text"
                  rows={6}
                  onChange={(e) => patchSlide(selIdx, { body: e.target.value })}
                />
              </div>
              <div className="slide-card-notes">
                <label className="tool-label">Speaker notes</label>
                <textarea
                  className="slide-notes-input"
                  value={slide.notes ?? ""}
                  placeholder="Notes (not shown in output)"
                  rows={3}
                  onChange={(e) => patchSlide(selIdx, { notes: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="slide-empty">
              <button className="btn" onClick={addSlide}>Add your first slide</button>
            </div>
          )}
        </div>
      </div>
      <div className="module-caption">
        MVP editor: one title + body + notes per slide · layout is fixed by the bundled LibreOffice
        template on export
      </div>
    </div>
  );
}