// Generates synthetic workbooks for tests. Names are fictional test data.
import ExcelJS from "exceljs";
import path from "node:path";

const out = path.join(process.cwd(), "tests", "fixtures");
const HEADERS = ["الطالب", "Email", "class", "الواجبات", "المشاركة و التفاعل", "المهام الآدائية", "المجموع",
  "القرآن الكريم", "الاختبار التحريري", "المجموع2", "المجموع النهائي", "ملاحظة", "1-6", "7-16", "17-24", "25-33", "حديث 1", "حديث2"];

const first = ["عبدالله", "محمد", "فهد", "سعود", "خالد", "عمر", "يوسف", "تركي", "ناصر", "سلمان", "ريان", "زياد"];
const last = ["اختبار", "تجربة", "نموذج"];

function student(i, cls, overrides = {}) {
  const hw = 8 + (i % 3), part = 9 + (i % 2), perf = 15 + (i % 5);
  const quran = 10 + (i % 6), exam = 20 + (i % 9);
  const r = {
    name: `${first[i % first.length]} ${last[i % last.length]} ${i + 1}`,
    email: `student${cls}${String(i + 1).padStart(2, "0")}@test.school.example`,
    cls, hw, part, perf, total1: hw + part + perf, quran, exam, total2: quran + exam,
    note: i % 4 === 0 ? "يحتاج إلى مراجعة التسميع." : null,
    q: ["تم", i % 2 ? "تم" : "لم يتم", i % 3 ? "تم" : null, i % 5 ? "لم يتم" : null],
    h: ["تم", i % 2 ? null : "لم يتم"],
    ...overrides,
  };
  r.final = overrides.final !== undefined ? overrides.final : (r.total1 ?? 0) + (r.total2 ?? 0);
  return r;
}

function toRow(s) {
  return [s.name, s.email, s.cls, s.hw, s.part, s.perf, s.total1, s.quran, s.exam, s.total2, s.final, s.note, ...s.q, ...s.h];
}

async function write(file, rows, { title = true, dateHeader = false, formulas = false } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("ورقة أخرى").addRow(["لا شيء هنا"]);
  const ws = wb.addWorksheet("الملخص العام");
  if (title) { ws.addRow(["كشف درجات الدراسات الإسلامية — بيانات تجريبية"]); ws.addRow([]); }
  const headers = [...HEADERS];
  ws.addRow(headers);
  const headerRow = ws.lastRow.number;
  if (dateHeader) ws.getRow(headerRow).getCell(13).value = new Date(Date.UTC(2026, 5, 1)); // Excel turned "1-6" into 1 Jun
  for (const s of rows) {
    const row = ws.addRow(toRow(s));
    if (formulas && typeof s.total1 === "number") {
      const n = row.number;
      row.getCell(7).value = { formula: `D${n}+E${n}+F${n}`, result: s.total1 };
    }
  }
  // Emails as hyperlinks (common when typed in Excel)
  ws.getRow(headerRow + 1).getCell(2).value = { text: rows[0].email, hyperlink: `mailto:${rows[0].email}` };
  ws.addRow([]); // trailing blank row
  await wb.xlsx.writeFile(path.join(out, file));
}

// 1) Valid file: 3 classes, with zero, empty, non-numeric and a mismatch warning.
const valid = [];
for (const cls of [4, 5, 6]) for (let i = 0; i < 8; i++) valid.push(student(i, cls));
valid[1] = student(1, 4, { final: 0, total1: 0, total2: 0, hw: 0, part: 0, perf: 0, quran: 0, exam: 0 }); // real zero
valid[2] = student(2, 4, { final: null }); // empty final total → excluded
valid[3] = student(3, 4, { exam: "غ", total2: null, final: "غ" }); // non-numeric
valid[9] = student(1, 5, { final: 99.999 }); // mismatch → warning; also tests rounding
valid[10] = student(2, 5, { hw: 9.456, total1: 9.456 + 9 + 15 + 0, perf: 15, part: 9 });
await write("valid.xlsx", valid, { dateHeader: true, formulas: true });

// 2) Invalid file: duplicate email, missing name, class not enabled, bad class.
const invalid = [student(0, 4), student(1, 4), student(2, 7), student(3, 5, { name: "" }), student(4, 5, { cls: "سادس" })];
invalid[1].email = invalid[0].email.toUpperCase();
await write("invalid.xlsx", invalid);

// 3) Missing required column.
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("الملخص العام");
  ws.addRow(HEADERS.filter((h) => h !== "المجموع2"));
  ws.addRow(["طالب", "a@test.school.example", 4]);
  await wb.xlsx.writeFile(path.join(out, "missing-column.xlsx"));
}
console.log("fixtures written");
