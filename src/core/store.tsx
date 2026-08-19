import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from "react";
import * as backend from "./backend";
import * as odf from "./odf";
import type { DocModel, EngineStatus, Tab } from "./types";
import { docDisplayName, uid } from "./model";

export type Theme = "light" | "dark";

export interface AppState {
  theme: Theme;
  tabs: Tab[];
  docs: Record<string, DocModel>;
  activeId: string | null;
  engine: EngineStatus;
  saveBusy: boolean;
  savingCount: number;
  paletteOpen: boolean;
  trustOpen: boolean;
  preview: { tabId: string; pdfUrl: string | null; loading: boolean } | null;
  notices: string[];
}

type Action =
  | { type: "theme"; theme: Theme }
  | { type: "newTab"; tab: Tab; doc: DocModel }
  | { type: "closeTab"; id: string }
  | { type: "activate"; id: string }
  | { type: "model"; id: string; doc: DocModel }
  | { type: "engine"; engine: EngineStatus }
  | { type: "saveBusy"; busy: boolean; count?: number }
  | { type: "palette"; open: boolean }
  | { type: "trust"; open: boolean }
  | { type: "preview"; preview: AppState["preview"] }
  | { type: "notice"; message: string }
  | { type: "noticesDismiss" };

function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case "theme":
      return { ...state, theme: a.theme };
    case "newTab":
      return {
        ...state,
        tabs: [...state.tabs, a.tab],
        docs: { ...state.docs, [a.tab.id]: a.doc },
        activeId: a.tab.id,
      };
    case "closeTab": {
      const next = state.tabs.filter((t) => t.id !== a.id);
      return {
        ...state,
        tabs: next,
        docs: omit(state.docs, a.id),
        activeId: state.activeId === a.id ? (next[next.length - 1]?.id ?? null) : state.activeId,
      };
    }
    case "activate":
      return { ...state, activeId: a.id };
    case "model":
      return { ...state, docs: { ...state.docs, [a.id]: a.doc } };
    case "engine":
      return { ...state, engine: a.engine };
    case "saveBusy":
      return { ...state, saveBusy: a.busy, savingCount: a.count ?? state.savingCount };
    case "palette":
      return { ...state, paletteOpen: a.open };
    case "trust":
      return { ...state, trustOpen: a.open };
    case "preview":
      return { ...state, preview: a.preview };
    case "notice":
      return { ...state, notices: [...state.notices, a.message].slice(-4) };
    case "noticesDismiss":
      return { ...state, notices: [] };
    default:
      return state;
  }
}

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const copy = { ...obj };
  delete (copy as Record<string, unknown>)[key];
  return copy;
}

const initialState: AppState = {
  theme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  tabs: [],
  docs: {},
  activeId: null,
  engine: {
    running: false,
    pid: null,
    port: null,
    profileDir: null,
    loVersion: null,
    lastNetworkRequest: "none",
    engineAvailable: false,
    degraded: false,
    degradedReason: null,
  },
  saveBusy: false,
  savingCount: 0,
  paletteOpen: false,
  trustOpen: false,
  preview: null,
  notices: [],
};

interface AppApi {
  state: AppState;
  setTheme: (t: Theme) => void;
  newDoc: (kind: DocModel["kind"]) => Promise<void>;
  openDoc: (path?: string) => Promise<void>;
  closeTab: (id: string) => void;
  activate: (id: string) => void;
  updateDoc: (id: string, doc: DocModel) => void;
  saveDoc: (id: string, format?: "odt" | "ods" | "odp" | "docx" | "xlsx" | "pptx" | "json") => Promise<void>;
  saveAs: (id: string) => Promise<void>;
  exportPdf: (id: string) => Promise<void>;
  showPreview: (id: string) => void;
  closePreview: () => void;
  refreshEngine: () => Promise<void>;
  startEngine: () => Promise<void>;
  checkReleases: () => Promise<void>;
  setPalette: (open: boolean) => void;
  setTrust: (open: boolean) => void;
  dismissNotices: () => void;
}

const Ctx = createContext<AppApi | null>(null);

const DEFAULT_TITLES: Record<DocModel["kind"], string> = {
  writer: "Untitled document",
  calc: "Untitled spreadsheet",
  impress: "Untitled presentation",
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  const setTheme = useCallback((theme: Theme) => dispatch({ type: "theme", theme }), []);

  const newDoc = useCallback(async (kind: DocModel["kind"]) => {
    const doc = odf.blankDoc(kind);
    const tab: Tab = {
      id: uid("tab"),
      title: DEFAULT_TITLES[kind],
      kind,
      path: null,
      dirty: true,
      sourceFormat: kind === "writer" ? "odt" : kind === "calc" ? "ods" : "odp",
    };
    dispatch({ type: "newTab", tab, doc });
    scheduleRecovery(tab.id, doc, stateRef.current);
  }, []);

  const openDoc = useCallback(async (path?: string) => {
    let chosen = path;
    if (!chosen) chosen = (await backend.pickOpenFile()) ?? undefined;
    if (!chosen) return;
    try {
      const ext = (chosen.split(".").pop() ?? "").toLowerCase();
      const hint = odf.odfKindForExt(ext);
      if (hint === null && ext === "json") {
        const bytes = await backend.readFileBytes(chosen);
        const doc = JSON.parse(new TextDecoder().decode(bytes)) as DocModel;
        const tab: Tab = {
          id: uid("tab"),
          title: chosen.split(/[\\/]/).pop() ?? "Document",
          kind: doc.kind,
          path: chosen,
          dirty: false,
          sourceFormat: "json",
        };
        dispatch({ type: "newTab", tab, doc });
        return;
      }
      const isForeign = ["docx", "xlsx", "pptx", "doc", "xls", "ppt", "txt", "csv", "html"].includes(ext);
      const kind = hint ?? (ext === "txt" || ext === "html" ? "writer" : "calc");
      const odfExt = kind === "writer" ? "odt" : kind === "calc" ? "ods" : "odp";
      let workingBytes: Uint8Array;
      let sourceFormat: Tab["sourceFormat"];
      if (isForeign) {
        const dirs = await backend.appDirs();
        const outPath = await backend.convertFile({
          inputPath: chosen,
          outDir: dirs.workingDir,
          targetExt: odfExt,
        });
        workingBytes = await backend.readFileBytes(outPath);
        sourceFormat = (ext === "docx" || ext === "xlsx" || ext === "pptx" ? ext.slice(0, 4) : ext) as Tab["sourceFormat"];
      } else {
        workingBytes = await backend.readFileBytes(chosen);
        sourceFormat = (ext === "fodt" || ext === "fods" || ext === "fodp" ? ext.slice(1) : ext) as Tab["sourceFormat"];
      }
      const workingParse = await odf.parseOdf(workingBytes, kind);
      const tab: Tab = {
        id: uid("tab"),
        title: docDisplayName(workingParse),
        kind,
        path: chosen,
        dirty: false,
        sourceFormat,
      };
      dispatch({ type: "newTab", tab, doc: workingParse });
      scheduleRecovery(tab.id, workingParse, stateRef.current);
    } catch (err) {
      dispatch({ type: "notice", message: `Failed to open: ${(err as Error).message}` });
    }
  }, []);

  const closeTab = useCallback((id: string) => dispatch({ type: "closeTab", id }), []);

  const activate = useCallback((id: string) => dispatch({ type: "activate", id }), []);

  const updateDoc = useCallback((id: string, doc: DocModel) => {
    dispatch({ type: "model", id, doc });
    const tab = stateRef.current.tabs.find((t) => t.id === id);
    if (tab) scheduleRecovery(id, doc, stateRef.current, tab);
  }, []);

  const refreshEngine = useCallback(async () => {
    const engine = await backend.engineStatus();
    dispatch({ type: "engine", engine });
  }, []);

  const startEngine = useCallback(async () => {
    const engine = await backend.engineStart();
    dispatch({ type: "engine", engine });
  }, []);

  const saveDoc = useCallback(
    async (id: string, format?: Tab["sourceFormat"]) => {
      const st = stateRef.current;
      const tab = st.tabs.find((t) => t.id === id);
      const doc = st.docs[id];
      if (!tab || !doc) return;
      let target = tab.path;
      const ext: "odt" | "ods" | "odp" = doc.kind === "writer" ? "odt" : doc.kind === "calc" ? "ods" : "odp";
      const fc: "docx" | "xlsx" | "pptx" | null = format === "docx" || format === "xlsx" || format === "pptx" ? format : null;
      if (!target || format) {
        const dirs = st.engine.engineAvailable ? await backend.appDirs().catch(() => null) : null;
        const defaultDir = dirs ? dirs.workingDir : "";
        const suggested = `${defaultDir ? defaultDir + "\\" : ""}${tab.title.replace(/[<>:"/\\|?*]+/g, "_")}.${fc ?? ext}`;
        const picked = await backend.pickSavePath(suggested.split(/[\\/]/).pop()!, fc ?? ext);
        if (!picked) return;
        target = picked;
      }
      dispatch({ type: "saveBusy", busy: true, count: st.savingCount + 1 });
      try {
        const bytes = await odf.serializeOdf(doc, ext);
        if (fc) {
          const dirs = await backend.appDirs();
          const tmpName = `${id}.${ext}`;
          const tmpPath = `${dirs.workingDir}\\${tmpName}`;
          await backend.writeFileBytes(tmpPath, bytes);
          await backend.convertFile({ inputPath: tmpPath, outDir: target.replace(/[\\/][^\\/]*$/, "") || ".", targetExt: fc });
        } else if (format === "json") {
          await backend.writeFileBytes(target, new TextEncoder().encode(JSON.stringify(doc, null, 2)));
        } else {
          await backend.writeFileBytes(target, bytes);
        }
        dispatch({
          type: "newTab",
          tab: { ...tab, path: target, dirty: false, sourceFormat: fc ?? (format === "json" ? "json" : ext) },
          doc,
        });
      } catch (err) {
        dispatch({ type: "notice", message: `Save failed: ${(err as Error).message}` });
      } finally {
        dispatch({ type: "saveBusy", busy: false, count: Math.max(0, stateRef.current.savingCount - 1) });
      }
    },
    []
  );

  const saveAs = useCallback(
    async (id: string) => {
      const st = stateRef.current;
      const tab = st.tabs.find((t) => t.id === id);
      if (!tab || !tab.path) {
        await saveDoc(id);
        return;
      }
      await saveDoc(id, tab.sourceFormat);
    },
    [saveDoc]
  );

  const showPreviewPath = useCallback((tabId: string, pdfPath: string) => {
    dispatch({ type: "preview", preview: { tabId, pdfUrl: pdfPath, loading: false } });
  }, []);

  const exportPdf = useCallback(async (id: string) => {
    const st = stateRef.current;
    const tab = st.tabs.find((t) => t.id === id);
    const doc = st.docs[id];
    if (!tab || !doc) return;
    dispatch({ type: "saveBusy", busy: true, count: st.savingCount + 1 });
    try {
      const dirs = await backend.appDirs();
      const ext: "odt" | "ods" | "odp" = doc.kind === "writer" ? "odt" : doc.kind === "calc" ? "ods" : "odp";
      const bytes = await odf.serializeOdf(doc, ext);
      const tmpPath = `${dirs.workingDir}\\${id}.${ext}`;
      await backend.writeFileBytes(tmpPath, bytes);
      const out = await backend.convertFile({ inputPath: tmpPath, outDir: dirs.workingDir, targetExt: "pdf" });
      showPreviewPath(id, out);
    } catch (err) {
      dispatch({ type: "notice", message: `PDF failed: ${(err as Error).message}` });
    } finally {
      dispatch({ type: "saveBusy", busy: false, count: Math.max(0, stateRef.current.savingCount - 1) });
    }
  }, [showPreviewPath]);

  const showPreview = useCallback(async (id: string) => {
    await exportPdf(id);
  }, [exportPdf]);

  const setPalette = useCallback((open: boolean) => dispatch({ type: "palette", open }), []);
  const setTrust = useCallback((open: boolean) => dispatch({ type: "trust", open }), []);
  const dismissNotices = useCallback(() => dispatch({ type: "noticesDismiss" }), []);
  const closePreview = useCallback(() => dispatch({ type: "preview", preview: null }), []);
  const checkReleases = useCallback(() => backend.checkReleases(), []);

  useEffect(() => {
    backend.engineStatus().then((engine) => dispatch({ type: "engine", engine }));
    const t = window.setInterval(() => {
      backend.engineStatus().then((engine) => dispatch({ type: "engine", engine })).catch(() => undefined);
    }, 4000);
    runRecoveryRestore();
    const onRecover = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { entry: { id: string; title: string; kind: DocModel["kind"] }; doc: DocModel }
        | undefined;
      if (!detail) return;
      const tab: Tab = {
        id: detail.entry.id,
        title: detail.entry.title,
        kind: detail.entry.kind,
        path: null,
        dirty: true,
        sourceFormat: detail.entry.kind === "writer" ? "odt" : detail.entry.kind === "calc" ? "ods" : "odp",
      };
      dispatch({ type: "newTab", tab, doc: detail.doc });
    };
    window.addEventListener("lumen-recover", onRecover);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("lumen-recover", onRecover);
    };
  }, []);

  const api: AppApi = {
    state,
    setTheme,
    newDoc,
    openDoc,
    closeTab,
    activate,
    updateDoc,
    saveDoc,
    saveAs,
    exportPdf,
    showPreview,
    closePreview,
    refreshEngine,
    startEngine,
    checkReleases,
    setPalette,
    setTrust,
    dismissNotices,
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/* -------- auto-recovery -------- */

let recoveryDir: string | null = null;

async function ensureRecoveryDir(): Promise<string | null> {
  if (recoveryDir) return recoveryDir;
  try {
    const dirs = await backend.appDirs();
    recoveryDir = dirs.recoveryDir;
    return recoveryDir;
  } catch {
    return null;
  }
}

const recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRecovery(id: string, doc: DocModel, _st: AppState, tab?: Tab) {
  const timer = recoveryTimers.get(id);
  if (timer) clearTimeout(timer);
  const t = setTimeout(async () => {
    try {
      const dir = await ensureRecoveryDir();
      if (!dir) return;
      const ext: "odt" | "ods" | "odp" = doc.kind === "writer" ? "odt" : doc.kind === "calc" ? "ods" : "odp";
      const bytes = await odf.serializeOdf(doc, ext);
      await backend.writeFileBytes(`${dir}\\${id}.${ext}`, bytes);
      await updateManifest(dir, id, tab?.title ?? "Document", doc.kind);
    } catch {
      /* recovery is best-effort */
    }
  }, 800);
  recoveryTimers.set(id, t);
}

async function updateManifest(dir: string, id: string, title: string, kind: DocModel["kind"]) {
  try {
    let manifest: Array<{ id: string; title: string; kind: DocModel["kind"] }> = [];
    try {
      const raw = await backend.readFileBytes(`${dir}\\manifest.json`);
      manifest = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      manifest = [];
    }
    const entry = { id, title, kind };
    const idx = manifest.findIndex((e) => e.id === id);
    if (idx >= 0) manifest[idx] = entry;
    else manifest.push(entry);
    await backend.writeFileBytes(`${dir}\\manifest.json`, new TextEncoder().encode(JSON.stringify(manifest)));
  } catch {
    /* best-effort */
  }
}

async function runRecoveryRestore() {
  try {
    const dir = await ensureRecoveryDir();
    if (!dir) return;
    let manifest: Array<{ id: string; title: string; kind: DocModel["kind"] }> = [];
    try {
      const raw = await backend.readFileBytes(`${dir}\\manifest.json`);
      manifest = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (manifest.length === 0) return;
    for (const entry of manifest) {
      try {
        const bytes = await backend.readFileBytes(`${dir}\\${entry.id}.${entry.kind === "calc" ? "ods" : entry.kind === "impress" ? "odp" : "odt"}`);
        const doc = await odf.parseOdf(bytes, entry.kind);
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("lumen-recover", { detail: { entry, doc } }));
        }, 0);
      } catch {
        /* skip corrupted recovery entry */
      }
    }
  } catch {
    /* best-effort */
  }
}

export function useApp(): AppApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function useActiveTab() {
  const { state } = useApp();
  const tab = state.tabs.find((t) => t.id === state.activeId) ?? null;
  const doc = tab ? (state.docs[tab.id] ?? null) : null;
  return { tab, doc };
}