// Seasons (calendar quarters) and months, plus their champions.
//
// A period's champion is whoever tops that period's leaderboard: most wins,
// then average placement, then average score, then total points, exactly
// like the all-time leaderboard. Players equal on all of those share it.
// Games without a readable date belong to no period.

import { computeStats } from './stats.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function seasonOf(date) {
  const y = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3);
  return {
    id: `${y}-Q${q + 1}`,
    label: `Q${q + 1} ${y}`,
    span: `${MONTHS[q * 3]}–${MONTHS[q * 3 + 2]}`,
    start: new Date(y, q * 3, 1),
    end: new Date(y, q * 3 + 3, 0),
  };
}

export function monthOf(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  return { id: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTHS[m]} ${y}`, start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
}

// Dated games grouped into periods, oldest period first.
export function groupByPeriod(games, periodOf) {
  const groups = new Map();
  for (const g of games) {
    if (!g.date) continue;
    const p = periodOf(g.date);
    if (!groups.has(p.id)) groups.set(p.id, { ...p, games: [] });
    groups.get(p.id).games.push(g);
  }
  return [...groups.values()].sort((a, b) => a.start - b.start);
}

export function champions(players, games) {
  if (!games.length) return [];
  return computeStats({ players, games })
    .leaderboard.filter((r) => r.rank === 1)
    .map((r) => ({ player: r.player, wins: r.wins, games: r.games }));
}

// Honours board: every season and month, newest first, with its champion(s).
// The period containing `today` is marked in progress.
export function honours({ players, games }, today) {
  const board = (periodOf) =>
    groupByPeriod(games, periodOf)
      .map((p) => ({
        id: p.id,
        label: p.label,
        span: p.span,
        start: p.start,
        end: p.end,
        games: p.games.length,
        champions: champions(players, p.games),
        inProgress: today >= p.start && today <= new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate(), 23, 59, 59),
      }))
      .reverse();
  return { seasons: board(seasonOf), months: board(monthOf) };
}

// Honours won by one player (finished periods only).
export function playerHonours(board, player) {
  const won = (list) => list.filter((p) => !p.inProgress && p.champions.some((c) => c.player === player)).map((p) => p.label);
  return { seasons: won(board.seasons), months: won(board.months) };
}
