// Fetches the published Google Sheet CSV and turns every failure into a
// specific, actionable message. There is deliberately no fallback data.

import { CONFIG } from './config.js';

export class LoadError extends Error {
  constructor(title, message, hints = []) {
    super(message);
    this.title = title;
    this.hints = hints;
  }
}

const PUBLISH_HINT =
  'In Google Sheets: File → Share → Publish to web → pick the score tab and "Comma-separated values (.csv)" → Publish. Then paste the new link into js/config.js.';

export async function fetchCsvText(url = CONFIG.csvUrl, { timeoutMs = CONFIG.requestTimeoutMs, fetchImpl = globalThis.fetch } = {}) {
  if (!url) throw new LoadError('No data source configured', 'js/config.js has no csvUrl.', [PUBLISH_HINT]);

  // A unique query parameter stops browsers and proxies serving a stale copy.
  // Google's own publishing cache (a few minutes) still applies.
  const target = new URL(url);
  target.searchParams.set('_ts', Date.now().toString());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(target.toString(), { cache: 'no-store', redirect: 'follow', signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new LoadError('Google Sheets took too long', `No response after ${timeoutMs / 1000} seconds.`, [
        'Check your internet connection and try again.',
      ]);
    }
    const hints = [
      'Check your internet connection.',
      'Privacy extensions or ad blockers can block docs.google.com — try disabling them for this site.',
    ];
    if (globalThis.location?.protocol === 'file:') {
      hints.unshift('This page was opened directly from disk. Run a local server instead (see README: "python3 -m http.server").');
    }
    throw new LoadError("Couldn't reach Google Sheets", `The browser could not download the scores (${err?.message || 'network error'}).`, hints);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const s = res.status;
    if (s === 404 || s === 410 || s === 400) {
      throw new LoadError('Published sheet not found', `Google returned HTTP ${s}. The sheet may have been unpublished or the link changed.`, [PUBLISH_HINT]);
    }
    if (s === 401 || s === 403) {
      throw new LoadError('Access to the sheet was denied', `Google returned HTTP ${s}.`, [
        PUBLISH_HINT,
        'If this is a Google Workspace (work/school) account, the admin may block publishing outside the organisation — use a personal Google account instead.',
      ]);
    }
    throw new LoadError('Google Sheets returned an error', `HTTP ${s} ${res.statusText || ''}`.trim(), [
      'This is usually temporary on Google’s side. Try again in a minute.',
    ]);
  }

  const text = await res.text();
  const head = text.trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<')) {
    throw new LoadError('Got a web page instead of CSV', 'The link returned HTML (often a sign-in or "published as web page" view) rather than spreadsheet data.', [
      'Make sure the link ends with output=csv — choose "Comma-separated values (.csv)" when publishing.',
      PUBLISH_HINT,
    ]);
  }
  if (!text.trim()) {
    throw new LoadError('The published sheet is empty', 'Google returned no data.', [
      'Check the right tab is published and that row 1 holds the player names.',
    ]);
  }
  return text;
}
