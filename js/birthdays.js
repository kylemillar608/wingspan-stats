// Easter egg: a birthday callout. Months are 1–12. Names are matched to the
// sheet's player names without regard to case.

export const BIRTHDAYS = {
  Jen: { month: 9, day: 9 },
  Alex: { month: 11, day: 6 },
  Connor: { month: 10, day: 18 },
};

// Names (as spelled in BIRTHDAYS) whose birthday falls on the given local date.
export function birthdaysOn(date, birthdays = BIRTHDAYS) {
  return Object.entries(birthdays)
    .filter(([, b]) => b.month === date.getMonth() + 1 && b.day === date.getDate())
    .map(([name]) => name);
}

// "?today=2026-11-06" previews a date (handy for testing the easter egg).
export function previewDate(search) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(search).get('today') || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
