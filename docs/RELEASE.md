# Release Guide

Everything here is automated in `.github/workflows/release.yml` on GitHub-hosted runners. This
document explains what the workflow does and what manual steps remain for maintainers.

## Trigger

Pushing a tag matching `v*` to `main` triggers the release workflow. Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## What the workflow does

1. **Matrix**: `ubuntu-latest`, `macos-latest` (arm64), `windows-latest`.
2. **LibreOffice**: downloads the pinned version from `download.documentfoundation.org`
   (`scripts/fetch-libreoffice.mjs`), verifies SHA-256, extracts, slims the runtime
   (`scripts/package-libreoffice.mjs` — strips langpacks/help/non-en-US UI).
3. **Quality**: `npm ci`, lint, typecheck, tests, `cargo fmt --check`, `cargo clippy -D warnings`,
   `cargo test`, dependency telemtry-audit.
4. **Build**: `npm run build` + `tauri build` via `tauri-apps/tauri-action` → creates/updates the
   GitHub Release for the tag and uploads installers (NSIS .exe, .app/.dmg, AppImage/.deb).
5. **Fidelity gate**: `scripts/smoke-convert.mjs` runs round-trip tests against the built runtime:
   ODF → docx → ODF, ODF → xlsx → ODF, ODF → pptx → ODF, and PDF export, asserting table cells,
   formula strings, style names and layout-critical props survive. Gates on linux + windows;
   **logs, non-blocking on macOS** (headless flakiness; see Risks).
6. Logs are uploaded as workflow artifacts.

## Manual steps a maintainer must take (opencode will never fabricate credentials)

1. **Windows code signing**: add secrets `WINDOWS_CERTIFICATE` (base64 .pfx) and
   `WINDOWS_CERTIFICATE_PASSWORD` (or a WHISPER / Azure trusted-signing identity). Without them the
   installer ships unsigned; SmartScreen will warn. Best-effort: the workflow already signs when
   the secrets are present.
2. **macOS signing + notarization**: add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
   `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (requires a paid Apple
   Developer account). Without them the app ships unsigned and Gatekeeper will require
   right-click → Open.
3. **Linux**: unsigned AppImage/.deb by default — fine.

## Risks called out in `docs/ADR.md` and `docs/RELEASE.md`

- macOS headless `soffice` can abort in background processes (isolated profile + non-interactive
  flags mitigate; the fidelity gate is non-blocking there).
- Bundled auto-launched `soffice.exe` may trip AV heuristics — see `docs/TRUST.md` for the
  user-facing explanation.

## Versioning

`package.json` version and the git tag should match. The workflow reads the tag for the release
number. Bumps are manual and documented in release notes.