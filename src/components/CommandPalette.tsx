import { useEffect, useRef, useState } from "react";
import { useApp } from "../core/store";

interface CmdEntry {
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const { state, setPalette, setTrust, newDoc, openDoc, showPreview, saveDoc, saveAs, refreshEngine, startEngine } = useApp();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tab = state.tabs.find((t) => t.id === state.activeId);

  useEffect(() => {
    if (state.paletteOpen) {
      setQuery("");
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [state.paletteOpen]);

  if (!state.paletteOpen) return null;

  const run = (fn: () => void) => {
    setPalette(false);
    fn();
  };

  const cmds: CmdEntry[] = [
    { label: "New Writer document", run: () => run(() => void newDoc("writer")) },
    { label: "New Calc spreadsheet", run: () => run(() => void newDoc("calc")) },
    { label: "New Impress presentation", run: () => run(() => void newDoc("impress")) },
    { label: "Open document…", hint: "Ctrl+O", run: () => run(() => void openDoc()) },
  ];
  if (tab) {
    cmds.push({ label: "Save", hint: "Ctrl+S", run: () => run(() => void saveDoc(tab.id)) });
    cmds.push({ label: "Save As…", run: () => run(() => void saveAs(tab.id)) });
    cmds.push({ label: "Print preview (PDF)", run: () => run(() => void showPreview(tab.id)) });
  }
  if (state.engine.engineAvailable) {
    cmds.push({ label: "Start engine", run: () => run(() => void startEngine()) });
  }
  cmds.push({ label: "Refresh engine status", run: () => run(() => void refreshEngine()) });
  cmds.push({ label: "Trust dashboard", run: () => run(() => setTrust(true)) });

  const q = query.trim().toLowerCase();
  const filtered = cmds.filter((c) => (c.label + " " + (c.hint ?? "")).toLowerCase().includes(q));

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setPalette(false)}>
      <div className="palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPalette(false);
            if (e.key === "Enter" && filtered[0]) filtered[0].run();
          }}
        />
        <div className="palette-list">
          {filtered.map((c) => (
            <button key={c.label} className="menu-item palette-item" onClick={c.run}>
              <span>{c.label}</span>
              {c.hint && <span className="palette-hint">{c.hint}</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="palette-empty">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}