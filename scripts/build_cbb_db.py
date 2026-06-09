#!/usr/bin/env python3
"""Build college basketball player database from legends + real roster data."""

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

ERAS = [
    "2020-24", "2015-19", "2010-14", "2005-09", "2000-04",
    "1990s", "1980s", "1970s", "1960s",
]


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


# Position-weighted stat contributions (tuned for college per-game averages).
POS_WEIGHTS = {
    "PG": {"ppg": 1.4, "rpg": 0.4, "apg": 2.0, "spg": 3.5, "bpg": 1.5},
    "G": {"ppg": 1.4, "rpg": 0.4, "apg": 2.0, "spg": 3.5, "bpg": 1.5},
    "SG": {"ppg": 1.8, "rpg": 0.5, "apg": 1.0, "spg": 3.0, "bpg": 1.0},
    "SF": {"ppg": 1.6, "rpg": 0.9, "apg": 0.9, "spg": 2.5, "bpg": 2.0},
    "G-F": {"ppg": 1.6, "rpg": 0.9, "apg": 0.9, "spg": 2.5, "bpg": 2.0},
    "F": {"ppg": 1.6, "rpg": 0.9, "apg": 0.9, "spg": 2.5, "bpg": 2.0},
    "PF": {"ppg": 1.3, "rpg": 1.3, "apg": 0.5, "spg": 1.8, "bpg": 3.0},
    "C": {"ppg": 1.0, "rpg": 1.6, "apg": 0.4, "spg": 1.0, "bpg": 3.8},
}

RATING_CURVE_K = 22  # higher = more compression at the top end


def rating_from_stats(stats: dict, pos: str) -> int:
    weights = POS_WEIGHTS.get(pos, POS_WEIGHTS["SF"])
    raw = sum(stats.get(stat, 0) * weights[stat] for stat in weights)
    raw += (stats.get("fgPct", 45) - 45) * 0.06

    if raw <= 0:
        return 40

    scaled = 40 + 57 * (1 - math.exp(-raw / RATING_CURVE_K))
    return max(40, min(97, round(scaled)))


def build_player(name, team_id, team_name, conf, era, positions, stats, awards=""):
    primary = positions[0]
    rating = rating_from_stats(stats, primary)
    pid = f"{team_id}-{era}-{slug(name)}"
    return {
        "id": pid,
        "name": name,
        "team": team_id,
        "teamName": team_name,
        "conference": conf,
        "era": era,
        "positions": positions,
        "rating": rating,
        "stats": stats,
        "awards": awards,
    }


def load_rosters():
    path = DATA / "rosters.json"
    if not path.exists():
        raise SystemExit(
            f"Missing {path}. Run: python scripts/fetch_rosters.py"
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload.get("rosters", {})


# Collapse over-specific roster positions to generics (G fits PG/SG, F fits SF/PF)
# so single-team drafts always have players for every slot.
GENERIC_POSITION = {"PG": "G", "SG": "G", "SF": "F", "PF": "F"}


def normalize_roster_positions(positions, stats):
    out = []
    for pos in positions or []:
        pos = (pos or "").strip().upper()
        if not pos:
            continue
        mapped = GENERIC_POSITION.get(pos, pos)
        if mapped not in out:
            out.append(mapped)
    if not out:
        out = ["F"] if stats.get("rpg", 0) >= 4.5 else ["G"]
    return out


def roster_players_for(team, era, roster_entries, legend_names, count):
    """Return up to `count` real roster players, excluding legends."""
    players = []
    for entry in roster_entries:
        if normalize_name(entry["name"]) in legend_names:
            continue
        stats = entry["stats"]
        positions = normalize_roster_positions(entry.get("positions"), stats)
        players.append(build_player(
            entry["name"],
            team["id"],
            team["name"],
            team["conf"],
            era,
            positions,
            stats,
            entry.get("awards", ""),
        ))
        if len(players) >= count:
            break
    return players


def main():
    teams = json.loads((DATA / "teams.json").read_text(encoding="utf-8"))
    legends = json.loads((DATA / "legends.json").read_text(encoding="utf-8"))
    rosters = load_rosters()
    team_by_id = {t["id"]: t for t in teams}

    players = []
    used_ids = set()
    roster_slots = 0
    shortfalls = []

    for leg in legends:
        team = team_by_id.get(leg["team"])
        if not team:
            continue
        pl = build_player(
            leg["name"],
            leg["team"],
            team["name"],
            team["conf"],
            leg["era"],
            leg["positions"],
            leg["stats"],
            leg.get("awards", ""),
        )
        if pl["id"] not in used_ids:
            players.append(pl)
            used_ids.add(pl["id"])

    print(f"Loaded {len(players)} legends")

    for team in teams:
        team_rosters = rosters.get(team["id"], {})
        for era in ERAS:
            legend_names = {
                normalize_name(p["name"])
                for p in players
                if p["team"] == team["id"] and p["era"] == era
            }
            count = 8 + team.get("tier", 1) * 2
            entries = team_rosters.get(era, [])
            roster = roster_players_for(team, era, entries, legend_names, count)
            roster_slots += len(roster)
            if len(roster) < count:
                shortfalls.append(f"{team['id']}/{era}: {len(roster)}/{count}")

            for pl in roster:
                if pl["id"] not in used_ids:
                    players.append(pl)
                    used_ids.add(pl["id"])

    out = DATA / "players.json"
    out.write_text(json.dumps(players, separators=(",", ":")), encoding="utf-8")
    print(f"Added {roster_slots} roster players from real data")
    if shortfalls:
        print(f"Roster shortfalls (no fake fill): {len(shortfalls)}")
    print(f"Wrote {len(players):,} players to {out}")


if __name__ == "__main__":
    main()
