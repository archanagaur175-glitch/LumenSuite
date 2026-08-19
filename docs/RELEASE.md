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
   (`scripts/fetch-libreoffice.mjs`), extracts it (msiexec admin-install on Windows, hdiutil on
   macOS, tar+ar/dpkg merge on Linux), computes and logs SHA-256 + size, then slims the runtime
   (`scripts/package-libreoffice.mjs` — strips help/examples/templates/gallery/python).
3. **Engine gate**: `scripts/smoke-convert.mjs` runs against the actual extracted runtime:
   Writer → docx/odt/pdf, Calc → xlsx/ods/pdf (incl. a formula cell), Impress → pptx/odp/pdf.
   The job fails if any conversion does not produce a non-empty output file.
4. **Quality**: `npm ci`, typecheck, lint, tests, `cargo clippy -D warnings` (runs on the same
   job against the packaged tree).
5. **Build**: `npm run build` + `npm run tauri build` — resolves `bundle.resources` globs
   (`resources/libreoffice/**`) so the runtime ships inside every installer.
6. **Upload**: a `release` job downloads each platform artifact and publishes a GitHub Release
   with `softprops/action-gh-release` (files: installers `.msi`/`.dmg`/`.deb`/`.rpm`/`.AppImage`).
7. Logs are available on each workflow run.

## Manual steps a maintainer must take (opencode will never fabricate credentials)

1. **Windows code signing**: add secrets `WINDOWS_CERTIFICATE` (base64 .pfx) and
   `WINDOWS_CERTIFICATE_PASSWORD` (or a WHISPER / Azure trusted-signing identity). Without them the
   installer ships unsigned; SmartScreen will warn.
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