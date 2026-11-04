import { CONFIG } from './config.js';
import { RULES } from './rules.js';
import { fetchCsvText, LoadError } from './loader.js';
import { interpretCsv, DataError } from './data.js';
import { computeStats } from './stats.js';
import { computeAwards } from './awards.js';
import { demoCsv } from './demo.js';
import { destroyCharts, renderCumulativeWins, renderRollingAverage, renderPlayerScores } from './charts.js';
import { fmtAvg, fmtInt, fmtNum, fmtPct, fmtSigned, gameList, listNames, ordinal, plural } from './fmt.js';

// ─────────────────────────── State ───────────────────────────

const DEMO = new URLSearchParams(location.search).has('demo');
const VIEWS = ['overview', 'players', 'hall', 'history'];

const state = {
  status: 'loading', // loading | ready | error
  data: null,
  stats: null,
  awards: null,
  loadedAt: null,
  error: null,
  refreshError: null,
  refreshing: false,
  historyNewestFirst: true,
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
    const data = interpretCsv(text);
    state.data = data;
    state.stats = computeStats(data);
    state.awards = computeAwards(state.stats);
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

function renderNotices() {
  const el = $('#notices');
  const w = state.status === 'ready' ? state.data.warnings : [];
  if (!w.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <details class="notice" ${w.length <= 2 ? 'open' : ''}>
      <summary>⚠ ${plural(w.length, 'issue')} in the sheet — affected rows are not counted</summary>
      <ul>${w.map((x) => `<li>${esc(x.message)}</li>`).join('')}</ul>
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

// ─────────────────────────── Overview ───────────────────────────

function renderOverview(el) {
  const { stats, awards } = state;
  const { games, players } = stats;
  if (!games.length) {
    el.innerHTML = emptyState();
    return;
  }
  const byId = Object.fromEntries(awards.map((a) => [a.id, a]));
  const leaders = byId.emperor.holders.map((h) => h.player);
  const high = byId['high-flyer'];
  const last = games[games.length - 1];
  const lastLine = last.results.map((r) => r.score).join(' – ');

  el.innerHTML = `
    <div class="tiles">
      <div class="tile">
        <div class="tile-label">Games played</div>
        <div class="tile-value">${games.length}</div>
        <div class="tile-sub">${players.length} players, every game</div>
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
        <div class="tile-label">Latest game</div>
        <div class="tile-value names">${pnames(last.winners)}</div>
        <div class="tile-sub">${last.isTie ? 'Shared win' : 'Won'} Game ${last.number} · ${esc(lastLine)}</div>
      </div>
    </div>

    <section class="section">
      <div class="section-head">
        <h2>Leaderboard</h2>
        <span class="sub">All-time · ${plural(games.length, 'game')}</span>
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
        <h2 class="card-title">Cumulative wins</h2>
        <p class="card-sub">Running total of wins after each game. Shared wins count for everyone tied.</p>
        <div class="chart-box tall"><canvas id="chart-wins" role="img" aria-label="Line chart of cumulative wins per player across all games"></canvas></div>
        ${dataTable(
          'Show as table',
          ['Game', ...players],
          [['Start', ...players.map(() => 0)], ...games.map((g, i) => [g.number, ...players.map((p) => stats.series.cumulativeWins[p][i + 1])])],
        )}
      </div>
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

  renderCumulativeWins($('#chart-wins'), stats);
  renderRollingAverage($('#chart-rolling'), stats);
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
        <li><strong>Ties for first:</strong> every tied player gets a win and a gold medal.</li>
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
  const { stats } = state;
  const { players } = stats;
  const { arg } = route();
  const player = players.find((p) => p.toLowerCase() === (arg || '').toLowerCase()) || stats.leaderboard[0].player;

  const pills = `<nav class="pills" aria-label="Choose player">${players
    .map(
      (p) =>
        `<a class="pill" style="${pc(p)}" href="#players/${encodeURIComponent(p)}" ${p === player ? 'aria-current="true"' : ''}><span class="swatch"></span>${esc(p)}</a>`,
    )
    .join('')}</nav>`;

  if (!stats.games.length) {
    el.innerHTML = pills + emptyState();
    return;
  }

  const s = stats.perPlayer[player];
  const rank = stats.leaderboard.find((r) => r.player === player).rank;
  const imp = s.improvement;
  const fewer = (form) => (form.complete ? '' : `only ${plural(form.n, 'game')} so far`);
  const runs = (rs) => rs.map((r) => (r.from === r.to ? `Game ${r.from}` : `Games ${r.from}–${r.to}`)).join(', ');

  const stat = (label, value, note = '') =>
    `<div><dt>${label}</dt><dd class="stat-value">${value}${note ? `<span class="stat-note">${note}</span>` : ''}</dd></div>`;

  const recent = stats.games.slice(-10).reverse();

  el.innerHTML = `
    ${pills}
    <div class="profile-head" style="${pc(player)}">
      <span class="avatar lg">${esc(player.charAt(0).toUpperCase())}</span>
      <div>
        <h2>${esc(player)}</h2>
        <p>${ordinal(rank)} on the leaderboard · ${plural(s.wins, 'win')} in ${plural(s.games, 'game')}</p>
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
  if (place === 1) {
    ctx = g.isTie
      ? `Shared with ${listNames(g.winners.filter((w) => w !== player))}`
      : `+${g.margin} over ${listNames(g.results.filter((r) => r.place === 2).map((r) => r.player))}`;
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
  const { awards, stats } = state;
  const section = (cat, title, blurb) => `
    <section class="hall-section ${cat}">
      <div class="hall-head"><h2>${title}</h2><p>${blurb}</p></div>
      <div class="awards">${awards.filter((a) => a.category === cat).map(awardCard).join('')}</div>
    </section>`;

  el.innerHTML = `
    <div class="section-head"><h2>Hall of Fame</h2><span class="sub">Recalculated from all ${plural(stats.games.length, 'game')} on every load. Tied records are shared.</span></div>
    ${section('glory', '🏆 Records &amp; Glory', 'Bragging rights, earned the hard way.')}
    ${section('shame', '💀 Shame &amp; Misfortune', 'Awards nobody asked for.')}
    <div class="card">${rulesDetails()}</div>`;
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
  const hasDate = games.some((g) => g.date);

  const marginTag = (g) =>
    g.isTie
      ? '<span class="tag tie">Tie</span>'
      : `<span class="tag ${g.isBlowout ? 'blowout' : ''}" title="${g.isBlowout ? `Blowout: ${RULES.blowoutMargin}+ points` : 'Winning margin'}">+${g.margin}${g.isBlowout ? ' 💥' : ''}</span>`;

  el.innerHTML = `
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
        <div class="hist-top"><span><span class="g">Game ${g.number}</span>${g.date ? `<span class="d">${esc(g.date)}</span>` : ''}</span>${marginTag(g)}</div>
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
          <td class="l"><strong>${g.number}</strong></td>${hasDate ? `<td class="l">${esc(g.date || '')}</td>` : ''}
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
}

// ─────────────────────────── Events ───────────────────────────

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action], [data-sort]');
  if (!btn) return;
  if (btn.dataset.action === 'retry') load();
  if (btn.dataset.action === 'refresh') load({ background: true });
  if (btn.dataset.sort) {
    state.historyNewestFirst = btn.dataset.sort === 'newest';
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
