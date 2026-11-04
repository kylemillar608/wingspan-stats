// "What changed in the latest game": compares stats and awards computed with
// and without the newest game and lists the interesting differences.

import { computeStats } from './stats.js';
import { computeAwards } from './awards.js';
import { listNames, ordinal, plural } from './fmt.js';

// Awards whose value is a one-off record, so a new value is news even when
// the holder hasn't changed (unlike averages, which move every game).
const RECORD_AWARDS = new Set([
  'high-flyer', 'destroyer', 'dynasty', 'apex-predator', 'club-120', 'underdog',
  'grounded-bird', 'heartbreaker', 'dodo', 'nemesis',
]);

const PRIORITY = { lead: 1, streak: 2, record: 3, personal: 4, award: 5 };

export function computeRecap(data, after = computeStats(data), afterAwards = computeAwards(after)) {
  const { players, games } = data;
  if (!games.length) return null;
  const game = after.games[after.games.length - 1];
  const before = computeStats({ players, games: games.slice(0, -1) });
  const beforeAwards = computeAwards(before);
  const events = [];
  const add = (kind, icon, text) => events.push({ kind, icon, text });

  // Leaderboard movement.
  const rankOf = (stats, p) => stats.leaderboard.find((r) => r.player === p).rank;
  if (before.games.length) {
    for (const p of players) {
      const was = rankOf(before, p);
      const now = rankOf(after, p);
      if (now < was) add('lead', now === 1 ? '👑' : '⬆️', now === 1 ? `${p} takes the lead on the leaderboard` : `${p} moves up to ${ordinal(now)} place`);
    }
  }

  // Streaks.
  for (const p of players) {
    const b = before.perPlayer[p];
    const a = after.perPlayer[p];
    const won = game.placeOf[p] === 1;
    if (won && a.currentWinStreak >= 2) add('streak', '🔥', `${p} extends their winning streak to ${a.currentWinStreak}`);
    if (won && b.currentDrought >= 2) add('streak', '🌤️', `${p}’s first win in ${b.currentDrought + 1} games`);
    if (!won && b.currentWinStreak >= 2) add('streak', '🧊', `${p}’s ${b.currentWinStreak}-game winning streak is over`);
    if (!won && a.currentDrought >= 3) add('streak', '🦤', `${p} has now gone ${a.currentDrought} games without a win`);
  }

  // Hall of Fame changes.
  const prev = Object.fromEntries(beforeAwards.map((x) => [x.id, x]));
  for (const aw of afterAwards) {
    const old = prev[aw.id];
    const now = aw.holders.map((h) => h.player);
    const was = old.holders.map((h) => h.player);
    if (!now.length) continue;
    const kind = RECORD_AWARDS.has(aw.id) ? 'record' : 'award';
    const label = `${aw.name} (${aw.valueText})`;
    const joined = now.filter((p) => !was.includes(p));
    const kept = now.filter((p) => was.includes(p));
    if (!was.length) {
      add(kind, aw.icon, `${listNames(now)} ${now.length > 1 ? 'share' : 'claims'} ${label}`);
    } else if (!joined.length && now.length === was.length) {
      if (kind === 'record' && aw.value !== old.value) add(kind, aw.icon, `${aw.name} record is now ${aw.valueText} (${listNames(now)})`);
    } else if (!joined.length) {
      add(kind, aw.icon, `${listNames(now)} now ${now.length > 1 ? 'share' : 'holds'} ${label} outright`);
    } else if (kept.length) {
      add(kind, aw.icon, `${listNames(joined)} ${joined.length > 1 ? 'join' : 'joins'} ${listNames(kept)} on ${label}`);
    } else {
      add(kind, aw.icon, `${listNames(joined)} ${joined.length > 1 ? 'take' : 'takes'} ${label} from ${listNames(was)}`);
    }
  }

  // Personal bests and lows (once there's some history to compare against).
  for (const p of players) {
    const b = before.perPlayer[p];
    const score = game.scores[p];
    if (b.games < 3) continue;
    if (score > b.high) add('personal', '⭐', `Personal best for ${p}: ${score} (previous ${b.high})`);
    if (score < b.low) add('personal', '🪶', `New personal low for ${p}: ${score} (previous ${b.low})`);
  }

  events.sort((x, y) => PRIORITY[x.kind] - PRIORITY[y.kind]);

  const second = game.results.find((r) => r.place > 1);
  const headline = game.isTie
    ? `${listNames(game.winners)} shared the win on ${game.topScore}`
    : `${game.winners[0]} won with ${game.topScore}, ${plural(game.margin, 'point')} ahead of ${listNames(
        game.results.filter((r) => r.score === second.score).map((r) => r.player),
      )}`;

  return { game, headline, events };
}
