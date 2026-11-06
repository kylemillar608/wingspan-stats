// Turns raw CSV rows into validated games.
//
// Expected sheet layout (the real "Log" tab):
//   Date      | Jen | Alex | Connor | Winner | (a link to this site in row 1)
//   8/22/2026 | 116 | 93   | 98     | Jen    |
//
// Player columns are every named header that isn't a recognised extra column
// (Date, Winner, Notes, Game #, Margin…) or a link. Games are taken in sheet
// order (top = oldest); dates are validated and displayed but never reorder.
//
// Problems never fail silently. Each one becomes a warning with a level:
//   'skipped'  the row can't be counted safely (e.g. a missing score)
//   'check'    the row counts, but something looks wrong (e.g. a future date)
// Only structural problems that make the whole sheet unreadable throw.

import { parseCsv } from './csv.js';
import { parseDate, dateOrderFor, resolveDate } from './dates.js';
import { RULES } from './rules.js';
import { listNames } from './fmt.js';

export class DataError extends Error {
  constructor(message, hints = []) {
    super(message);
    this.hints = hints;
  }
}

const META_COLUMNS = [
  { kind: 'date', label: 'Date', re: /^(date|date played|played|played on|when)$/i },
  { kind: 'id', label: 'Game #', re: /^(game|game ?#|game ?no\.?|game number|#|no\.?|id)$/i },
  { kind: 'notes', label: 'Notes', re: /^(notes?|comments?)$/i },
  { kind: 'winner', label: 'Winner', re: /^(winner|winners|won|won by)$/i },
  { kind: 'ignored', re: /^(margin|total|totals|average|avg|expansions?|location)$/i },
];

const NUMBER_RE = /^\d+(\.\d+)?$/;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const SHARED_RE = /^(tie|tied|shared|draw|split)$/i;

function columnLetter(index) {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const isBlank = (v) => v == null || String(v).trim() === '';

/**
 * @param rows      parsed CSV rows
 * @param options.dateOrder      'MDY' | 'DMY' for all-ambiguous numeric dates
 * @param options.requireDate    warn when the Date column or a row's date is missing
 * @param options.requireWinner  warn when the Winner column or a row's winner is missing
 * @param options.today          "now", for the future-date check
 */
export function interpretRows(rows, { dateOrder = 'MDY', requireDate = false, requireWinner = false, today = new Date() } = {}) {
  const warnings = [];
  const warn = (level, row, message) => warnings.push({ level, row, message });

  const headerIndex = rows.findIndex((r) => r.some((c) => !isBlank(c)));
  if (headerIndex === -1) {
    throw new DataError('The published sheet is empty.', [
      'Make sure the score tab is the one being published, and that row 1 holds the player names.',
    ]);
  }
  const headerRow = headerIndex + 1;
  const header = rows[headerIndex].map((c) => String(c).trim());
  const dataRows = rows.slice(headerIndex + 1);

  // ── Columns ──
  let playerCols = [];
  const meta = {};
  header.forEach((name, col) => {
    if (!name || URL_RE.test(name)) return; // e.g. a link to this site in row 1
    const m = META_COLUMNS.find((mc) => mc.re.test(name));
    if (m) {
      if (m.kind === 'ignored') return;
      if (meta[m.kind] == null) meta[m.kind] = col;
      else warn('check', headerRow, `There are two ${m.label} columns (${columnLetter(meta[m.kind])} and ${columnLetter(col)}). Only column ${columnLetter(meta[m.kind])} is used.`);
      return;
    }
    playerCols.push({ name, col });
  });

  // A header cell with nothing beneath it is a label or note, not a player.
  // (If no games have been entered at all yet, keep every named column.)
  const hasValues = (col) => dataRows.some((r) => !isBlank(r[col]));
  if (playerCols.some((p) => hasValues(p.col))) playerCols = playerCols.filter((p) => hasValues(p.col));

  if (playerCols.length && playerCols.every((p) => NUMBER_RE.test(p.name))) {
    throw new DataError(`The first row contains numbers (${header.join(', ')}) instead of player names.`, [
      'Add a header row at the top of the sheet with one player name per column, e.g. "Jen, Alex, Connor".',
    ]);
  }
  if (playerCols.length < 2) {
    throw new DataError(`Found ${playerCols.length} player column(s) in the header row; at least 2 are needed.`, [
      'Row 1 of the sheet should contain one player name per column.',
    ]);
  }
  const seen = new Set();
  for (const p of playerCols) {
    const key = p.name.toLowerCase();
    if (seen.has(key)) {
      throw new DataError(`The player name "${p.name}" appears in more than one column.`, ['Each player needs exactly one column.']);
    }
    seen.add(key);
  }
  if (playerCols.length !== 3) {
    warn('check', headerRow, `Expected 3 players but found ${playerCols.length} (${playerCols.map((p) => p.name).join(', ')}).`);
  }
  if (requireDate && meta.date == null) {
    warn('check', headerRow, 'No Date column was found, so games have no dates. Add a column headed "Date".');
  }
  if (requireWinner && meta.winner == null) {
    warn('check', headerRow, 'No Winner column was found, so ties for first can’t be settled. Add a column headed "Winner".');
  }

  const players = playerCols.map((p) => p.name);
  const games = [];
  let blankRows = 0;
  const strayColumns = new Set();
  const scoreRows = new Map(); // identical-score detection

  // ── Rows ──
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const sheetRow = r + 1;
    const cell = (col) => (col == null || col >= row.length ? '' : String(row[col]).trim());

    row.forEach((v, col) => {
      if (!isBlank(v) && isBlank(header[col])) strayColumns.add(col);
    });

    const raw = playerCols.map((p) => cell(p.col));
    const otherFilled = ['date', 'id', 'notes', 'winner'].some((k) => cell(meta[k]) !== '');

    if (raw.every((v) => v === '')) {
      if (otherFilled) warn('skipped', sheetRow, `Row ${sheetRow} has no scores yet, so it isn't counted (unfinished game?).`);
      else blankRows++;
      continue;
    }

    const missing = playerCols.filter((_, i) => raw[i] === '').map((p) => p.name);
    if (missing.length) {
      warn('skipped', sheetRow, `Row ${sheetRow} is missing a score for ${missing.join(' & ')}, so the game isn't counted.`);
      continue;
    }

    const bad = playerCols.map((p, i) => ({ name: p.name, value: raw[i] })).filter(({ value }) => !NUMBER_RE.test(value));
    if (bad.length) {
      warn(
        'skipped',
        sheetRow,
        `Row ${sheetRow} has a score that isn't a valid number (${bad.map((b) => `${b.name}: "${b.value}"`).join(', ')}), so the game isn't counted.`,
      );
      continue;
    }

    const scores = {};
    playerCols.forEach((p, i) => (scores[p.name] = Number(raw[i])));

    // Scores that parse but look wrong for Wingspan.
    for (const p of players) {
      const s = scores[p];
      if (!Number.isInteger(s)) warn('check', sheetRow, `Row ${sheetRow}: ${p}'s score ${s} isn't a whole number.`);
      if (s < RULES.plausibleScore.min) warn('check', sheetRow, `Row ${sheetRow}: ${p}'s score of ${s} is unusually low for Wingspan. Typo?`);
      if (s > RULES.plausibleScore.max) warn('check', sheetRow, `Row ${sheetRow}: ${p}'s score of ${s} is unusually high for Wingspan. Typo?`);
    }
    const key = players.map((p) => scores[p]).join('|');
    if (scoreRows.has(key)) {
      warn('check', sheetRow, `Row ${sheetRow} has exactly the same scores as row ${scoreRows.get(key)} (${players.map((p) => `${p} ${scores[p]}`).join(', ')}). Entered twice?`);
    } else {
      scoreRows.set(key, sheetRow);
    }

    games.push({
      number: games.length + 1,
      sheetRow,
      date: null,
      dateText: cell(meta.date) || null,
      notes: cell(meta.notes) || null,
      scores,
      tiebreakWinner: resolveWinner(cell(meta.winner), scores, players, sheetRow, warn, requireWinner && meta.winner != null),
    });
  }

  resolveGameDates(games, warn, { fallbackOrder: dateOrder, requireDate: requireDate && meta.date != null, today });

  for (const col of strayColumns) {
    warn('check', headerRow, `Column ${columnLetter(col)} has values but no heading in row 1, so it's ignored.`);
  }

  // Sheet-wide problems first, then by row, so the list reads top to bottom.
  warnings.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return { players, games, warnings, blankRows };
}

// The Winner column. Points decide every game; the column only settles a tie
// for first (Wingspan's tiebreaker is leftover food) and is otherwise checked
// against the scores. Returns the tiebreak winner, or null.
function resolveWinner(text, scores, players, sheetRow, warn, required) {
  const top = Math.max(...players.map((p) => scores[p]));
  const leaders = players.filter((p) => scores[p] === top);
  const tied = leaders.length > 1;
  const r = `Row ${sheetRow}`;

  if (!text) {
    if (required) {
      warn(
        'check',
        sheetRow,
        tied
          ? `${r}: ${listNames(leaders)} tied on ${top} and the Winner is blank, so they share the win. Enter whoever had the most leftover food.`
          : `${r} has no Winner. Going by the scores (${leaders[0]}).`,
      );
    }
    return null;
  }

  const names = SHARED_RE.test(text) ? [] : text.split(/\s*(?:&|,|\/|\+|\band\b)\s*/i).filter(Boolean);
  const matched = names.map((n) => players.find((p) => p.toLowerCase() === n.toLowerCase()));
  if (matched.some((m) => !m)) {
    warn('check', sheetRow, `${r}: the Winner column says "${text}", which isn't a player name. Using the scores.`);
    return null;
  }

  // "Tie" or several names: a shared win.
  if (names.length !== 1) {
    if (!tied) {
      warn('check', sheetRow, `${r}: the Winner column says "${text}", but ${leaders[0]} won outright with ${top}. Using the scores.`);
    } else if (names.length && (matched.length !== leaders.length || !leaders.every((l) => matched.includes(l)))) {
      warn('check', sheetRow, `${r}: the Winner column says "${text}", but the players tied on ${top} were ${listNames(leaders)}. Using the scores.`);
    }
    return null;
  }

  const named = matched[0];
  if (!leaders.includes(named)) {
    warn(
      'check',
      sheetRow,
      `${r}: the Winner column says ${named}, but the top score was ${leaders.join(' & ')}'s ${top} (${named} had ${scores[named]}). Using the scores.`,
    );
    return null;
  }
  return tied ? named : null;
}

// Fills in game.date (a local-midnight Date) from game.dateText. A blank or
// unreadable date leaves the game counted with date = null.
function resolveGameDates(games, warn, { fallbackOrder, requireDate, today }) {
  const parsed = new Map(games.filter((g) => g.dateText).map((g) => [g, parseDate(g.dateText)]));
  const { order, conflict } = dateOrderFor([...parsed.values()], fallbackOrder);
  if (conflict) {
    warn('check', null, `The Date column mixes day-first and month-first dates, so they're read as ${order === 'DMY' ? 'day/month/year' : 'month/day/year'}. Use one format for every row.`);
  }
  // A day of grace, since players may be in different time zones.
  const latest = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  let previous = null;
  for (const g of games) {
    const r = `Row ${g.sheetRow}`;
    if (!g.dateText) {
      if (requireDate) warn('check', g.sheetRow, `${r} has no date.`);
      continue;
    }
    g.date = resolveDate(parsed.get(g), order);
    if (!g.date) {
      warn('check', g.sheetRow, `${r}: couldn't read the date "${g.dateText}". The game still counts.`);
      continue;
    }
    if (g.date > latest) warn('check', g.sheetRow, `${r}'s date (${g.dateText}) is in the future. Typo?`);
    if (g.date < RULES.earliestDate) warn('check', g.sheetRow, `${r}'s date (${g.dateText}) is before Wingspan came out in 2019. Typo in the year?`);
    if (previous && g.date < previous.date) {
      warn(
        'check',
        g.sheetRow,
        `${r}'s date (${g.dateText}) is earlier than row ${previous.sheetRow}'s (${previous.dateText}). Games are ordered by row, so check the order.`,
      );
    }
    previous = g;
  }
}

export function interpretCsv(text, options) {
  return interpretRows(parseCsv(text), options);
}
