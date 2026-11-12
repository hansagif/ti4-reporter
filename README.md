# TI4 Reporter

Browser-based stats tracker for TI4 async games on Discord.

## Quick Start

Serve the files locally (needed for CSV fetch):

```bash
python3 serve.py
```

Then open `http://127.0.0.1:3001/` in your browser for Season 2. Season 1 is at
`http://127.0.0.1:3001/season1/`. The admin page is at
`http://127.0.0.1:3001/admin.html` and always manages Season 2.
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
In the Season 2 admin, select one of the 13 existing games to report it:

- **Player area:** race assignment, starting position (seat 1-6), number of turns,
  average turn time in one `hh:mm` field (hours may exceed 23), VP, final rank,
  and speaker. Race dropdowns are available immediately, without confirming a
  draft first; banned races are excluded. Assignments must match the draft.
- **Game area:** progress status, duration in days, bans, and race draft order.
  Toggle up to six race boxes and confirm bans (zero bans is allowed). Click six
  other race boxes in draft order and confirm, then assign those races to players.
  Click a selected box again to remove it; later draft positions shift forward.
  Changed selections must be confirmed again before saving. All six drafted races
  are played this season, so there is no not-picked race input. Historical
  not-picked records are retained when updating older games.
- **Update game** saves partial progress. Set Ongoing when play starts.
- **Finish game** requires confirmed bans and all six picks, six unique player
  races and seats, turns, average turn times, VP, ranks 1-6 exactly once, and
  duration. The winner is derived from rank 1.
- Finished games are read-only until **Reopen game** is used. Reopening retains
  recorded fields for correction, changes status to Ongoing, and removes the game
  from finished-game standings until it is finished again.

Game creation, deletion, and lineup changes are not available.
On localhost, choose **Connect locally (no token)** to load and save CSVs directly
in this checkout. This requires `python3 serve.py` (Python standard library only);
use `--port 3002` to choose another port. The server binds to loopback only, allows
only the two editable seasons' CSV paths, checks same-origin writes, and rejects
stale saves. Local edits do not change GitHub until committed and pushed.
The connection label shows which season and save mode are active.

Alternatively, **Connect** with a GitHub token saves the CSVs on the repository's
main branch, not the local working copy. Ordinary static hosting still supports
this GitHub mode. Local mode never uses the token or sends writes to GitHub.
The reporting script and styles are shared with the simulation admin; the page's
season setting keeps their data paths separate.

New game columns are added automatically on save, with blank values for older
records: `starting_position`, `turns`, and `avg_turn_minutes` (total average minutes
per turn). `draft_races` stores the confirmed race draft order, separated by `|`,
independently of player assignments. Existing `pick_order` is derived from each
player's race. These fields and duration appear in Game Reports; older records
without them display dashes. Season 1 is unchanged.

Run reporting and standings tests with `node --test tests/*.test.cjs` and local
server tests with `python3 -m unittest discover -s tests -p 'test_*.py'`.

## Season 2 Scoring

League points depend only on placement: 1st +15, 2nd +8, 3rd +4, 4th +1,
5th -4, and 6th -8. Victory points do not add league points. Each player's
six game scores are added together, including negative scores, for a maximum of
90 points. Season 1 retains its original scoring rules.
All Season 2 roster players appear in the standings, including players with no
finished games, who start with zero points.
The standings columns are position, player (one winning race icon per
finished-game win), Started Games (one race icon per ongoing game), Finished
Games, Races Played, and Total Points. Winning and active race icons retain
duplicates for separate games; their tooltips identify the game and race.
Ongoing games without an assigned race show "Race TBD" with the game name.
Started Games can still be sorted by the number of ongoing games.
Races Played shows each distinct assigned race from ongoing or finished games
once, with its name in a tooltip on hover or keyboard focus. Scheduled and
abandoned games do not count as active games or races played. Total Points counts
finished games only and is the default descending sort.

The 30 faction icons are served locally from `assets/factions/`, downloaded from
[AsyncTI4's faction assets](https://github.com/AsyncTI4/TI4_map_generator_bot/tree/c986fb5642f5e3340bc8e01443a6029326d46056/src/main/resources/factions).
Twilight Imperium faction artwork belongs to its respective owners; the upstream
software license explicitly excludes art assets. No ownership of these images
is claimed.

## Features

- **Game Reports** — select any game, see full results and bans
- **Season 2 Games Overview** — toggle player names below the table to highlight
  games containing every selected player; clear the selection to reset
- **Race Stats** — win rates, avg VP, sortable columns
- **Race Draft Preference** — Race Stats includes a faction-icon heatmap of picks
  1-6, ordered by average pick position (earlier first), with pick counts and
  hover/focus details. Uses each ongoing or finished game's confirmed draft once,
  even before player race assignment; older records use player pick orders.
  Scheduled/abandoned games are excluded. This measures draft preference, not
  faction strength; small samples should be interpreted cautiously.
- **Standings** — player leaderboard with multiple sort options
- **Picks & Bans** — race popularity, ban rates, performance when picked
- **Player Sheets** — per-player history, race breakdown, stats
