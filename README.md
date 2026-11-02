# TI4 Reporter

Browser-based stats tracker for TI4 async games on Discord.

## Quick Start

Serve the files locally (needed for CSV fetch):

```bash
npx serve .
```

Then open `http://localhost:3000/` in your browser for Season 2. Season 1 is at
`http://localhost:3000/season1/`. The admin page is at
`http://localhost:3000/admin.html` and always manages Season 2.
Both `/admin.html` and the legacy `/season1/admin.html` redirect to
`/season2/admin.html`. Season 1 is read-only in the app.

## Data Files

Each season has its own data in `season1/data/` and `season2/data/`:

- `games.csv` — one row per player per game (game_id, player, race, VP, winner, etc.)
- `bans.csv` — race bans per game
- `players.csv` — player metadata

Export your Google Sheets tabs as CSV and drop them in the matching season's `data/` directory.
Season 2 has 13 scheduled games (G01–G13, named Meciul 1–13), with six players per
game and six games per player. Races and results are unset, and bans are empty.
Scheduled games appear in game reports and player history but do not count as played
games or contribute to scores and race statistics.
In the Season 2 admin, select one of the 13 existing games to edit races, pick
order, speaker, bans, not-picked races, duration, status, VP, and final ranks.
Game creation, deletion, and lineup changes are not available. Set the status to
Ongoing when play starts, or Finished with ranks 1-6 to record results. The winner
is derived from rank 1. Admin saves update the CSVs on the repository's main
branch, not the local working copy.

## Season 2 Scoring

League points depend only on placement: 1st +15, 2nd +8, 3rd +4, 4th +1,
5th -4, and 6th -8. Victory points do not add league points. Each player's
six game scores are added together, including negative scores, for a maximum of
90 points. Season 1 retains its original scoring rules.
All Season 2 roster players appear in the standings, including players with no
finished games, who start with zero points.

## Features

- **Game Reports** — select any game, see full results and bans
- **Season 2 Games Overview** — toggle player names below the table to highlight
  games containing every selected player; clear the selection to reset
- **Race Stats** — win rates, avg VP, sortable columns
- **Standings** — player leaderboard with multiple sort options
- **Picks & Bans** — race popularity, ban rates, performance when picked
- **Player Sheets** — per-player history, race breakdown, stats
