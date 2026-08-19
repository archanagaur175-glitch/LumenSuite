import type { EngineStatus } from "./types";

export const isTauriRuntime =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type CommandResult<T> = { ok: boolean; data?: T; error?: string };

async function invokeCmd<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  const res = (await mod.invoke(cmd, args)) as CommandResult<T>;
  if (!res.ok) {
    throw new Error(res.error ?? `command ${cmd} failed`);
  }
  return res.data as T;
}

export interface ConvertRequest {
  inputPath: string;
  outDir: string;
  targetExt: "odt" | "ods" | "odp" | "docx" | "xlsx" | "pptx" | "pdf";
}

export async function engineStatus(): Promise<EngineStatus> {
  if (!isTauriRuntime) {
    return {
      running: false,
      pid: null,
      port: null,
      profileDir: null,
      loVersion: null,
      lastNetworkRequest: "none",
      engineAvailable: false,
      degraded: false,
      degradedReason: null,
    };
  }
  return invokeCmd<EngineStatus>("engine_status");
}

export async function engineStart(): Promise<EngineStatus> {
  if (!isTauriRuntime) return engineStatus();
  return invokeCmd<EngineStatus>("engine_start");
}

export async function engineShutdown(): Promise<EngineStatus> {
  if (!isTauriRuntime) return engineStatus();
  return invokeCmd<EngineStatus>("engine_shutdown");
}

export async function convertFile(req: ConvertRequest): Promise<string> {
  if (!isTauriRuntime) {
    throw new Error("Engine unavailable in browser preview");
  }
  const data = await invokeCmd<{ path: string }>("convert_file", {
    inputPath: req.inputPath,
    outDir: req.outDir,
    targetExt: req.targetExt,
  });
  return data.path;
}

export async function appDirs(): Promise<{
  recoveryDir: string;
  workingDir: string;
  loBundleRoot: string;
  profilesDir: string;
}> {
  if (!isTauriRuntime) {
    return {
      recoveryDir: "/dev/browser-mock",
      workingDir: "/dev/browser-mock",
      loBundleRoot: "",
      profilesDir: "",
    };
  }
  return invokeCmd<{
    recoveryDir: string;
    workingDir: string;
    loBundleRoot: string;
    profilesDir: string;
  }>("app_dirs");
}

export async function pickOpenFile(): Promise<string | null> {
  if (!isTauriRuntime) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept =
        ".odt,.odf,.ods,.odp,.docx,.xlsx,.pptx,.json,.fods,.fodt,.fodp,.txt,.csv,.html";
      input.onchange = () => resolve(input.files?.[0] ? input.files[0].name : null);
      input.click();
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    multiple: false,
    filters: [
      {
        name: "Office documents",
        extensions: [
          "odt", "ods", "odp", "odf",
          "docx", "xlsx", "pptx",
          "doc", "xls", "ppt",
          "fodt", "fods", "fodp",
          "txt", "csv", "html", "json",
        ],
      },
    ],
  });
  return typeof picked === "string" ? picked : null;
}

export async function pickSavePath(
  defaultName: string,
  ext: "odt" | "ods" | "odp" | "docx" | "xlsx" | "pptx" | "odf" | "json"
): Promise<string | null> {
  if (!isTauriRuntime) {
    return defaultName.endsWith("." + ext) ? defaultName : `${defaultName}.${ext}`;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: defaultName.endsWith("." + ext) ? defaultName : `${defaultName}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return readFile(path);
}

export async function writeFileBytes(path: string, data: Uint8Array): Promise<void> {
  const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (idx > 0) {
    const dir = path.slice(0, idx);
    await mkdir(dir, { recursive: true }).catch(() => undefined);
  }
  await writeFile(path, data);
}

export async function checkReleases(): Promise<void> {
  const url = "https://github.com/archanagaur175-glitch/LumenSuite/releases";
  if (!isTauriRuntime) {
    window.open(url, "_blank");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function notify(
  title: string,
  body?: string,
  kind: "info" | "error" | "warning" = "info"
): Promise<void> {
  // Native message boxes only for blocking errors; everything else is in-app toasts.
  if (kind === "error") {
    const { message } = await import("@tauri-apps/plugin-dialog");
    await message(body ?? title, { title, kind: "error" });
  }
}