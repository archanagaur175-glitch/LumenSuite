import type { CalcDoc, DocModel, ImpressDoc, WriterDoc } from "./types";
import { colIndex } from "./odf";

export function uid(prefix = "id"): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

export function updateWriter(doc: WriterDoc, patch: Partial<WriterDoc>): WriterDoc {
  return { ...doc, ...patch, kind: "writer" };
}

export function updateCalc(doc: CalcDoc, patch: Partial<CalcDoc>): CalcDoc {
  return { ...doc, ...patch, kind: "calc" };
}

export function updateImpress(doc: ImpressDoc, patch: Partial<ImpressDoc>): ImpressDoc {
  return { ...doc, ...patch, kind: "impress" };
}

export function setCalcCell(doc: CalcDoc, sheet: number, row: number, col: number, v: string, f?: string): CalcDoc {
  const name = `${colName(col)}${row + 1}`;
  const current = doc.sheets[sheet] ?? { name: `Sheet${sheet + 1}`, cells: {} };
  const cells = { ...current.cells };
  if (v === "" && !f) {
    delete cells[name];
  } else {
    cells[name] = { v, ...(f ? { f: f.startsWith("=") ? f : `=${f}` } : {}) };
  }
  const sheets = doc.sheets.map((s, i) => (i === sheet ? { ...s, cells } : s));
  if (sheet >= doc.sheets.length) sheets.push({ name: `Sheet${sheets.length + 1}`, cells });
  return { ...doc, sheets, kind: "calc" };
}

export function parseFormula(f: string): { refs: string[] } {
  const refs: string[] = [];
  const re = /([A-Z]{1,3}\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f.replace(/=\s*/, ""))) !== null) {
    refs.push(m[1]);
  }
  return { refs };
}

export function collectCalcFormulaErrors(doc: CalcDoc): Array<{ sheet: string; ref: string; message: string }> {
  const errors: Array<{ sheet: string; ref: string; message: string }> = [];
  doc.sheets.forEach((sheet, si) => {
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      if (!cell.f) continue;
      const { refs } = parseFormula(cell.f);
      for (const r of refs) {
        const col = colIndex(r.replace(/\d/g, ""));
        const row = Number(r.replace(/[A-Z]/g, "")) - 1;
        if (row < 0 || col < 0) {
          errors.push({ sheet: sheet.name, ref, message: `Invalid reference ${r}` });
          continue;
        }
      }
      void si;
    }
  });
  return errors;
}

function colName(col: number): string {
  let s = "";
  let c = col;
  do {
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return s;
}

export function docDisplayName(doc: DocModel): string {
  if (doc.kind === "writer") {
    const h = doc.blocks.find((b) => b.type !== "ul");
    return h ? h.text.trim() || "Untitled document" : "Untitled document";
  }
  if (doc.kind === "calc") return doc.sheets[0]?.name ?? "Spreadsheet";
  return doc.slides[0]?.title.trim() || "Untitled presentation";
}