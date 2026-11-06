// Every threshold the statistics depend on lives here so the UI copy and the
// calculations can never drift apart.

export const RULES = {
  blowoutMargin: 20, // a win by at least this many points over 2nd place
  centuryScore: 100, // "100+ point games"
  clubScore: 120, // "120 Club"
  rollingWindow: 5, // rolling-average chart window
  hotHandWindow: 5, // "last five games"
  formWindowLong: 10, // "last ten games"
  minGamesForConsistency: 5, // std-dev awards (The Rock / Chaos Bird)
  risingStarMinGames: 4, // need at least 2 early + 2 recent games
  risingStarMaxWindow: 10, // compare first N vs last N games, N ≤ 10
  risingStarSolidWindow: 5, // below this the comparison is labeled provisional

  // Dates
  longBreakDays: 10, // recap mentions "first game in N days" from this gap
  busyWeekGames: 3, // recap mentions "3rd game this week" from this many (Mon–Sun)
  birthdayWindowDays: 3, // "birthday games": finished within this many days of a birthday

  // Data checks: values outside these still count, but are flagged.
  plausibleScore: { min: 40, max: 200 }, // Wingspan scores outside this are likely typos
  earliestDate: new Date(2019, 0, 1), // Wingspan was released in 2019
};
