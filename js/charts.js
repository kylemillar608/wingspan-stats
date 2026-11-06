// Chart.js rendering. Colours are read from CSS tokens at render time, so
// charts follow the light/dark theme and player colours stay consistent.

import { RULES } from './rules.js';
import { fmtAvg, fmtDate, listNames, ordinal, plural } from './fmt.js';

const active = new Map();

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const playerColor = (index) => css(`--p${index + 1}`) || css('--ink-3');

function theme() {
  return {
    ink: css('--ink'),
    ink2: css('--ink-2'),
    ink3: css('--ink-3'),
    line: css('--line'),
    surface: css('--surface'),
    lineStrong: css('--line-strong'),
    font: getComputedStyle(document.body).fontFamily,
  };
}

export function destroyCharts(scope) {
  for (const [canvas, chart] of active) {
    if (!scope || scope.contains(canvas)) {
      chart.destroy();
      active.delete(canvas);
    }
  }
}

function measure(texts, font) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = font;
  return Math.max(0, ...texts.map((t) => ctx.measureText(t).width));
}

// Direct labels at the end of each line (nudged apart so ties stay legible).
const endLabels = {
  id: 'endLabels',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    const { ctx, chartArea } = chart;
    const items = [];
    chart.data.datasets.forEach((ds, i) => {
      if (ds.endLabel === false || !chart.isDatasetVisible(i)) return;
      const meta = chart.getDatasetMeta(i);
      let last = null;
      for (let j = ds.data.length - 1; j >= 0; j--) {
        if (ds.data[j] != null) {
          last = meta.data[j];
          break;
        }
      }
      if (last) items.push({ y: last.y, text: ds.label, color: ds.borderColor });
    });
    items.sort((a, b) => a.y - b.y);
    const gap = 16;
    for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + gap);
    const over = items.length ? items[items.length - 1].y - (chartArea.bottom + 4) : 0;
    if (over > 0) items.forEach((it) => (it.y -= over));

    ctx.save();
    ctx.font = opts.font;
    ctx.textBaseline = 'middle';
    const x = chartArea.right + 10;
    for (const it of items) {
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(x + 4, it.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = opts.color;
      ctx.fillText(it.text, x + 13, it.y);
    }
    ctx.restore();
  },
};

function baseOptions(t, { endLabelTexts = [] } = {}) {
  const narrow = window.innerWidth < 640;
  const labelFont = `600 12px ${t.font}`;
  const right = endLabelTexts.length ? measure(endLabelTexts, labelFont) + 26 : 8;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 350 },
    layout: { padding: { top: 6, right, left: 0, bottom: 0 } },
    interaction: { mode: 'index', intersect: false },
    events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
    plugins: {
      legend: { display: false },
      endLabels: { enabled: endLabelTexts.length > 0, font: labelFont, color: t.ink2 },
      tooltip: {
        backgroundColor: t.surface,
        titleColor: t.ink,
        bodyColor: t.ink2,
        footerColor: t.ink3,
        borderColor: t.lineStrong,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        boxPadding: 4,
        usePointStyle: true,
        titleFont: { weight: '700', family: t.font },
        bodyFont: { family: t.font },
        footerFont: { family: t.font, weight: '500' },
        itemSort: (a, b) => (b.parsed.y ?? -Infinity) - (a.parsed.y ?? -Infinity),
        filter: (item) => item.parsed.y != null,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: t.lineStrong },
        ticks: {
          color: t.ink3,
          font: { family: t.font, size: 11 },
          autoSkip: true,
          maxTicksLimit: narrow ? 7 : 14,
          maxRotation: 0,
        },
        title: { display: true, text: 'Game', color: t.ink3, font: { family: t.font, size: 11, weight: '600' } },
      },
      y: {
        grid: { color: t.line, drawTicks: false },
        border: { display: false },
        ticks: { color: t.ink3, font: { family: t.font, size: 11 }, padding: 8 },
      },
    },
  };
}

function mount(canvas, config) {
  if (typeof window.Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<div class="chart-fallback">Chart library failed to load. The numbers below are still accurate.</div>';
    return null;
  }
  if (active.has(canvas)) active.get(canvas).destroy();
  const chart = new window.Chart(canvas, { ...config, plugins: [endLabels] });
  active.set(canvas, chart);
  return chart;
}

const pointRadius = (n) => (n > 60 ? 0 : n > 30 ? 2 : 3.5);

export function renderCumulativeWins(canvas, stats) {
  const t = theme();
  const { players, games, series } = stats;
  const labels = ['Start', ...games.map((g) => String(g.number))];
  const options = baseOptions(t, { endLabelTexts: players });
  options.scales.y.beginAtZero = true;
  options.scales.y.ticks.precision = 0;
  options.scales.y.title = { display: true, text: 'Wins', color: t.ink3, font: { family: t.font, size: 11, weight: '600' } };
  options.plugins.tooltip.callbacks = {
    title: (items) => {
      const i = items[0].dataIndex;
      if (i === 0) return 'Before game 1';
      const g = games[i - 1];
      return `Game ${g.number}${fmtDate(g) ? ` · ${fmtDate(g)}` : ''}`;
    },
    label: (item) => ` ${item.dataset.label}: ${plural(item.parsed.y, 'win')}`,
    footer: (items) => {
      const i = items[0].dataIndex;
      if (i === 0) return '';
      const g = games[i - 1];
      return g.isTie
        ? `Shared win: ${listNames(g.winners)}`
        : `Won by ${g.winners[0]} (${g.wonOnTiebreak ? 'food tiebreaker' : `+${g.margin}`})`;
    },
  };

  return mount(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: players.map((p, i) => ({
        label: p,
        data: series.cumulativeWins[p],
        borderColor: playerColor(i),
        backgroundColor: playerColor(i),
        borderWidth: 2.5,
        pointRadius: pointRadius(games.length),
        pointHoverRadius: 6,
        pointBorderColor: t.surface,
        pointBorderWidth: 1.5,
      })),
    },
    options,
  });
}

export function renderRollingAverage(canvas, stats) {
  const t = theme();
  const { players, games, series } = stats;
  const W = RULES.rollingWindow;
  const labels = games.map((g) => String(g.number));
  const options = baseOptions(t, { endLabelTexts: players });
  options.scales.y.grace = '6%';
  options.scales.y.title = { display: true, text: `Avg of last ${W}`, color: t.ink3, font: { family: t.font, size: 11, weight: '600' } };
  options.plugins.tooltip.callbacks = {
    title: (items) => {
      const g = games[items[0].dataIndex];
      return `Game ${g.number}${fmtDate(g) ? ` · ${fmtDate(g)}` : ''}`;
    },
    label: (item) => {
      const r = series.rolling[item.dataset.label][item.dataIndex];
      const span = r.n < W ? `first ${r.n} game${r.n === 1 ? '' : 's'}` : `last ${W}`;
      return ` ${item.dataset.label}: ${fmtAvg(r.avg)} (${span})`;
    },
  };

  return mount(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: players.map((p, i) => ({
        label: p,
        data: series.rolling[p].map((r) => r.avg),
        borderColor: playerColor(i),
        backgroundColor: playerColor(i),
        borderWidth: 2.5,
        pointRadius: pointRadius(games.length),
        pointHoverRadius: 6,
        pointBorderColor: t.surface,
        pointBorderWidth: 1.5,
        cubicInterpolationMode: 'monotone',
        // Dashed while the window is still filling up.
        segment: { borderDash: (ctx) => (ctx.p1DataIndex < W - 1 ? [5, 4] : undefined) },
      })),
    },
    options,
  });
}

export function renderPlayerScores(canvas, stats, player) {
  const t = theme();
  const { games, players, perPlayer } = stats;
  const s = perPlayer[player];
  const color = playerColor(players.indexOf(player));
  const labels = games.map((g) => String(g.number));
  const options = baseOptions(t);
  options.scales.y.grace = '8%';
  options.scales.y.title = { display: true, text: 'Score', color: t.ink3, font: { family: t.font, size: 11, weight: '600' } };
  options.plugins.tooltip.callbacks = {
    title: (items) => {
      const g = games[items[0].dataIndex];
      return `Game ${g.number}${fmtDate(g) ? ` · ${fmtDate(g)}` : ''}`;
    },
    label: (item) => {
      if (item.datasetIndex === 1) return ` Career average: ${fmtAvg(s.avg)}`;
      const g = games[item.dataIndex];
      const place = g.placeOf[player];
      return ` ${item.parsed.y} pts · ${ordinal(place)}${place === 1 && g.isTie ? ' (shared)' : ''}`;
    },
  };
  const won = s.places.map((p) => p === 1);

  return mount(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: player,
          data: s.scores,
          borderColor: color,
          backgroundColor: won.map((w) => (w ? color : t.surface)),
          pointBorderColor: color,
          pointBorderWidth: 2,
          borderWidth: 2.5,
          pointRadius: won.map((w) => (games.length > 60 ? (w ? 3 : 0) : w ? 6 : 4)),
          pointHoverRadius: 7,
          cubicInterpolationMode: 'monotone',
        },
        {
          label: 'Average',
          data: s.scores.map(() => s.avg),
          borderColor: t.ink3,
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        },
      ],
    },
    options,
  });
}
