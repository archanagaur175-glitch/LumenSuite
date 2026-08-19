import { useApp } from "../core/store";
import * as lucide from "lucide-react";
import type { DocKind } from "../core/types";

const KIND_ICON: Record<DocKind, typeof lucide.FileText> = {
  writer: lucide.FileText,
  calc: lucide.Grid3x3,
  impress: lucide.Presentation,
};

export function Tabs() {
  const { state, activate, closeTab, setPalette } = useApp();

  return (
    <div className="tabs" role="tablist" aria-label="Open documents">
      {state.tabs.map((t) => {
        const Icon = KIND_ICON[t.kind];
        const active = t.id === state.activeId;
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={active}
            className={`tab ${active ? "active" : ""}`}
            onClick={() => activate(t.id)}
          >
            <Icon size={13} strokeWidth={1.75} className="tab-icon" />
            <span className="tab-title">{t.title}</span>
            {t.dirty && <span className="tab-dirty" title="Unsaved changes">●</span>}
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
            >
              <lucide.X size={13} strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
      <button className="tb-btn icon-only tabs-palette" title="Command palette (Ctrl+K)" onClick={() => setPalette(true)}>
        <lucide.Command size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}