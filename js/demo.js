// Demo mode only (open the site with ?demo). These games are invented, the
// names say "(demo)", and the UI shows a persistent banner. Never used as a
// fallback when the real sheet fails to load.

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoCsv(games = 24) {
  const rand = mulberry32(20260101);
  const players = ['Robin (demo)', 'Wren (demo)', 'Finch (demo)'];
  const base = [96, 88, 92];
  const trend = [0.2, 1.1, -0.1];
  const lines = [['Date', ...players, 'Winner'].join(',')];
  // Game nights roughly weekly, sometimes two games in a night.
  const day = new Date(2026, 0, 9);
  for (let g = 0; g < games; g++) {
    if (g > 0 && rand() > 0.3) day.setDate(day.getDate() + 5 + Math.floor(rand() * 10));
    const date = `${day.getMonth() + 1}/${day.getDate()}/${day.getFullYear()}`;
    const scores = players.map((_, i) => Math.max(55, Math.round(base[i] + trend[i] * g + (rand() + rand() + rand() - 1.5) * 26)));
    let winner = '';
    if (g === games - 1) {
      // The latest demo game is a tie for first, settled on leftover food.
      scores[0] = scores[1] = Math.max(...scores) + 2;
      winner = players[1];
    }
    lines.push([date, ...scores, winner].join(','));
  }
  return lines.join('\r\n');
}
