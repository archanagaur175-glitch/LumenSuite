import { useEffect, useMemo, useRef, useState } from "react";
import type { CalcCell, CalcDoc, DocModel } from "../core/types";
import { useApp } from "../core/store";
import { colIndex, rcToCell } from "../core/odf";
import { collectCalcFormulaErrors, setCalcCell } from "../core/model";
import { HyperFormula } from "hyperformula";
import * as ld from "lucide-react";

export const GRID_ROWS = 60;
export const GRID_COLS = 26;

export function CalcCanvas({ tabId, doc }: { tabId: string; doc: DocModel }) {
  const { updateDoc } = useApp();
  const c = doc as CalcDoc;
  const hfRef = useRef<HyperFormula | null>(null);
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const [errors, setErrors] = useState<Array<{ sheet: string; ref: string; message: string }>>([]);
  const [formulaError, setFormulaError] = useState<string | null>(null);

  useEffect(() => {
    if (active?.r != null && active?.c != null) {
      const cell = cellAt(c, 0, active.r, active.c);
      setEditDraft(cell?.f ?? cell?.v ?? "");
    }
  }, [c, active]);

  useEffect(() => {
    setErrors(collectCalcFormulaErrors(c));
  }, [c]);

  const cellAt = (dd: CalcDoc, sheet: number, row: number, col: number): CalcCell | undefined =>
    dd.sheets[sheet]?.cells[rcToCell(row, col)];

  useEffect(() => {
    const rows = matrixOf(c);
    if (rows.length === 0) {
      hfRef.current = null;
      return;
    }
    let hf: HyperFormula;
    try {
      hf = HyperFormula.buildFromArray(rows, { licenseKey: "gpl-v3" });
    } catch {
      hf = HyperFormula.buildFromSheets({ [c.sheets[0]?.name ?? "Sheet1"]: [] });
    }
    hfRef.current = hf;
  }, [c]);

  const commit = (row: number, col: number, text: string) => {
    const trimmed = text.trimEnd();
    const isFormula = trimmed.startsWith("=");
    let v = trimmed;
    let f: string | undefined;
    const matrixRef = rcToCell(row, col);
    if (isFormula) {
      f = v;
      v = "";
    }
    let next = setCalcCell(c, 0, row, col, v, isFormula ? f : undefined);
    if (isFormula && hfRef.current) {
      try {
        const sheetName = c.sheets[0]?.name ?? "Sheet1";
        const [rr, cc] = rcToRC(matrixRef);
        hfRef.current.setCellContents({ sheet: sheetName, row: rr, col: cc } as never, [[trimmed]]);
        const val = hfRef.current.getCellValue({ sheet: sheetName, row: rr, col: cc } as never);
        v = formatHf(val);
        next = setCalcCell(next, 0, row, col, v, f);
        setFormulaError(null);
      } catch (e) {
        setFormulaError(`Formula rejected: ${(e as Error).message}`);
      }
    }
    updateDoc(tabId, next);
    setEditDraft(null);
  };

  const display = (row: number, col: number): string => {
    const cell = cellAt(c, 0, row, col);
    if (!cell) return "";
    if (cell.f && hfRef.current) {
      try {
        const sheetName = c.sheets[0]?.name ?? "Sheet1";
        const val = hfRef.current.getCellValue({ sheet: sheetName, row, col } as never);
        return formatHf(val);
      } catch {
        return cell.v;
      }
    }
    return cell.v;
  };

  const onCellFocus = (row: number, col: number) => setActive({ r: row, c: col });

  const grid = useMemo(() => {
    const out: Array<Array<{ v: string; f?: string }>> = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: Array<{ v: string; f?: string }> = [];
      for (let cc = 0; cc < GRID_COLS; cc++) {
        const raw = cellAt(c, 0, r, cc);
        row.push({ v: display(r, cc), f: raw?.f });
      }
      out.push(row);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- display/cellAt are pure per c
  }, [c]);

  const errorCount = errors.length + (formulaError ? 1 : 0);

  return (
    <div className="module">
      <div className="module-toolbar">
        <div className="tool-group">
          <span className="tool-label">Active: {active ? rcToCell(active.r, active.c) : "—"}</span>
        </div>
        <div className="tool-group">
          {errorCount > 0 && (
            <span className="tool-warn" title={formulaError ?? errors[0]?.message}>
              <ld.AlertTriangle size={13} />
              {errorCount} issue{errorCount === 1 ? "" : "s"}
            </span>
          )}
          <span className="tool-label">{c.sheets[0]?.name ?? "Sheet1"} · {GRID_ROWS}×{GRID_COLS}</span>
        </div>
      </div>
      <div className="sheet-scroll">
        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th className="corner" />
                {grid[0]?.map((_, i) => (
                  <th key={i} className="colhead">{colName(i)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((rowCells, r) => (
                <tr key={r}>
                  <th className="rowhead">{r + 1}</th>
                  {rowCells.map((cell, cc) => {
                    const editing = active?.r === r && active?.c === cc && editDraft != null;
                    const isActive = active?.r === r && active?.c === cc;
                    return (
                      <td
                        key={cc}
                        className={`cell${isActive ? " active" : ""}`}
                        onDoubleClick={() => {
                          setActive({ r, c: cc });
                          const cv = cellAt(c, 0, r, cc);
                          setEditDraft(cv?.f ?? cv?.v ?? "");
                        }}
                        onFocus={() => onCellFocus(r, cc)}
                        tabIndex={0}
                      >
                        {editing ? (
                          <input
                            className="cell-input"
                            value={editDraft}
                            autoFocus
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commit(r, cc, editDraft ?? "");
                              if (e.key === "Escape") setEditDraft(null);
                            }}
                            onBlur={() => {
                              if (editDraft != null) commit(r, cc, editDraft);
                            }}
                          />
                        ) : (
                          <span
                            className={`cell-view${cell.f ? " cell-formula" : ""}`}
                            onClick={() => onCellFocus(r, cc)}
                          >
                            {cell.v}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="module-caption">
        Live calculation via HyperFormula (GPL-3.0) · formulas start with <code>=</code> · double-click to edit · refs
        like <code>A1</code> supported
      </div>
    </div>
  );
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

function rcToRC(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return [0, 0];
  return [Number(m[2]) - 1, colIndex(m[1])];
}

function matrixOf(doc: CalcDoc): (string | number)[][] {
  const s = doc.sheets[0];
  if (!s) return [];
  const rows: (string | number)[][] = [];
  const re = /^([A-Z]+)(\d+)$/;
  const entries: Array<[number, number, string | number]> = [];
  for (const [ref, cell] of Object.entries(s.cells)) {
    const m = re.exec(ref);
    if (!m) continue;
    const r = Number(m[2]) - 1;
    const cc = colIndex(m[1]);
    const value: string | number = cell.f ? cell.f : /^[-+]?\d+(\.\d+)?$/.test(cell.v) ? Number(cell.v) : cell.v;
    entries.push([r, cc, value]);
  }
  const maxR = entries.reduce((mx, [r]) => Math.max(mx, r), -1);
  const maxC = entries.reduce((mx, [, cc]) => Math.max(mx, cc), -1);
  for (let r = 0; r <= Math.max(maxR, 0); r++) {
    const row: (string | number)[] = [];
    for (let cc = 0; cc <= maxC; cc++) row.push("");
    rows.push(row);
  }
  for (const [r, cc, v] of entries) {
    if (rows[r]) rows[r][cc] = v;
  }
  return rows;
}

function formatHf(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") {
    return Number.isInteger(val) ? String(val) : String(Number(val.toFixed(6)));
  }
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  return String(val);
}