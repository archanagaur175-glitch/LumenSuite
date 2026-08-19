import type { CalcDoc, DocModel, ImpressDoc, WriterDoc } from "./types";

/* ---------- ZIP ---------- */

const SIG_LOCAL = 0x04034b50;
const SIG_CD = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function u16(bytes: Uint8Array, o: number): number {
  return bytes[o] | (bytes[o + 1] << 8);
}
function u32(bytes: Uint8Array, o: number): number {
  return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
}

function utf8(data: string): Uint8Array {
  return new TextEncoder().encode(data);
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  await writer.write(data as unknown as BufferSource);
  await writer.close();
  const res = new Response(cs.readable as unknown as BodyInit);
  return new Uint8Array(await res.arrayBuffer());
}

export async function zipWrite(entries: Array<{ name: string; data: Uint8Array; store?: boolean }>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const cd: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = utf8(entry.name);
    const crc = crc32(entry.data);
    const store = entry.store === true;
    const compressed = store ? entry.data : (await deflateRaw(entry.data)) as Uint8Array;
    const method = store ? 0 : 8;

    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, SIG_LOCAL, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, store ? 0 : 0x0800, true);
    dv.setUint16(8, method, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, compressed.length, true);
    dv.setUint32(22, entry.data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, compressed);

    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cdEntry.buffer);
    cdv.setUint32(0, SIG_CD, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, store ? 0 : 0x0800, true);
    cdv.setUint16(10, method, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, compressed.length, true);
    cdv.setUint32(24, entry.data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    cdEntry.set(nameBytes, 46);
    cd.push(cdEntry);

    offset += local.length + compressed.length;
  }

  const cdSize = cd.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, SIG_EOCD, true);
  edv.setUint16(8, cd.length, true);
  edv.setUint16(10, cd.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, offset, true);

  const size = offset + cdSize + 22;
  const out = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  for (const c of cd) {
    out.set(c, pos);
    pos += c.length;
  }
  out.set(eocd, pos);
  return out;
}

export async function zipRead(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();

  let eocd = -1;
  const tailStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= tailStart; i--) {
    if (u32(bytes, i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP archive");
  const count = u16(bytes, eocd + 10);
  let cursor = u32(bytes, eocd + 16);

  for (let i = 0; i < count; i++) {
    if (u32(bytes, cursor) !== SIG_CD) throw new Error("Corrupt ZIP central directory");
    const method = u16(bytes, cursor + 10);
    const compSize = u32(bytes, cursor + 20);
    const nameLen = u16(bytes, cursor + 28);
    const extraLen = u16(bytes, cursor + 30);
    const commentLen = u16(bytes, cursor + 32);
    const localOff = u32(bytes, cursor + 42);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLen));
    const localHeader = u32(bytes, localOff) === SIG_LOCAL ? localOff : -1;
    if (localHeader < 0) throw new Error(`Corrupt local header for ${name}`);
    const lNameLen = u16(bytes, localHeader + 26);
    const lExtraLen = u16(bytes, localHeader + 28);
    const dataOff = localHeader + 30 + lNameLen + lExtraLen;
    const raw = bytes.slice(dataOff, dataOff + compSize);

    let data: Uint8Array;
    if (method === 0) {
      data = raw;
    } else if (method === 8) {
      data = await inflateRaw(raw);
    } else {
      throw new Error(`Unsupported ZIP method ${method}`);
    }
    out.set(name, data);
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  await writer.write(raw as unknown as BufferSource);
  await writer.close();
  const res = new Response(ds.readable as unknown as BodyInit);
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.length > 0) return data;
  const ds2 = new DecompressionStream("deflate");
  const w2 = ds2.writable.getWriter();
  await w2.write(raw as unknown as BufferSource);
  await w2.close();
  const res2 = new Response(ds2.readable as unknown as BodyInit);
  return new Uint8Array(await res2.arrayBuffer());
}

/* ---------- ODF namespaces ---------- */

const NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  manifest: "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0",
};

const XML_DECL = (root: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<office:document-content xmlns:office="${NS.office}" xmlns:text="${NS.text}" xmlns:table="${NS.table}" xmlns:draw="${NS.draw}" xmlns:style="${NS.style}" office:version="1.3">${root.join("")}</office:document-content>`;

const MANIFEST = (files: Array<[string, string]>): string =>
  `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="${NS.manifest}" manifest:version="1.3">` +
  files.map(([p, mt]) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="${mt}"/>`).join("") +
  `</manifest:manifest>`;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function xmlDoc(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function getByNS(doc: Document | Element, ns: string, local: string): Element[] {
  const root =
    "documentElement" in doc && doc.documentElement ? (doc as Document).documentElement : (doc as Element);
  return Array.from(root.getElementsByTagNameNS(ns, local));
}

/* ---------- MODEL UTILITIES ---------- */

export function blankDoc(kind: "writer" | "calc" | "impress"): DocModel {
  if (kind === "writer") {
    return { kind, blocks: [{ id: "b1", type: "h1", text: "Untitled document" }, { id: "b2", type: "p", text: "" }] };
  }
  if (kind === "calc") {
    return { kind, sheets: [{ name: "Sheet1", cells: {} }] };
  }
  return {
    kind,
    slides: [{ id: "s1", title: "Untitled presentation", body: "" }],
  };
}

/* ---------- WRITER ---------- */

function writerXml(doc: WriterDoc): string {
  const body = doc.blocks
    .map((b) => {
      let inner = esc(b.text);
      if (b.bold) inner = `<text:span text:style-name="T1">${inner}</text:span>`;
      if (b.italic) inner = `<text:span text:style-name="T2">${inner}</text:span>`;
      if (!inner) inner = "";
      if (b.type === "h1") return `<text:h text:outline-level="1">${inner}</text:h>`;
      if (b.type === "h2") return `<text:h text:outline-level="2">${inner}</text:h>`;
      if (b.type === "h3") return `<text:h text:outline-level="3">${inner}</text:h>`;
      if (b.type === "ul") return `<text:list><text:list-item><text:p>${inner}</text:p></text:list-item></text:list>`;
      return `<text:p>${inner}</text:p>`;
    })
    .join("");
  return XML_DECL([`<office:body><office:text>${body}</office:text></office:body>`]);
}

function parseWriter(doc: Document): WriterDoc {
  const blocks: WriterDoc["blocks"] = [];
  const officeText = doc.getElementsByTagNameNS(NS.office, "text")[0];
  if (!officeText) return { kind: "writer", blocks: [] };
  let id = 0;
  Array.from(officeText.childNodes).forEach((node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tn = el.localName;
    if (tn === "p" || tn === "h") {
      const lvl = el.getAttribute("text:outline-level");
      const type = lvl ? (`h${Math.min(3, Number(lvl))}` as "h1" | "h2" | "h3") : "p";
      const text = Array.from(el.childNodes)
        .map((c) => (c.nodeType === 3 ? c.textContent ?? "" : c.textContent ?? ""))
        .join("");
      blocks.push({ id: `p${id++}`, type, text });
    } else if (tn === "list") {
      const items = Array.from(el.getElementsByTagNameNS(NS.text, "list-item"));
      for (const item of items) {
        blocks.push({ id: `p${id++}`, type: "ul", text: item.textContent ?? "" });
      }
    }
  });
  return { kind: "writer", blocks };
}

/* ---------- CALC ---------- */

const colName = (col: number): string => {
  let s = "";
  let c = col;
  do {
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return s;
};

export function colIndex(name: string): number {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = n * 26 + name.charCodeAt(i) - 64;
  return n - 1;
}

function cellToRC(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Bad cell ref ${ref}`);
  return [Number(m[2]) - 1, colIndex(m[1])];
}

function rcToRC(row: number, col: number): string {
  return `${colName(col)}${row + 1}`;
}

export { rcToRC as rcToCell };

function sheetXml(doc: CalcDoc): string {
  const sheets = doc.sheets
    .map((sheet) => {
      const refs = Object.keys(sheet.cells).sort((a, b) => {
        const [ra, ca] = cellToRC(a);
        const [rb, cb] = cellToRC(b);
        return ra - rb || ca - cb;
      });
      const rows = new Map<number, Array<[number, { v: string; f?: string }]>>();
      for (const ref of refs) {
        const [r, c] = cellToRC(ref);
        if (!rows.has(r)) rows.set(r, []);
        rows.get(r)!.push([c, sheet.cells[ref]]);
      }
      const sortedRows = Array.from(rows.keys()).sort((a, b) => a - b);
      const rowsXml = sortedRows
        .map((r) => {
          const cells = rows.get(r)!;
          const cellXml = cells
            .map(([, cell]) => {
              let formulaAttr = "";
              if (cell.f) {
                formulaAttr = ` table:formula="of:=${esc(stripEquals(cell.f))}"`;
              }
              const valueAttr = /^[+-]?\d+(\.\d+)?$/.test(cell.v)
                ? ` office:value-type="float" office:value="${Number(cell.v)}"`
                : cell.v !== ""
                  ? ' office:value-type="string"'
                  : "";
              return `<table:table-cell${formulaAttr}${valueAttr}><text:p>${esc(cell.v)}</text:p></table:table-cell>`;
            })
            .join("");
          return `<table:table-row>${cellXml}</table:table-row>`;
        })
        .join("");
      return `<table:table table:name="${esc(sheet.name)}">${rowsXml}</table:table>`;
    })
    .join("");
  return XML_DECL([`<office:body><office:spreadsheet>${sheets}</office:spreadsheet></office:body>`]);
}

function stripEquals(f: string): string {
  return f.startsWith("=") ? f.slice(1) : f;
}

function parseCalc(doc: Document): CalcDoc {
  const sheets: CalcDoc["sheets"] = [];
  for (const t of getByNS(doc, NS.table, "table")) {
    const name = t.getAttribute("table:name") ?? `Sheet${sheets.length + 1}`;
    const cells: Record<string, { v: string; f?: string }> = {};
    const rows = getByNS(t, NS.table, "table-row");
    rows.forEach((row, r) => {
      const cellEls = Array.from(row.children).filter((c) => c.localName === "table-cell");
      let col = 0;
      for (const cell of cellEls) {
        const repeat = Number(cell.getAttribute("table:number-columns-repeated") ?? 1);
        const formulaRaw = cell.getAttribute("table:formula");
        const formula = formulaRaw && formulaRaw.startsWith("of:=") ? formulaRaw.slice(3) : formulaRaw ?? undefined;
        const text = cell.textContent ?? "";
        for (let k = 0; k < repeat; k++) {
          const ref = rcToRC(r, col);
          if (formula || text !== "") {
            cells[ref] = { v: text, ...(formula ? { f: formula.includes("[") && !formula.includes("[.") ? "" : formula } : {}) };
          }
          col++;
        }
      }
    });
    sheets.push({ name, cells });
  }
  return { kind: "calc", sheets };
}

/* ---------- IMPRESS ---------- */

function impressXml(doc: ImpressDoc): string {
  const pages = doc.slides
    .map((s, i) => {
      const frames = [
        `<draw:frame draw:name="Title" draw:style-name="fTitle"><draw:text-box><text:p>${esc(s.title)}</text:p></draw:text-box></draw:frame>`,
        `<draw:frame draw:name="Body" draw:style-name="fBody"><draw:text-box><text:p>${esc(s.body)}</text:p></draw:text-box></draw:frame>`,
        s.notes
          ? `<draw:frame draw:name="Notes" draw:style-name="fNotes"><draw:text-box><text:p>${esc(s.notes)}</text:p></draw:text-box></draw:frame>`
          : "",
      ].join("");
      return `<draw:page draw:name="${esc(s.title || `Slide ${i + 1}`)}">${frames}</draw:page>`;
    })
    .join("");
  return XML_DECL([`<office:body><office:presentation>${pages}</office:presentation></office:body>`]);
}

function parseImpress(doc: Document): ImpressDoc {
  const slides: ImpressDoc["slides"] = [];
  let id = 0;
  for (const page of getByNS(doc, NS.draw, "page")) {
    const frames = getByNS(page, NS.draw, "frame");
    const textOf = (f: Element | undefined): string =>
      f ? (f.textContent ?? "").trim() : "";
    const titleFrame = frames.find((f) => f.getAttribute("draw:name") === "Title") ?? frames[0];
    const bodyFrame = frames.find((f) => f.getAttribute("draw:name") === "Body") ?? frames[1];
    const notesFrame = frames.find((f) => f.getAttribute("draw:name") === "Notes");
    slides.push({
      id: `s${id++}`,
      title: textOf(titleFrame),
      body: textOf(bodyFrame),
      notes: notesFrame ? textOf(notesFrame) : "",
    });
  }
  if (slides.length === 0) {
    slides.push({ id: `s0`, title: "Untitled presentation", body: "" });
  }
  return { kind: "impress", slides };
}

/* ---------- PUBLIC ODF API ---------- */

const MIME: Record<string, string> = {
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  fodt: "application/vnd.oasis.opendocument.text-flat-xml",
};

export function odfKindForExt(ext: string): "writer" | "calc" | "impress" | null {
  if (ext === "odt" || ext === "fodt" || ext === "docx" || ext === "doc" || ext === "txt" || ext === "html") return "writer";
  if (ext === "ods" || ext === "fods" || ext === "xlsx" || ext === "xls" || ext === "csv") return "calc";
  if (ext === "odp" || ext === "fodp" || ext === "pptx" || ext === "ppt") return "impress";
  if (ext === "odf" || ext === "json") return null;
  return null;
}

export async function serializeOdf(doc: DocModel, ext: "odt" | "ods" | "odp"): Promise<Uint8Array> {
  const mimeType = MIME[ext];
  const contentXml =
    doc.kind === "writer" ? writerXml(doc) : doc.kind === "calc" ? sheetXml(doc) : impressXml(doc);
  const contentBytes = utf8(contentXml);
  const rootFile = `content.${ext === "odp" ? "xml" : "xml"}`;
  const manifestFiles: Array<[string, string]> = [
    ["/", mimeType],
    [rootFile, "text/xml"],
  ];
  return zipWrite([
    { name: "mimetype", data: utf8(mimeType), store: true },
    { name: "content.xml", data: contentBytes },
    { name: "META-INF/manifest.xml", data: utf8(MANIFEST(manifestFiles)) },
  ]);
}

export async function parseOdf(bytes: Uint8Array, hint: "writer" | "calc" | "impress"): Promise<DocModel> {
  const entries = await zipRead(bytes);
  const content = entries.get("content.xml");
  if (!content) {
    const flat = new TextDecoder().decode(bytes);
    if (flat.includes("office:document-content")) return parseFlat(flat, hint);
    throw new Error("Unsupported ODF package");
  }
  const doc = xmlDoc(new TextDecoder().decode(content));
  if (hint === "writer") return parseWriter(doc);
  if (hint === "calc") return parseCalc(doc);
  return parseImpress(doc);
}

function parseFlat(xml: string, hint: "writer" | "calc" | "impress"): DocModel {
  const doc = xmlDoc(xml);
  if (hint === "writer") {
    const container = doc.createElementNS(NS.office, "office:text");
    const body = getByNS(doc, NS.office, "body")[0];
    body?.appendChild(container);
    return parseWriter(body.ownerDocument);
  }
  if (hint === "calc") {
    const sheet = getByNS(doc, NS.table, "table")[0];
    if (sheet) return parseCalc(sheet.ownerDocument);
    return { kind: "calc", sheets: [] };
  }
  return parseImpress(doc);
}