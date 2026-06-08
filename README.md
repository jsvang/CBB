# Undefeated CBB

Draft an all-time college basketball starting five and see if your lineup can run an undefeated season.

Each round spins a random team and era. Pick one player, fill all five spots, and simulate a full NCAA season — regular season, conference tournament, and March Madness. Land the right legends, stack your stats, and push for an undefeated national title.

## Run locally

Generate the player database first (once, or again after editing `data/legends.json` or `data/teams.json`):

```bash
python scripts/build_cbb_db.py
python -m http.server 8080 --bind 127.0.0.1
```

Then open [http://127.0.0.1:8080](http://127.0.0.1:8080).

## Stack

Vanilla HTML, CSS, and JavaScript — no bundler or build step. Deploy as static files to Cloudflare Pages or GitHub Pages.
