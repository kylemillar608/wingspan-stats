// The real "Log" tab as published on 2026-11-05, plus the options the site uses.
export const TODAY = new Date(2026, 10, 5);
export const STRICT = { requireDate: true, requireWinner: true, today: TODAY };
export const LOG_HEADER = 'Date,Jen,Alex,Connor,Winner,https://kylemillar608.github.io/wingspan-stats/\r\n';
export const LOG_ROWS = [
  '8/22/2026,116,93,98,Jen,', '8/28/2026,101,100,117,Connor,', '8/31/2026,115,98,116,Connor,',
  '9/2/2026,114,121,137,Connor,', '9/5/2026,116,106,123,Connor,', '9/12/2026,115,94,98,Jen,',
  '9/16/2026,92,123,125,Connor,', '9/20/2026,99,105,108,Connor,', '9/24/2026,118,120,106,Alex,',
  '9/27/2026,100,103,126,Connor,', '10/1/2026,83,100,105,Connor,', '10/3/2026,113,106,103,Jen,',
  '10/8/2026,90,90,113,Connor,', '10/11/2026,115,93,113,Jen,', '10/12/2026,117,117,126,Connor,',
  '10/14/2026,105,116,105,Alex,', '10/24/2026,117,78,100,Jen,', '10/31/2026,112,111,110,Jen,',
  '11/1/2026,113,103,109,Jen,', '11/3/2026,102,94,99,Jen,',
];
export const LOG = LOG_HEADER + LOG_ROWS.join('\r\n');
// The sheet as it stood after its first n games.
export const logUpTo = (n) => LOG_HEADER + LOG_ROWS.slice(0, n).join('\r\n');
