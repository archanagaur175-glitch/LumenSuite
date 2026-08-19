import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import * as https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LO_DIR = path.resolve(ROOT, "src-tauri", "resources", "libreoffice");
const RUNTIME = path.join(LO_DIR, "runtime");
const CACHE_DIR = path.resolve(__dirname, ".cache");

const VERSION = process.env.LO_VERSION || "26.2.5";
const BASE = "https://download.documentfoundation.org/libreoffice/stable";

function platformKey() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "linux";
}

function archKey() {
  const arch = process.env.LO_ARCH || os.arch();
  return arch === "x64" || arch === "amd64" ? "x86_64" : "aarch64";
}

const URLS = {
  windows: {
    x86_64: `${BASE}/${VERSION}/win/x86_64/LibreOffice_${VERSION}_Win_x86-64.msi`,
    aarch64: `${BASE}/${VERSION}/win/aarch64/LibreOffice_${VERSION}_Win_aarch64.msi`,
  },
  macos: {
    x86_64: `${BASE}/${VERSION}/mac/x86_64/LibreOffice_${VERSION}_MacOS_x86-64.dmg`,
    aarch64: `${BASE}/${VERSION}/mac/aarch64/LibreOffice_${VERSION}_MacOS_aarch64.dmg`,
  },
  linux: {
    x86_64: `${BASE}/${VERSION}/deb/x86_64/LibreOffice_${VERSION}_Linux_x86-64_deb.tar.gz`,
    aarch64: `${BASE}/${VERSION}/deb/aarch64/LibreOffice_${VERSION}_Linux_aarch64_deb.tar.gz`,
  },
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      pipeline(res, createWriteStream(dest)).then(resolve, reject);
    });
    req.on("error", reject);
  });
}

async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(file);
    s.on("error", reject);
    s.on("data", (d) => h.update(d));
    s.on("end", () => resolve(h.digest("hex")));
  });
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
  }
}

async function extractWindowsMsi(pkg, dest) {
  // Administrative install: extracts MSI contents without an admin prompt.
  const tmp = path.join(dest, "_msi");
  await rm(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  run("msiexec.exe", ["/a", pkg, "/qn", `TARGETDIR=${tmp}`]);
  // msiexec nests under LibreOffice X.Y.Z_Win_x86-64\program
  const top = await readdir(tmp);
  const base = top.find((f) => f.toLowerCase().startsWith("libreoffice")) ?? "";
  const srcRoot = path.join(tmp, base);
  const program = path.join(srcRoot, "program");
  if (!existsSync(path.join(program, "soffice.exe")) && !existsSync(path.join(program, "soffice.com"))) {
    throw new Error("extracted MSI missing program/soffice.exe");
  }
  await mkdir(RUNTIME, { recursive: true });
  await cp(srcRoot, RUNTIME, { recursive: true });
  await rm(tmp, { recursive: true, force: true });
}

async function extractMacDmg(pkg) {
  const mount = path.join(os.tmpdir(), `lo-mount-${Date.now()}`);
  mkdirSync(mount, { recursive: true });
  run("hdiutil", ["attach", pkg, "-mountpoint", mount, "-nobrowse"]);
  const appSrc = (await readdir(mount)).find((f) => f.endsWith(".app"));
  if (!appSrc) throw new Error("no .app inside dmg");
  await mkdir(RUNTIME, { recursive: true });
  await cp(path.join(mount, appSrc), path.join(RUNTIME, appSrc), { recursive: true });
  run("hdiutil", ["detach", mount, "-force"]);
  await rm(mount, { recursive: true, force: true });
}

async function extractLinuxDebs(pkg, dest) {
  const tmp = path.join(dest, "_debs");
  await rm(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  run("tar", ["xzf", pkg, "-C", tmp]);
  const debs = [];
  const walk = async (dir) => {
    for (const f of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) await walk(p);
      else if (f.name.endsWith(".deb")) debs.push(p);
    }
  };
  await walk(tmp);
  if (debs.length === 0) throw new Error("no .deb files in tar.gz");
  const merged = path.join(dest, "_merged");
  await rm(merged, { recursive: true, force: true });
  mkdirSync(merged, { recursive: true });
  for (const deb of debs) {
    const work = path.join(tmp, "work");
    await rm(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    run("ar", ["x", deb], { cwd: work });
    const dataFile = (await readdir(work)).find((f) => f.startsWith("data.tar"));
    if (!dataFile) throw new Error(`no data.tar in ${deb}`);
    run("tar", ["xf", path.join(work, dataFile), "-C", work]);
    // Merge usr/lib/libreoffice below merged root, symlink program -> ../libreoffice/program
    const loUsr = path.join(work, "usr", "lib", "libreoffice");
    if (existsSync(loUsr)) {
      await cp(loUsr, merged, { recursive: true });
    } else {
      // non-standard layout: copy whatever usr/lib has
      const lib = path.join(work, "usr", "lib");
      if (existsSync(lib)) await cp(lib, merged, { recursive: true });
    }
  }
  await mkdir(RUNTIME, { recursive: true });
  await cp(merged, RUNTIME, { recursive: true });
  // LO deb layout has program/soffice under usr/lib/libreoffice/program/soffice; ensure exec bit
  const sofficePath = path.join(RUNTIME, "program", "soffice");
  await rm(tmp, { recursive: true, force: true });
  await rm(merged, { recursive: true, force: true });
  console.log(`Linux runtime extracted; soffice at ${sofficePath}`);
}

async function main() {
  const pk = platformKey();
  const ak = archKey();
  const url = URLS[pk]?.[ak];
  if (!url) {
    console.error(`No LibreOffice ${VERSION} download URL for ${process.platform}/${os.arch()}`);
    process.exit(1);
  }
  mkdirSync(LO_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });
  await rm(RUNTIME, { recursive: true, force: true }).catch(() => {});

  const pkg = path.join(CACHE_DIR, `lo-${VERSION}-${pk}-${ak}${pk === "windows" ? ".msi" : pk === "macos" ? ".dmg" : ".tar.gz"}`);
  if (!existsSync(pkg) || (await stat(pkg)).size < 10 * 1024 * 1024) {
    console.log(`Downloading ${url}`);
    await download(url, pkg);
    console.log(`Downloaded ${pkg}`);
  } else {
    console.log(`Package already cached: ${pkg}`);
  }

  console.log("Extracting runtime (this can take a few minutes)...");
  if (pk === "windows") await extractWindowsMsi(pkg, LO_DIR);
  else if (pk === "macos") await extractMacDmg(pkg, LO_DIR);
  else await extractLinuxDebs(pkg, path.join(LO_DIR, "_work"));

  const sha = await sha256File(pkg);
  const size = (await stat(pkg)).size;
  console.log(`LO=${VERSION} PK=${pk} SHA256=${sha} SIZE=${size}`);
  console.log(`Runtime ready at ${RUNTIME}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});