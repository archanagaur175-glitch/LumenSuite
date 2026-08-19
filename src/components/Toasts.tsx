import { useApp } from "../core/store";
import * as lucide from "lucide-react";

export function Toasts() {
  const { state, dismissNotices } = useApp();

  if (state.notices.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {state.notices.map((n, i) => (
        <div key={`${i}-${n}`} className="toast">
          <lucide.AlertTriangle size={14} strokeWidth={1.75} className="toast-icon" />
          <span>{n}</span>
          <button className="tb-btn icon-only" onClick={dismissNotices} aria-label="Dismiss">
            <lucide.X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}