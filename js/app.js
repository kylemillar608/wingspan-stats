import { CONFIG } from './config.js';
import { RULES } from './rules.js';
import { fetchCsvText, LoadError } from './loader.js';
import { interpretCsv, DataError } from './data.js';
import { computeStats } from './stats.js';
import { computeAwards } from './awards.js';
import { computeRecap } from './recap.js';
import { demoCsv } from './demo.js';
import { BIRTHDAYS, birthdaysOn, previewDate } from './birthdays.js';
import { groupByPeriod, honours, playerHonours, seasonOf } from './periods.js';
import { activity, birthdayGames, onThisDay } from './activity.js';
import { destroyCharts, renderActivity, renderCumulativeWins, renderRollingAverage, renderPlayerScores } from './charts.js';
import { fmtAvg, fmtDate, fmtInt, fmtShortDate, fmtNum, fmtPct, fmtSigned, gameList, listNames, ordinal, plural } from './fmt.js';

// ─────────────────────────── State ───────────────────────────

const DEMO = new URLSearchParams(location.search).has('demo');
const VIEWS = ['overview', 'players', 'hall', 'history'];

const state = {
  status: 'loading', // loading | ready | error
  data: null,
  stats: null,
  awards: null,
  recap: null,
  loadedAt: null,
  error: null,
  refreshError: null,
  refreshing: false,
  historyNewestFirst: true,
  scope: 'all', // 'all' or a season id such as '2026-Q4'
  scopeCache: new Map(),
  seasons: [],
  honours: null,
  activity: null,
  winsByDate: false,
};

const $ = (sel) => document.querySelector(sel);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pIndex = (p) => state.stats.players.indexOf(p);
const pc = (p) => `--pc: var(--p${pIndex(p) + 1})`;
const pname = (p) => `<span class="pname" style="${pc(p)}"><span class="swatch"></span>${esc(p)}</span>`;
const pnames = (ps) => ps.map(pname).join(' ');
const medals = (s) =>
  `<span class="medals" aria-label="${s.gold} gold, ${s.silver} silver, ${s.bronze} bronze">
    <span class="medal g" title="1st place">${s.gold}</span><span class="medal s" title="2nd place">${s.silver}</span><span class="medal b" title="3rd place">${s.bronze}</span>
  </span>`;
const placeBadge = (place, shared) =>
  `<span class="place p${Math.min(place, 4)}" title="${ordinal(place)} place${shared ? ' (shared)' : ''}">${ordinal(place)}${shared ? '=' : ''}</span>`;

// ─────────────────────────── Loading ───────────────────────────

async function load({ background = false } = {}) {
  if (background) {
    state.refreshing = true;
    renderStatus();
  } else {
    state.status = 'loading';
    render();
  }
  try {
    const text = DEMO ? demoCsv() : await fetchCsvText();
    const data = interpretCsv(text, { dateOrder: CONFIG.dateOrder, requireDate: CONFIG.requireDate, requireWinner: CONFIG.requireWinner });
    state.data = data;
    state.stats = computeStats(data);
    state.seasons = groupByPeriod(data.games, seasonOf);
    state.honours = honours(data, today());
    state.awards = computeAwards(state.stats, { honours: state.honours });
    state.recap = computeRecap(data, state.stats, state.awards);
    state.activity = activity(data.games, today());
    state.scopeCache = new Map();
    if (!state.seasons.some((x) => x.id === state.scope)) state.scope = 'all';
    state.loadedAt = new Date();
    state.status = 'ready';
    state.error = null;
    state.refreshError = null;
  } catch (err) {
    console.error(err);
    if (background && state.stats) {
      state.refreshError = err;
    } else {
      state.status = 'error';
      state.error = err;
    }
  } finally {
    state.refreshing = false;
  }
  render();
}

// ─────────────────────────── Routing ───────────────────────────

function route() {
  const [view, ...rest] = location.hash.replace(/^#/, '').split('/');
  return { view: VIEWS.includes(view) ? view : 'overview', arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

function render() {
  const { view } = route();
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  renderStatus();
  renderNotices();
  renderBirthday();

  const stateEl = $('#state');
  destroyCharts();
  VIEWS.forEach((v) => ($(`#view-${v}`).hidden = true));

  if (state.status === 'loading') {
    stateEl.innerHTML = loadingCard();
    return;
  }
  if (state.status === 'error') {
    stateEl.innerHTML = errorCard(state.error);
    return;
  }
  stateEl.innerHTML = '';
  const el = $(`#view-${view}`);
  el.hidden = false;
  ({ overview: renderOverview, players: renderPlayers, hall: renderHall, history: renderHistory })[view](el);
}

// ─────────────────────────── Chrome ───────────────────────────

function renderStatus() {
  const el = $('#status');
  if (state.status !== 'ready') {
    el.innerHTML = '';
    return;
  }
  const time = state.loadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const src = DEMO
    ? '<span><span class="live-dot demo"></span><strong>Demo data</strong> (not real games)</span>'
    : '<span><span class="live-dot"></span>Live from Google Sheets</span>';
  el.innerHTML = `
    ${src}<span class="sep">·</span>
    <span>${plural(state.stats.games.length, 'game')}</span><span class="sep">·</span>
    <span>Updated ${esc(time)}</span>
    <button class="btn btn-small" type="button" data-action="refresh" ${state.refreshing ? 'disabled' : ''}>
      ${state.refreshing ? 'Refreshing…' : '↻ Refresh'}
    </button>
    ${
      state.refreshError
        ? `<span class="refresh-error">Couldn’t refresh (${esc(state.refreshError.title || state.refreshError.message)}). Showing scores from ${esc(time)}.</span>`
        : ''
    }`;
}

// ─────────────────────────── Birthday easter egg ───────────────────────────

const BIRTHDAY_DISMISS_KEY = 'wingspan-stats:birthday-dismissed';
const today = () => previewDate(location.search) || new Date();
const dateKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
let confettiShown = false;

// Today's birthday people, spelled as in the sheet when they're in it.
function birthdayPeople() {
  const players = state.stats?.players || [];
  return birthdaysOn(today()).map((n) => players.find((p) => p.toLowerCase() === n.toLowerCase()) || n);
}

function birthdayLine(names) {
  const s = names.length === 1 ? state.stats?.perPlayer[names[0]] : null;
  if (!s || !s.games) return 'Birthday rules: the birthday bird picks the expansion.';
  const p = names[0];
  if (s.currentWinStreak >= 2) return `${p} is on a ${s.currentWinStreak}-game winning streak. Letting it grow would be a lovely present.`;
  if (state.stats.leaderboard[0].player === p) return `Birthday and top of the leaderboard. Some birds have all the luck.`;
  return `Birthday rules: ${p} picks the expansion. Best score to beat today: ${s.high}.`;
}

function renderBirthday() {
  const el = $('#birthday');
  // Wait for the scores, so the one-time confetti isn't spent on the loading screen.
  const names = state.status === 'ready' ? birthdayPeople() : [];
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(BIRTHDAY_DISMISS_KEY) === dateKey(today());
  } catch {}
  if (!names.length || dismissed) {
    el.innerHTML = '';
    return;
  }
  const colors = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--gold)', 'var(--wheat)'];
  const confetti = confettiShown
    ? ''
    : `<div class="confetti" aria-hidden="true">${Array.from(
        { length: 22 },
        (_, i) =>
          `<i style="left:${(i * 37) % 100}%;background:${colors[i % colors.length]};animation-delay:${(i % 7) * 0.12}s;--r:${(i * 53) % 360}deg"></i>`,
      ).join('')}</div>`;
  confettiShown = true;
  el.innerHTML = `
    <section class="birthday" role="status">
      ${confetti}
      <div class="bday-cake" aria-hidden="true">🎂</div>
      <div class="bday-text">
        <h2>Happy birthday, ${names.map((n) => (state.stats?.players.includes(n) ? pname(n) : esc(n))).join(' &amp; ')}!</h2>
        <p>${esc(birthdayLine(names))}</p>
      </div>
      <button class="icon-btn bday-close" type="button" data-action="dismiss-birthday" aria-label="Dismiss birthday message" title="Dismiss for today">×</button>
    </section>`;
}

const isBirthday = (p) => birthdayPeople().includes(p);

function renderNotices() {
  const el = $('#notices');
  const w = state.status === 'ready' ? state.data.warnings : [];
  if (!w.length) {
    el.innerHTML = '';
    return;
  }
  const skipped = w.filter((x) => x.level === 'skipped');
  const check = w.filter((x) => x.level !== 'skipped');
  const parts = [skipped.length && `${plural(skipped.length, 'row')} not counted`, check.length && `${plural(check.length, 'thing')} to check`].filter(Boolean);
  const list = (title, items) =>
    items.length ? `<p class="notice-group">${title}</p><ul>${items.map((x) => `<li>${esc(x.message)}</li>`).join('')}</ul>` : '';
  el.innerHTML = `
    <details class="notice" ${w.length <= 3 ? 'open' : ''}>
      <summary>⚠ Sheet check: ${parts.join(' · ')}</summary>
      ${list('Not counted (fix these rows in the sheet to include them):', skipped)}
      ${list('Counted, but worth a look:', check)}
    </details>`;
}

function loadingCard() {
  return `
    <div class="state-card" role="status">
      <svg class="loader-bird brand-mark" viewBox="0 0 40 40" aria-hidden="true">${$('.brand-mark').innerHTML}</svg>
      <h2>${DEMO ? 'Loading demo data…' : 'Fetching scores from Google Sheets…'}</h2>
      <p>This usually takes a second or two.</p>
    </div>`;
}

function errorCard(err) {
  const title = err instanceof LoadError ? err.title : err instanceof DataError ? 'The sheet couldn’t be read' : 'Something went wrong';
  const hints = err?.hints?.length ? err.hints : ['Try again in a moment.'];
  return `
    <div class="state-card" role="alert">
      <div class="state-icon" aria-hidden="true">🪹</div>
      <h2>${esc(title)}</h2>
      <p>${esc(err?.message || String(err))}</p>
      <ul class="hints">${hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <div class="actions">
        <button class="btn btn-primary" type="button" data-action="retry">Try again</button>
        ${DEMO ? '' : `<a class="btn" href="${esc(CONFIG.csvUrl)}" target="_blank" rel="noopener">Open the CSV link</a>`}
        ${DEMO ? '' : '<a class="btn" href="?demo#overview">Preview with demo data</a>'}
      </div>
      <p class="state-tech">No scores are shown because real data could not be loaded. Source: ${esc(DEMO ? 'demo' : CONFIG.csvUrl)}</p>
    </div>`;
}

// ─────────────────────────── Season scope ───────────────────────────

// Stats and awards for the selected season (or all time), computed once each.
function scoped() {
  if (state.scope === 'all') return { stats: state.stats, awards: state.awards, season: null };
  if (!state.scopeCache.has(state.scope)) {
    const season = state.seasons.find((x) => x.id === state.scope);
    const stats = computeStats({ players: state.data.players, games: season.games });
    state.scopeCache.set(state.scope, { stats, awards: computeAwards(stats), season });
  }
  return state.scopeCache.get(state.scope);
}

const scopeName = (season) => (season ? season.label : 'All time');

// The season picker. Hidden until there are two seasons to choose between.
function scopeBar() {
  if (state.seasons.length < 2) return '';
  const live = new Set(state.honours.seasons.filter((x) => x.inProgress).map((x) => x.id));
  const opt = (value, label) => `<option value="${value}" ${state.scope === value ? 'selected' : ''}>${esc(label)}</option>`;
  return `
    <div class="scope-row">
      <label class="scope"><span class="scope-label">Showing</span>
        <select data-scope aria-label="Choose a season">
          ${opt('all', `All time · ${plural(state.stats.games.length, 'game')}`)}
          ${[...state.seasons]
            .reverse()
            .map((x) => opt(x.id, `${x.label} (${x.span})${live.has(x.id) ? ', in progress' : ''} · ${plural(x.games.length, 'game')}`))
            .join('')}
        </select>
      </label>
    </div>`;
}

// ─────────────────────────── Overview ───────────────────────────

function renderOverview(el) {
  const { stats, awards, season } = scoped();
  const { games, players } = stats;
  if (!games.length) {
    el.innerHTML = scopeBar() + emptyState();
    return;
  }
  // Date axis is offered only when every game in view has a date.
  const canDate = games.length >= 2 && games.every((g) => g.date);
  const byDate = canDate && state.winsByDate;
  const byId = Object.fromEntries(awards.map((a) => [a.id, a]));
  const leaders = byId.emperor.holders.map((h) => h.player);
  const high = byId['high-flyer'];
  const topStreak = Math.max(...players.map((p) => stats.perPlayer[p].currentWinStreak));
  const streakers = players.filter((p) => stats.perPlayer[p].currentWinStreak === topStreak);

  const span = canDate ? `${fmtShortDate(games[0].date)} – ${fmtShortDate(games[games.length - 1].date)}` : `${players.length} players, every game`;
  el.innerHTML = `
    ${scopeBar()}
    <div class="tiles">
      <div class="tile">
        <div class="tile-label">Games played</div>
        <div class="tile-value">${games.length}</div>
        <div class="tile-sub">${esc(span)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Most wins</div>
        <div class="tile-value names">${leaders.length ? pnames(leaders) : '—'}</div>
        <div class="tile-sub">${leaders.length ? `${plural(byId.emperor.value, 'win')}${leaders.length > 1 ? ' each' : ''}` : 'No wins yet'}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Record score</div>
        <div class="tile-value">${fmtInt(high.value)}</div>
        <div class="tile-sub">${high.holders.map((h) => `${esc(h.player)} · ${esc(h.detail)}`).join('<br>')}</div>
      </div>
      <div class="tile">
        <div class="tile-label">${season && !state.honours.seasons.find((x) => x.id === season.id)?.inProgress ? 'Streak at season end' : 'Current streak'}</div>
        <div class="tile-value names">${pnames(streakers)}</div>
        <div class="tile-sub">${plural(topStreak, 'win')} in a row${streakers.length > 1 ? ' each' : ''}</div>
      </div>
    </div>

    ${season ? '' : recapCard()}

    <section class="section">
      <div class="section-head">
        <h2>Leaderboard</h2>
        <span class="sub">${esc(scopeName(season))} · ${plural(games.length, 'game')}</span>
      </div>
      <div class="card">
        ${leaderboardCards(stats)}
        ${leaderboardTable(stats)}
        <p class="footnote">Ranked by wins, then average placement, then average score.</p>
        ${rulesDetails()}
      </div>
    </section>

    <section class="section">
      <div class="card chart-card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Cumulative wins</h2>
            <p class="card-sub">Running total of wins after each game. Shared wins count for everyone tied.</p>
          </div>
          ${
            canDate
              ? `<div class="seg seg-small" role="group" aria-label="Horizontal axis">
                  <button type="button" data-wins-axis="game" aria-pressed="${!byDate}">Game #</button>
                  <button type="button" data-wins-axis="date" aria-pressed="${byDate}">Date</button>
                </div>`
              : ''
          }
        </div>
        <div class="chart-box tall"><canvas id="chart-wins" role="img" aria-label="Line chart of cumulative wins per player across all games"></canvas></div>
        ${dataTable(
          'Show as table',
          ['Game', ...players],
          [['Start', ...players.map(() => 0)], ...games.map((g, i) => [g.number, ...players.map((p) => stats.series.cumulativeWins[p][i + 1])])],
        )}
      </div>
      ${headToHeadCard(stats)}
      <div class="card chart-card">
        <h2 class="card-title">Rolling average score</h2>
        <p class="card-sub">Average of each player’s last ${RULES.rollingWindow} games.</p>
        <div class="chart-box"><canvas id="chart-rolling" role="img" aria-label="Line chart of each player's rolling ${RULES.rollingWindow}-game average score"></canvas></div>
        <p class="chart-note">Dashed segments: fewer than ${RULES.rollingWindow} games played yet, so the average uses every game so far.</p>
        ${dataTable(
          'Show as table',
          ['Game', ...players],
          games.map((g, i) => [g.number, ...players.map((p) => fmtAvg(stats.series.rolling[p][i].avg))]),
        )}
      </div>
    </section>`;

  renderCumulativeWins($('#chart-wins'), stats, { byDate });
  renderRollingAverage($('#chart-rolling'), stats);
}

const RECAP_SHOWN = 5;

function recapCard() {
  const r = state.recap;
  if (!r) return '';
  const g = r.game;
  const item = (e) => `<li><span class="recap-icon" aria-hidden="true">${e.icon}</span><span>${esc(e.text)}</span></li>`;
  const shown = r.events.slice(0, RECAP_SHOWN);
  const rest = r.events.slice(RECAP_SHOWN);
  return `
    <section class="section">
      <div class="card recap">
        <div class="recap-head">
          <div>
            <div class="tile-label">Latest game · Game ${g.number}${fmtDate(g) ? ` · ${esc(fmtDate(g))}` : ''}</div>
            <h2 class="recap-title">${esc(r.headline)}</h2>
          </div>
          <div class="recap-scores">${g.results
            .map((x) => `<div class="row">${placeBadge(x.place, x.place === 1 && g.isTie)}${pname(x.player)}<span class="sc">${x.score}</span></div>`)
            .join('')}</div>
        </div>
        ${
          r.events.length
            ? `<ul class="recap-events">${shown.map(item).join('')}</ul>
               ${rest.length ? `<details class="recap-more"><summary>${plural(rest.length, 'more change')}</summary><ul class="recap-events">${rest.map(item).join('')}</ul></details>` : ''}`
            : '<p class="card-sub">No records changed hands this time.</p>'
        }
        ${onThisDayLine()}
      </div>
    </section>`;
}

// One quiet line, only on the anniversary of an earlier game (max two).
function onThisDayLine() {
  const now = today();
  const past = onThisDay(state.stats.games, now).slice(0, 2);
  if (!past.length) return '';
  const ago = (g) => plural(now.getFullYear() - g.date.getFullYear(), 'year');
  const text = (g) =>
    `${ago(g)} ago today, ${listNames(g.winners)} ${g.isTie ? 'shared the win' : 'won'} Game ${g.number} with ${g.topScore}.`;
  return `<p class="on-this-day"><span aria-hidden="true">🗓️</span> ${past.map((g) => esc(text(g))).join(' ')}</p>`;
}

function rivalryBar(a, b, r) {
  const seg = (n, style, cls = '') => (n ? `<span class="${cls}" style="flex:${n};${style}"></span>` : '');
  return `<div class="rv-bar" role="img" aria-label="${esc(a)} ${r.wins}, ${esc(b)} ${r.losses}, ${plural(r.ties, 'tie')}">
    ${seg(r.wins, `background:var(--p${pIndex(a) + 1})`)}${seg(r.ties, '', 'tie')}${seg(r.losses, `background:var(--p${pIndex(b) + 1})`)}
  </div>`;
}

function headToHeadCard(stats) {
  const { players, headToHead: h } = stats;
  const pairs = [];
  players.forEach((a, i) =>
    players.slice(i + 1).forEach((b) => {
      // Put the player leading the rivalry on the left.
      const [x, y] = h[a][b].wins >= h[a][b].losses ? [a, b] : [b, a];
      pairs.push({ a: x, b: y, r: h[x][y] });
    }),
  );
  pairs.sort((p, q) => q.r.wins - q.r.losses - (p.r.wins - p.r.losses));
  const lastText = ({ a, b, r }) => (r.last === 'T' ? 'tied' : r.last === 'W' ? esc(a) : esc(b));
  return `
    <div class="card">
      <h2 class="card-title">Head-to-head</h2>
      <p class="card-sub">Who finished ahead of whom in each game (higher score, or the food tiebreaker), whoever won the game overall.</p>
      <div class="rivalries">${pairs
        .map(
          (p) => `
        <div class="rivalry">
          <div class="rv-names">
            <span>${pname(p.a)} <strong class="rv-count">${p.r.wins}</strong></span>
            ${p.r.ties ? `<span class="rv-ties">${plural(p.r.ties, 'tie')}</span>` : ''}
            <span><strong class="rv-count">${p.r.losses}</strong> ${pname(p.b)}</span>
          </div>
          ${rivalryBar(p.a, p.b, p.r)}
          <div class="rv-meta">${
            p.r.wins === p.r.losses ? 'Dead even' : `${esc(p.a)} leads`} · Average margin ${esc(p.a)} ${fmtSigned(p.r.avgMargin)
          } · Last game: ${lastText(p)}</div>
        </div>`,
        )
        .join('')}</div>
    </div>`;
}

function rivalsCard(stats, player) {
  const h = stats.headToHead[player];
  const opps = stats.players.filter((p) => p !== player);
  const most = Math.max(...opps.map((o) => h[o].losses));
  const nemeses = opps.filter((o) => h[o].losses === most && h[o].losses > h[o].wins);
  return `
    <div class="card">
      <h3 class="card-title">Head-to-head</h3>
      <p class="card-sub">${
        nemeses.length
          ? `🎭 Nemesis: ${nemeses.map((n) => `${esc(n)} (beats ${esc(player)} ${h[n].losses}–${h[n].wins})`).join(', ')}`
          : `${esc(player)} doesn’t trail anyone head-to-head.`
      }</p>
      <div class="rivalries">${opps
        .map((o) => {
          const r = h[o];
          return `
        <div class="rivalry">
          <div class="rv-names">
            <span>vs ${pname(o)}</span>
            <span><strong class="rv-count">${r.wins}–${r.losses}</strong>${r.ties ? ` <span class="rv-ties">${plural(r.ties, 'tie')}</span>` : ''}</span>
          </div>
          ${rivalryBar(player, o, r)}
          <div class="rv-meta">Average margin ${fmtSigned(r.avgMargin)} · Last game: ${r.last === 'W' ? 'won' : r.last === 'L' ? 'lost' : 'tied'}</div>
        </div>`;
        })
        .join('')}</div>
    </div>`;
}

function leaderboardCards(stats) {
  return `<div class="lb-cards">${stats.leaderboard
    .map(
      (r) => `
      <a class="lb-card" href="#players/${encodeURIComponent(r.player)}" style="${pc(r.player)}; text-decoration:none; color:inherit">
        <div class="lb-rank">${r.rank}</div>
        <div class="who">${pname(r.player)}${medals(r)}</div>
        <div class="lb-wins"><strong>${r.wins}</strong><span>${r.wins === 1 ? 'win' : 'wins'}</span></div>
        <dl class="lb-stats">
          <div><dt>Win %</dt><dd>${fmtPct(r.winPct)}</dd></div>
          <div><dt>Avg</dt><dd>${fmtAvg(r.avg)}</dd></div>
          <div><dt>Median</dt><dd>${fmtNum(r.median)}</dd></div>
          <div><dt>Avg place</dt><dd>${fmtAvg(r.avgPlace)}</dd></div>
          <div><dt>Total pts</dt><dd>${r.total.toLocaleString()}</dd></div>
          <div><dt>Games</dt><dd>${r.games}</dd></div>
        </dl>
      </a>`,
    )
    .join('')}</div>`;
}

function leaderboardTable(stats) {
  return `
    <div class="lb-table-wrap">
      <table class="lb-table">
        <thead><tr>
          <th class="l" scope="col">#</th><th class="l" scope="col">Player</th>
          <th scope="col">Games</th><th scope="col">Wins</th><th class="l" scope="col">Medals</th>
          <th scope="col">Win %</th><th scope="col">Total pts</th><th scope="col">Avg</th>
          <th scope="col">Median</th><th scope="col"><abbr title="Average finishing position (1 = always first)">Avg place</abbr></th>
        </tr></thead>
        <tbody>${stats.leaderboard
          .map(
            (r) => `
          <tr style="${pc(r.player)}">
            <td class="l rank">${r.rank}</td>
            <td class="l"><a href="#players/${encodeURIComponent(r.player)}" style="color:inherit;text-decoration:none">${pname(r.player)}</a></td>
            <td>${r.games}</td>
            <td class="strong">${r.wins}${r.sharedWins ? `<span class="muted" title="${plural(r.sharedWins, 'shared win')}"> (${r.sharedWins}=)</span>` : ''}</td>
            <td class="l">${medals(r)}</td>
            <td>${fmtPct(r.winPct)}</td>
            <td>${r.total.toLocaleString()}</td>
            <td>${fmtAvg(r.avg)}</td>
            <td>${fmtNum(r.median)}</td>
            <td>${fmtAvg(r.avgPlace)}</td>
          </tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>`;
}

function rulesDetails() {
  return `
    <details class="rules">
      <summary>How ties and records work</summary>
      <ul>
        <li><strong>Ties for first</strong> are settled by leftover food, as in the Wingspan rules, when the sheet’s Winner column names one of the tied players. That player wins and the others tied with them finish 2nd. With no Winner entry, every tied player gets a win and a gold medal.</li>
        <li><strong>Placements</strong> use competition ranking: 120 / 120 / 95 is 1st, 1st, 3rd (no silver); 120 / 95 / 95 is 1st, 2nd, 2nd.</li>
        <li><strong>Winning margin</strong> is the winner’s score minus the second-highest score, so a tied win has a margin of 0.</li>
        <li><strong>Blowouts</strong> are wins by ${RULES.blowoutMargin}+ points over second place. Tied wins never count.</li>
        <li><strong>Streaks</strong> follow the order of rows in the sheet (top = oldest). Shared wins continue a winning streak.</li>
        <li><strong>Shared records</strong> list every tied holder.</li>
        <li><strong>Standard deviation</strong> is the sample standard deviation, shown once a player has 2+ games. The consistency awards need ${RULES.minGamesForConsistency}+ games.</li>
        <li>Rows with a missing or non-numeric score are treated as unfinished and are not counted. A warning names the row.</li>
      </ul>
    </details>`;
}

function dataTable(summary, head, rows) {
  return `
    <details class="data-table">
      <summary>${esc(summary)}</summary>
      <div class="table-scroll">
        <table>
          <thead><tr>${head.map((h, i) => `<th class="${i ? '' : 'l'}" scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? '' : 'l'}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </details>`;
}

function emptyState() {
  return `<div class="card empty-state"><h2>No finished games yet</h2><p>Add a row of scores under the player names in the Google Sheet. It will appear here on the next refresh.</p></div>`;
}

// ─────────────────────────── Players ───────────────────────────

function renderPlayers(el) {
  const { stats, season } = scoped();
  const { players } = stats;
  const { arg } = route();
  const player = players.find((p) => p.toLowerCase() === (arg || '').toLowerCase()) || stats.leaderboard[0].player;

  const pills = `<nav class="pills" aria-label="Choose player">${players
    .map(
      (p) =>
        `<a class="pill" style="${pc(p)}" href="#players/${encodeURIComponent(p)}" ${p === player ? 'aria-current="true"' : ''}><span class="swatch"></span>${esc(p)}${isBirthday(p) ? ' 🎂' : ''}</a>`,
    )
    .join('')}</nav>`;

  if (!stats.games.length) {
    el.innerHTML = scopeBar() + pills + emptyState();
    return;
  }

  const s = stats.perPlayer[player];
  const won = playerHonours(state.honours, player);
  const honourBits = [
    ...won.seasons.map((x) => `🏅 ${esc(x)} champion`),
    won.months.length ? `🌟 Player of the month${won.months.length > 1 ? ` ×${won.months.length}` : ''} (${esc(won.months.join(', '))})` : '',
  ].filter(Boolean);
  const birthday = Object.entries(BIRTHDAYS).find(([n]) => n.toLowerCase() === player.toLowerCase())?.[1];
  const bdayGames = birthdayGames(stats.games, birthday, RULES.birthdayWindowDays);
  const bdayAvg = bdayGames.length ? bdayGames.reduce((a, g) => a + g.scores[player], 0) / bdayGames.length : null;
  const bdayWins = bdayGames.filter((g) => g.placeOf[player] === 1).length;
  const rank = stats.leaderboard.find((r) => r.player === player).rank;
  const imp = s.improvement;
  const fewer = (form) => (form.complete ? '' : `only ${plural(form.n, 'game')} so far`);
  const runs = (rs) => rs.map((r) => (r.from === r.to ? `Game ${r.from}` : `Games ${r.from}–${r.to}`)).join(', ');

  const stat = (label, value, note = '') =>
    `<div><dt>${label}</dt><dd class="stat-value">${value}${note ? `<span class="stat-note">${note}</span>` : ''}</dd></div>`;

  const recent = stats.games.slice(-10).reverse();

  el.innerHTML = `
    ${scopeBar()}
    ${pills}
    <div class="profile-head" style="${pc(player)}">
      <span class="avatar lg">${esc(player.charAt(0).toUpperCase())}</span>
      <div>
        <h2>${esc(player)}${isBirthday(player) ? ' <span title="Happy birthday!">🎂</span>' : ''}</h2>
        <p>${ordinal(rank)} ${season ? `in ${esc(season.label)}` : 'on the leaderboard'} · ${plural(s.wins, 'win')} in ${plural(s.games, 'game')}</p>
        ${honourBits.length ? `<p class="honours-line">${honourBits.join(' · ')}</p>` : ''}
      </div>
    </div>

    <div class="profile-grid">
      <div class="stat-groups">
        <div class="card stat-group">
          <h3>Results</h3>
          <dl class="stat-list">
            ${stat('Games played', s.games)}
            ${stat('Wins', s.wins, s.sharedWins ? `incl. ${plural(s.sharedWins, 'shared win')}` : '')}
            ${stat('Win rate', fmtPct(s.winPct))}
            ${stat('Avg placement', fmtAvg(s.avgPlace), '1.0 = always first')}
            ${stat('Medals', medals(s))}
          </dl>
        </div>
        <div class="card stat-group">
          <h3>Scoring</h3>
          <dl class="stat-list">
            ${stat('Total points', s.total.toLocaleString())}
            ${stat('Average', fmtAvg(s.avg))}
            ${stat('Median', fmtNum(s.median))}
            ${stat('Std deviation', s.stdDev == null ? '—' : `±${fmtAvg(s.stdDev)}`, s.stdDev == null ? 'needs 2+ games' : 'lower = more consistent')}
            ${stat('Highest', fmtInt(s.high), gameList(s.highGames))}
            ${stat('Lowest', fmtInt(s.low), gameList(s.lowGames))}
          </dl>
        </div>
        <div class="card stat-group">
          <h3>Form</h3>
          <dl class="stat-list">
            ${stat(`Last ${RULES.hotHandWindow} avg`, fmtAvg(s.last5.avg), fewer(s.last5))}
            ${stat(`Last ${RULES.formWindowLong} avg`, fmtAvg(s.last10.avg), fewer(s.last10))}
            ${
              imp
                ? stat(
                    'Early → recent',
                    `<span class="${imp.delta > 0 ? 'delta-up' : imp.delta < 0 ? 'delta-down' : ''}">${fmtSigned(imp.delta)}</span>`,
                    `${fmtAvg(imp.early)} → ${fmtAvg(imp.recent)} (first ${imp.k} vs last ${imp.k} games)${imp.provisional ? ', small sample' : ''}`,
                  )
                : stat('Early → recent', '—', `needs ${RULES.risingStarMinGames}+ games`)
            }
          </dl>
        </div>
        <div class="card stat-group">
          <h3>Milestones &amp; streaks</h3>
          <dl class="stat-list">
            ${stat(`${RULES.centuryScore}+ point games`, s.centuryGames)}
            ${stat(`${RULES.clubScore}+ point games`, s.clubGames)}
            ${stat('Current win streak', s.currentWinStreak, s.currentWinStreak ? '' : s.currentDrought ? `${plural(s.currentDrought, 'game')} since a win` : '')}
            ${stat('Longest win streak', s.longestWinStreak, runs(s.longestWinStreakRuns))}
            ${stat('Longest run without a win', s.longestDrought, runs(s.longestDroughtRuns))}
            ${
              bdayGames.length
                ? stat(
                    '🎂 Birthday games',
                    bdayGames.length,
                    `within ${RULES.birthdayWindowDays} days of their birthday: ${plural(bdayWins, 'win')}, avg ${fmtAvg(bdayAvg)} (${fmtAvg(s.avg)} overall)`,
                  )
                : ''
            }
          </dl>
        </div>
      </div>

      <div class="stat-groups" style="grid-template-columns:1fr">
        <div class="card chart-card">
          <h3 class="card-title">Score history</h3>
          <div class="legend">
            <span class="pname" style="${pc(player)}"><span class="swatch"></span>Score (filled dot = win)</span>
            <span><span class="key-line"></span>Career average ${fmtAvg(s.avg)}</span>
          </div>
          <div class="chart-box"><canvas id="chart-player" role="img" aria-label="${esc(player)}'s score in every game"></canvas></div>
        </div>
        ${rivalsCard(stats, player)}
        <div class="card">
          <h3 class="card-title">Recent games</h3>
          <p class="card-sub">Last ${plural(recent.length, 'game')}, newest first</p>
          <ul class="recent-list">${recent.map((g) => recentRow(g, player)).join('')}</ul>
        </div>
      </div>
    </div>`;

  renderPlayerScores($('#chart-player'), stats, player);
}

function recentRow(g, player) {
  const place = g.placeOf[player];
  const score = g.scores[player];
  let ctx;
  const second = listNames(g.results.filter((r) => r.place === 2).map((r) => r.player));
  if (place === 1) {
    ctx = g.isTie
      ? `Shared with ${listNames(g.winners.filter((w) => w !== player))}`
      : g.wonOnTiebreak
      ? `Won the food tiebreaker over ${second}`
      : `+${g.margin} over ${second}`;
  } else if (g.wonOnTiebreak && score === g.topScore) {
    ctx = `Lost the food tiebreaker to ${g.winners[0]}`;
  } else {
    ctx = `${g.topScore - score} behind ${listNames(g.winners)}`;
  }
  return `<li>
    <span class="g">Game ${g.number}</span>
    ${placeBadge(place, place === 1 && g.isTie)}
    <span class="ctx">${esc(ctx)}</span>
    <span class="sc">${score}</span>
  </li>`;
}

// ─────────────────────────── Hall of Fame ───────────────────────────

function renderHall(el) {
  const { awards, stats, season } = scoped();
  const section = (cat, title, blurb) => `
    <section class="hall-section ${cat}">
      <div class="hall-head"><h2>${title}</h2><p>${blurb}</p></div>
      <div class="awards">${awards.filter((a) => a.category === cat).map(awardCard).join('')}</div>
    </section>`;

  el.innerHTML = `
    ${scopeBar()}
    <div class="section-head"><h2>Hall of Fame</h2><span class="sub">${esc(season ? `${season.label} only` : 'All time')} · ${plural(stats.games.length, 'game')} · tied records are shared</span></div>
    ${section('glory', '🏆 Records &amp; Glory', 'Bragging rights, earned the hard way.')}
    ${section('shame', '💀 Shame &amp; Misfortune', 'Awards nobody asked for.')}
    ${honoursBoard()}
    <div class="card">${rulesDetails()}</div>`;
}

const HONOURS_SHOWN = 6;

// Season champions and players of the month, newest first (always all history).
function honoursBoard() {
  const h = state.honours;
  if (!h || !h.seasons.length) return '';
  const row = (p) => `
    <li class="honour">
      <span class="hn-period">${esc(p.label)}${p.span ? ` <span class="muted">${esc(p.span)}</span>` : ''}</span>
      <span class="hn-who">${p.champions.length ? pnames(p.champions.map((c) => c.player)) : '—'}</span>
      <span class="hn-detail">${p.champions.length ? `${plural(p.champions[0].wins, 'win')} of ${p.games}` : ''}${p.inProgress ? ' · so far' : ''}</span>
    </li>`;
  const list = (items) => `
    <ol class="honours-list">${items.slice(0, HONOURS_SHOWN).map(row).join('')}</ol>
    ${
      items.length > HONOURS_SHOWN
        ? `<details class="recap-more"><summary>${plural(items.length - HONOURS_SHOWN, 'earlier one')}</summary><ol class="honours-list">${items.slice(HONOURS_SHOWN).map(row).join('')}</ol></details>`
        : ''
    }`;
  const undated = state.activity?.undated || 0;
  return `
    <section class="card honours">
      <h2 class="card-title">🏅 Honours</h2>
      <p class="card-sub">Whoever topped the leaderboard for each season (calendar quarter) and month.${undated ? ` ${plural(undated, 'game')} without a date ${undated === 1 ? 'isn’t' : 'aren’t'} included.` : ''}</p>
      <div class="honours-cols">
        <div><h3>Season champions</h3>${list(h.seasons)}</div>
        <div><h3>🌟 Player of the month</h3>${list(h.months)}</div>
      </div>
    </section>`;
}

function awardCard(a) {
  const shared = a.holders.length > 1;
  const body = a.holders.length
    ? `<div class="award-value">${esc(a.valueText)}</div>
       <ul class="award-holders">${a.holders
         .map((h) => `<li>${pname(h.player)}${h.detail ? `<span class="detail">${esc(h.detail)}</span>` : ''}</li>`)
         .join('')}</ul>
       ${shared ? `<span class="tag tie" style="align-self:flex-start">Shared by ${a.holders.length}</span>` : ''}
       ${a.provisional ? `<span class="flag">${esc(a.provisional)}</span>` : ''}`
    : `<div class="award-empty">${esc(a.empty || 'Not yet awarded.')}</div>`;
  return `
    <article class="award">
      <div class="award-top"><span class="award-icon" aria-hidden="true">${a.icon}</span><h3 class="award-name">${esc(a.name)}</h3></div>
      ${body}
      <div class="award-def">${esc(a.definition)}</div>
    </article>`;
}

// ─────────────────────────── History ───────────────────────────

function renderHistory(el) {
  const { stats } = state;
  const { players } = stats;
  const games = state.historyNewestFirst ? [...stats.games].reverse() : stats.games;
  const hasDate = games.some((g) => g.date || g.dateText);

  const marginTag = (g) =>
    g.isTie
      ? '<span class="tag tie">Tie</span>'
      : g.wonOnTiebreak
      ? '<span class="tag tie" title="Tied on points; won on leftover food">Food tiebreak 🍒</span>'
      : `<span class="tag ${g.isBlowout ? 'blowout' : ''}" title="${g.isBlowout ? `Blowout: ${RULES.blowoutMargin}+ points` : 'Winning margin'}">+${g.margin}${g.isBlowout ? ' 💥' : ''}</span>`;

  el.innerHTML = `
    ${activityCard()}
    <div class="section-head">
      <h2>Game history</h2>
      <div class="seg" role="group" aria-label="Sort order">
        <button type="button" data-sort="newest" aria-pressed="${state.historyNewestFirst}">Newest first</button>
        <button type="button" data-sort="oldest" aria-pressed="${!state.historyNewestFirst}">Oldest first</button>
      </div>
    </div>
    ${
      !games.length
        ? emptyState()
        : `
    <ol class="history-list">${games
      .map(
        (g) => `
      <li class="hist-card">
        <div class="hist-top"><span><span class="g">Game ${g.number}</span>${fmtDate(g) ? `<span class="d">${esc(fmtDate(g))}</span>` : ''}</span>${marginTag(g)}</div>
        <div class="hist-scores">${g.results
          .map(
            (r) => `<div class="row ${r.place === 1 ? 'win' : ''}">${placeBadge(r.place, r.place === 1 && g.isTie)}${pname(r.player)}<span class="sc">${r.score}</span></div>`,
          )
          .join('')}</div>
        ${g.notes ? `<div class="hist-notes">${esc(g.notes)}</div>` : ''}
      </li>`,
      )
      .join('')}</ol>
    <div class="card history-table-wrap">
      <table class="history-table">
        <thead><tr>
          <th class="l" scope="col">Game</th>${hasDate ? '<th class="l" scope="col">Date</th>' : ''}
          ${players.map((p) => `<th scope="col">${pname(p)}</th>`).join('')}
          <th class="l" scope="col">Winner</th><th scope="col">Margin</th>
        </tr></thead>
        <tbody>${games
          .map(
            (g) => `<tr>
          <td class="l"><strong>${g.number}</strong></td>${hasDate ? `<td class="l">${esc(fmtDate(g))}</td>` : ''}
          ${players
            .map((p) => {
              const place = g.placeOf[p];
              return `<td class="${place === 1 ? 'win' : ''}"><span class="score-cell" title="${ordinal(place)}">${place <= 3 ? `<span class="dot p${place}"></span>` : ''}${g.scores[p]}</span></td>`;
            })
            .join('')}
          <td class="l">${pnames(g.winners)}</td>
          <td>${marginTag(g)}</td>
        </tr>`,
          )
          .join('')}</tbody>
      </table>
      <p class="footnote">Dots: <span class="dot p1"></span> 1st <span class="dot p2"></span> 2nd <span class="dot p3"></span> 3rd · 💥 = win by ${RULES.blowoutMargin}+ · Game numbers follow the sheet’s row order.</p>
    </div>`
    }`;
  if (state.activity) renderActivity($('#chart-activity'), state.activity);
}

// How often we play: three numbers and a small weekly bar chart.
function activityCard() {
  const a = state.activity;
  if (!a || a.games < 2) return '';
  const since = a.daysSinceLast === 0 ? 'Today' : a.daysSinceLast === 1 ? 'Yesterday' : `${a.daysSinceLast} days ago`;
  const gap = a.longestGap;
  const stat = (label, value, note) =>
    `<div class="act-stat"><div class="tile-label">${label}</div><div class="act-value">${esc(value)}</div><div class="tile-sub">${esc(note)}</div></div>`;
  return `
    <section class="section">
      <div class="card activity">
        <div class="act-stats">
          ${stat('Last game', since, fmtShortDate(a.last.date, { weekday: true }))}
          ${stat('Pace', `${a.perWeek.toFixed(1)} / week`, `a game every ${fmtAvg(a.avgGap)} days`)}
          ${stat('Longest gap', plural(gap.days, 'day'), `${fmtShortDate(gap.from.date)} → ${fmtShortDate(gap.to.date)}`)}
        </div>
        <div class="chart-box mini"><canvas id="chart-activity" role="img" aria-label="Bar chart of games played per ${a.unit}"></canvas></div>
        <p class="chart-note">Games finished per ${a.unit}${a.undated ? `, not counting ${plural(a.undated, 'game')} without a date` : ''}.</p>
      </div>
    </section>`;
}

// ─────────────────────────── Events ───────────────────────────

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action], [data-sort], [data-wins-axis]');
  if (!btn) return;
  if (btn.dataset.action === 'retry') load();
  if (btn.dataset.action === 'refresh') load({ background: true });
  if (btn.dataset.action === 'dismiss-birthday') {
    try {
      localStorage.setItem(BIRTHDAY_DISMISS_KEY, dateKey(today()));
    } catch {}
    $('#birthday').innerHTML = '';
  }
  if (btn.dataset.winsAxis) {
    state.winsByDate = btn.dataset.winsAxis === 'date';
    render();
  }
  if (btn.dataset.sort) {
    state.historyNewestFirst = btn.dataset.sort === 'newest';
    render();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-scope]')) {
    state.scope = e.target.value;
    render();
  }
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo({ top: 0 });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.loadedAt && !state.refreshing && Date.now() - state.loadedAt > CONFIG.autoRefreshAfterMs) {
    load({ background: true });
  }
});

// Theme toggle: system by default; a click pins the opposite of what's showing.
const isDarkNow = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
function labelThemeToggle() {
  const label = isDarkNow() ? 'Switch to light mode' : 'Switch to dark mode';
  const btn = $('.theme-toggle');
  btn.setAttribute('aria-label', label);
  btn.title = label;
}
$('.theme-toggle').addEventListener('click', () => {
  const root = document.documentElement;
  root.dataset.theme = isDarkNow() ? 'light' : 'dark';
  try {
    localStorage.setItem('wingspan-stats:theme', root.dataset.theme);
  } catch {}
  labelThemeToggle();
  if (state.status === 'ready') render();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  labelThemeToggle();
  if (!document.documentElement.dataset.theme && state.status === 'ready') render();
});
labelThemeToggle();

// Re-render charts when crossing the phone/desktop breakpoint (tick density).
let wasNarrow = innerWidth < 640;
addEventListener('resize', () => {
  const narrow = innerWidth < 640;
  if (narrow !== wasNarrow && state.status === 'ready') {
    wasNarrow = narrow;
    render();
  }
});

$('#sheet-link').href = CONFIG.sheetUrl;
if (DEMO) {
  const b = $('#demo-banner');
  b.hidden = false;
  b.innerHTML = 'DEMO MODE · these are invented sample games, not real scores. <a href="./">Show real scores →</a>';
}

load();
