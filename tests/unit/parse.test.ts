import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { computeClassStats, normalizeHeader, parseGrid, parseRecitation, parseScore } from "@/shared/import/parse";
import { extractGrid, readCell, validateGrid } from "@/shared/import/grid";
import { formatNumber, formatScore } from "@/shared/format";
import { normalizeAccessCode } from "@/shared/access-code-format";

const fixture = (name: string) => readFileSync(path.join(__dirname, "..", "fixtures", name));

/** Same path as production: browser extracts the grid, JSON crosses the wire, server validates and parses. */
async function parseWorkbook(buffer: Buffer, classes: number[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const grid = validateGrid(JSON.parse(JSON.stringify(extractGrid(wb))));
  if (!grid) throw new Error("invalid grid");
  return parseGrid(grid, classes);
}

describe("parseWorkbook — valid file", async () => {
  const result = await parseWorkbook(fixture("valid.xlsx"), [4, 5, 6]);

  it("finds the named sheet and the header row below the title", () => {
    expect(result.sheetName).toBe("الملخص العام");
    expect(result.headerRow).toBe(3);
  });

  it("reads every student and counts classes", () => {
    expect(result.students).toHaveLength(24);
    expect(result.classCounts).toEqual({ "4": 8, "5": 8, "6": 8 });
    expect(result.issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("unwraps hyperlink e-mails and formula results", () => {
    expect(result.students[0].email).toBe("student401@test.school.example");
    expect(result.students[0].scores.classworkTotal.num).toBe(8 + 9 + 15);
  });

  it("keeps zeros, empties and text distinct", () => {
    const [, zero, empty, text] = result.students;
    expect(zero.scores.finalTotal).toEqual({ num: 0, raw: null });
    expect(empty.scores.finalTotal).toEqual({ num: null, raw: null });
    expect(text.scores.finalTotal).toEqual({ num: null, raw: "غ" });
    expect(formatScore(empty.scores.finalTotal)).toBe("غير مسجل");
    expect(formatScore(text.scores.finalTotal)).toBe("غ");
  });

  it("maps recitation columns, including a header Excel turned into a date", () => {
    const s = result.students[0];
    expect(s.quran.s1.status).toBe("done");
    expect(s.quran.s2.status).toBe("not_done");
    expect(s.quran.s3.status).toBe("empty");
    expect(s.hadith.h2.status).toBe("not_done");
  });

  it("warns about totals that do not match their parts without changing them", () => {
    const mismatch = result.issues.find((i) => i.level === "warning" && i.row === 3 + 10 && i.message.includes("المجموع النهائي"));
    expect(mismatch).toBeDefined();
    expect(result.students[9].scores.finalTotal.num).toBe(99.999);
  });

  it("computes class stats from numeric final totals only, zeros included", () => {
    const class4 = result.students.filter((s) => s.classNo === 4);
    const numeric = class4.map((s) => s.scores.finalTotal.num).filter((n): n is number => n !== null);
    expect(numeric).toHaveLength(6); // 8 students minus one empty and one "غ"
    expect(numeric).toContain(0);
    const stats = result.stats.find((s) => s.classNo === 4)!;
    expect(stats.counted).toBe(6);
    expect(stats.total).toBe(8);
    expect(stats.average).toBeCloseTo(numeric.reduce((a, b) => a + b, 0) / 6, 10);
    expect(stats.highest).toBe(Math.max(...numeric));
  });
});

describe("parseWorkbook — invalid file", async () => {
  const result = await parseWorkbook(fixture("invalid.xlsx"), [4, 5, 6]);
  const errors = result.issues.filter((i) => i.level === "error");

  it("reports duplicate e-mails case-insensitively with both rows", () => {
    expect(errors.some((e) => e.row === 5 && e.message.includes("مكرر") && e.message.includes("الصف 4"))).toBe(true);
  });
  it("reports classes that are not enabled", () => {
    expect(errors.some((e) => e.row === 6 && e.message.includes("الفصل 7 غير مفعّل"))).toBe(true);
  });
  it("reports missing names and invalid class values", () => {
    expect(errors.some((e) => e.row === 7 && e.message.includes("اسم الطالب فارغ"))).toBe(true);
    expect(errors.some((e) => e.row === 8 && e.message.includes("رقم الفصل غير صحيح"))).toBe(true);
  });
});

describe("parseWorkbook — missing column", () => {
  it("fails with a file-level error naming the column", async () => {
    const result = await parseWorkbook(fixture("missing-column.xlsx"), [4, 5, 6]);
    expect(result.students).toHaveLength(0);
    expect(result.issues).toContainEqual({ level: "error", row: null, message: "العمود «المجموع2» غير موجود في الملف." });
  });

  it("rejects non-xlsx content", async () => {
    await expect(parseWorkbook(Buffer.from("not a zip"), [4])).rejects.toThrow();
  });

  it("rejects malformed grids from the client", () => {
    expect(validateGrid([{ name: "x", rows: [[{ kind: "number", value: "1" }]] }])).toBeNull();
    expect(validateGrid([{ name: "x", rows: [[{ kind: "script" }]] }])).toBeNull();
    expect(validateGrid("nope")).toBeNull();
    expect(validateGrid([{ name: "x", rows: [[{ kind: "text", value: "ok" }]] }])).toEqual([{ name: "x", rows: [[{ kind: "text", value: "ok" }]] }]);
  });
});

describe("cell helpers", () => {
  it("normalises headers", () => {
    expect(normalizeHeader("المهام الآدائية")).toBe(normalizeHeader("المهام الأدائية"));
    expect(normalizeHeader(" حديث 2 ")).toBe(normalizeHeader("حديث2"));
    expect(normalizeHeader("1–6")).toBe("1-6");
  });

  it("parses Arabic-Indic numerals and keeps other text", () => {
    expect(parseScore(readCell("١٥٫٥"))).toEqual({ num: 15.5, raw: null });
    expect(parseScore(readCell("  "))).toEqual({ num: null, raw: null });
    expect(parseScore(readCell("غائب"))).toEqual({ num: null, raw: "غائب" });
    expect(parseScore(readCell({ formula: "A1", result: 7 } as never))).toEqual({ num: 7, raw: null });
  });

  it("parses recitation states", () => {
    expect(parseRecitation(readCell("تم"))).toEqual({ status: "done" });
    expect(parseRecitation(readCell(" لم  يتم "))).toEqual({ status: "not_done" });
    expect(parseRecitation(readCell(null))).toEqual({ status: "empty" });
    expect(parseRecitation(readCell("✓"))).toEqual({ status: "unknown", raw: "✓" });
  });

  it("formats numbers with at most two decimals", () => {
    expect(formatNumber(15)).toBe("15");
    expect(formatNumber(14.5)).toBe("14.5");
    expect(formatNumber(9.876)).toBe("9.88");
    expect(formatNumber(99.999)).toBe("100");
  });

  it("returns null stats for a class with no numeric totals", () => {
    const stats = computeClassStats([{ classNo: 4, scores: { finalTotal: { num: null, raw: null } } as never }], [4, 5]);
    expect(stats[0]).toEqual({ classNo: 4, average: null, highest: null, counted: 0, total: 1 });
    expect(stats[1].total).toBe(0);
  });

  it("normalises access codes", () => {
    expect(normalizeAccessCode("١٢٣٤ ٥٦٧٨")).toBe("12345678");
    expect(normalizeAccessCode("1234-5678")).toBe("12345678");
    expect(normalizeAccessCode("1234567")).toBeNull();
    expect(normalizeAccessCode("1234567a")).toBeNull();
  });
});
