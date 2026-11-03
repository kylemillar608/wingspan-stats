// Turns raw CSV rows into validated games.
//
// Expected sheet layout (what the real sheet uses today):
//   Row 1: player names, one per column           Jen,Alex,Connor
//   Each following row: one finished game          103,100,104
//
// Optional extra columns are recognised by header name and never mistaken for
// players: Date / Played, Game / #, Notes / Comments, and computed columns such
// as Winner / Margin / Total. Games are taken in sheet order (top = oldest).

import { parseCsv } from './csv.js';

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
  { kind: 'ignored', re: /^(winner|winners|margin|total|totals|average|avg|expansions?|location)$/i },
];

const SCORE_RE = /^\d+(\.\d+)?$/;

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

export function interpretRows(rows) {
  const warnings = [];
  const headerIndex = rows.findIndex((r) => r.some((c) => !isBlank(c)));
  if (headerIndex === -1) {
    throw new DataError('The published sheet is empty.', [
      'Make sure the score tab is the one being published, and that row 1 holds the player names.',
    ]);
  }
  const header = rows[headerIndex].map((c) => String(c).trim());

  const playerCols = [];
  const meta = {};
  header.forEach((name, col) => {
    if (!name) return;
    const m = META_COLUMNS.find((mc) => mc.re.test(name));
    if (m) {
      if (m.kind !== 'ignored' && meta[m.kind] == null) meta[m.kind] = col;
      return;
    }
    playerCols.push({ name, col });
  });

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
      date: cell(meta.date) || null,
      notes: cell(meta.notes) || null,
      scores,
    });
  }

  for (const col of strayColumns) {
    warnings.push({
      row: headerIndex + 1,
      message: `Column ${columnLetter(col)} has values but no player name in the header row, so it's ignored.`,
    });
  }

  return { players, games, warnings, blankRows };
}

export function interpretCsv(text) {
  return interpretRows(parseCsv(text));
}
