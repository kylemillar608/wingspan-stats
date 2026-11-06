// All statistics are computed here, once, from the validated games.
//
// Tie rules (applied everywhere):
//  • Placement uses competition ranking: 1 + number of players with a strictly
//    higher score. Scores 120/120/95 → places 1, 1, 3. Scores 120/95/95 → 1, 2, 2.
//  • Every player in 1st place earns a win and a gold medal (shared wins count).
//    A tie for first can be settled by the sheet's Winner column (leftover
//    food): the named player takes 1st, the others tied with them take 2nd.
//  • Medals follow placement: 1st = gold, 2nd = silver, 3rd = bronze.
//  • Winning margin = top score − second-highest score, so a tied win has margin 0.
//  • Streaks run in sheet order and count shared wins as wins.

import { RULES } from './rules.js';

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Sample standard deviation (n − 1). Undefined for fewer than two games.
export function stdDev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

// `tiebreakWinner` (from the sheet's Winner column) settles a tie for first:
// that player takes 1st and the others tied with them drop to 2nd.
export function rankGame(scores, players, tiebreakWinner = null) {
  const entries = players.map((player) => ({ player, score: scores[player] }));
  for (const e of entries) e.place = 1 + entries.filter((o) => o.score > e.score).length;
  const brokeTie = tiebreakWinner != null && entries.filter((e) => e.place === 1).length > 1;
  if (brokeTie) for (const e of entries) if (e.place === 1 && e.player !== tiebreakWinner) e.place = 2;
  const results = [...entries].sort(
    (a, b) => b.score - a.score || a.place - b.place || players.indexOf(a.player) - players.indexOf(b.player),
  );
  const winners = results.filter((e) => e.place === 1).map((e) => e.player);
  const margin = results.length > 1 ? results[0].score - results[1].score : null;
  return {
    results,
    placeOf: Object.fromEntries(entries.map((e) => [e.player, e.place])),
    winners,
    isTie: winners.length > 1,
    wonOnTiebreak: brokeTie,
    topScore: results[0].score,
    margin,
    isBlowout: margin != null && margin >= RULES.blowoutMargin,
  };
}

// Runs of consecutive `true` values. Returns every run of maximal length so
// shared records can name each occurrence, plus the run still in progress.
export function streaks(flags) {
  const runs = [];
  let start = null;
  flags.forEach((f, i) => {
    if (f && start === null) start = i;
    if (!f && start !== null) {
      runs.push({ start, end: i - 1, length: i - start });
      start = null;
    }
  });
  if (start !== null) runs.push({ start, end: flags.length - 1, length: flags.length - start });
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  const current = flags.length && flags[flags.length - 1] ? runs[runs.length - 1].length : 0;
  return { longest, longestRuns: runs.filter((r) => r.length === longest && longest > 0), current };
}

function recentForm(scores, window) {
  const slice = scores.slice(-window);
  return { avg: mean(slice), n: slice.length, complete: scores.length >= window };
}

// Recent trend: average of the last k games against the k games just before
// them, where k = min(5, floor(games / 2)). Both windows slide forward with
// every game, so this measures recent improvement, not change since day one.
export function improvement(scores) {
  if (scores.length < RULES.risingStarMinGames) return null;
  const k = Math.min(RULES.risingStarWindow, Math.floor(scores.length / 2));
  const prior = mean(scores.slice(-2 * k, -k));
  const recent = mean(scores.slice(-k));
  return { k, prior, recent, delta: recent - prior, provisional: k < RULES.risingStarSolidWindow };
}

export function computeStats({ players, games }) {
  const ranked = games.map((g) => ({ ...g, ...rankGame(g.scores, players, g.tiebreakWinner) }));
  const gameNumbers = ranked.map((g) => g.number);
  const toGames = (run) => ({ length: run.length, from: gameNumbers[run.start], to: gameNumbers[run.end] });

  const perPlayer = {};
  for (const p of players) {
    const scores = ranked.map((g) => g.scores[p]);
    const places = ranked.map((g) => g.placeOf[p]);
    const won = places.map((x) => x === 1);
    const n = scores.length;
    const wins = won.filter(Boolean).length;
    const lossScores = scores.filter((_, i) => !won[i]);
    const winStreaks = streaks(won);
    const droughts = streaks(won.map((w) => !w));
    const high = n ? Math.max(...scores) : null;
    const low = n ? Math.min(...scores) : null;

    perPlayer[p] = {
      player: p,
      games: n,
      wins,
      sharedWins: ranked.filter((g, i) => won[i] && g.isTie).length,
      gold: places.filter((x) => x === 1).length,
      silver: places.filter((x) => x === 2).length,
      bronze: places.filter((x) => x === 3).length,
      winPct: n ? wins / n : null,
      total: scores.reduce((a, b) => a + b, 0),
      avg: mean(scores),
      median: median(scores),
      high,
      highGames: gameNumbers.filter((_, i) => scores[i] === high),
      low,
      lowGames: gameNumbers.filter((_, i) => scores[i] === low),
      avgPlace: mean(places),
      stdDev: stdDev(scores),
      last5: recentForm(scores, RULES.hotHandWindow),
      last10: recentForm(scores, RULES.formWindowLong),
      improvement: improvement(scores),
      centuryGames: scores.filter((s) => s >= RULES.centuryScore).length,
      clubGames: scores.filter((s) => s >= RULES.clubScore).length,
      blowoutWins: ranked.filter((g, i) => won[i] && g.isBlowout).length,
      lossAvg: mean(lossScores),
      losses: lossScores.length,
      currentWinStreak: winStreaks.current,
      longestWinStreak: winStreaks.longest,
      longestWinStreakRuns: winStreaks.longestRuns.map(toGames),
      currentDrought: droughts.current,
      longestDrought: droughts.longest,
      longestDroughtRuns: droughts.longestRuns.map(toGames),
      scores,
      places,
    };
  }

  // Leaderboard order: wins, then average placement, then average score,
  // then total points. Players equal on every key share a rank.
  const keyOf = (s) => [-s.wins, s.avgPlace ?? Infinity, -(s.avg ?? -Infinity), -s.total];
  const cmp = (a, b) => {
    const ka = keyOf(perPlayer[a]);
    const kb = keyOf(perPlayer[b]);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  };
  const order = [...players].sort((a, b) => cmp(a, b) || players.indexOf(a) - players.indexOf(b));
  const leaderboard = order.map((p) => ({
    player: p,
    rank: 1 + order.filter((o) => cmp(o, p) < 0).length,
    ...perPlayer[p],
  }));

  const cumulativeWins = {};
  const rolling = {};
  for (const p of players) {
    let c = 0;
    cumulativeWins[p] = [0, ...ranked.map((g) => (c += g.placeOf[p] === 1 ? 1 : 0))];
    const sc = perPlayer[p].scores;
    rolling[p] = sc.map((_, i) => {
      const w = sc.slice(Math.max(0, i - RULES.rollingWindow + 1), i + 1);
      return { avg: mean(w), n: w.length };
    });
  }

  return {
    players,
    games: ranked,
    perPlayer,
    leaderboard,
    headToHead: headToHead(players, ranked),
    series: { cumulativeWins, rolling },
  };
}

// Head-to-head: in every game, whoever of the two finished ahead "beats" the
// other, regardless of who won the game overall. That's the higher score, or
// the food tiebreaker when it decided first place. Otherwise equal is a tie.
export function headToHead(players, games) {
  const h2h = {};
  for (const a of players) {
    h2h[a] = {};
    for (const b of players) {
      if (a === b) continue;
      const ahead = games.map((g) => Math.sign(g.placeOf[b] - g.placeOf[a]));
      const last = ahead.length ? ahead[ahead.length - 1] : null;
      h2h[a][b] = {
        wins: ahead.filter((d) => d > 0).length,
        losses: ahead.filter((d) => d < 0).length,
        ties: ahead.filter((d) => d === 0).length,
        games: ahead.length,
        avgMargin: mean(games.map((g) => g.scores[a] - g.scores[b])),
        last: last == null ? null : last > 0 ? 'W' : last < 0 ? 'L' : 'T',
      };
    }
  }
  return h2h;
}
