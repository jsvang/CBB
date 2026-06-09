# Undefeated CBB

Draft an all-time college basketball starting five and see if your lineup can run an undefeated season.

Each round spins a random team and era. Pick one player, fill all five spots, and simulate a full NCAA season — regular season, conference tournament, and March Madness. Land the right legends, stack your stats, and push for an undefeated national title.

## Run locally

Generate the player database (once, or again after editing source data):

```bash
python scripts/fetch_rosters.py   # real roster names/stats from Sports-Reference (resumable)
python scripts/build_cbb_db.py    # merges legends + rosters into data/players.json
python -m http.server 8080 --bind 127.0.0.1
```

Roster data is cached in `data/rosters.json`. Re-run `fetch_rosters.py` only when teams or eras change; edit `data/legends.json` for star players, then run `build_cbb_db.py`.

Then open [http://127.0.0.1:8080](http://127.0.0.1:8080).

## Stack

Vanilla HTML, CSS, and JavaScript — no bundler or build step. Deploy as static files to Cloudflare Pages or GitHub Pages.
