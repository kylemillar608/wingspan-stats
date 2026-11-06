import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, dateOrderFor, resolveDate } from '../js/dates.js';
import { interpretCsv } from '../js/data.js';

const ymd = (d) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null);
const read = (text, order = 'MDY') => ymd(resolveDate(parseDate(text), order));

test('reads the formats Google Sheets exports', () => {
  assert.deepEqual(read('2026-11-03'), [2026, 11, 3]);
  assert.deepEqual(read('11/3/2026'), [2026, 11, 3]);
  assert.deepEqual(read('11/3/26'), [2026, 11, 3]);
  assert.deepEqual(read('3/11/2026', 'DMY'), [2026, 11, 3]);
  assert.deepEqual(read('3.11.2026', 'DMY'), [2026, 11, 3]);
  assert.deepEqual(read('Nov 3, 2026'), [2026, 11, 3]);
  assert.deepEqual(read('November 3rd 2026'), [2026, 11, 3]);
  assert.deepEqual(read('3 Nov 2026'), [2026, 11, 3]);
  assert.deepEqual(read('Monday, November 3, 2026'), [2026, 11, 3]);
  assert.deepEqual(read('11/3/2026 19:30:00'), [2026, 11, 3]);
  assert.deepEqual(read('2026-11-03 7:30 PM'), [2026, 11, 3]);
});

test('rejects impossible or incomplete dates', () => {
  assert.equal(read('2/30/2026'), null);
  assert.equal(read('2026-13-01'), null);
  assert.equal(read('Smarch 3, 2026'), null);
  assert.equal(read('11/3'), null, 'no year: can’t place it in time');
  assert.equal(read('last Tuesday'), null);
  assert.equal(read(''), null);
});

test('column order detection: day-first, month-first, ambiguous, conflicting', () => {
  const p = (...xs) => xs.map(parseDate);
  assert.deepEqual(dateOrderFor(p('13/10/2026', '1/11/2026')), { order: 'DMY', conflict: false });
  assert.deepEqual(dateOrderFor(p('10/13/2026', '11/1/2026'), 'DMY'), { order: 'MDY', conflict: false });
  assert.deepEqual(dateOrderFor(p('1/2/2026', '3/4/2026'), 'DMY'), { order: 'DMY', conflict: false });
  assert.deepEqual(dateOrderFor(p('13/1/2026', '1/13/2026')), { order: 'MDY', conflict: true });
});

test('a day-first sheet is detected from any unambiguous row', () => {
  const d = interpretCsv('Date,Jen,Alex,Connor\n3/10/2026,1,2,3\n18/10/2026,4,5,6\n');
  assert.deepEqual(ymd(d.games[0].date), [2026, 10, 3]);
  assert.deepEqual(ymd(d.games[1].date), [2026, 10, 18]);
  assert.deepEqual(d.warnings, []);
});

test('blank dates are fine; unreadable dates warn but the game still counts', () => {
  const d = interpretCsv('Date,Jen,Alex,Connor\n,1,2,3\nsometime,4,5,6\n2026-11-03,7,8,9\n');
  assert.equal(d.games.length, 3);
  assert.equal(d.games[0].date, null);
  assert.equal(d.games[1].date, null);
  assert.equal(d.games[1].dateText, 'sometime');
  assert.deepEqual(ymd(d.games[2].date), [2026, 11, 3]);
  assert.equal(d.warnings.length, 1);
  assert.match(d.warnings[0].message, /Row 3: couldn't read the date "sometime"/);
});

test('dates out of row order are flagged, but games keep their row order', () => {
  const d = interpretCsv('Date,Jen,Alex,Connor\n2026-10-09,1,2,3\n2026-10-02,4,5,6\n2026-10-09,7,8,9\n');
  assert.deepEqual(d.games.map((g) => g.number), [1, 2, 3]);
  assert.equal(d.warnings.length, 1);
  assert.match(d.warnings[0].message, /Row 3's date .* earlier than row 2's/);
});

test('several games on the same day are not out of order', () => {
  const d = interpretCsv('Date,Jen,Alex,Connor\n11/3/2026,1,2,3\n11/3/2026,4,5,6\n');
  assert.deepEqual(d.warnings, []);
});
