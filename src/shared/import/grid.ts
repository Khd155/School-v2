/**
 * A workbook reduced to plain cells. The browser reads the .xlsx file into this
 * shape (so the server never spends CPU unzipping/parsing XML) and the server
 * re-validates it as untrusted input before mapping it in parse.ts.
 */
import type ExcelJS from "exceljs";

export type Cell =
  | { kind: "empty" }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "date"; value: string }
  | { kind: "error"; value: string };

export type GridSheet = { name: string; rows: Cell[][] };

export const GRID_LIMITS = {
  sheets: 10,
  rows: 2100,
  columns: 60,
  textLength: 500,
  sheetName: 100,
};

const EMPTY: Cell = { kind: "empty" };

/** Unwraps ExcelJS values (formula results, rich text, hyperlinks, shared strings). */
export function readCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return EMPTY;
  if (typeof value === "number") return Number.isFinite(value) ? { kind: "number", value } : { kind: "error", value: String(value) };
  if (typeof value === "string") return value.trim() === "" ? EMPTY : { kind: "text", value: value.trim() };
  if (typeof value === "boolean") return { kind: "bool", value };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? EMPTY : { kind: "date", value: value.toISOString() };
  if (typeof value === "object") {
    if ("error" in value) return { kind: "error", value: String(value.error) };
    if ("formula" in value || "sharedFormula" in value) {
      return readCell((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    }
    if ("richText" in value) return readCell(value.richText.map((r) => r.text).join(""));
    if ("hyperlink" in value) {
      const v = value as ExcelJS.CellHyperlinkValue;
      return readCell(typeof v.text === "string" ? v.text : v.hyperlink);
    }
  }
  return { kind: "text", value: String(value) };
}

/** Reads every worksheet into a trimmed grid (trailing empty cells/rows dropped). */
export function extractGrid(workbook: ExcelJS.Workbook): GridSheet[] {
  return workbook.worksheets.slice(0, GRID_LIMITS.sheets).map((ws) => {
    const rows: Cell[][] = [];
    const lastRow = Math.min(ws.rowCount, GRID_LIMITS.rows);
    for (let r = 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      const lastCol = Math.min(row.cellCount, GRID_LIMITS.columns);
      for (let c = 1; c <= lastCol; c++) cells.push(truncate(readCell(row.getCell(c).value)));
      while (cells.length && cells[cells.length - 1].kind === "empty") cells.pop();
      rows.push(cells);
    }
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
    return { name: ws.name.slice(0, GRID_LIMITS.sheetName), rows };
  });
}

function truncate(cell: Cell): Cell {
  return (cell.kind === "text" || cell.kind === "error") && cell.value.length > GRID_LIMITS.textLength
    ? { ...cell, value: cell.value.slice(0, GRID_LIMITS.textLength) }
    : cell;
}

/** Server-side: accepts only well-formed grids within limits; returns null otherwise. */
export function validateGrid(input: unknown): GridSheet[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > GRID_LIMITS.sheets) return null;
  const out: GridSheet[] = [];
  for (const sheet of input) {
    if (!sheet || typeof sheet !== "object") return null;
    const { name, rows } = sheet as { name?: unknown; rows?: unknown };
    if (typeof name !== "string" || name.length > GRID_LIMITS.sheetName) return null;
    if (!Array.isArray(rows) || rows.length > GRID_LIMITS.rows) return null;
    const cleanRows: Cell[][] = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length > GRID_LIMITS.columns) return null;
      const cleanRow: Cell[] = [];
      for (const cell of row) {
        const c = validateCell(cell);
        if (!c) return null;
        cleanRow.push(c);
      }
      cleanRows.push(cleanRow);
    }
    out.push({ name, rows: cleanRows });
  }
  return out;
}

function validateCell(cell: unknown): Cell | null {
  if (!cell || typeof cell !== "object") return null;
  const { kind, value } = cell as { kind?: unknown; value?: unknown };
  switch (kind) {
    case "empty":
      return EMPTY;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? { kind, value } : null;
    case "bool":
      return typeof value === "boolean" ? { kind, value } : null;
    case "text":
    case "error":
      return typeof value === "string" && value.length <= GRID_LIMITS.textLength ? { kind, value } : null;
    case "date":
      return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? { kind, value } : null;
    default:
      return null;
  }
}
