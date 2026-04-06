# TI4 Reporter

Browser-based stats tracker for TI4 async games on Discord.

## Quick Start

Serve the files locally (needed for CSV fetch):

```bash
npx serve .
```

Then open `http://localhost:3000` in your browser.

## Data Files

All data lives in `data/`:

- `games.csv` — one row per player per game (game_id, player, race, VP, winner, etc.)
- `bans.csv` — race bans per game
- `players.csv` — player metadata

Export your Google Sheets tabs as CSV and drop them in `data/`.

## Features

- **Game Reports** — select any game, see full results and bans
- **Race Stats** — win rates, avg VP, sortable columns
- **Standings** — player leaderboard with multiple sort options
- **Picks & Bans** — race popularity, ban rates, performance when picked
- **Player Sheets** — per-player history, race breakdown, stats
