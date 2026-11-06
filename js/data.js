// Turns raw CSV rows into validated games.
//
// Expected sheet layout (what the real sheet uses today):
//   Row 1: player names, one per column           Jen,Alex,Connor
//   Each following row: one finished game          103,100,104
//
// Optional extra columns are recognised by header name and never mistaken for
// players: Date / Played, Game / #, Notes / Comments, and computed columns such
// as Winner / Margin / Total. Games are taken in sheet order (top = oldest);
// dates are read for display and date-based stats but never reorder games.

import { parseCsv } from './csv.js';
import { parseDate, dateOrderFor, resolveDate } from './dates.js';

export class DataError extends Error {
  constructor(message, hints = []) {
    super(message);
    this.hints = hints;
  }
}

const META_COLUMNS = [
  { kind: 'date', re: /^(date|date played|played|played on|when)$/i },
  { kind: 'id', re: /^(game|game ?#|game ?no\.?|game number|#|no\.?|id)$/i },
  { kind: 'notes', re: /^(notes?|comments?)$/i },
  { kind: 'winner', re: /^(winner|winners|won|won by)$/i },
  { kind: 'ignored', re: /^(margin|total|totals|average|avg|expansions?|location)$/i },
];

const SCORE_RE = /^\d+(\.\d+)?$/;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;

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

export function interpretRows(rows, { dateOrder = 'MDY' } = {}) {
  const warnings = [];
  const headerIndex = rows.findIndex((r) => r.some((c) => !isBlank(c)));
  if (headerIndex === -1) {
    throw new DataError('The published sheet is empty.', [
      'Make sure the score tab is the one being published, and that row 1 holds the player names.',
    ]);
  }
  const header = rows[headerIndex].map((c) => String(c).trim());
  const dataRows = rows.slice(headerIndex + 1);

  let playerCols = [];
  const meta = {};
  header.forEach((name, col) => {
    if (!name || URL_RE.test(name)) return; // e.g. a link to this site in row 1
    const m = META_COLUMNS.find((mc) => mc.re.test(name));
    if (m) {
      if (m.kind !== 'ignored' && meta[m.kind] == null) meta[m.kind] = col;
      return;
    }
    playerCols.push({ name, col });
  });

  // A header cell with nothing beneath it is a label or note, not a player.
  // (If no games have been entered at all yet, keep every named column.)
  const hasValues = (col) => dataRows.some((r) => !isBlank(r[col]));
  if (playerCols.some((p) => hasValues(p.col))) playerCols = playerCols.filter((p) => hasValues(p.col));

  if (playerCols.length && playerCols.every((p) => SCORE_RE.test(p.name))) {
    throw new DataError(`The first row contains numbers (${header.join(', ')}) instead of player names.`, [
      'Add a header row at the top of the sheet with one player name per column, e.g. "Jen, Alex, Connor".',
    ]);
  }
  if (playerCols.length < 2) {
    throw new DataError(`Found ${playerCols.length} player column(s) in the header row; at least 2 are needed.`, [
      'Row 1 of the sheet should contain one player name per column.',
    ]);
  }
  const seen = new Map();
  for (const p of playerCols) {
    const key = p.name.toLowerCase();
    if (seen.has(key)) {
      throw new DataError(`The player name "${p.name}" appears in more than one column.`, [
        'Each player needs exactly one column.',
      ]);
    }
    seen.set(key, true);
  }
  if (playerCols.length !== 3) {
    warnings.push({
      row: headerIndex + 1,
      message: `Expected 3 players but found ${playerCols.length} (${playerCols.map((p) => p.name).join(', ')}).`,
    });
  }

  const players = playerCols.map((p) => p.name);
  const games = [];
  let blankRows = 0;
  const strayColumns = new Set();

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const sheetRow = r + 1;
    const cell = (col) => (col == null || col >= row.length ? '' : String(row[col]).trim());

    row.forEach((v, col) => {
      if (!isBlank(v) && isBlank(header[col])) strayColumns.add(col);
    });

    const raw = playerCols.map((p) => cell(p.col));
    const metaFilled = ['date', 'id', 'notes'].some((k) => cell(meta[k]) !== '');

    if (raw.every((v) => v === '')) {
      if (metaFilled) {
        warnings.push({ row: sheetRow, message: `Row ${sheetRow} has no scores yet, so it isn't counted (unfinished game?).` });
      } else {
        blankRows++;
      }
      continue;
    }

    const missing = playerCols.filter((_, i) => raw[i] === '').map((p) => p.name);
    if (missing.length) {
      warnings.push({
        row: sheetRow,
        message: `Row ${sheetRow} is missing a score for ${missing.join(' & ')}, so the game isn't counted.`,
      });
      continue;
    }

    const bad = playerCols
      .map((p, i) => ({ name: p.name, value: raw[i] }))
      .filter(({ value }) => !SCORE_RE.test(value));
    if (bad.length) {
      warnings.push({
        row: sheetRow,
        message: `Row ${sheetRow} has a score that isn't a number (${bad
          .map((b) => `${b.name}: "${b.value}"`)
          .join(', ')}), so the game isn't counted.`,
      });
      continue;
    }

    const scores = {};
    playerCols.forEach((p, i) => {
      scores[p.name] = Number(raw[i]);
    });
    games.push({
      number: games.length + 1,
      sheetRow,
      date: null,
      dateText: cell(meta.date) || null,
      notes: cell(meta.notes) || null,
      scores,
      tiebreakWinner: tiebreakFrom(cell(meta.winner), scores, players, sheetRow, warnings),
    });
  }

  resolveGameDates(games, warnings, dateOrder);

  for (const col of strayColumns) {
    warnings.push({
      row: headerIndex + 1,
      message: `Column ${columnLetter(col)} has values but no player name in the header row, so it's ignored.`,
    });
  }

  return { players, games, warnings, blankRows };
}

const SHARED_RE = /^(tie|tied|shared|draw|split)$/i;

// The Winner column only matters when points are tied for first (Wingspan's
// tiebreaker is leftover food). Returns the named player if they're one of the
// tied top scorers; otherwise null, with a warning when the column disagrees
// with the scores. The scores always win a disagreement.
function tiebreakFrom(text, scores, players, sheetRow, warnings) {
  if (!text || SHARED_RE.test(text)) return null;
  const top = Math.max(...players.map((p) => scores[p]));
  const leaders = players.filter((p) => scores[p] === top);
  const named = players.find((p) => p.toLowerCase() === text.toLowerCase());
  if (!named) {
    const several = text.split(/\s*(?:&|,|\/|\band\b)\s*/i).filter(Boolean);
    const all = several.map((n) => players.find((p) => p.toLowerCase() === n.toLowerCase()));
    if (several.length > 1 && all.every(Boolean)) return null; // e.g. "Jen & Connor": a shared win
    warnings.push({ row: sheetRow, message: `Row ${sheetRow}: the Winner column says "${text}", which isn't a player name. Using the scores.` });
    return null;
  }
  if (!leaders.includes(named)) {
    warnings.push({
      row: sheetRow,
      message: `Row ${sheetRow}: the Winner column says ${named}, but the top score was ${leaders.join(' & ')}'s ${top} (${named} had ${scores[named]}). Using the scores.`,
    });
    return null;
  }
  return leaders.length > 1 ? named : null;
}

// Fills in game.date (a local-midnight Date) from game.dateText. A blank or
// unreadable date leaves the game counted with date = null.
function resolveGameDates(games, warnings, fallbackOrder) {
  const dated = games.filter((g) => g.dateText);
  if (!dated.length) return;
  const parsed = new Map(dated.map((g) => [g, parseDate(g.dateText)]));
  const { order, conflict } = dateOrderFor([...parsed.values()], fallbackOrder);
  if (conflict) {
    warnings.push({
      row: null,
      message: `The Date column mixes day-first and month-first dates, so they're read as ${order === 'DMY' ? 'day/month/year' : 'month/day/year'}. Use one format for every row.`,
    });
  }
  let previous = null;
  for (const g of dated) {
    g.date = resolveDate(parsed.get(g), order);
    if (!g.date) {
      warnings.push({ row: g.sheetRow, message: `Row ${g.sheetRow}: couldn't read the date "${g.dateText}". The game still counts.` });
      continue;
    }
    if (previous && g.date < previous.date) {
      warnings.push({
        row: g.sheetRow,
        message: `Row ${g.sheetRow}'s date (${g.dateText}) is earlier than row ${previous.sheetRow}'s (${previous.dateText}). Games are ordered by row, so check the order.`,
      });
    }
    previous = g;
  }
}

export function interpretCsv(text, options) {
  return interpretRows(parseCsv(text), options);
}
