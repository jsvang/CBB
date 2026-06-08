#!/usr/bin/env python3
"""Build college basketball player database from legends + generated roster players."""

import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

ERAS = [
    "2020-24", "2015-19", "2010-14", "2005-09", "2000-04",
    "1990s", "1980s", "1970s", "1960s",
]

POSITIONS_BY_SLOT = {
    "PG": ["PG", "G"],
    "SG": ["SG", "G"],
    "SF": ["SF", "F", "G-F"],
    "PF": ["PF", "F"],
    "C": ["C"],
}

FIRST_NAMES = [
    "James", "Michael", "Chris", "Marcus", "Tyler", "Brandon", "Jordan", "Derek",
    "Kevin", "Ryan", "Josh", "Matt", "David", "Eric", "Brian", "Anthony", "Devin",
    "Malik", "Jamal", "Terrence", "Cameron", "Isaiah", "Darius", "Trevor", "Logan",
]

LAST_NAMES = [
    "Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor",
    "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Robinson",
    "Clark", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright",
]

ERA_BASELINE = {
    "2020-24": 72,
    "2015-19": 71,
    "2010-14": 70,
    "2005-09": 69,
    "2000-04": 68,
    "1990s": 70,
    "1980s": 69,
    "1970s": 68,
    "1960s": 67,
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def rating_from_stats(stats: dict, pos: str) -> int:
    ppg = stats.get("ppg", 0)
    rpg = stats.get("rpg", 0)
    apg = stats.get("apg", 0)
    spg = stats.get("spg", 0)
    bpg = stats.get("bpg", 0)

    if pos in ("PG", "G"):
        raw = ppg * 1.1 + apg * 2.2 + rpg * 0.5 + spg * 3 + bpg * 2
    elif pos in ("SG",):
        raw = ppg * 1.15 + apg * 1.2 + rpg * 0.6 + spg * 2.5 + bpg * 1.5
    elif pos in ("SF", "G-F", "F"):
        raw = ppg * 1.0 + rpg * 0.9 + apg * 1.0 + spg * 2 + bpg * 1.8
    elif pos in ("PF",):
        raw = ppg * 0.95 + rpg * 1.3 + apg * 0.6 + spg * 1.5 + bpg * 2.2
    else:
        raw = ppg * 0.85 + rpg * 1.5 + apg * 0.4 + spg * 1.2 + bpg * 2.8

    return max(40, min(97, round(raw)))


def gen_stats(pos: str, rating: int, rng: random.Random) -> dict:
    scale = rating / 75.0
    if pos in ("PG", "G"):
        return {
            "ppg": round(rng.uniform(6, 14) * scale, 1),
            "rpg": round(rng.uniform(2, 5) * scale, 1),
            "apg": round(rng.uniform(3, 8) * scale, 1),
            "spg": round(rng.uniform(0.8, 2.2) * scale, 1),
            "bpg": round(rng.uniform(0.1, 0.5) * scale, 1),
            "fgPct": round(rng.uniform(38, 48), 1),
        }
    if pos == "SG":
        return {
            "ppg": round(rng.uniform(8, 18) * scale, 1),
            "rpg": round(rng.uniform(2, 5) * scale, 1),
            "apg": round(rng.uniform(1.5, 4) * scale, 1),
            "spg": round(rng.uniform(0.7, 1.8) * scale, 1),
            "bpg": round(rng.uniform(0.1, 0.6) * scale, 1),
            "fgPct": round(rng.uniform(40, 50), 1),
        }
    if pos in ("SF", "G-F", "F"):
        return {
            "ppg": round(rng.uniform(8, 16) * scale, 1),
            "rpg": round(rng.uniform(4, 8) * scale, 1),
            "apg": round(rng.uniform(1.5, 4) * scale, 1),
            "spg": round(rng.uniform(0.6, 1.5) * scale, 1),
            "bpg": round(rng.uniform(0.3, 1.0) * scale, 1),
            "fgPct": round(rng.uniform(42, 52), 1),
        }
    if pos == "PF":
        return {
            "ppg": round(rng.uniform(7, 15) * scale, 1),
            "rpg": round(rng.uniform(6, 10) * scale, 1),
            "apg": round(rng.uniform(1, 3) * scale, 1),
            "spg": round(rng.uniform(0.4, 1.2) * scale, 1),
            "bpg": round(rng.uniform(0.5, 1.5) * scale, 1),
            "fgPct": round(rng.uniform(44, 54), 1),
        }
    return {
        "ppg": round(rng.uniform(6, 14) * scale, 1),
        "rpg": round(rng.uniform(7, 12) * scale, 1),
        "apg": round(rng.uniform(0.8, 2.5) * scale, 1),
        "spg": round(rng.uniform(0.3, 1.0) * scale, 1),
        "bpg": round(rng.uniform(1.0, 3.0) * scale, 1),
        "fgPct": round(rng.uniform(50, 60), 1),
    }


def build_player(name, team_id, team_name, conf, era, positions, rating, stats, awards=""):
    primary = positions[0]
    if not rating:
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


def generate_roster_players(team, era, count, rng, used_names):
    players = []
    tier = team.get("tier", 1)
    base = ERA_BASELINE.get(era, 68) + tier * 2
    slot_cycle = ["PG", "SG", "SF", "PF", "C", "PG", "SG", "SF", "PF", "C", "G", "F"]

    for i in range(count):
        pos = slot_cycle[i % len(slot_cycle)]
        positions = POSITIONS_BY_SLOT.get(pos, [pos])[:1]
        if pos == "G":
            positions = ["G"]
        elif pos == "F":
            positions = ["F"]

        for _ in range(20):
            name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
            if name not in used_names:
                used_names.add(name)
                break

        rating = max(55, min(84, base + rng.randint(-6, 8)))
        stats = gen_stats(positions[0], rating, rng)
        players.append(build_player(
            name, team["id"], team["name"], team["conf"], era, positions, rating, stats,
        ))
    return players


def main():
    teams = json.loads((DATA / "teams.json").read_text(encoding="utf-8"))
    legends = json.loads((DATA / "legends.json").read_text(encoding="utf-8"))
    team_by_id = {t["id"]: t for t in teams}

    players = []
    used_ids = set()

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
            leg.get("rating"),
            leg["stats"],
            leg.get("awards", ""),
        )
        if pl["id"] not in used_ids:
            players.append(pl)
            used_ids.add(pl["id"])

    print(f"Loaded {len(players)} legends")

    for team in teams:
        for era in ERAS:
            rng = random.Random(hash(f"{team['id']}|{era}"))
            used_names = {p["name"] for p in players if p["team"] == team["id"] and p["era"] == era}
            count = 8 + team.get("tier", 1) * 2
            roster = generate_roster_players(team, era, count, rng, used_names)
            for pl in roster:
                if pl["id"] not in used_ids:
                    players.append(pl)
                    used_ids.add(pl["id"])

    out = DATA / "players.json"
    out.write_text(json.dumps(players, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(players):,} players to {out}")


if __name__ == "__main__":
    main()
