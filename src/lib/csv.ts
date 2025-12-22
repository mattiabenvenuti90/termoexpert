export function toCsvRows(headers: string[], rows: Array<string | number | null | undefined>[]) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      row
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
  }
  return lines.join("\n");
}
