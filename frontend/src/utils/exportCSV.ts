/**
 * Export an array of objects to a CSV file and trigger download.
 * @param data - Array of objects to export
 * @param columns - Column definitions: { key, header }
 * @param filename - File name (without .csv extension)
 */
export function exportToCSV(
  data: Record<string, any>[],
  columns: { key: string; header: string }[],
  filename: string = 'export'
) {
  if (!data || data.length === 0) {
    alert('No data to export.');
    return;
  }

  const headers = columns.map((c) => c.header);
  let csvContent = '\uFEFF'; // BOM for Excel UTF-8
  csvContent += headers.join(',') + '\r\n';

  for (const row of data) {
    const line = columns.map((col) => {
      let val = row[col.key];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val}"`;
      }
      return val;
    });
    csvContent += line.join(',') + '\r\n';
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
