import { useApp } from "../core/store";
import * as lucide from "lucide-react";

const MODULES = [
  { kind: "writer", label: "Writer", Icon: lucide.FileText },
  { kind: "calc", label: "Calc", Icon: lucide.Grid3x3 },
  { kind: "impress", label: "Impress", Icon: lucide.Presentation },
] as const;

export function Titlebar() {
  const { state, newDoc, openDoc, setTheme, setTrust } = useApp();

  const blank = (kind: (typeof MODULES)[number]["kind"]) => {
    void newDoc(kind);
  };

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="logo-dot" aria-hidden="true" />
        <span className="brand-name">Lumen Suite</span>
      </div>
      <div className="titlebar-actions">
        <details className="new-menu">
          <summary title="New document">New</summary>
          <div className="new-menu-pop">
            {MODULES.map(({ kind, label, Icon }) => (
              <button key={kind} className="menu-item" onClick={() => blank(kind)}>
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>
        </details>
        <button
          className="tb-btn"
          title="Open… (Ctrl+O)"
          onClick={() => void openDoc()}
        >
          <lucide.FolderOpen size={15} strokeWidth={1.75} />
          <span>Open</span>
        </button>
        <button
          className="tb-btn"
          title="Trust dashboard"
          onClick={() => setTrust(true)}
        >
          <lucide.ShieldCheck size={15} strokeWidth={1.75} />
          <span>Trust</span>
        </button>
        <button
          className="tb-btn icon-only"
          title={state.theme === "dark" ? "Light theme" : "Dark theme"}
          onClick={() => setTheme(state.theme === "dark" ? "light" : "dark")}
        >
          {state.theme === "dark" ? (
            <lucide.Sun size={15} strokeWidth={1.75} />
          ) : (
            <lucide.Moon size={15} strokeWidth={1.75} />
          )}
        </button>
      </div>
    </header>
  );
}