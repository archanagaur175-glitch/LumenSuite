import { useApp } from "../core/store";

const RULES: Array<{ title: string; body: string; ok: boolean }> = [
  { title: "No network egress", body: "The app performs no network requests. Status bar always shows “No network”. HTTP is only ever client-to-localhost IPC.", ok: true },
  { title: "No telemetry", body: "No analytics, crash reporters, or usage tracking. Releases are installed by you, and the only external URL we open is the GitHub releases page — and only when you click “Check releases”.", ok: true },
  { title: "No accounts", body: "There is no account system, no login, and no sync. All documents live on your device.", ok: true },
  { title: "No ads", body: "Nothing in this app is ad-supported and there is no content tracking.", ok: true },
  { title: "Documents stay local", body: "Conversion and rendering are performed by the bundled LibreOffice engine on your machine. Nothing is uploaded.", ok: true },
  { title: "Capability allow-list", body: "The Tauri capability file grants only dialog, filesystem (restricted to paths you pick and the recovery folder), and a single opener URL.", ok: true },
  { title: "CSP is strict", body: "Content-Security-Policy allows only self-references, data: URIs, and local IPC. No remote scripts, frames, or objects.", ok: true },
  { title: "Auto-recovery stays on disk", body: "Recovery copies are written into the app's isolated recovery folder so your work is never silently lost. You can delete them anytime.", ok: true },
];

export function TrustDashboard() {
  const { state, setTrust, openDoc, checkReleases } = useApp();

  if (!state.trustOpen) return null;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setTrust(false)}>
      <div className="panel trust-panel">
        <header className="panel-header">
          <h2>Trust dashboard</h2>
          <button className="tb-btn icon-only" onClick={() => setTrust(false)} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="trust-intro">
          Lumen Suite is designed so that as much as possible happens on your device. Here is the
          verified guarantee set for this build:
        </p>
        <ul className="trust-list">
          {RULES.map((r) => (
            <li key={r.title} className="trust-item">
              <span className="trust-badge ok">✓</span>
              <div>
                <strong>{r.title}</strong>
                <p>{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="panel-footer">
          <button className="btn" onClick={() => void openDoc()}>Open a document</button>
          <button className="btn ghost" onClick={() => void checkReleases()}>Check releases</button>
        </div>
      </div>
    </div>
  );
}