// Site configuration. This is the only file you should ever need to edit,
// and only if the Google Sheet's published link changes.

export const CONFIG = {
  // Google Sheets → File → Share → Publish to web → (score tab) → CSV.
  csvUrl:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vT09powUsPn2xPaa5yYOdtKl5tJ0wLINavivMTEUuQY8cGEmdLWOh1yBUS-MaGpLe6ZvL2a0hQ4olPj/pub?gid=0&single=true&output=csv',

  // Link shown in the footer so players can jump to the source sheet.
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1pz7voYnfaIormEAxs-dY9fVCyrMU4At46eDB5UH03GM/edit',

  requestTimeoutMs: 15000,

  // When the tab regains focus after this long, quietly re-fetch the sheet.
  autoRefreshAfterMs: 10 * 60 * 1000,
};
