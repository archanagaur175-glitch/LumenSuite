import { useEffect, useState } from "react";
import { useApp, useActiveTab } from "./core/store";
import { Titlebar } from "./components/Titlebar";
import { Tabs } from "./components/Tabs";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { TrustDashboard } from "./components/TrustDashboard";
import { PreviewModal } from "./components/PreviewModal";
import { Toasts } from "./components/Toasts";
import { Welcome } from "./components/Welcome";
import { WriterCanvas } from "./modules/WriterCanvas";
import { CalcCanvas } from "./modules/CalcCanvas";
import { ImpressCanvas } from "./modules/ImpressCanvas";

export function App() {
  const { state, setPalette, openDoc, dismissNotices } = useApp();
  const { tab, doc } = useActiveTab();
  const [engineHint, setEngineHint] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(!state.paletteOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openDoc();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.paletteOpen, setPalette, openDoc]);

  useEffect(() => {
    const s = state.engine;
    if (!s.engineAvailable) {
      setEngineHint("Engine not bundled — limited preview. Install the app for full save/export.");
    } else if (s.degraded) {
      setEngineHint(s.degradedReason ?? "Engine degraded");
    } else {
      setEngineHint(null);
    }
  }, [state.engine]);

  return (
    <div className="app">
      <Titlebar />
      <Tabs />
      <main className="canvas-host">
        {tab && doc ? (
          tab.kind === "writer" ? (
            <WriterCanvas tabId={tab.id} doc={doc} />
          ) : tab.kind === "calc" ? (
            <CalcCanvas tabId={tab.id} doc={doc} />
          ) : (
            <ImpressCanvas tabId={tab.id} doc={doc} />
          )
        ) : (
          <Welcome />
        )}
      </main>
      <StatusBar hint={engineHint} />
      <CommandPalette />
      <TrustDashboard />
      <PreviewModal />
      <Toasts />
      <button
        className="notices-dismiss"
        aria-label="Dismiss notices"
        onClick={dismissNotices}
        style={{ display: state.notices.length ? undefined : "none" }}
      />
    </div>
  );
}