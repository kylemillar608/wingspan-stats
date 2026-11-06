import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../js/csv.js';
import { interpretCsv, DataError } from '../js/data.js';

test('parses CRLF, quotes, escaped quotes, embedded commas/newlines and BOM', () => {
  const rows = parseCsv('﻿a,"b,c","say ""hi"""\r\n1,"two\nlines",3\r\n');
  assert.deepEqual(rows, [
    ['a', 'b,c', 'say "hi"'],
    ['1', 'two\nlines', '3'],
  ]);
});

test('parses the exact format the published sheet returns', () => {
  const csv = 'Jen,Alex,Connor\r\n103,100,104\r\n102,100,101\r\n101,105,100\r\n99,75,120\r\n150,125,100';
  const d = interpretCsv(csv);
  assert.deepEqual(d.players, ['Jen', 'Alex', 'Connor']);
  assert.equal(d.games.length, 5);
  assert.deepEqual(d.games[3].scores, { Jen: 99, Alex: 75, Connor: 120 });
  assert.equal(d.games[0].number, 1);
  assert.equal(d.games[0].sheetRow, 2);
  assert.deepEqual(d.warnings, []);
});

test('blank rows are skipped silently and never count as games', () => {
  const d = interpretCsv('A,B,C\n10,20,30\n,,\n\n40,50,60\n,,\n');
  assert.equal(d.games.length, 2);
  assert.equal(d.blankRows, 3);
  assert.deepEqual(d.warnings, []);
  assert.deepEqual(d.games.map((g) => g.number), [1, 2]);
});

test('missing scores are never treated as zero; the row is reported', () => {
  const d = interpretCsv('A,B,C\n10,20,30\n40,,60\n');
  assert.equal(d.games.length, 1);
  assert.equal(d.warnings.length, 1);
  assert.match(d.warnings[0].message, /Row 3 .*missing a score for B/);
});

test('non-numeric and negative scores are rejected and reported', () => {
  const d = interpretCsv('A,B,C\n10,abc,30\n-5,20,30\n 11 , 21 ,31\n');
  assert.equal(d.games.length, 1);
  assert.deepEqual(d.games[0].scores, { A: 11, B: 21, C: 31 });
  assert.equal(d.warnings.length, 2);
});

test('date/notes/winner columns are not mistaken for players', () => {
  const d = interpretCsv('Date,Jen,Alex,Connor,Winner,Notes\n2026-01-02,90,80,70,Jen,fun\n2026-01-09,,,,,next week\n');
  assert.deepEqual(d.players, ['Jen', 'Alex', 'Connor']);
  assert.equal(d.games.length, 1);
  assert.equal(d.games[0].dateText, '2026-01-02');
  assert.equal(d.games[0].date.getTime(), new Date(2026, 0, 2).getTime());
  assert.equal(d.games[0].notes, 'fun');
  assert.equal(d.warnings.length, 1, 'row with a date but no scores is flagged as unfinished');
});

test('header errors are explicit', () => {
  assert.throws(() => interpretCsv(''), DataError);
  assert.throws(() => interpretCsv('100,90,80\n1,2,3'), /numbers .* instead of player names/);
  assert.throws(() => interpretCsv('Jen,jen,Alex\n1,2,3'), /more than one column/);
  assert.throws(() => interpretCsv('Jen\n1'), /at least 2/);
});

test('unexpected player count is a warning, not a failure', () => {
  const d = interpretCsv('A,B\n1,2\n');
  assert.equal(d.games.length, 1);
  assert.match(d.warnings[0].message, /Expected 3 players/);
});

test('a link to the site in the header row is not a player (real sheet, 2026-11-03)', () => {
  const csv =
    'Jen,Alex,Connor,,,https://kylemillar608.github.io/wingspan-stats/\r\n83,100,105,,,\r\n90,90,110,,,\r\n102,94,99,,,';
  const d = interpretCsv(csv);
  assert.deepEqual(d.players, ['Jen', 'Alex', 'Connor']);
  assert.equal(d.games.length, 3);
  assert.deepEqual(d.warnings, []);
});

test('a text label in the header row with nothing beneath it is not a player', () => {
  const d = interpretCsv('Jen,Alex,Connor,,Our stats site\n1,2,3,,\n4,5,6,,\n');
  assert.deepEqual(d.players, ['Jen', 'Alex', 'Connor']);
  assert.equal(d.games.length, 2);
  assert.deepEqual(d.warnings, []);
});

test('with no games entered yet, every named column is still a player', () => {
  const d = interpretCsv('Jen,Alex,Connor\n,,\n');
  assert.deepEqual(d.players, ['Jen', 'Alex', 'Connor']);
  assert.equal(d.games.length, 0);
});

test('values in an unnamed column are reported', () => {
  const d = interpretCsv('A,B,C,\n1,2,3,4\n');
  assert.equal(d.games.length, 1);
  assert.match(d.warnings[0].message, /Column D/);
});
