// Hall of Fame. Each award returns every tied record holder.

import { RULES } from './rules.js';
import { fmtAvg, fmtInt, fmtSigned, gameList, gameRange, listNames, plural } from './fmt.js';

const EPS = 1e-9;

// Keep the items whose value is the best (max or min). Null values never win.
function best(items, dir = 'max') {
  const valid = items.filter((i) => i.value != null && Number.isFinite(i.value));
  if (!valid.length) return { value: null, items: [] };
  const value = dir === 'max' ? Math.max(...valid.map((i) => i.value)) : Math.min(...valid.map((i) => i.value));
  return { value, items: valid.filter((i) => Math.abs(i.value - value) < EPS) };
}

// Game-level records (one item per player per game) → one holder per player.
function groupByPlayer(items, describe) {
  const by = new Map();
  for (const it of items) {
    if (!by.has(it.player)) by.set(it.player, []);
    by.get(it.player).push(it);
  }
  return [...by.entries()].map(([player, its]) => ({ player, detail: describe(its) }));
}

const runsText = (runs) => runs.map((r) => gameRange(r.from, r.to)).join(' and ');

function award(def, result) {
  return { ...def, holders: [], value: null, valueText: '', ...result };
}

export function computeAwards(stats) {
  const { players, games, perPlayer } = stats;
  const P = players.map((p) => perPlayer[p]);
  const out = [];

  // Player-level award helper.
  const playerAward = (def, valueOf, dir, { valueText, detail, minValue, eligible = () => true }) => {
    const r = best(
      P.filter(eligible).map((s) => ({ player: s.player, value: valueOf(s), s })),
      dir,
    );
    if (r.value == null || (minValue != null && r.value < minValue)) return award(def, {});
    return award(def, {
      value: r.value,
      valueText: valueText(r.value),
      holders: r.items.map((i) => ({ player: i.player, detail: detail ? detail(i.s) : '' })),
    });
  };

  // Every (player, game) score with its placement, for game-level records.
  const entries = games.flatMap((g) =>
    g.results.map((e) => ({ player: e.player, score: e.score, place: e.place, game: g })),
  );

  // ─────────────── Records & Glory ───────────────

  out.push(
    playerAward(
      { id: 'emperor', category: 'glory', icon: '👑', name: 'The Emperor', definition: 'Most career wins (shared wins count).', unit: 'wins', empty: 'No wins recorded yet.' },
      (s) => s.wins,
      'max',
      {
        minValue: 1,
        valueText: (v) => plural(v, 'win'),
        detail: (s) => `${Math.round(s.winPct * 100)}% of ${plural(s.games, 'game')}`,
      },
    ),
  );

  out.push(
    playerAward(
      { id: 'sharpshooter', category: 'glory', icon: '🎯', name: 'The Sharpshooter', definition: 'Highest career average score.', unit: 'avg pts' },
      (s) => s.avg,
      'max',
      { valueText: (v) => `${fmtAvg(v)} avg`, detail: (s) => `over ${plural(s.games, 'game')}` },
    ),
  );

  {
    const def = { id: 'high-flyer', category: 'glory', icon: '🦅', name: 'The High Flyer', definition: 'Highest single-game score.' };
    const r = best(entries.map((e) => ({ ...e, value: e.score })), 'max');
    out.push(
      r.value == null
        ? award(def, {})
        : award(def, {
            value: r.value,
            valueText: `${fmtInt(r.value)} pts`,
            holders: groupByPlayer(r.items, (its) => gameList(its.map((i) => i.game.number))),
          }),
    );
  }

  {
    const def = { id: 'destroyer', category: 'glory', icon: '💥', name: 'The Destroyer', definition: 'Largest winning margin over second place (tied wins have no margin).', empty: 'Every game so far has been tied.' };
    const r = best(
      games.filter((g) => !g.isTie).map((g) => ({ player: g.winners[0], value: g.margin, game: g })),
      'max',
    );
    out.push(
      r.value == null
        ? award(def, {})
        : award(def, {
            value: r.value,
            valueText: `${fmtSigned(r.value)} pts`,
            holders: groupByPlayer(r.items, (its) =>
              its.map((i) => `Game ${i.game.number}: ${i.game.results[0].score}–${i.game.results[1].score}`).join(', '),
            ),
          }),
    );
  }

  out.push(
    playerAward(
      {
        id: 'rock', category: 'glory', icon: '🧱', name: 'The Rock',
        definition: `Lowest standard deviation of scores. Requires ${RULES.minGamesForConsistency}+ games.`,
        empty: `Nobody has played ${RULES.minGamesForConsistency} games yet.`,
      },
      (s) => s.stdDev,
      'min',
      {
        eligible: (s) => s.games >= RULES.minGamesForConsistency,
        valueText: (v) => `±${fmtAvg(v)} pts`,
        detail: (s) => `around a ${fmtAvg(s.avg)} average`,
      },
    ),
  );

  out.push(
    playerAward(
      {
        id: 'hot-hand', category: 'glory', icon: '🔥', name: 'The Hot Hand',
        definition: `Highest average score over the last ${RULES.hotHandWindow} games.`,
        empty: `Needs ${RULES.hotHandWindow} games.`,
      },
      (s) => s.last5.avg,
      'max',
      {
        eligible: (s) => s.last5.complete,
        valueText: (v) => `${fmtAvg(v)} avg`,
        detail: (s) => `last ${RULES.hotHandWindow}: ${s.scores.slice(-RULES.hotHandWindow).join(', ')}`,
      },
    ),
  );

  {
    const def = {
      id: 'rising-star', category: 'glory', icon: '📈', name: 'The Rising Star',
      definition: `Biggest rise in average score: first ${RULES.risingStarMaxWindow} games vs last ${RULES.risingStarMaxWindow} (or first half vs second half until ${RULES.risingStarMaxWindow * 2} games are played).`,
      empty: 'Nobody has improved yet.',
    };
    const res = playerAward(def, (s) => s.improvement?.delta ?? null, 'max', {
      valueText: (v) => `${fmtSigned(v)} pts`,
      detail: (s) => `${fmtAvg(s.improvement.early)} → ${fmtAvg(s.improvement.recent)}, first ${s.improvement.k} vs last ${s.improvement.k} games`,
    });
    if (res.value != null && res.value <= 0) {
      out.push(award(def, {}));
    } else {
      if (res.holders.length) {
        const k = perPlayer[res.holders[0].player].improvement.k;
        res.provisional = k < RULES.risingStarSolidWindow
          ? `Early days: only ${plural(k, 'game')} in each comparison window.`
          : null;
      }
      if (games.length < RULES.risingStarMinGames) res.empty = `Needs ${RULES.risingStarMinGames} games.`;
      out.push(res);
    }
  }

  out.push(
    playerAward(
      { id: 'dynasty', category: 'glory', icon: '👑', name: 'The Dynasty', definition: 'Longest run of consecutive wins (shared wins count).', empty: 'No wins recorded yet.' },
      (s) => s.longestWinStreak,
      'max',
      { minValue: 1, valueText: (v) => plural(v, 'win'), detail: (s) => runsText(s.longestWinStreakRuns) },
    ),
  );

  out.push(
    playerAward(
      {
        id: 'apex-predator', category: 'glory', icon: '🦅', name: 'The Apex Predator',
        definition: `Most wins by ${RULES.blowoutMargin}+ points over second place.`,
        empty: `No ${RULES.blowoutMargin}+ point wins yet.`,
      },
      (s) => s.blowoutWins,
      'max',
      {
        minValue: 1,
        valueText: (v) => plural(v, 'blowout'),
        detail: (s) => gameList(games.filter((g) => g.isBlowout && g.winners[0] === s.player).map((g) => g.number)),
      },
    ),
  );

  out.push(
    playerAward(
      {
        id: 'club-120', category: 'glory', icon: '💯', name: `The ${RULES.clubScore} Club`,
        definition: `Most games scoring ${RULES.clubScore} or more.`,
        empty: `Nobody has scored ${RULES.clubScore}+ yet.`,
      },
      (s) => s.clubGames,
      'max',
      {
        minValue: 1,
        valueText: (v) => plural(v, 'game'),
        detail: (s) => gameList(games.filter((g) => g.scores[s.player] >= RULES.clubScore).map((g) => g.number)),
      },
    ),
  );

  {
    const def = {
      id: 'nemesis', category: 'glory', icon: '🎭', name: 'The Nemesis',
      definition: 'Most lopsided rivalry: head-to-head wins minus losses against one opponent (higher score in the same game, whoever won overall).',
      empty: 'No rivalry has a leader yet.',
    };
    const h2h = stats.headToHead;
    const pairs = players.flatMap((a) =>
      players.filter((b) => b !== a).map((b) => ({ player: a, opp: b, r: h2h[a][b], value: h2h[a][b].wins - h2h[a][b].losses })),
    );
    const r = best(pairs, 'max');
    const record = (x) => `${x.r.wins}–${x.r.losses}${x.r.ties ? `, ${plural(x.r.ties, 'tie')}` : ''}`;
    out.push(
      r.value == null || r.value < 1
        ? award(def, {})
        : award(def, {
            value: r.value,
            valueText: new Set(r.items.map(record)).size === 1 ? record(r.items[0]) : `+${r.value} net`,
            holders: groupByPlayer(r.items, (its) => its.map((i) => `${record(i)} over ${i.opp}`).join(', ')),
          }),
    );
  }

  {
    const def = { id: 'underdog', category: 'glory', icon: '🐣', name: 'The Underdog', definition: 'Lowest winning score ever (shared wins count).' };
    const r = best(entries.filter((e) => e.place === 1).map((e) => ({ ...e, value: e.score })), 'min');
    out.push(
      r.value == null
        ? award(def, {})
        : award(def, {
            value: r.value,
            valueText: `${fmtInt(r.value)} pts`,
            holders: groupByPlayer(r.items, (its) => `won ${gameList(its.map((i) => i.game.number))}`),
          }),
    );
  }

  // ─────────────── Shame & Misfortune ───────────────

  {
    const def = { id: 'grounded-bird', category: 'shame', icon: '🪶', name: 'The Grounded Bird', definition: 'Lowest single-game score ever.' };
    const r = best(entries.map((e) => ({ ...e, value: e.score })), 'min');
    out.push(
      r.value == null
        ? award(def, {})
        : award(def, {
            value: r.value,
            valueText: `${fmtInt(r.value)} pts`,
            holders: groupByPlayer(r.items, (its) => gameList(its.map((i) => i.game.number))),
          }),
    );
  }

  out.push(
    playerAward(
      { id: 'bridesmaid', category: 'shame', icon: '🥈', name: 'The Bridesmaid', definition: 'Most second-place finishes.', empty: 'No second places yet.' },
      (s) => s.silver,
      'max',
      { minValue: 1, valueText: (v) => plural(v, 'silver'), detail: (s) => `in ${plural(s.games, 'game')}` },
    ),
  );

  out.push(
    playerAward(
      { id: 'unlucky', category: 'shame', icon: '😭', name: 'The Unlucky One', definition: 'Highest average score in games they didn’t win.', empty: 'Nobody has lost yet.' },
      (s) => s.lossAvg,
      'max',
      { valueText: (v) => `${fmtAvg(v)} avg`, detail: (s) => `across ${plural(s.losses, 'loss', 'losses')}` },
    ),
  );

  {
    const def = { id: 'heartbreaker', category: 'shame', icon: '💔', name: 'The Heartbreaker', definition: 'Highest score that finished second.', empty: 'No second places yet.' };
    const r = best(entries.filter((e) => e.place === 2).map((e) => ({ ...e, value: e.score })), 'max');
    out.push(
      r.value == null
        ? award(def, {})
        : award(def, {
            value: r.value,
            valueText: `${fmtInt(r.value)} pts`,
            holders: groupByPlayer(r.items, (its) =>
              its.map((i) => `Game ${i.game.number}, lost to ${listNames(i.game.winners)}’s ${i.game.topScore}`).join('; '),
            ),
          }),
    );
  }

  out.push(
    playerAward(
      {
        id: 'chaos-bird', category: 'shame', icon: '🎢', name: 'The Chaos Bird',
        definition: `Highest standard deviation of scores. Requires ${RULES.minGamesForConsistency}+ games.`,
        empty: `Nobody has played ${RULES.minGamesForConsistency} games yet.`,
      },
      (s) => s.stdDev,
      'max',
      {
        eligible: (s) => s.games >= RULES.minGamesForConsistency,
        valueText: (v) => `±${fmtAvg(v)} pts`,
        detail: (s) => `ranging ${s.low}–${s.high}`,
      },
    ),
  );

  out.push(
    playerAward(
      { id: 'dodo', category: 'shame', icon: '🦤', name: 'The Dodo', definition: 'Longest run of consecutive games without a win.', empty: 'Everyone has won every game.' },
      (s) => s.longestDrought,
      'max',
      { minValue: 1, valueText: (v) => plural(v, 'game'), detail: (s) => runsText(s.longestDroughtRuns) },
    ),
  );

  return out;
}
