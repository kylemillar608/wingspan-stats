import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCsv } from '../js/data.js';

const TODAY = new Date(2026, 10, 5);
const STRICT = { requireDate: true, requireWinner: true, today: TODAY };
const H = 'Date,Jen,Alex,Connor,Winner,https://kylemillar608.github.io/wingspan-stats/\r\n';
const check = (rows, opts = STRICT) => interpretCsv(H + rows, opts);
const msgs = (d) => d.warnings.map((w) => `${w.level}: ${w.message}`);

// The real "Log" tab as published on 2026-11-05.
const LOG = H + [
  '8/22/2026,116,93,98,Jen,', '8/28/2026,101,100,117,Connor,', '8/31/2026,115,98,116,Connor,',
  '9/2/2026,114,121,137,Connor,', '9/5/2026,116,106,123,Connor,', '9/12/2026,115,94,98,Jen,',
  '9/16/2026,92,123,125,Connor,', '9/20/2026,99,105,108,Connor,', '9/24/2026,118,120,106,Alex,',
  '9/27/2026,100,103,126,Connor,', '10/1/2026,83,100,105,Connor,', '10/3/2026,113,106,103,Jen,',
  '10/8/2026,90,90,113,Connor,', '10/11/2026,115,93,113,Jen,', '10/12/2026,117,117,126,Connor,',
  '10/14/2026,105,116,105,Alex,', '10/24/2026,117,78,100,Jen,', '10/31/2026,112,111,110,Jen,',
  '11/1/2026,113,103,109,Jen,', '11/3/2026,102,94,99,Jen,',
].join('\r\n');

test('the real Log tab passes every check', () => {
  const d = interpretCsv(LOG, STRICT);
  assert.deepEqual(d.players, ['Jen', 'Alex', 'Connor']);
  assert.equal(d.games.length, 20);
  assert.deepEqual(msgs(d), []);
  assert.equal(d.games[0].date.getTime(), new Date(2026, 7, 22).getTime());
  assert.equal(d.games[19].date.getTime(), new Date(2026, 10, 3).getTime());
});

test('missing Date or Winner columns are flagged when required', () => {
  const d = interpretCsv('Jen,Alex,Connor\n101,92,83\n', STRICT);
  assert.equal(d.games.length, 1);
  assert.deepEqual(msgs(d), [
    'check: No Date column was found, so games have no dates. Add a column headed "Date".',
    'check: No Winner column was found, so ties for first can’t be settled. Add a column headed "Winner".',
  ]);
  assert.deepEqual(msgs(interpretCsv('Jen,Alex,Connor\n101,92,83\n')), [], 'not required by default');
});

test('duplicate Date/Winner columns: first one is used, and it’s flagged', () => {
  const d = interpretCsv('Date,Jen,Alex,Connor,Winner,Date\n8/22/2026,116,93,98,Jen,1/1/2020\n', STRICT);
  assert.equal(d.games[0].date.getMonth(), 7);
  assert.match(msgs(d)[0], /two Date columns \(A and F\)\. Only column A is used/);
});

test('blank date or winner on a row is flagged; the game still counts', () => {
  const d = check(',116,93,98,Jen,\r\n8/28/2026,101,100,117,,\r\n8/31/2026,115,115,98,,');
  assert.equal(d.games.length, 3);
  assert.deepEqual(msgs(d), [
    'check: Row 2 has no date.',
    'check: Row 3 has no Winner. Going by the scores (Connor).',
    'check: Row 4: Jen & Alex tied on 115 and the Winner is blank, so they share the win. Enter whoever had the most leftover food.',
  ]);
  assert.equal(d.games[2].tiebreakWinner, null);
});

test('scores: non-numbers and negatives are not counted; decimals and implausible values are flagged', () => {
  const d = check('8/22/2026,116,9O,98,Jen,\r\n8/23/2026,-5,93,98,Connor,\r\n8/24/2026,101.5,93,98,Jen,\r\n8/25/2026,116,12,250,Connor,');
  assert.deepEqual(d.games.map((g) => g.sheetRow), [4, 5]);
  assert.deepEqual(msgs(d), [
    'skipped: Row 2 has a score that isn\'t a valid number (Alex: "9O"), so the game isn\'t counted.',
    'skipped: Row 3 has a score that isn\'t a valid number (Jen: "-5"), so the game isn\'t counted.',
    "check: Row 4: Jen's score 101.5 isn't a whole number.",
    "check: Row 5: Alex's score of 12 is unusually low for Wingspan. Typo?",
    "check: Row 5: Connor's score of 250 is unusually high for Wingspan. Typo?",
  ]);
});

test('a row entered twice is flagged (and still counted, since it might be real)', () => {
  const d = check('8/22/2026,116,93,98,Jen,\r\n8/29/2026,116,93,98,Jen,');
  assert.equal(d.games.length, 2);
  assert.deepEqual(msgs(d), ['check: Row 3 has exactly the same scores as row 2 (Jen 116, Alex 93, Connor 98). Entered twice?']);
});

test('dates: unreadable, future, before Wingspan existed, and out of order', () => {
  const d = check('8/22/2026,116,93,98,Jen,\r\nyesterday,101,100,117,Connor,\r\n8/22/2016,115,98,116,Connor,\r\n12/25/2026,114,121,137,Connor,\r\n9/5/2026,116,106,123,Connor,');
  assert.equal(d.games.length, 5, 'date problems never drop a game');
  assert.deepEqual(msgs(d), [
    'check: Row 3: couldn\'t read the date "yesterday". The game still counts.',
    'check: Row 4\'s date (8/22/2016) is before Wingspan came out in 2019. Typo in the year?',
    "check: Row 4's date (8/22/2016) is earlier than row 2's (8/22/2026). Games are ordered by row, so check the order.",
    "check: Row 5's date (12/25/2026) is in the future. Typo?",
    "check: Row 6's date (9/5/2026) is earlier than row 5's (12/25/2026). Games are ordered by row, so check the order.",
  ]);
});

test('a date one day ahead is allowed (time zones)', () => {
  assert.deepEqual(msgs(check('11/6/2026,116,93,98,Jen,')), []);
});

test('winner: not a player, contradicts the scores, “Tie” on a clear win, wrong tied set', () => {
  const d = check(
    [
      '8/22/2026,116,93,98,Jenn,', // typo
      '8/23/2026,115,93,98,Alex,', // contradicts
      '8/24/2026,114,93,98,Tie,', // "Tie" but Jen won outright
      '8/25/2026,116,116,98,Jen & Connor,', // Jen & Alex tied, not Connor
      '8/26/2026,117,117,98,alex,', // valid tiebreak, any case
      '8/27/2026,119,119,98,Jen & Alex,', // valid shared
    ].join('\r\n'),
  );
  assert.equal(d.games.length, 6);
  assert.deepEqual(msgs(d), [
    'check: Row 2: the Winner column says "Jenn", which isn\'t a player name. Using the scores.',
    "check: Row 3: the Winner column says Alex, but the top score was Jen's 115 (Alex had 93). Using the scores.",
    'check: Row 4: the Winner column says "Tie", but Jen won outright with 114. Using the scores.',
    'check: Row 5: the Winner column says "Jen & Connor", but the players tied on 116 were Jen & Alex. Using the scores.',
  ]);
  assert.equal(d.games[4].tiebreakWinner, 'Alex');
  assert.equal(d.games[5].tiebreakWinner, null);
});

test('rows with a date or winner but no scores are unfinished, not counted', () => {
  const d = check('8/22/2026,116,93,98,Jen,\r\n11/5/2026,,,,,\r\n,,,,Jen,');
  assert.equal(d.games.length, 1);
  assert.deepEqual(d.warnings.map((w) => [w.level, w.row]), [['skipped', 3], ['skipped', 4]]);
});

test('warnings are listed in row order', () => {
  const d = check('8/22/2016,116,93,98,Jenn,\r\n8/23/2026,101,100,117,,');
  assert.deepEqual(d.warnings.map((w) => w.row), [2, 2, 3]);
});

test('every warning has a level and a message', () => {
  const d = check('8/22/2016,116,abc,98,Jenn,\r\n8/22/2026,101.5,93,98,,');
  for (const w of d.warnings) {
    assert.ok(['skipped', 'check'].includes(w.level));
    assert.equal(typeof w.message, 'string');
  }
});
