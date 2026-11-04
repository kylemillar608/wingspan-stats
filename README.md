# Wingspan Stats

A static website for our three-player Wingspan games. It reads the scores live from a
published Google Sheet and calculates the leaderboard, player profiles, Hall of Fame, charts and
game history in the browser. There's no backend, no build step and no cost.

**Google Sheets is the only source of truth.** Add a game to the sheet, refresh the site, and it's
included. You never need to edit or redeploy the website because a game was played.

---

## The Google Sheet

The site reads this published CSV (set in `js/config.js`):

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vT09powUsPn2xPaa5yYOdtKl5tJ0wLINavivMTEUuQY8cGEmdLWOh1yBUS-MaGpLe6ZvL2a0hQ4olPj/pub?gid=0&single=true&output=csv
```

### Layout the site expects

| A   | B    | C      |
| --- | ---- | ------ |
| Jen | Alex | Connor |
| 103 | 100  | 104    |
| 102 | 100  | 101    |

* **Row 1 holds the player names**, one per column. The names shown on the site come from here.
* **Every other row is one finished game**, with one final score per player.
* **Rows run in time order, oldest at the top and newest at the bottom.** Streaks, "last 5
  games", the Rising Star award and the charts all rely on this order. Add new games at the bottom.
* Blank rows are ignored.
* A row with any missing or non-numeric score is treated as unfinished. It is **not** counted,
  and the site shows a yellow notice naming the row. Missing scores are never treated as zero.
* Optional extra columns are fine if their header is `Date`, `Notes`, `Game`/`#`, or a computed
  column such as `Winner`/`Margin`/`Total`. They're never mistaken for players. A `Date` column is
  shown in the game history, but row order still decides the game order.

### If the data stops loading

The site never falls back to made-up scores. It shows an error that explains what failed, with a
**Try again** button. Common fixes:

1. In Google Sheets: **File → Share → Publish to web**. Pick the score tab and
   **Comma-separated values (.csv)**, then click **Publish**. Make sure "Automatically republish
   when changes are made" is ticked.
2. If you re-published and got a new link, paste it into `csvUrl` in `js/config.js`.
3. Work or school Google accounts can block publishing outside the organisation. Use a personal
   account if so.

Google caches published CSVs for a few minutes, so a new game can take up to ~5 minutes to appear.

To check the live sheet from a terminal with the exact code the site uses:

```bash
node scripts/verify-live.mjs
```

It prints every game, the leaderboard and every award.

---

## Running locally

Browsers won't load JavaScript modules from `file://`, so preview through a local server:

```bash
cd wingspan
python3 scripts/serve.py
# open http://localhost:8000
```

`scripts/serve.py` is a tiny wrapper around Python's built-in server that tells the browser not to
cache anything. With plain `python3 -m http.server`, browsers can keep running old copies of the
JavaScript after you edit it.

**Demo mode** is for previewing the design without real data. Open
`http://localhost:8000/?demo`. It uses clearly fake players ("Robin (demo)" etc.) under a striped
**DEMO MODE** banner, and it's only ever used when `?demo` is in the URL.

### Tests

Requires Node 18+ and nothing else: no `npm install`, no dependencies.

```bash
npm test
```

The tests cover CSV parsing, blank and partial rows, wins, medals, ties, medians, standard
deviation, streaks, blowouts, the Rising Star comparison, every Hall of Fame award (against a
hand-checked snapshot of the real sheet) and the loader's error handling.

---

## Publishing on GitHub Pages

No build step. The repository contents are the website.

1. Create a new repository on GitHub (e.g. `wingspan-stats`). It must be **public** for free
   GitHub Pages.
2. Upload everything in this folder, keeping the structure (`index.html` at the top level).
   * Website: **Add file → Upload files**, drag the folder contents in, then **Commit**.
   * Or from a terminal:
     ```bash
     git init && git add . && git commit -m "Wingspan stats site"
     git branch -M main
     git remote add origin https://github.com/<you>/wingspan-stats.git
     git push -u origin main
     ```
3. In the repository, go to **Settings → Pages**. Under *Build and deployment*, choose
   **Deploy from a branch**, then branch **main** and folder **/ (root)**, then **Save**.
4. After a minute the site is live at `https://<you>.github.io/wingspan-stats/`.

All asset paths are relative, so the site works at a project sub-path like the one above. The
`.nojekyll` file tells GitHub Pages to serve the files as they are.

---

## How the numbers work

All calculations live in `js/stats.js` and `js/awards.js`, and all thresholds in `js/rules.js`.
Every page reads from those modules, so each rule is defined once.

**Ties**

* Everyone tied for the highest score shares 1st place. Each of them gets a win and a gold medal.
* Placements use competition ranking: 120 / 120 / 95 is 1st, 1st, 3rd (no silver), and
  120 / 95 / 95 is 1st, 2nd, 2nd.
* Winning margin = top score − second-highest score, so a tied win has margin 0.
* A **blowout** (Apex Predator) is a win by 20+ over second place. Tied wins never qualify.
* Streaks follow row order. Shared wins continue a winning streak.
* Every tied record holder is listed on an award.

**Statistics**

* Median uses numeric sorting; with an even number of games it's the mean of the middle two.
* Standard deviation is the sample standard deviation (n − 1). It's shown once a player has 2+
  games. The Rock and the Chaos Bird require 5+ games.
* "Last 5" and "Last 10" averages use every game available and are labelled when there are fewer.
* **Improvement / Rising Star**: average of the first *k* games vs the last *k* games, where
  *k* = min(10, ⌊games ÷ 2⌋), so the two windows never overlap. It needs 4+ games and is labelled
  "small sample" while *k* < 5.
* The leaderboard ranks by wins, then average placement, then average score, then total points.
  Podium % is left out because with three players everyone is on the podium every game.

**Head-to-head** compares each pair of players game by game: whoever scored higher "beats" the
other, regardless of who won the game overall, and equal scores are ties. The Nemesis award goes
to the biggest head-to-head wins-minus-losses against a single opponent.

**Latest-game recap** recomputes everything without the newest game and lists what changed: lead
changes, streaks extended or ended, Hall of Fame records changing hands, and personal bests or lows
(once a player has 3+ earlier games).

**Hall of Fame**

| 🏆 Records & Glory | | 💀 Shame & Misfortune | |
|---|---|---|---|
| 👑 The Emperor | most wins | 🪶 The Grounded Bird | lowest single score |
| 🎯 The Sharpshooter | highest average | 🥈 The Bridesmaid | most 2nd places |
| 🦅 The High Flyer | highest single score | 😭 The Unlucky One | highest average in non-wins |
| 💥 The Destroyer | largest winning margin | 💔 The Heartbreaker | highest 2nd-place score |
| 🧱 The Rock | lowest std dev (5+ games) | 🎢 The Chaos Bird | highest std dev (5+ games) |
| 🔥 The Hot Hand | best last-5 average | 🦤 The Dodo | longest run without a win |
| 📈 The Rising Star | biggest early→recent rise | | |
| 👑 The Dynasty | longest win streak | | |
| 🦅 The Apex Predator | most 20+ point wins | | |
| 💯 The 120 Club | most 120+ games | | |
| 🎭 The Nemesis | most lopsided head-to-head rivalry | | |
| 🐣 The Underdog | lowest winning score | | |

---

## Link previews and home-screen icon

`index.html` contains Open Graph tags so a shared link shows a title, description and
`assets/og-image.png`. Preview services need absolute URLs, so the tags point at
`https://kylemillar608.github.io/wingspan-stats/`. If you rename the repository, update the
`og:url` and `og:image` lines. Apps such as iMessage cache previews, so a link that was already
shared may keep its old preview for a while.

`manifest.webmanifest` and `assets/apple-touch-icon.png` give the home-screen shortcut its name and
bird icon. Instructions for adding it are in a collapsible section in the site's footer.

The preview image and icons are rendered from HTML sources in `assets/src/`. After editing those
(for example, to change the player names on the preview image), run:

```bash
bash scripts/render-images.sh
```

---

## Files

```
index.html            page shell
css/styles.css        all styling (light + dark themes, mobile-first)
js/config.js          the Google Sheets CSV link  ← the only file you'd normally edit
js/rules.js           thresholds (blowout margin, 120 Club, window sizes…)
js/csv.js             CSV parser (quotes, CRLF, BOM)
js/data.js            validates rows → games, reports problems
js/stats.js           every statistic, ranking, streak and head-to-head record
js/awards.js          Hall of Fame
js/recap.js           latest-game recap (what changed)
js/birthdays.js       🎂 easter egg: birthday dates (preview with ?today=YYYY-MM-DD)
js/charts.js          Chart.js rendering
js/app.js             views, routing, loading/error states
js/loader.js          fetches the sheet and explains failures
js/demo.js            sample data for ?demo only
vendor/chart.umd.min.js   Chart.js 4.4.1, bundled so no CDN is needed
scripts/verify-live.mjs   prints live stats in the terminal
scripts/serve.py      no-cache local preview server
scripts/render-images.sh  re-renders the preview image and icons
manifest.webmanifest  home-screen app name and icons
assets/               favicon, preview image, icons (sources in assets/src/)
tests/                node:test unit tests
```
