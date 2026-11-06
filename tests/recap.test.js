import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCsv } from '../js/data.js';
import { computeRecap } from '../js/recap.js';

const REAL = 'Jen,Alex,Connor\r\n103,100,104\r\n102,100,101\r\n101,105,100\r\n99,75,120\r\n150,125,100';
const texts = (csv) => computeRecap(interpretCsv(csv)).events.map((e) => e.text);

test('recap of the snapshot’s Game 5 (Jen 150, Alex 125, Connor 100)', () => {
  const r = computeRecap(interpretCsv(REAL));
  assert.equal(r.game.number, 5);
  assert.equal(r.headline, 'Jen won with 150, 25 points ahead of Alex');
  const t = r.events.map((e) => e.text);
  assert.equal(t[0], 'Jen takes the lead on the leaderboard', 'lead changes come first');
  assert.ok(t.includes('Jen’s first win in 3 games'));
  assert.ok(t.includes('Jen takes The High Flyer (150 pts) from Connor'));
  assert.ok(t.includes('Alex takes The Heartbreaker (125 pts) from Jen'));
  assert.ok(t.includes('Jen joins Connor on The Emperor (2 wins)'));
  assert.ok(t.includes('Jen now holds The Nemesis (4–1) outright'));
  assert.ok(t.includes('Connor claims The Rock (±8.5 pts)'), 'first game where 5-game awards qualify');
  assert.ok(t.includes('Personal best for Jen: 150 (previous 103)'));
  assert.ok(t.includes('Personal best for Alex: 125 (previous 105)'));
  assert.ok(!t.some((x) => /Connor.*personal low/i.test(x)), 'equalling a low is not a new low');
  // Unchanged records are not mentioned.
  assert.ok(!t.some((x) => /Grounded Bird|Underdog|Dynasty|Dodo/.test(x)));
});

test('streaks: extended, ended, and long droughts', () => {
  // A wins 1–3, then B wins game 4; C never wins.
  const t = texts('A,B,C\n100,90,80\n100,90,80\n100,90,80\n90,100,80\n');
  assert.ok(t.includes('A’s 3-game winning streak is over'));
  assert.ok(t.includes('C has now gone 4 games without a win'));
  assert.ok(t.includes('B’s first win in 4 games'));
  const t2 = texts('A,B,C\n100,90,80\n100,90,80\n100,90,80\n');
  assert.ok(t2.includes('A extends their winning streak to 3'));
});

test('shared win headline and the very first game', () => {
  const r = computeRecap(interpretCsv('A,B,C\n100,100,90\n'));
  assert.equal(r.headline, 'A & B shared the win on 100');
  assert.ok(r.events.length > 0);
  assert.equal(computeRecap(interpretCsv('A,B,C\n')), null);
});

test('an average-based award that changes hands because of someone else says so', async () => {
  const { LOG, STRICT } = await import('./fixtures.js');
  const t = computeRecap(interpretCsv(LOG, STRICT)).events.map((e) => e.text);
  // Game 20: Jen won (her average in non-wins is untouched at 104.17); Connor lost
  // with 99, dropping his from 104.67 to 104.10, below Jen's.
  assert.ok(t.includes('The Unlucky One passes from Connor to Jen (104.2 avg) as Connor’s average in non-wins fell to 104.1'), t.join('\n'));
  assert.ok(!t.some((x) => /takes The Unlucky One/.test(x)));
});

test('an average-based award won by the new holder’s own game has no “as …” reason', () => {
  const t = texts(REAL);
  // Snapshot Game 5: Jen's 150 lifts her own career average above Connor's.
  assert.ok(t.includes('The Sharpshooter passes from Connor to Jen (111.0 avg)'), t.join('\n'));
});
