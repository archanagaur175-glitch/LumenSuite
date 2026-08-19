import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.resolve(ROOT, "src-tauri", "resources", "libreoffice", "runtime");

function sofficeBinary() {
  if (process.env.LUMEN_SUITE_SOFFICE) return process.env.LUMEN_SUITE_SOFFICE;
  const candidates =
    process.platform === "win32"
      ? [path.join(RUNTIME, "program", "soffice.exe"), path.join(RUNTIME, "program", "soffice.com")]
      : process.platform === "darwin"
        ? [path.join(RUNTIME, "LibreOffice.app", "Contents", "MacOS", "soffice")]
        : [path.join(RUNTIME, "program", "soffice")];
  return candidates.find((c) => exists(c)) ?? null;
}

function exists(p) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

const FILTERS = {
  docx: "docx:MS Word 2007 XML",
  odt: "odt:writer8",
  xlsx: "xlsx:Calc MS Excel 2007 XML",
  ods: "ods:calc8",
  pptx: "pptx:Impress MS PowerPoint 2007 XML",
  odp: "odp:impress8",
  pdf: "pdf",
};

const WRITER_XML = `<?xml version="1.0" encoding="UTF-8"?><office:document-content
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.3"><office:body>
 <office:text><text:h text:outline-level="1">Smoke Test</text:h>
 <text:p>Hello from Lumen Suite smoke test 12345!</text:p></office:text></office:body>
 </office:document-content>`;

const CALC_XML = `<?xml version="1.0" encoding="UTF-8"?><office:document-content
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.3"><office:body>
 <office:spreadsheet><table:table table:name="Sheet1">
 <table:table-row><table:table-cell office:value-type="float" office:value="2"><text:p>2</text:p></table:table-cell>
 <table:table-cell office:value-type="float" office:value="3"><text:p>3</text:p></table:table-cell></table:table-row>
 <table:table-row><table:table-cell table:formula="of:=A1+B1" office:value-type="float" office:value="5"><text:p>5</text:p></table:table-cell></table:table-row>
 </table:table></office:spreadsheet></office:body>
 </office:document-content>`;

const IMPRESS_XML = `<?xml version="1.0" encoding="UTF-8"?><office:document-content
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.3"><office:body>
 <office:presentation><draw:page draw:name="Slide 1">
 <draw:frame draw:name="Title" draw:style-name="fTitle"><draw:text-box><text:p>Smoke Deck</text:p></draw:text-box></draw:frame>
 <draw:frame draw:name="Body" draw:style-name="fBody"><draw:text-box><text:p>Hello slide body</text:p></draw:text-box></draw:frame>
 </draw:page></office:presentation></office:body>
 </office:document-content>`;

async function convert(bin, profile, work, docId, input, ext) {
  const outdir = path.join(work, `out-${docId}-${ext}`);
  await mkdir(outdir, { recursive: true });
  const profileUrl = `file:///${profile.replace(/\\/g, "/")}`;
  const r = spawnSync(
    bin,
    [
      "--headless", "--invisible", "--nologo", "--nodefault", "--norestore", "--nolockcheck",
      `-env:UserInstallation=${profileUrl}`,
      `--convert-to ${FILTERS[ext]}`,
      "--outdir", outdir,
      input,
    ],
    { encoding: "utf8", timeout: 180_000 }
  );
  const out = path.join(outdir, `${docId}.${ext}`);
  if (r.status !== 0 || !exists(out)) {
    console.error(`FAIL ${docId} -> ${ext}`);
    console.error(r.stderr || r.stdout || "no output");
    return "FAIL";
  }
  const size = (await stat(out)).size;
  console.log(`PASS ${docId} -> ${ext} (${size} bytes)`);
  return "PASS";
}

async function main() {
  const bin = sofficeBinary();
  if (!bin) {
    console.error("No soffice found. Run npm run fetch:lo first or set LUMEN_SUITE_SOFFICE.");
    process.exit(2);
  }
  const work = path.join(os.tmpdir(), `lumen-smoke-${Date.now()}`);
  const profile = path.join(work, "profile");
  await mkdir(work, { recursive: true });
  await mkdir(profile, { recursive: true });

  const docs = {
    writer: { xml: WRITER_XML, tests: ["docx", "odt", "pdf"] },
    calc: { xml: CALC_XML, tests: ["xlsx", "ods", "pdf"] },
    impress: { xml: IMPRESS_XML, tests: ["pptx", "odp", "pdf"] },
  };

  let allPass = true;
  for (const [docId, { xml, tests }] of Object.entries(docs)) {
    const input = path.join(work, `${docId}.od${docId === "writer" ? "t" : docId === "calc" ? "s" : "p"}`);
    await writeFile(input, xml, "utf8");
    for (const ext of tests) {
      const result = await convert(bin, profile, work, docId, input, ext);
      if (result !== "PASS") allPass = false;
    }
  }

  await rm(work, { recursive: true, force: true });
  if (!allPass) process.exit(1);
  console.log("SMOKE OK: writer/calc/impress all convert to docx/xlsx/pptx, odt/ods/odp, and PDF");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});