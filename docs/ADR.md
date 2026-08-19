# Lumen Suite — Architecture Decision Record

Status: **Accepted** (MVP scope). Each ADR records a decision, its context, and its trade-offs.

## ADR-1: Desktop shell — Tauri 2.x over Electron

**Context.** Lumen Suite must be local-first, zero-telemetry, and ship as a small, fast native app.

| Criterion | Tauri 2.x | Electron |
|---|---|---|
| Installer footprint (shell only) | a few MB | ~150 MB+ |
| Runtime memory | tens of MB (OS-native WebView) | ~200-400 MB per window |
| Network egress enforcement | Rust capability allow-list + CSP; no network plugin = no network | Everything is JS; requires OS-level firewall rules |
| Local-first fit | Structural: an un-granted capability cannot be used | Possible but fights the defaults |

**Decision.** Tauri 2.x. The capability/permission system and a strict CSP are the enforcement
mechanism for "zero unauthorized network requests". The webview renders HTML5/CSS + Canvas; no
native GTK/VCL chrome is used.

## ADR-2: Document engine — bundled headless LibreOffice over a loopback-only bridge

**Context.** We need real `.docx/.xlsx/.pptx/.odt/.ods/.odp` fidelity. Two viable paths exist.

**Path A (chosen): bundled native LibreOffice, spawned as a supervised local process.**

- LibreOffice 26.2.x is fetched at build time, verified by SHA-256, extracted into
  `src-tauri/resources/libreoffice/` and shipped via Tauri `bundle.resources`.
- The Rust core spawns `soffice` with:
  `--headless --nologo --nodefault --norestore --nolockcheck
  -env:UserInstallation=file:///<isolated-profile>
  --accept=socket,host=127.0.0.1,port=<free-port>;urp;`
- Only loopback is bound; the sidecar has no outbound network capability.
- Conversions use `--convert-to <explicit filter>` one-shots against an isolated profile,
  serialized (one instance — concurrent `soffice` on one profile fails silently).
- A python-uno broker (LibreOffice ships Python + UNO bindings) is used for health checks,
  metadata, simple apply ops and load-time recalc verification. See `docs/CONTRACT.md`.

**Path B (rejected for MVP): LibreOffice compiled to WASM.**

- Official LO WASM port still targets the Qt5 VCL backend (experimental).
- Community ports ship ~140 MB `.wasm` + ~95 MB `.data`, take 10–15 s to initialize, use
  200–300 MB RAM, and require `SharedArrayBuffer` + `COOP/COEP` cross-origin isolation.
- Fidelity for complex OOXML does not yet match the native binary.

**Trade-off accepted.** Bundle size grows dramatically (LO unpacked ≈ 1 GB) in exchange for mature
fidelity today. The WASM path is recorded as the future optimization for a zero-native-dependency
build, **not** a current capability.

**Scope honesty.** MVP fidelity = "at the level LibreOffice's native filters achieve", verified in
CI by round-trip tests on fixture files. Print Preview (LO-rendered PDF pages via pdf.js) is the
only surface where LO fidelity is guaranteed. Editing in v1 covers simple text/cell/slide ops.

## ADR-3: Calc — in-browser engine for live typing, LO only at load/save

**Context.** Routing every cell edit through an IPC round-trip to `soffice` would bound typing
latency by process IPC, undercutting the "lightning-fast" promise.

**Decision.** Live editing and recalculation run on **HyperFormula 3.4** in the webview. The LO
broker is used only for: (1) load-time recalc verification of foreign files, and (2) save/export
fidelity (the on-disk `.xlsx`/`.ods` is produced by LO filters). Type latency is bounded by JS.

**License consequence.** HyperFormula is GPL-3.0/commercial. Lumen Suite is licensed GPL-3.0-or-later
so the combination is coherent and cost-free. LibreOffice (MPL-2.0) is a separate process.

## ADR-4: File I/O — Tauri plugins with an explicit, minimal allow-list

`tauri-plugin-fs` + `tauri-plugin-dialog` + `tauri-plugin-opener` (restricted to one URL).
No `fs:default`, no broad globs, no `http:default`. The only directories with full access are
the app-data auto-recovery cache and paths the user picks in a dialog. Never a cloud bucket.

## ADR-5: Rendering surface — webview DOM + Canvas, not native chrome

Writer uses a controlled rich-text editing surface; Calc renders an HTML grid over HyperFormula;
Impress is a DOM/Canvas slide editor. The one fidelity-proof surface is Print Preview, which
renders the PDF that LibreOffice itself produced.

## Decisions with confirmed defaults

- License: **GPL-3.0-or-later** (accommodates HyperFormula; LO remains a separate MPL-2.0 process).
- macOS MVP build: **arm64** (Apple Silicon runner). Intel/universal follow-ups later.
- Fidelity claims: "high via LO filters, verified by CI round-trip tests" — never "pixel-perfect".
