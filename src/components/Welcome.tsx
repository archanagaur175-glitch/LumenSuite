import { useApp } from "../core/store";
import type { DocKind } from "../core/types";
import * as lucide from "lucide-react";

const EXAMPLES: Array<{
  kind: DocKind;
  label: string;
  Icon: typeof lucide.FileText;
  desc: string;
}> = [
  { kind: "writer", label: "Writer", Icon: lucide.FileText, desc: "Plain-text documents" },
  { kind: "calc", label: "Calc", Icon: lucide.Grid3x3, desc: "Spreadsheets & formulas" },
  { kind: "impress", label: "Impress", Icon: lucide.Presentation, desc: "Slide decks" },
];

export function Welcome() {
  const { newDoc, openDoc } = useApp();

  return (
    <div className="welcome">
      <div className="welcome-logo">
        <span className="logo-dot" aria-hidden="true" />
        <span>Lumen Suite</span>
      </div>
      <h1>What are we making today?</h1>
      <p className="welcome-sub">
        Local-first, ad-free, private. Everything is saved on this device.
      </p>
      <div className="welcome-cards">
        {EXAMPLES.map(({ kind, label, Icon, desc }) => (
          <button key={kind} className="welcome-card" onClick={() => void newDoc(kind)}>
            <Icon size={22} strokeWidth={1.5} />
            <strong>{label}</strong>
            <span>{desc}</span>
          </button>
        ))}
      </div>
      <button className="btn ghost" onClick={() => void openDoc()}>
        <lucide.FolderOpen size={15} strokeWidth={1.75} />
        Open an existing document
      </button>
    </div>
  );
}