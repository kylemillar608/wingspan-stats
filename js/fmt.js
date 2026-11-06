// Shared display formatting.

export const fmtInt = (x) => (x == null ? '—' : String(Math.round(x)));

// Whole numbers stay whole; everything else gets one decimal place.
export const fmtNum = (x, digits = 1) => {
  if (x == null || Number.isNaN(x)) return '—';
  return Number.isInteger(x) ? String(x) : x.toFixed(digits);
};

export const fmtAvg = (x) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(1));

export const fmtPct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export const fmtSigned = (x, digits = 1) => {
  if (x == null) return '—';
  const s = Number.isInteger(x) ? String(Math.abs(x)) : Math.abs(x).toFixed(digits);
  return x > 0 ? `+${s}` : x < 0 ? `−${s}` : s;
};

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function listNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export const gameRange = (from, to) => (from === to ? `Game ${from}` : `Games ${from}–${to}`);

export const gameList = (nums) =>
  nums.length === 1 ? `Game ${nums[0]}` : `Games ${listNames(nums.map(String))}`;

// A game's date for display: "Mon, Nov 3, 2026" (in the viewer's locale), or
// the sheet's original text if it couldn't be read.
export const fmtDate = (g, { weekday = true } = {}) =>
  g.date
    ? g.date.toLocaleDateString(undefined, { weekday: weekday ? 'short' : undefined, month: 'short', day: 'numeric', year: 'numeric' })
    : g.dateText || '';

// Compact date: "Oct 14", with the year only when it isn't this year.
export const fmtShortDate = (d, { weekday = false, now = new Date() } = {}) =>
  d
    ? d.toLocaleDateString(undefined, {
        weekday: weekday ? 'short' : undefined,
        month: 'short',
        day: 'numeric',
        year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      })
    : '';
