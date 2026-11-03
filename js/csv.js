// Minimal RFC 4180 CSV parser: quoted fields, escaped quotes (""),
// embedded commas/newlines, CRLF or LF line endings, and a leading BOM.

export class CsvError extends Error {}

export function parseCsv(text) {
  if (typeof text !== 'string') throw new CsvError('CSV input must be text.');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += c;
      }
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += c;
    }
    i++;
  }

  if (inQuotes) throw new CsvError('The CSV ends inside a quoted field (unbalanced quotes).');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
