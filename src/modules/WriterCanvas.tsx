import React, { useState } from "react";
import type { DocModel, WriterBlock, WriterDoc } from "../core/types";
import { useApp } from "../core/store";
import { uid } from "../core/model";
import * as ld from "lucide-react";

const BLOCK_TYPES = [
  { t: "p" as const, label: "Body" },
  { t: "h1" as const, label: "H1" },
  { t: "h2" as const, label: "H2" },
  { t: "h3" as const, label: "H3" },
  { t: "ul" as const, label: "Bullet" },
];

export function WriterCanvas({ tabId, doc }: { tabId: string; doc: DocModel }) {
  const { updateDoc } = useApp();
  const w = doc as WriterDoc;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [savedSel, setSavedSel] = useState<{ blockId: string; start: number; end: number } | null>(null);

  const mutate = (next: WriterDoc) => updateDoc(tabId, next);

  const patchBlock = (id: string, patch: Partial<WriterBlock>) => {
    mutate({ ...w, blocks: w.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  };

  const setType = (b: WriterBlock, type: WriterBlock["type"]) => patchBlock(b.id, { type });

  const setStyle = (b: WriterBlock, key: "bold" | "italic") => patchBlock(b.id, { [key]: !b[key] });

  const onInput = (b: WriterBlock, el: HTMLDivElement) => {
    const text = el.innerText ?? "";
    if (text !== b.text) patchBlock(b.id, { text });
  };

  const onKeyDown = (b: WriterBlock, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const idx = w.blocks.findIndex((x) => x.id === b.id);
      const nb: WriterBlock = { id: uid("b"), type: b.type === "ul" ? "ul" : "p", text: "" };
      const blocks = [...w.blocks.slice(0, idx + 1), nb, ...w.blocks.slice(idx + 1)];
      mutate({ ...w, blocks });
      setFocusId(nb.id);
      setSavedSel({ blockId: nb.id, start: 0, end: 0 });
    }
  };

  const onBlurCapture = (el: HTMLDivElement) => {
    let start = 0;
    let end = 0;
    try {
      const sel = window.getSelection();
      const range = sel?.getRangeAt(0);
      if (range && el.contains(range.startContainer)) {
        const pre = range.cloneRange();
        pre.selectNodeContents(el);
        pre.setEnd(range.startContainer, range.startOffset);
        start = pre.toString().length;
        end = start + range.toString().length;
      }
    } catch {
      /* selection unavailable */
    }
    setSavedSel({ blockId: el.id.replace("wb-", ""), start, end });
  };

  const focusBlock = (id: string) => {
    setFocusId(id);
    const t = savedSel?.blockId === id ? savedSel : null;
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`wb-${id}`);
      if (!el) return;
      el.focus();
      if (t) {
        const r = document.createRange();
        const tn = el.firstChild ?? el;
        try {
          r.setStart(tn, Math.min(t.start, (tn.textContent ?? "").length));
          r.setEnd(tn, Math.min(t.end, (tn.textContent ?? "").length));
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(r);
        } catch {
          /* fallthrough */
        }
      }
    });
  };

  return (
    <div className="module">
      <div className="module-toolbar">
        <div className="tool-group">
          <label className="tool-label">Block</label>
          <select
            className="tool-select"
            value={focusId ? (w.blocks.find((b) => b.id === focusId)?.type ?? "p") : "p"}
            onChange={(e) => {
              const b = w.blocks.find((x) => x.id === focusId);
              if (b) setType(b, e.target.value as WriterBlock["type"]);
            }}
          >
            {BLOCK_TYPES.map((bt) => (
              <option key={bt.t} value={bt.t}>{bt.label}</option>
            ))}
          </select>
        </div>
        <div className="tool-group">
          <button
            className="tb-btn"
            title="Bold"
            onClick={() => {
              const b = w.blocks.find((x) => x.id === focusId);
              if (b) setStyle(b, "bold");
            }}
          >
            <ld.Bold size={14} strokeWidth={1.9} />
          </button>
          <button
            className="tb-btn"
            title="Italic"
            onClick={() => {
              const b = w.blocks.find((x) => x.id === focusId);
              if (b) setStyle(b, "italic");
            }}
          >
            <ld.Italic size={14} strokeWidth={1.9} />
          </button>
        </div>
      </div>
      <div className="doc-scroll">
        <div className="paper" onClick={() => focusBlock(w.blocks[0]?.id ?? "")}>
          {w.blocks.map((b) => (
            <div
              key={b.id}
              id={`wb-${b.id}`}
              className={`block block-${b.type} ${b.bold ? "block-bold" : ""} ${b.italic ? "block-italic" : ""}`}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onInput={(e) => onInput(b, e.currentTarget)}
              onKeyDown={(e) => onKeyDown(b, e)}
              onFocus={() => setFocusId(b.id)}
              onBlur={(e) => onBlurCapture(e.currentTarget)}
              onPointerDown={() => setFocusId(b.id)}
            >
              {b.text}
            </div>
          ))}
        </div>
      </div>
      <div className="module-caption">
        {w.blocks.length} block{w.blocks.length === 1 ? "" : "s"} · plain-text blocks with whole-block formatting
      </div>
    </div>
  );
}