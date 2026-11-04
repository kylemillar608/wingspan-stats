import { test } from 'node:test';
import assert from 'node:assert/strict';
import { birthdaysOn, previewDate } from '../js/birthdays.js';

test('each birthday matches only its own day (local date)', () => {
  assert.deepEqual(birthdaysOn(new Date(2026, 8, 9)), ['Jen']);
  assert.deepEqual(birthdaysOn(new Date(2026, 10, 6)), ['Alex']);
  assert.deepEqual(birthdaysOn(new Date(2027, 9, 18, 23, 59)), ['Connor']);
  assert.deepEqual(birthdaysOn(new Date(2026, 10, 3)), []);
  assert.deepEqual(birthdaysOn(new Date(2026, 5, 9)), [], 'same day, wrong month');
});

test('shared birthdays list everyone', () => {
  const b = { A: { month: 1, day: 2 }, B: { month: 1, day: 2 } };
  assert.deepEqual(birthdaysOn(new Date(2026, 0, 2), b), ['A', 'B']);
});

test('?today= preview parameter', () => {
  const d = previewDate('?today=2026-11-06');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 10, 6]);
  assert.equal(previewDate('?today=nope'), null);
  assert.equal(previewDate(''), null);
});
