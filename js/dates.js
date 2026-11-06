// Reads the date formats Google Sheets exports to CSV. Dates are local
// calendar days (midnight); any time of day is ignored.
//
//   2026-11-03 · 11/3/2026 · 3/11/2026 · 11/3/26 · 3.11.2026
//   Nov 3, 2026 · November 3rd 2026 · 3 Nov 2026 · Monday, November 3, 2026
//
// Purely numeric dates like 3/11/2026 are ambiguous (3 Nov or 11 Mar), so
// parseDate() returns both readings and resolveDates() picks one per column.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function make(y, m, d) {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

const year = (s) => (s.length === 2 ? 2000 + Number(s) : Number(s));
const month = (name) => {
  const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return i === -1 ? null : i + 1;
};

// → { date } for unambiguous text, { a, b, y } for numeric a/b/y, or null.
export function parseDate(text) {
  let s = String(text ?? '').trim();
  if (!s) return null;
  s = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, ''); // leading weekday
  s = s.replace(/[ T]\d{1,2}:\d{2}(:\d{2})?(\s?[ap]\.?m\.?)?$/i, '').trim(); // trailing time

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const date = make(+m[1], +m[2], +m[3]);
    return date ? { date } : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(s);
  if (m) return { a: +m[1], b: +m[2], y: year(m[3]) };

  m = /^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(s);
  if (m && month(m[1])) {
    const date = make(+m[3], month(m[1]), +m[2]);
    return date ? { date } : null;
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?\s+(\d{4})$/i.exec(s);
  if (m && month(m[2])) {
    const date = make(+m[3], month(m[2]), +m[1]);
    return date ? { date } : null;
  }
  return null;
}

// Decides day-first vs month-first for a whole column of parsed values:
// a first number above 12 means day-first, a second number above 12 means
// month-first, and an all-ambiguous column uses `fallback` ('MDY' | 'DMY').
export function dateOrderFor(parsed, fallback = 'MDY') {
  const numeric = parsed.filter((p) => p && p.a != null);
  const dayFirst = numeric.some((p) => p.a > 12);
  const monthFirst = numeric.some((p) => p.b > 12);
  if (dayFirst && !monthFirst) return { order: 'DMY', conflict: false };
  if (monthFirst && !dayFirst) return { order: 'MDY', conflict: false };
  return { order: fallback, conflict: dayFirst && monthFirst };
}

export function resolveDate(p, order) {
  if (!p) return null;
  if (p.date) return p.date;
  return order === 'DMY' ? make(p.y, p.b, p.a) : make(p.y, p.a, p.b);
}
