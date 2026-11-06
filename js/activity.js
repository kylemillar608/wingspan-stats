// Date-based helpers: gaps between games, weekly activity, "on this day" and
// birthday games. Only games with a readable date take part.

const DAY = 86400000;

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Whole calendar days from a to b (safe across daylight-saving changes).
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

// Monday of the week containing d.
export const weekStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const chronological = (games) => games.filter((g) => g.date).sort((a, b) => a.date - b.date || a.number - b.number);

export function activity(games, today) {
  const dated = chronological(games);
  if (!dated.length) return null;
  const first = dated[0];
  const last = dated[dated.length - 1];

  const gaps = dated.slice(1).map((g, i) => ({ days: daysBetween(dated[i].date, g.date), from: dated[i], to: g }));
  const longest = gaps.reduce((best, g) => (!best || g.days >= best.days ? g : best), null); // most recent of the longest

  // Weekly buckets from the first game's week through this week, or monthly
  // once there's more than ~18 months of history.
  const end = today > last.date ? today : last.date;
  let buckets = [];
  let unit = 'week';
  for (let w = weekStart(first.date); w <= end; w = addDays(w, 7)) buckets.push({ start: w, count: 0 });
  if (buckets.length > 78) {
    unit = 'month';
    buckets = [];
    for (let m = new Date(first.date.getFullYear(), first.date.getMonth(), 1); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      buckets.push({ start: m, count: 0 });
    }
  }
  const keyOf = (d) => (unit === 'week' ? weekStart(d) : new Date(d.getFullYear(), d.getMonth(), 1)).getTime();
  const index = new Map(buckets.map((b, i) => [b.start.getTime(), i]));
  for (const g of dated) buckets[index.get(keyOf(g.date))].count++;

  const spanDays = Math.max(1, daysBetween(first.date, last.date));
  return {
    first,
    last,
    games: dated.length,
    undated: games.length - dated.length,
    daysSinceLast: daysBetween(last.date, today),
    longestGap: longest,
    avgGap: gaps.length ? gaps.reduce((a, g) => a + g.days, 0) / gaps.length : null,
    perWeek: gaps.length ? (dated.length - 1) / (spanDays / 7) : null,
    buckets,
    unit,
  };
}

// Games played on today's month and day in earlier years, newest first.
export function onThisDay(games, today) {
  return chronological(games)
    .filter((g) => g.date.getMonth() === today.getMonth() && g.date.getDate() === today.getDate() && g.date.getFullYear() < today.getFullYear())
    .reverse();
}

// Games finished within `window` days of the player's birthday (either side,
// including across New Year).
export function birthdayGames(games, birthday, window = 3) {
  if (!birthday) return [];
  return chronological(games).filter((g) => {
    const y = g.date.getFullYear();
    return [y - 1, y, y + 1].some((yy) => Math.abs(daysBetween(new Date(yy, birthday.month - 1, birthday.day), g.date)) <= window);
  });
}
