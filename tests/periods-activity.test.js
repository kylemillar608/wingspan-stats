import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCsv } from '../js/data.js';
import { honours, playerHonours, seasonOf, monthOf } from '../js/periods.js';
import { activity, onThisDay, birthdayGames, daysBetween, weekStart } from '../js/activity.js';
import { computeRecap } from '../js/recap.js';
import { BIRTHDAYS } from '../js/birthdays.js';
import { LOG, STRICT, TODAY, logUpTo } from './fixtures.js';

const data = interpretCsv(LOG, STRICT);
const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

test('season and month periods', () => {
  assert.deepEqual(seasonOf(new Date(2026, 7, 22)), {
    id: '2026-Q3', label: 'Q3 2026', span: 'Jul–Sep', start: new Date(2026, 6, 1), end: new Date(2026, 8, 30),
  });
  assert.equal(seasonOf(new Date(2026, 11, 31)).id, '2026-Q4');
  assert.equal(seasonOf(new Date(2027, 0, 1)).id, '2027-Q1');
  assert.equal(monthOf(new Date(2026, 1, 14)).label, 'Feb 2026');
  assert.deepEqual(ymd(monthOf(new Date(2026, 1, 14)).end), [2026, 2, 28]);
});

test('season champions on the real sheet', () => {
  const s = honours(data, TODAY).seasons;
  assert.deepEqual(
    s.map((p) => [p.label, p.games, p.champions.map((c) => `${c.player} ${c.wins}`), p.inProgress]),
    [['Q4 2026', 10, ['Jen 6'], true], ['Q3 2026', 10, ['Connor 7'], false]],
  );
});

test('players of the month on the real sheet', () => {
  const m = honours(data, TODAY).months;
  assert.deepEqual(
    m.map((p) => [p.label, p.games, p.champions.map((c) => `${c.player} ${c.wins}`), p.inProgress]),
    [['Nov 2026', 2, ['Jen 2'], true], ['Oct 2026', 8, ['Jen 4'], false], ['Sep 2026', 7, ['Connor 5'], false], ['Aug 2026', 3, ['Connor 2'], false]],
  );
});

test('a player’s honours only count finished periods', () => {
  const board = honours(data, TODAY);
  assert.deepEqual(playerHonours(board, 'Connor'), { seasons: ['Q3 2026'], months: ['Sep 2026', 'Aug 2026'] });
  assert.deepEqual(playerHonours(board, 'Jen'), { seasons: [], months: ['Oct 2026'] });
  assert.deepEqual(playerHonours(board, 'Alex'), { seasons: [], months: [] });
});

test('shared champions when the leaderboard can’t separate them', () => {
  const d = interpretCsv('Date,A,B,C,Winner\n1/5/2026,100,90,80,A\n1/12/2026,90,100,80,B\n', STRICT);
  assert.deepEqual(honours(d, TODAY).months[0].champions.map((c) => c.player), ['A', 'B']);
});

test('undated games belong to no season', () => {
  const d = interpretCsv('Date,A,B,C,Winner\n,100,90,80,A\n1/12/2026,90,100,80,B\n');
  assert.deepEqual(honours(d, TODAY).seasons.map((s) => s.games), [1]);
});

test('activity on the real sheet', () => {
  const a = activity(data.games, TODAY);
  assert.deepEqual([ymd(a.first.date), ymd(a.last.date)], [[2026, 8, 22], [2026, 11, 3]]);
  assert.equal(a.daysSinceLast, 2);
  assert.equal(a.longestGap.days, 10);
  assert.deepEqual([ymd(a.longestGap.from.date), ymd(a.longestGap.to.date)], [[2026, 10, 14], [2026, 10, 24]]);
  assert.ok(Math.abs(a.avgGap - 73 / 19) < 1e-9);
  assert.equal(a.unit, 'week');
  assert.deepEqual(a.buckets.map((b) => b.count), [1, 1, 3, 1, 2, 2, 2, 2, 2, 1, 2, 1]);
  assert.deepEqual(ymd(a.buckets[0].start), [2026, 8, 17], 'weeks start on Monday');
  assert.equal(activity([], TODAY), null);
});

test('date helpers', () => {
  assert.equal(daysBetween(new Date(2026, 2, 7), new Date(2026, 2, 9)), 2, 'across a DST change');
  assert.deepEqual(ymd(weekStart(new Date(2026, 10, 8))), [2026, 11, 2], 'Sunday belongs to the week starting Monday');
});

test('on this day: same month and day in an earlier year', () => {
  assert.deepEqual(onThisDay(data.games, new Date(2027, 8, 2)).map((g) => g.number), [4]);
  assert.deepEqual(onThisDay(data.games, new Date(2026, 8, 2)), [], 'not the same year');
  assert.deepEqual(onThisDay(data.games, new Date(2027, 8, 3)), []);
});

test('birthday games: within 3 days either side, including across New Year', () => {
  const nums = (p) => birthdayGames(data.games, BIRTHDAYS[p], 3).map((g) => g.number);
  assert.deepEqual(nums('Jen'), [6], 'Sep 12 is 3 days after Sep 9; Sep 5 is 4 days before');
  assert.deepEqual(nums('Alex'), [20], 'Nov 3 is 3 days before Nov 6');
  assert.deepEqual(nums('Connor'), [], 'Oct 14 and Oct 24 are 4 and 6 days away');
  const d = interpretCsv('Date,A,B,C,Winner\n12/30/2025,100,90,80,A\n');
  assert.deepEqual(birthdayGames(d.games, { month: 1, day: 1 }, 3).length, 1);
});

test('recap pace: a long break and a busy week, but not a normal week', () => {
  const at = (n) => computeRecap(interpretCsv(logUpTo(n), STRICT)).events.map((e) => e.text);
  assert.ok(at(17).includes('First game in 10 days'), 'Oct 14 → Oct 24');
  assert.ok(at(5).includes('3rd game this week'), 'Aug 31, Sep 2, Sep 5');
  assert.ok(!at(20).some((t) => /game this week|First game in/.test(t)), 'Nov 3: 2 days after the last, 1st that week');
});
