type Cell = string | number | boolean | null | undefined;
/** CSV that opens safely in Excel/Sheets: quotes awkward values and defuses spreadsheet formulas. */
export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map((c) => {
    if (c === null || c === undefined) return "";
    let s = typeof c === "string" ? c : String(c);
    if (typeof c === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(",")).join("\r\n");
}
export function downloadCsv(name: string, rows: Cell[][]) {
  const blob = new Blob(["\ufeff" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
