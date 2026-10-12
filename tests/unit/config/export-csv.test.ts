import { describe, expect, it } from "vitest";
import { exportCsv } from "@/server/export-csv";

describe("complete bounded CSV exports", () => {
  it("quotes multiline Persian text and formula-like cells without changing decimal money", () => {
    expect(exportCsv([["نگه‌داری\nدر سایه", 'متن "مصوب"', "=SUM(1,2)", "12000", null]]))
      .toBe('\uFEFF"نگه‌داری\nدر سایه","متن ""مصوب""","\'=SUM(1,2)","12000",""');
  });
  it("counts actual UTF-8 bytes including BOM and row separators at an inclusive boundary", () => {
    const rows = [["فارسی"], ["60000"]];
    const body = exportCsv(rows);
    const size = Buffer.byteLength(body, "utf8");
    expect(exportCsv(rows, size)).toBe(body);
    expect(() => exportCsv(rows, size - 1)).toThrow(expect.objectContaining({ code: "CONFLICT", status: 409 }));
  });
  it("stops iterating after overflow and returns no partial download", () => {
    let visited = 0;
    function* rows() { for (const value of ["one", "two", "three"]) { visited++; yield [value]; } }
    expect(() => exportCsv(rows(), 10)).toThrow(expect.objectContaining({ code: "CONFLICT" }));
    expect(visited).toBe(2);
  });
});
