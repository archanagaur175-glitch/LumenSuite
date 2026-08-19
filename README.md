# Lumen Suite

A stunning, lightning-fast, **ad-free**, **privacy-first**, **open-source** office productivity suite.
Writer, Calc and Impress in one tabbed app — with real document fidelity powered by a bundled
headless LibreOffice engine, and zero telemetry, zero accounts, zero network by default.

> **Local-first by construction.** Your documents never leave your machine. The bundled
> LibreOffice process binds only to `127.0.0.1`, has no network capability, and the app ships
> with an empty outbound-request allow-list.

## Features (MVP)

- **Unified Canvas** — one app, tabbed Writer / Calc / Impress, context-aware toolbars and a
  search-first command palette (`Ctrl/Cmd + K`).
- **Real Interop** — open, save and export `.docx`, `.xlsx`, `.pptx`, `.odt`, `.ods`, `.odp`
  and PDF through a bundled headless LibreOffice 26.2.x engine. Fidelity is verified in CI via
  round-trip tests on fixture files. **Print Preview shows true LibreOffice rendering.**
- **Lightning-fast Calc** — live editing runs on an in-browser engine (HyperFormula); LibreOffice
  is only used for load-time recalc verification and save/export fidelity, so typing never waits
  on a background process.
- **Local-First & Privacy** — native Open/Save dialogs, app-local auto-recovery cache, no forced
  accounts, full data sovereignty.
- **Trust Dashboard** — shows live local-execution status, the sidecar's loopback socket, the
  "last network request = none" invariant, engine version, source link and license.
- **Modern UI** — Inter type scale, spacing system, color tokens, dark/light modes, Lucide icons,
  smooth motion. No ads. No paywalls. Ever.

## Honest fidelity statement

"Fidelity" in v1 means *at the level LibreOffice's native filters achieve* — which is high, but
not pixel-perfect on the most complex corporate `.docx`/`.xlsx` files. Editing in v1 covers
simple text / cell / slide operations. The one surface where LibreOffice fidelity is guaranteed
is **Print Preview** (LibreOffice-rendered PDF pages).

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2.x (Rust core, OS-native WebView) |
| UI | React 19 + TypeScript + Vite, Lucide icons, CSS design tokens |
| Calc engine | HyperFormula 3.4 (in-browser, GPL-3.0) |
| Document engine | Bundled headless LibreOffice 26.2.x (`soffice`), supervised by the Rust core over a loopback-only UNO socket + CLI convert |
| Fidelity | LO PDF render via pdf.js in Print Preview |
| CI/CD | GitHub Actions only — lint/typecheck/test on push, cross-platform build & release on tag |

## Repository layout

```
src/             React/TS webview app (Writer / Calc / Impress modules)
src-tauri/       Rust core: sidecar supervisor, convert pipeline, UNO broker bridge
src-tauri/resources/libreoffice/   LibreOffice runtime (fetched, never committed)
scripts/         fetch-libreoffice, package-libreoffice, smoke-convert
docs/            ADR.md, CONTRACT.md, TRUST.md, RELEASE.md
.github/workflows/  ci.yml (quality gates), release.yml (build + release on tag)
```

## Building from source

Prerequisites: [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS,
Node 20+, Rust stable.

```bash
npm install
npm run fetch:lo        # downloads + extracts bundled LibreOffice for dev
npm run tauri dev
```

## Why is LibreOffice bundled inside the app?

See `docs/TRUST.md` — including a note for Windows users about antivirus heuristics and the
checksums/paths of the bundled engine.

## License

GPL-3.0-or-later. LibreOffice is distributed as a separate process (MPL-2.0). HyperFormula
bundles under GPL-3.0. See `LICENSE`.
