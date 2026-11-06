import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCsv } from '../js/data.js';
import { computeStats } from '../js/stats.js';
import { computeAwards } from '../js/awards.js';
import { computeRecap } from '../js/recap.js';
import { honours } from '../js/periods.js';
import { LOG, STRICT, TODAY } from './fixtures.js';

const ring = (csv, today) => {
  const data = interpretCsv(csv, STRICT);
  return computeAwards(computeStats(data), { honours: honours(data, today) }).find((a) => a.id === 'ring-chaser');
};

test('real sheet: Connor has the only ring (Q3 2026); Q4 is still in progress', () => {
  const a = ring(LOG, TODAY);
  assert.equal(a.category, 'glory');
  assert.equal(a.value, 1);
  assert.equal(a.valueText, '1 ring');
  assert.deepEqual(a.holders, [{ player: 'Connor', detail: 'Q3 2026 · 2× Player of the Month' }]);
});

test('once Q4 ends, Jen’s ring counts too; equal rings and months are shared', () => {
  // Same games, viewed from January: Q4 is finished (Jen), and Nov is Jen's.
  const a = ring(LOG, new Date(2027, 0, 5));
  // Jen: 1 ring + Oct, Nov = 2 months · Connor: 1 ring + Aug, Sep = 2 months → shared.
  assert.deepEqual(a.holders, [
    { player: 'Jen', detail: 'Q4 2026 · 2× Player of the Month' },
    { player: 'Connor', detail: 'Q3 2026 · 2× Player of the Month' },
  ]);
  assert.equal(a.valueText, '1 ring');
});

test('equal rings: more Player of the Month titles wins', () => {
  // Q1: A wins Jan and Feb, B wins Mar → A's season. Q2: B wins Apr and May → B's season.
  const csv = 'Date,A,B,C,Winner\n1/5/2026,100,90,80,A\n2/5/2026,100,90,80,A\n3/5/2026,90,100,80,B\n4/5/2026,90,101,80,B\n5/5/2026,90,102,80,B\n';
  const a = ring(csv, new Date(2026, 7, 1));
  assert.deepEqual(a.holders, [{ player: 'B', detail: 'Q2 2026 · 3× Player of the Month' }]);
});

test('before any season has finished, the card says when the first ring is handed out', () => {
  const a = ring('Date,A,B,C,Winner\n10/5/2026,100,90,80,A\n', TODAY);
  assert.equal(a.holders.length, 0);
  assert.equal(a.empty, 'The first ring is handed out when Q4 2026 ends.');
});

test('left out of single-season views, and never mentioned in the recap', () => {
  const data = interpretCsv(LOG, STRICT);
  const stats = computeStats(data);
  assert.equal(computeAwards(stats).find((a) => a.id === 'ring-chaser'), undefined);
  const withRings = computeAwards(stats, { honours: honours(data, TODAY) });
  const r = computeRecap(data, stats, withRings);
  assert.ok(!r.events.some((e) => /Ring Chaser/.test(e.text)));
});
