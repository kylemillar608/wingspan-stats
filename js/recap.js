// "What changed in the latest game": compares stats and awards computed with
// and without the newest game and lists the interesting differences.

import { computeStats } from './stats.js';
import { computeAwards } from './awards.js';
import { fmtAvg, listNames, ordinal, plural } from './fmt.js';
import { daysBetween, weekStart } from './activity.js';
import { RULES } from './rules.js';

// Awards whose value is a one-off record, so a new value is news even when
// the holder hasn't changed (unlike averages, which move every game).
const RECORD_AWARDS = new Set([
  'high-flyer', 'destroyer', 'dynasty', 'apex-predator', 'club-120', 'underdog',
  'grounded-bird', 'heartbreaker', 'dodo', 'nemesis',
]);

// Awards decided by an average or spread. These can change hands without the
// new holder doing anything (someone else's game moves *their* number), so
// they "pass" to someone rather than being "taken", with the reason when the
// new holder's own number didn't move.
const STANDINGS = {
  sharpshooter: { stat: (s) => s.avg, noun: 'career average', fmt: fmtAvg },
  rock: { stat: (s) => s.stdDev, noun: 'spread of scores', fmt: (v) => `±${fmtAvg(v)}` },
  'chaos-bird': { stat: (s) => s.stdDev, noun: 'spread of scores', fmt: (v) => `±${fmtAvg(v)}` },
  'hot-hand': { stat: (s) => s.last5.avg, noun: 'last-5 average', fmt: fmtAvg },
  unlucky: { stat: (s) => s.lossAvg, noun: 'average in non-wins', fmt: fmtAvg },
};

const PRIORITY = { lead: 1, streak: 2, activity: 3, record: 4, personal: 5, award: 6 };

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

  // Pace: only notable gaps and busy weeks (1–2 games a week is normal).
  if (game.date) {
    const prev = [...games.slice(0, -1)].reverse().find((g) => g.date);
    const gap = prev ? daysBetween(prev.date, game.date) : null;
    if (gap != null && gap >= RULES.longBreakDays) add('activity', '⏳', `First game in ${gap} days`);
    const week = weekStart(game.date).getTime();
    const thisWeek = games.filter((g) => g.date && weekStart(g.date).getTime() === week).length;
    if (thisWeek >= RULES.busyWeekGames) add('activity', '📆', `${ordinal(thisWeek)} game this week`);
  }

  // Hall of Fame changes.
  const prev = Object.fromEntries(beforeAwards.map((x) => [x.id, x]));
  for (const aw of afterAwards) {
    const old = prev[aw.id];
    if (!old) continue; // e.g. The Ring Chaser: titles come from the calendar, not from a game
    const now = aw.holders.map((h) => h.player);
    const was = old.holders.map((h) => h.player);
    if (!now.length) continue;
    const kind = RECORD_AWARDS.has(aw.id) ? 'record' : 'award';
    const label = `${aw.name} (${aw.valueText})`;
    const joined = now.filter((p) => !was.includes(p));
    const kept = now.filter((p) => was.includes(p));
    const standing = STANDINGS[aw.id];
    if (standing && was.length && joined.length) {
      const value = (stats, p) => standing.stat(stats.perPlayer[p]);
      const moved = (p) => {
        const b = value(before, p);
        const a = value(after, p);
        return b == null || a == null || Math.abs(a - b) > 1e-9;
      };
      // Why it changed hands, when the newcomers' own numbers stood still:
      // the previous holders' numbers moved instead.
      const causes = joined.some(moved) ? [] : was.filter(moved);
      const why = causes.length
        ? ` as ${listNames(causes.map((p) => `${p}’s ${standing.noun} ${value(after, p) < value(before, p) ? 'fell' : 'rose'} to ${standing.fmt(value(after, p))}`))}`
        : '';
      const text = kept.length
        ? `${aw.name} is now shared by ${listNames(now)} (${aw.valueText})`
        : `${aw.name} passes from ${listNames(was)} to ${listNames(joined)} (${aw.valueText})`;
      add(kind, aw.icon, text + why);
    } else if (!was.length) {
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
  const tiedWith = game.results.filter((r) => r.score === game.topScore && r.player !== game.winners[0]).map((r) => r.player);
  const headline = game.isTie
    ? `${listNames(game.winners)} shared the win on ${game.topScore}`
    : game.wonOnTiebreak
    ? `${game.winners[0]} won on the food tiebreaker after tying ${listNames(tiedWith)} on ${game.topScore}`
    : `${game.winners[0]} won with ${game.topScore}, ${plural(game.margin, 'point')} ahead of ${listNames(
        game.results.filter((r) => r.score === second.score).map((r) => r.player),
      )}`;

  return { game, headline, events };
}
