// Fetches the live published CSV with the exact same code the website uses and
// prints the computed statistics, so they can be checked against the sheet.
//   node scripts/verify-live.mjs              # the link in js/config.js
//   node scripts/verify-live.mjs <csv-url>    # any other published CSV (e.g. a new tab)

import { fetchCsvText } from '../js/loader.js';
import { interpretCsv } from '../js/data.js';
import { computeStats } from '../js/stats.js';
import { computeAwards } from '../js/awards.js';
import { fmtAvg, fmtDate, listNames } from '../js/fmt.js';
import { CONFIG } from '../js/config.js';

try {
  const text = await fetchCsvText(process.argv[2] || CONFIG.csvUrl);
  const data = interpretCsv(text, { dateOrder: CONFIG.dateOrder });
  const stats = computeStats(data);

  console.log(`Players: ${data.players.join(', ')}`);
  console.log(`Valid games: ${data.games.length}   blank rows skipped: ${data.blankRows}`);
  for (const w of data.warnings) console.log(`  ⚠ ${w.message}`);

  console.log('\nGames (sheet row → scores → winner, margin)');
  for (const g of stats.games) {
    const s = data.players.map((p) => `${p} ${g.scores[p]}`).join(' · ');
    const when = fmtDate(g) ? ` ${fmtDate(g)}` : '';
    console.log(`  #${g.number} (row ${g.sheetRow})${when}: ${s} → ${listNames(g.winners)}${g.isTie ? ' (tie)' : ''}, +${g.margin}`);
  }

  console.log('\nLeaderboard');
  console.table(
    stats.leaderboard.map((r) => ({
      rank: r.rank, player: r.player, games: r.games, wins: r.wins, gold: r.gold, silver: r.silver, bronze: r.bronze,
      'win%': Math.round(r.winPct * 100), total: r.total, avg: fmtAvg(r.avg), median: r.median,
      'avg place': fmtAvg(r.avgPlace), 'std dev': fmtAvg(r.stdDev),
    })),
  );

  console.log('Hall of Fame');
  for (const a of computeAwards(stats)) {
    const who = a.holders.length
      ? a.holders.map((h) => `${h.player}${h.detail ? ` (${h.detail})` : ''}`).join('; ')
      : `— ${a.empty || 'no holder'}`;
    console.log(`  ${a.icon} ${a.name.padEnd(18)} ${a.valueText.padEnd(12)} ${who}`);
  }
} catch (err) {
  console.error(`✖ ${err.title || 'Error'}: ${err.message}`);
  for (const h of err.hints || []) console.error(`  • ${h}`);
  process.exit(1);
}
