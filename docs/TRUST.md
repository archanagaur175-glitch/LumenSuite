# Trust & Zero-Telemetry Architecture

Lumen Suite's trust model is **enforced, not aspirational.** Every item below is a mechanism in
the running application, not a policy statement.

## 1. Network posture

- The webview CSP (`tauri.conf.json` → `app.security.csp`) contains no `https:` origin anywhere:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; frame-src 'self'; object-src 'none'; base-uri 'self'`
- `tauri-plugin-http` is **not installed**. The app cannot make arbitrary HTTP requests.
- No auto-update-checking, no updater endpoints, no crash reporters, no error-collection SDKs.
- The only remote-ish capability is `plugin-opener`, allow-listed to exactly the GitHub Releases
  URL, and it is **user-initiated only** — it opens the user's OS browser; the webview never fetches.
- CI enforces this: a workflow step fails if `analytics|sentry|posthog|mixpanel|amplitude|google-analytics`
  appears in any dependency manifest.

## 2. Capabilities allow-list (`src-tauri/capabilities/default.json`)

Granted, and nothing else:
- `dialog:allow-open`, `dialog:allow-save`, `dialog:allow-message` — native pickers.
- `fs` scoped to: paths the user chose in a dialog, and the app-data **auto-recovery cache** dir.
- `opener:allow-open-url` limited to the single releases URL.
- **Denied by default:** shell, http, process, global-shortcut, clipboard read/write, window
  mutation beyond the app's own single window.

## 3. The bundled LibreOffice process

- `soffice` is spawned by the Rust core, supervised (auto-respawn with backoff, tree-kill on exit).
- Binds **127.0.0.1 only** during the session. It has no network capability and never initiates
  outbound traffic.
- Runs with an **isolated user profile** under the app-data dir so it never touches user settings
  or other installations, and its parsing surface is contained.
- Pin: LibreOffice **≥ 26.2.3** (OOXML encryption-path CVE-2026-4430 fixed in 26.2.3/25.8.7).
  The release build verifies the exact version and SHA-256 of every downloaded archive.

### Note for Windows users (antivirus)

Lumen Suite bundles and auto-launches `soffice`, the LibreOffice core binary. Windows Defender
and third-party AV heuristics occasionally flag self-contained, auto-launched binaries — the
installer and the bundled engine carry LibreOffice's signatures, and the OS/AV may still show a
one-time prompt. What this binary actually does:

- lives inside the app installation (`<install>\libreoffice\...`), never runs from a temp dir;
- binds only to 127.0.0.1 with no network capability;
- parses documents you open — nothing else.
If a scanner flags it, mark the app folder as trusted. Report the false positive to your AV vendor.
Source and checksum records: this repo, `scripts/fetch-libreoffice.mjs`.

## 4. Transparency Dashboard (in-app)

Route: **Trust** (shield icon). Shows live:
- **Local execution** — the supervised process, its PID, loopback socket, isolated profile path.
- **Last network request** — `none` (invariant, not measured-and-reported-zero).
- **Engine version** — LibreOffice build + SHA-256 of the shipped runtime.
- **Links** — source repository, license (GPL-3.0-or-later).
- **Check GitHub Releases** — a button that opens the Releases page in the user's browser
  (user-initiated; no background update pings, ever).

## 5. Data-sovereignty invariants

- Documents, working copies and auto-recovery snapshots live only under app-data and user-picked
  paths. No cloud storage, no sync, no account.
- No fingerprinting: no unique-ID persisted for analytics, no fonts/telemetry beacons, no homepage,
  no first-run network handshake.