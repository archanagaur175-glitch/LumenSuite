# LibreOffice Bridge — Request/Response Contract

This document is the contract between the Tauri Rust core and the bundled headless LibreOffice
process. It is versioned with the code; changes require a docs review.

## 1. Runtime topology

```
┌──────────────────────────────┐   invoke (JSON)   ┌──────────────────────────────┐
│ React/TS webview (UI)        │ ────────────────▶ │ Rust core (Tauri commands)    │
└──────────────────────────────┘                   └──────────────┬───────────────┘
                                                                  │ supervision,
                                                                  │ spawn/kill,
                                                                  │ serialized convert queue,
                                                                  │ stdout protocol
                                        ┌─────────────────────────▼───────────────┐
                                        │ soffice (headless, loopback-only)        │
                                        │   ┌────────────┐    ┌─────────────────┐  │
                                        │   │ UNO socket │◀──▶│ python-uno broker│  │
                                        │   │ 127.0.0.1  │    │ (stdlib JSON)   │  │
                                        │   └────────────┘    └─────────────────┘  │
                                        └─────────────────────────────────────────┘
```

- The UNO socket is bound to **127.0.0.1 only**, on a dynamically selected free port.
- The broker is spawned by the Rust core with the correct interpreter per platform, talks JSON
  over stdio, and connects to the UNO socket. It never binds a port itself.
- One `soffice` instance per app. All work is **serialized** through one queue.

## 2. python-uno bootstrapping (read this before touching the broker)

The most common cross-platform failure in LO automation is the UNO module not being importable.

**Interpreter discovery, per platform:**
- Windows: `<bundle>/libreoffice/program/python.exe`
- macOS: `<bundle>/libreoffice/LibreOffice.app/Contents/Resources/python` (check `program/` too)
- Linux: system `python3` with `PYTHONPATH` pointing at the extracted `<program>` dir; if that
  fails, use `<bundle>/libreoffice/program/python` if present.

**Environment variables that must be set for the broker to import `uno`:**
- Windows: `PYTHONPATH=<program>` (contains `uno.py`, `unohelper.py`, `pydlo.*`)
- Linux/macOS: `PYTHONPATH=<program>` and `URE_BOOTSTRAP=file://<program>/fundamentalrc`
  (fundamentalrc is generated at first run in the isolated profile dir; the supervisor must
  point `URE_BOOTSTRAP` at the profile's `program/fundamentalrc` when present).

**Bootstrapping via socket (recommended over `pyuno.bootstrap()`'s default):**

```python
import uno, sys, json
# localContext + resolver, then connect:
localContext = uno.getComponentContext()
resolver = localContext.ServiceManager.createInstanceWithContext(
    "com.sun.star.bridge.UnoUrlResolver", localContext)
ctx = resolver.resolve(
    "uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext")
smgr = ctx.ServiceManager
```

**Failure semantics.** If the broker cannot bootstrap, it exits non-zero and prints
`{"error": "<reason>", "stage": "bootstrap"}` to stderr. The Rust core then:
1. retries once with a fresh profile (first-run `fundamentalrc` race), then
2. falls back to **CLI-only conversion** for the affected op and reports the degraded mode.

## 3. Broker protocol (JSON lines over stdio)

Request: `{"id": 1, "op": "<op>", "params": {...}}\n`
Response: `{"id": 1, "ok": true, "result": {...}}\n` or `{"id": 1, "ok": false, "error": "..."}\n`

Ops:

| op | params | result |
|---|---|---|
| `probe` | — | `{version, profileDir, socketPort}` |
| `meta` | `{uri}` | `{mimeFamily, pageCount?, sheetCount?, sheets?[], metadata{}}` |
| `set_text` (Writer) | `{uri, bookmark, text}` | `{applied: true}` |
| `set_slide_text` (Impress) | `{uri, slide, shapeIndex, text}` | `{applied: true}` |
| `set_cell` (Calc) | `{uri, sheet, cell, value}` | `{applied: true}` |
| `recalc_verify` (Calc) | `{uri}` | `{formulas: [{ref, formula, cached}], hf_diffs: [...]}` |
| `shutdown` | — | `{ok: true}` |

## 4. Convert contract (CLI one-shots, serialized)

```
soffice --headless --nologo --nodefault --norestore --nolockcheck \
  -env:UserInstallation=file:///<profile> \
  --convert-to "<filter>" --outdir <outdir> <input>
```

Filter map (explicit names for fidelity):

| target | filter string |
|---|---|
| docx | `docx:MS Word 2007 XML` |
| odt  | `odt:writer8` |
| xlsx | `xlsx:Calc MS Excel 2007 XML` |
| ods  | `ods:calc8` |
| pptx | `pptx:Impress MS PowerPoint 2007 XML` |
| odp  | `odp:impress8` |
| pdf  | `pdf:writer_pdf_Export` (Calc/Impress use their own PDF export variants) |
| html | `html:HTML (StarWriter)` |
| csv  | `csv:Text - txt - csv (StarCalc):44,34,76,1` |

Output filename = input basename with the new extension, in `--outdir`. The convert op copies
into/out of an app-owned scratch dir under the auto-recovery cache.

## 5. Concurrency and limitations (stated MVP limits)

- **One soffice, one profile, serialized queue.** Multi-tab saves are queued; the UI shows queue
  position in the "Saving…" state.
- **Per-save latency** is a full LO open→convert→close cycle. It is async and debounced; typing
  never blocks.
- **v1 "edit" scope** = simple text/cell/slide ops. Anything outside that is rejected with
  `"unsupported"` rather than silently degraded.
- Shutdown: graceful terminate, then platform tree-kill (`taskkill /T /F` on Windows; `kill` +
  wait on Unix). Temp profiles are removed on clean exit and reused across sessions otherwise.
