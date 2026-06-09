#!/usr/bin/env python3
"""Fetch real college basketball rosters from Sports-Reference by team and era."""

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

from sr_team_slugs import sr_slug

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "rosters.json"

ERAS = [
    "2020-24", "2015-19", "2010-14", "2005-09", "2000-04",
    "1990s", "1980s", "1970s", "1960s",
]

ERA_SEASON_YEAR = {
    "2020-24": 2024,
    "2015-19": 2019,
    "2010-14": 2014,
    "2005-09": 2009,
    "2000-04": 2004,
    "1990s": 2000,
    "1980s": 1990,
    "1970s": 1980,
    "1960s": 1970,
}

USER_AGENT = "CBB-DB/1.0 (educational; local)"
REQUEST_DELAY = 1.2
MAX_RETRIES = 6


def fetch_html(url: str) -> str | None:
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429:
                wait = 8 * (attempt + 1)
                print(f"  rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            raise
        except urllib.error.URLError:
            wait = 5 * (attempt + 1)
            time.sleep(wait)
    return None


def strip_tags(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def parse_per_game_table(html: str) -> list[dict]:
    m = re.search(r'id="players_per_game".*?</table>', html, re.S)
    if not m:
        return []

    rows = re.findall(r"<tr[^>]*>.*?</tr>", m.group(0), re.S)
    if len(rows) < 2:
        return []

    headers = [strip_tags(c).lower() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", rows[0], re.S)]
    players = []

    for row in rows[1:]:
        cells = [strip_tags(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
        if len(cells) < len(headers):
            continue

        row_map = dict(zip(headers, cells))
        name = row_map.get("player", "")
        if not name or name.lower() in {"player", "team totals"}:
            continue

        def num(key: str, default: float = 0.0) -> float:
            raw = row_map.get(key, "")
            if not raw or raw in {"-", ""}:
                return default
            try:
                return float(raw)
            except ValueError:
                return default

        pos = row_map.get("pos", "G").upper()
        fg = num("fg%")
        if 0 < fg <= 1:
            fg *= 100

        stats = {
            "ppg": round(num("pts"), 1),
            "rpg": round(num("trb"), 1),
            "apg": round(num("ast"), 1),
            "spg": round(num("stl"), 1),
            "bpg": round(num("blk"), 1),
            "fgPct": round(fg, 1),
        }
        awards = row_map.get("awards", "")
        mpg = num("mp")

        players.append({
            "name": name,
            "positions": infer_positions(pos, stats),
            "stats": stats,
            "awards": awards,
            "mpg": mpg,
        })

    return players


def infer_positions(pos: str, stats: dict) -> list[str]:
    pos = pos.upper().replace("/", "-")
    if pos in {"G-F", "GF"}:
        return ["G-F"]
    if pos in {"F-C", "FC", "C-F", "CF"}:
        return ["PF", "C"]
    if pos == "C":
        return ["C"]
    if pos == "G":
        return ["PG"] if stats["apg"] >= 4.0 else ["SG"]
    if pos == "F":
        return ["PF"] if stats["rpg"] >= 7.0 else ["SF"]
    if "-" in pos:
        return [pos]
    return [pos]


def roster_for_team_era(team_id: str, era: str, min_mpg: float = 5.0) -> list[dict]:
    slug = sr_slug(team_id)
    year = ERA_SEASON_YEAR[era]
    url = f"https://www.sports-reference.com/cbb/schools/{slug}/men/{year}.html"
    html = fetch_html(url)
    if not html:
        return []

    players = parse_per_game_table(html)
    rotation = [p for p in players if p["mpg"] >= min_mpg or p["stats"]["ppg"] >= 6.0]
    rotation.sort(key=lambda p: (-p["stats"]["ppg"], -p["mpg"]))

    return [
        {
            "name": p["name"],
            "positions": p["positions"],
            "stats": p["stats"],
            "awards": p["awards"],
        }
        for p in rotation
    ]


def load_existing() -> dict:
    if not OUT.exists():
        return {}
    payload = json.loads(OUT.read_text(encoding="utf-8"))
    return payload.get("rosters", {})


def save_progress(rosters: dict, missing: list[str]):
    payload = {
        "source": "https://www.sports-reference.com/cbb/",
        "eraSeasonYear": ERA_SEASON_YEAR,
        "missing": missing,
        "rosters": rosters,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main():
    teams = json.loads((DATA / "teams.json").read_text(encoding="utf-8"))
    rosters = load_existing()
    missing = []

    for i, team in enumerate(teams):
        tid = team["id"]
        if tid not in rosters:
            rosters[tid] = {}

        for era in ERAS:
            if era in rosters[tid]:
                continue
            players = roster_for_team_era(tid, era)
            if players:
                rosters[tid][era] = players
            else:
                missing.append(f"{tid}/{era}")
            save_progress(rosters, missing)
            time.sleep(REQUEST_DELAY)

        total = sum(len(v) for v in rosters[tid].values())
        print(f"[{i + 1}/{len(teams)}] {tid}: {total} players", flush=True)

    save_progress(rosters, missing)
    print(f"Wrote {OUT}")
    print(f"Missing team/era combos: {len(missing)}")


if __name__ == "__main__":
    main()
