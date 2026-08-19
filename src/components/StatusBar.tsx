import { useApp } from "../core/store";
import * as lucide from "lucide-react";

export function StatusBar({ hint }: { hint: string | null }) {
  const { state, refreshEngine, startEngine } = useApp();
  const e = state.engine;

  const statusColor = !e.engineAvailable
    ? "status-red"
    : e.degraded
      ? "status-amber"
      : "status-green";

  const label = !e.engineAvailable
    ? "Engine unavailable"
    : e.running
      ? e.loVersion
        ? `LibreOffice ${e.loVersion}`
        : "Engine running"
      : "Engine idle";

  return (
    <footer className="statusbar">
      <div className="status-group">
        <div
          className={`status-dot ${statusColor}`}
          title={hint ?? label}
          onClick={() => {
            if (!e.running && e.engineAvailable) void startEngine();
            else void refreshEngine();
          }}
        />
        <span className="status-label">{label}</span>
        {e.running && e.pid != null && <span className="status-pid">pid {e.pid}</span>}
        {hint && <span className="status-hint" title={hint}>{hint}</span>}
      </div>
      <div className="status-group">
        {state.saveBusy && (
          <span className="status-save">
            <lucide.Loader2 size={12} className="spin" />
            {state.savingCount && state.savingCount > 1 ? `Saving… ${state.savingCount} queued` : "Saving…"}
          </span>
        )}
        <span className="status-net">
          <lucide.WifiOff size={12} strokeWidth={1.75} />
          No network
        </span>
        <span className="status-ver">v0.1.0</span>
      </div>
    </footer>
  );
}