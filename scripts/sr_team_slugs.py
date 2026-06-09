"""Sports-Reference school slug overrides (team id -> URL path segment)."""

# Default: team id matches SR slug. Overrides for exceptions only.
SR_SLUG_OVERRIDES = {
    "ole-miss": "mississippi",
    "uconn": "connecticut",
    "nc-state": "north-carolina-state",
    "miami": "miami-fl",
    "usc": "southern-california",
    "byu": "brigham-young",
    "smu": "southern-methodist",
    "vcu": "virginia-commonwealth",
    "saint-marys": "saint-marys-ca",
    "loyola-chicago": "loyola-il",
    "unlv": "nevada-las-vegas",
    "ucf": "central-florida",
    "texas-am": "texas-am",
    "st-johns": "st-johns-ny",
    "pittsburgh": "pittsburgh",
    "lsu": "louisiana-state",
    "tcu": "texas-christian",
}


def sr_slug(team_id: str) -> str:
    return SR_SLUG_OVERRIDES.get(team_id, team_id)
