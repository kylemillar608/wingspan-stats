import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCsv } from '../js/data.js';
import { computeStats, median, stdDev, rankGame, streaks, improvement } from '../js/stats.js';
import { computeAwards } from '../js/awards.js';

// Snapshot of the published sheet as first fetched on 2026-11-03 (5 games),
// with hand-checked answers. The live sheet has changed since; this is a fixture.
const REAL = 'Jen,Alex,Connor\r\n103,100,104\r\n102,100,101\r\n101,105,100\r\n99,75,120\r\n150,125,100';
const close = (a, b, tol = 0.005) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);

test('median handles odd, even and unsorted input numerically', () => {
  assert.equal(median([103, 102, 101, 99, 150]), 102);
  assert.equal(median([10, 2, 30, 4]), 7);
  assert.equal(median([100, 99, 1000]), 100); // not string-sorted
  assert.equal(median([]), null);
});

test('standard deviation is the sample SD and undefined below 2 games', () => {
  close(stdDev([104, 101, 100, 120, 100]), Math.sqrt(73));
  assert.equal(stdDev([100]), null);
  assert.equal(stdDev([100, 100]), 0);
});

test('ties: shared first gets two wins and competition ranking 1,1,3', () => {
  const r = rankGame({ A: 120, B: 120, C: 95 }, ['A', 'B', 'C']);
  assert.deepEqual(r.placeOf, { A: 1, B: 1, C: 3 });
  assert.deepEqual(r.winners, ['A', 'B']);
  assert.equal(r.isTie, true);
  assert.equal(r.margin, 0);
  assert.equal(r.isBlowout, false);
});

test('ties for second: 1,2,2', () => {
  const r = rankGame({ A: 140, B: 95, C: 95 }, ['A', 'B', 'C']);
  assert.deepEqual(r.placeOf, { A: 1, B: 2, C: 2 });
  assert.equal(r.margin, 45);
  assert.equal(r.isBlowout, true);
});

test('blowout requires a margin of at least 20 over second place', () => {
  assert.equal(rankGame({ A: 120, B: 100, C: 50 }, ['A', 'B', 'C']).isBlowout, true);
  assert.equal(rankGame({ A: 119, B: 100, C: 50 }, ['A', 'B', 'C']).isBlowout, false);
});

test('streaks: longest runs (all occurrences) and current run', () => {
  const s = streaks([true, true, false, true, true, false, true]);
  assert.equal(s.longest, 2);
  assert.deepEqual(s.longestRuns.map((r) => [r.start, r.end]), [[0, 1], [3, 4]]);
  assert.equal(s.current, 1);
  assert.equal(streaks([false, false]).longest, 0);
  assert.equal(streaks([]).current, 0);
});

test('trend compares the last k games with the k before them, k = min(5, floor(n/2))', () => {
  assert.equal(improvement([1, 2, 3]), null);
  const i = improvement([103, 102, 101, 99, 150]);
  assert.deepEqual([i.k, i.prior, i.recent, i.delta, i.provisional], [2, 101.5, 124.5, 23, true]);
  const big = improvement(Array.from({ length: 30 }, (_, n) => n));
  assert.deepEqual([big.k, big.prior, big.recent, big.delta, big.provisional], [5, 22, 27, 5, false]);
});

test('trend windows slide: an improvement long ago doesn’t count as recent', () => {
  // Ten games at 60, then ten at 110: improved a lot, but flat for the last ten.
  const scores = [...Array(10).fill(60), ...Array(10).fill(110)];
  assert.equal(improvement(scores).delta, 0);
  // A player improving right now: flat, then a recent climb.
  assert.equal(improvement([...Array(10).fill(100), 100, 100, 100, 100, 100, 104, 106, 108, 110, 112]).delta, 8);
});

test('real sheet: per-player statistics', () => {
  const s = computeStats(interpretCsv(REAL));
  const { Jen, Alex, Connor } = s.perPlayer;

  assert.deepEqual([Jen.wins, Alex.wins, Connor.wins], [2, 1, 2]);
  assert.deepEqual([Jen.gold, Jen.silver, Jen.bronze], [2, 3, 0]);
  assert.deepEqual([Alex.gold, Alex.silver, Alex.bronze], [1, 1, 3]);
  assert.deepEqual([Connor.gold, Connor.silver, Connor.bronze], [2, 1, 2]);
  assert.deepEqual([Jen.total, Alex.total, Connor.total], [555, 505, 525]);
  assert.deepEqual([Jen.avg, Alex.avg, Connor.avg], [111, 101, 105]);
  assert.deepEqual([Jen.median, Alex.median, Connor.median], [102, 100, 101]);
  assert.deepEqual([Jen.high, Jen.low, Alex.low, Connor.high], [150, 99, 75, 120]);
  assert.deepEqual([Jen.avgPlace, Alex.avgPlace, Connor.avgPlace], [1.6, 2.4, 2]);
  close(Jen.stdDev, 21.852);
  close(Alex.stdDev, 17.819);
  close(Connor.stdDev, 8.544);
  assert.equal(Jen.winPct, 0.4);
  assert.equal(Jen.last5.avg, 111);
  assert.equal(Jen.last10.complete, false);
  assert.deepEqual([Jen.centuryGames, Alex.centuryGames, Connor.centuryGames], [4, 4, 5]);
  assert.deepEqual([Jen.clubGames, Alex.clubGames, Connor.clubGames], [1, 1, 1]);
  assert.deepEqual([Jen.blowoutWins, Alex.blowoutWins, Connor.blowoutWins], [1, 0, 1]);
  assert.deepEqual([Jen.currentWinStreak, Alex.currentDrought, Connor.currentDrought], [1, 2, 1]);
  assert.deepEqual([Jen.longestWinStreak, Alex.longestWinStreak, Connor.longestWinStreak], [1, 1, 1]);
  assert.deepEqual([Jen.longestDrought, Alex.longestDrought, Connor.longestDrought], [2, 2, 2]);
  assert.equal(Jen.lossAvg, 101);
});

test('real sheet: leaderboard order uses wins, then average placement', () => {
  const s = computeStats(interpretCsv(REAL));
  assert.deepEqual(s.leaderboard.map((r) => [r.player, r.rank]), [['Jen', 1], ['Connor', 2], ['Alex', 3]]);
});

test('real sheet: chart series', () => {
  const s = computeStats(interpretCsv(REAL));
  assert.deepEqual(s.series.cumulativeWins.Jen, [0, 0, 1, 1, 1, 2]);
  assert.deepEqual(s.series.cumulativeWins.Connor, [0, 1, 1, 1, 2, 2]);
  assert.deepEqual(s.series.cumulativeWins.Alex, [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(s.series.rolling.Jen.map((r) => r.n), [1, 2, 3, 4, 5]);
  assert.equal(s.series.rolling.Jen[1].avg, 102.5);
  assert.equal(s.series.rolling.Jen[4].avg, 111);
});

test('real sheet: Hall of Fame', () => {
  const awards = Object.fromEntries(computeAwards(computeStats(interpretCsv(REAL))).map((a) => [a.id, a]));
  const who = (id) => awards[id].holders.map((h) => h.player);

  assert.deepEqual(who('emperor'), ['Jen', 'Connor']);
  assert.equal(awards.emperor.value, 2);
  assert.deepEqual(who('sharpshooter'), ['Jen']);
  assert.deepEqual([who('high-flyer'), awards['high-flyer'].value], [['Jen'], 150]);
  assert.deepEqual([who('destroyer'), awards.destroyer.value], [['Jen'], 25]);
  assert.deepEqual(who('rock'), ['Connor']);
  assert.deepEqual(who('hot-hand'), ['Jen']);
  assert.deepEqual([who('rising-star'), awards['rising-star'].value], [['Jen'], 23]);
  assert.ok(awards['rising-star'].provisional);
  assert.deepEqual(who('dynasty'), ['Jen', 'Alex', 'Connor']);
  assert.deepEqual(who('apex-predator'), ['Jen', 'Connor']);
  assert.deepEqual(who('club-120'), ['Jen', 'Alex', 'Connor']);
  assert.deepEqual([who('underdog'), awards.underdog.value], [['Jen'], 102]);
  assert.deepEqual([who('grounded-bird'), awards['grounded-bird'].value], [['Alex'], 75]);
  assert.deepEqual([who('bridesmaid'), awards.bridesmaid.value], [['Jen'], 3]);
  assert.deepEqual([who('unlucky'), awards.unlucky.value], [['Jen'], 101]);
  assert.deepEqual([who('heartbreaker'), awards.heartbreaker.value], [['Alex'], 125]);
  assert.deepEqual(who('chaos-bird'), ['Jen']);
  assert.deepEqual([who('dodo'), awards.dodo.value], [['Jen', 'Alex', 'Connor'], 2]);
  assert.equal(awards.dodo.holders[1].detail, 'Games 1–2 and Games 4–5');
});

test('ties flow through medals, streaks and awards', () => {
  // G1: A&B tie for first. G2: A wins. G3: A,B,C all tie. G4: C wins by 30.
  const s = computeStats(interpretCsv('A,B,C\n100,100,90\n110,100,100\n95,95,95\n80,90,120\n'));
  const { A, B, C } = s.perPlayer;
  assert.deepEqual([A.wins, B.wins, C.wins], [3, 2, 2]);
  assert.deepEqual([A.sharedWins, B.sharedWins], [2, 2]);
  assert.deepEqual([A.gold, A.silver, A.bronze], [3, 0, 1]);
  assert.deepEqual([B.gold, B.silver, B.bronze], [2, 2, 0]);
  assert.deepEqual([C.gold, C.silver, C.bronze], [2, 1, 1]);
  assert.equal(A.longestWinStreak, 3, 'shared wins extend a streak');
  assert.equal(A.currentDrought, 1);

  const awards = Object.fromEntries(computeAwards(s).map((a) => [a.id, a]));
  assert.deepEqual(awards.destroyer.holders.map((h) => h.player), ['C']);
  assert.equal(awards.destroyer.value, 30);
  assert.deepEqual(awards['apex-predator'].holders.map((h) => h.player), ['C']);
  // Lowest winning score includes the three-way tie at 95.
  assert.deepEqual(awards.underdog.holders.map((h) => h.player), ['A', 'B', 'C']);
  // Heartbreaker only considers 2nd place (G1/G3 have nobody in 2nd).
  assert.deepEqual(awards.heartbreaker.holders.map((h) => h.player), ['B', 'C']);
  assert.equal(awards.heartbreaker.value, 100);
  // Fewer than 5 games: std-dev awards are withheld rather than guessed.
  assert.equal(awards.rock.holders.length, 0);
  assert.equal(awards['hot-hand'].holders.length, 0);
});

test('no games: everything degrades gracefully', () => {
  const s = computeStats(interpretCsv('A,B,C\n'));
  assert.equal(s.games.length, 0);
  assert.equal(s.perPlayer.A.avg, null);
  assert.equal(s.perPlayer.A.winPct, null);
  for (const a of computeAwards(s)) assert.equal(a.holders.length, 0, a.id);
});

test('editing a historical score changes the records', () => {
  const before = computeAwards(computeStats(interpretCsv(REAL))).find((a) => a.id === 'high-flyer');
  const edited = REAL.replace('150,125,100', '110,125,100');
  const after = computeAwards(computeStats(interpretCsv(edited))).find((a) => a.id === 'high-flyer');
  assert.equal(before.holders[0].player, 'Jen');
  assert.equal(after.holders[0].player, 'Alex');
  assert.equal(after.value, 125);
});

test('head-to-head counts the higher score in each game, whoever won overall', () => {
  const h = computeStats(interpretCsv(REAL)).headToHead;
  assert.deepEqual([h.Jen.Alex.wins, h.Jen.Alex.losses, h.Jen.Alex.ties], [4, 1, 0]);
  assert.equal(h.Jen.Alex.avgMargin, 10);
  assert.deepEqual([h.Alex.Jen.wins, h.Alex.Jen.losses], [1, 4]);
  assert.equal(h.Alex.Jen.avgMargin, -10);
  assert.deepEqual([h.Jen.Connor.wins, h.Jen.Connor.losses], [3, 2]);
  assert.equal(h.Jen.Connor.avgMargin, 6);
  assert.deepEqual([h.Connor.Alex.wins, h.Connor.Alex.losses], [3, 2]);
  assert.equal(h.Connor.Alex.avgMargin, 4);
  assert.equal(h.Jen.Alex.last, 'W');
  assert.equal(h.Connor.Jen.last, 'L');
});

test('head-to-head ties: equal scores are neither a win nor a loss', () => {
  const h = computeStats(interpretCsv('A,B,C\n100,100,90\n110,100,100\n')).headToHead;
  assert.deepEqual([h.A.B.wins, h.A.B.losses, h.A.B.ties], [1, 0, 1]);
  assert.deepEqual([h.B.C.wins, h.B.C.losses, h.B.C.ties], [1, 0, 1]);
});

test('Nemesis: most lopsided rivalry, ties shared', () => {
  const nem = (csv) => computeAwards(computeStats(interpretCsv(csv))).find((a) => a.id === 'nemesis');
  const real = nem(REAL);
  assert.deepEqual(real.holders.map((h) => h.player), ['Jen']);
  assert.equal(real.value, 3);
  assert.equal(real.valueText, '4–1');
  assert.equal(real.holders[0].detail, '4–1 over Alex');
  // First four games only: Jen over Alex 3–1 and Connor over Alex 3–1 share it.
  const four = nem(REAL.split('\r\n').slice(0, 5).join('\r\n'));
  assert.deepEqual(four.holders.map((h) => h.player), ['Jen', 'Connor']);
  assert.equal(four.valueText, '3–1');
  // Perfectly even rivalries: no holder.
  assert.equal(nem('A,B,C\n1,2,3\n3,2,1\n').holders.length, 0);
});
