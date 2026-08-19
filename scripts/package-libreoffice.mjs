import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.resolve(ROOT, "src-tauri", "resources", "libreoffice", "runtime");

const PRUNE_DIRS = [
  "help",
  "share/help",
  "share/examples",
  "share/template",
  "share/gallery",
  "program/python",
];

async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(p);
    else if (entry.isFile()) total += (await stat(p)).size;
  }
  return total;
}

async function main() {
  let pruned = 0n;
  for (const rel of PRUNE_DIRS) {
    const target = path.join(RUNTIME, rel);
    try {
      const size = await dirSize(target);
      await rm(target, { recursive: true, force: true });
      console.log(`pruned ${rel} (${(size / 1048576).toFixed(1)} MiB)`);
      pruned += BigInt(size);
    } catch {
      /* absent — fine */
    }
  }
  let remaining = 0n;
  try {
    remaining = BigInt(await dirSize(RUNTIME));
  } catch {
    /* runtime missing */
  }
  console.log(
    `runtime pruned ${(Number(pruned) / 1048576).toFixed(1)} MiB; remaining ${(Number(remaining) / 1048576).toFixed(1)} MiB`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});