import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCsv } from '../js/data.js';
import { computeStats } from '../js/stats.js';
import { computeAwards } from '../js/awards.js';
import { computeRecap } from '../js/recap.js';

const H = 'Jen,Alex,Connor,Winner\n';
const stats = (rows) => computeStats(interpretCsv(H + rows));

test('Winner column settles a tie for first: winner 1st, other tied player 2nd', () => {
  const d = interpretCsv(H + '120,120,95,Alex\n');
  assert.deepEqual(d.players, ['Jen', 'Alex', 'Connor'], 'Winner is not a player column');
  assert.deepEqual(d.warnings, []);
  const g = computeStats(d).games[0];
  assert.deepEqual(g.placeOf, { Jen: 2, Alex: 1, Connor: 3 });
  assert.deepEqual(g.winners, ['Alex']);
  assert.equal(g.isTie, false);
  assert.equal(g.wonOnTiebreak, true);
  assert.equal(g.margin, 0);
  assert.equal(g.isBlowout, false);
  assert.deepEqual(g.results.map((r) => r.player), ['Alex', 'Jen', 'Connor']);
});

test('tiebreaker results flow into wins, medals, head-to-head and awards', () => {
  const s = stats('120,120,95,Alex\n100,90,80,\n');
  const { Jen, Alex } = s.perPlayer;
  assert.deepEqual([Alex.wins, Alex.sharedWins, Jen.wins, Jen.silver], [1, 0, 1, 1]);
  assert.deepEqual([s.headToHead.Alex.Jen.wins, s.headToHead.Alex.Jen.losses, s.headToHead.Alex.Jen.ties], [1, 1, 0]);
  assert.equal(s.headToHead.Alex.Jen.avgMargin, -5, 'average margin still uses points');
  const a = Object.fromEntries(computeAwards(s).map((x) => [x.id, x]));
  assert.deepEqual(a.destroyer.holders.map((h) => h.player), ['Jen'], 'a 0-margin tiebreaker never wins The Destroyer');
  assert.equal(a.destroyer.value, 10);
  assert.deepEqual([a.heartbreaker.holders.map((h) => h.player), a.heartbreaker.value], [['Jen'], 120]);
  assert.deepEqual([a.underdog.holders.map((h) => h.player), a.underdog.value], [['Jen'], 100]);
});

test('three-way tie broken by the Winner column: 1st, 2nd, 2nd', () => {
  assert.deepEqual(stats('100,100,100,Connor\n').games[0].placeOf, { Jen: 2, Alex: 2, Connor: 1 });
});

test('blank, "Tie" or several names leave a tie shared, without warnings', () => {
  for (const w of ['', 'Tie', 'shared', 'Jen & Alex', 'Jen and Alex']) {
    const d = interpretCsv(H + `120,120,95,${w}\n`);
    assert.deepEqual(d.warnings, [], `"${w}"`);
    const g = computeStats(d).games[0];
    assert.equal(g.isTie, true, `"${w}"`);
    assert.deepEqual(g.winners, ['Jen', 'Alex']);
  }
});

test('Winner names are matched without regard to case', () => {
  assert.deepEqual(stats('120,120,95,alex\n').games[0].winners, ['Alex']);
});

test('a Winner that agrees with a clear win is fine; one that disagrees is flagged and ignored', () => {
  assert.deepEqual(interpretCsv(H + '110,104,90,Jen\n').warnings, []);
  const d = interpretCsv(H + '110,104,90,Alex\n');
  assert.equal(d.warnings.length, 1);
  assert.match(d.warnings[0].message, /Row 2: the Winner column says Alex, but the top score was Jen's 110 \(Alex had 104\)\. Using the scores\./);
  assert.deepEqual(computeStats(d).games[0].winners, ['Jen']);
});

test('a Winner that isn’t a player is flagged and ignored', () => {
  const d = interpretCsv(H + '120,120,95,Jenn\n');
  assert.match(d.warnings[0].message, /says "Jenn", which isn't a player name/);
  assert.equal(computeStats(d).games[0].isTie, true);
});

test('recap headline for a tiebreaker win', () => {
  const r = computeRecap(interpretCsv(H + '100,90,80,\n120,120,95,Alex\n'));
  assert.equal(r.headline, 'Alex won on the food tiebreaker after tying Jen on 120');
});
