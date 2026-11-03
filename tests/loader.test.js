import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCsvText, LoadError } from '../js/loader.js';

const URL_ = 'https://docs.google.com/spreadsheets/d/e/x/pub?gid=0&single=true&output=csv';
const respond = (body, status = 200) => async () => new Response(body, { status });

test('returns CSV text and adds a cache-busting parameter', async () => {
  let seen;
  const text = await fetchCsvText(URL_, {
    fetchImpl: async (u, opts) => {
      seen = { u, opts };
      return new Response('Jen,Alex,Connor\n1,2,3');
    },
  });
  assert.equal(text, 'Jen,Alex,Connor\n1,2,3');
  assert.match(seen.u, /output=csv/);
  assert.match(seen.u, /_ts=\d+/);
  assert.equal(seen.opts.cache, 'no-store');
});

test('HTML instead of CSV is a clear error', async () => {
  await assert.rejects(fetchCsvText(URL_, { fetchImpl: respond('<!DOCTYPE html><html>Sign in</html>') }), (e) => {
    assert.ok(e instanceof LoadError);
    assert.match(e.title, /web page instead of CSV/);
    assert.ok(e.hints.some((h) => /Publish to web/.test(h)));
    return true;
  });
});

test('HTTP errors map to specific messages', async () => {
  await assert.rejects(fetchCsvText(URL_, { fetchImpl: respond('', 404) }), /HTTP 404/);
  await assert.rejects(fetchCsvText(URL_, { fetchImpl: respond('', 403) }), (e) => /denied/.test(e.title));
  await assert.rejects(fetchCsvText(URL_, { fetchImpl: respond('', 500) }), (e) => /error/.test(e.title));
});

test('network failure and timeout are reported, never replaced with sample data', async () => {
  await assert.rejects(
    fetchCsvText(URL_, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    (e) => e instanceof LoadError && /Couldn't reach/.test(e.title),
  );
  await assert.rejects(
    fetchCsvText(URL_, {
      timeoutMs: 20,
      fetchImpl: (_u, { signal }) =>
        new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    }),
    (e) => /too long/.test(e.title),
  );
});

test('empty body is an error', async () => {
  await assert.rejects(fetchCsvText(URL_, { fetchImpl: respond('   ') }), /no data/);
});
