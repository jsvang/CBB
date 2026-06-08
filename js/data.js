export const SEASON_LENGTH = 82;

export const CONFERENCES = {
  SEC: { name: 'SEC', color: '#c9a227' },
  BigTen: { name: 'Big Ten', color: '#003366' },
  Big12: { name: 'Big 12', color: '#c8102e' },
  ACC: { name: 'ACC', color: '#012169' },
  BigEast: { name: 'Big East', color: '#005eb8' },
  AAC: { name: 'AAC', color: '#00205b' },
  MWC: { name: 'Mountain West', color: '#003da5' },
  WCC: { name: 'WCC', color: '#003da5' },
  A10: { name: 'Atlantic 10', color: '#c8102e' },
  MVC: { name: 'Missouri Valley', color: '#005030' },
  Independent: { name: 'Independent', color: '#ae9142' },
};

export const POWER_CONFERENCES = ['SEC', 'BigTen', 'Big12', 'ACC', 'BigEast'];

export const MODERN_ERAS = [
  { id: '2020-24', label: '2020–24', isLegend: false },
  { id: '2015-19', label: '2015–19', isLegend: false },
  { id: '2010-14', label: '2010–14', isLegend: false },
  { id: '2005-09', label: '2005–09', isLegend: false },
  { id: '2000-04', label: '2000–04', isLegend: false },
];

export const LEGEND_ERAS = [
  { id: '1990s', label: '1990s', isLegend: true },
  { id: '1980s', label: '1980s', isLegend: true },
  { id: '1970s', label: '1970s', isLegend: true },
  { id: '1960s', label: '1960s', isLegend: true },
];

export const ALL_ERAS = [...MODERN_ERAS, ...LEGEND_ERAS];

/** 82-0 style starting five */
export const ROSTER_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];

export const POSITION_MAP = {
  PG: ['PG', 'G'],
  SG: ['SG', 'G'],
  SF: ['SF', 'F', 'G-F'],
  PF: ['PF', 'F'],
  C: ['C'],
};

export const POSITION_WEIGHTS = {
  PG: 1.35,
  C: 1.2,
};

export const POOL_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'PG', label: 'PG', positions: ['PG', 'G'] },
  { id: 'SG', label: 'SG', positions: ['SG', 'G'] },
  { id: 'SF', label: 'SF', positions: ['SF', 'F', 'G-F'] },
  { id: 'PF', label: 'PF', positions: ['PF', 'F'] },
  { id: 'C', label: 'C', positions: ['C'] },
];

export function slotDisplayLabel(slotKey) {
  return slotKey;
}

export function rosterDiagramLabels() {
  return [...ROSTER_SLOTS];
}

export function playerMatchesPoolFilter(player, filterId) {
  const filter = POOL_FILTERS.find((f) => f.id === filterId);
  if (!filter || filter.id === 'all' || !filter.positions) return true;
  return player.positions.some((pos) => filter.positions.includes(pos));
}

export function playerFitsOpenSlot(player, openSlots) {
  if (!openSlots.length) return false;
  for (const slot of openSlots) {
    const allowed = POSITION_MAP[slot] || [];
    if (player.positions.some((pos) => allowed.includes(pos))) {
      return true;
    }
  }
  return false;
}

export function playerEligibleForDraftPool(player, openSlots) {
  return playerFitsOpenSlot(player, openSlots);
}

export let TEAMS = [];
let PLAYER_DB = [];
let PLAYER_BY_ID = new Map();
let PLAYERS_BY_COMBO = new Map();
let dbLoaded = false;
let dbLoadPromise = null;

async function indexPlayerBatch(batch, teamById) {
  for (const pl of batch) {
    const team = teamById.get(pl.team);
    const enriched = {
      ...pl,
      teamName: pl.teamName || team?.name || pl.team,
      conference: pl.conference || team?.conf || 'Independent',
    };
    PLAYER_DB.push(enriched);
    PLAYER_BY_ID.set(enriched.id, enriched);
    const key = `${enriched.team}|${enriched.era}`;
    if (!PLAYERS_BY_COMBO.has(key)) PLAYERS_BY_COMBO.set(key, []);
    PLAYERS_BY_COMBO.get(key).push(enriched);
  }
}

async function indexPlayersAsync(players, onProgress, teamById) {
  PLAYER_DB = [];
  PLAYER_BY_ID = new Map();
  PLAYERS_BY_COMBO = new Map();

  const batchSize = 4000;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);
    await indexPlayerBatch(batch, teamById);
    reportProgress(onProgress, {
      phase: 'index',
      loaded: Math.min(i + batch.length, players.length),
      total: players.length,
    });
    if (i + batchSize < players.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

async function loadPlayersFromManifest(onProgress) {
  reportProgress(onProgress, { phase: 'manifest', loaded: 0, total: 1 });

  const manifestRes = await fetch('data/players/manifest.json', { cache: 'no-cache' });
  if (!manifestRes.ok) return null;

  const manifest = await manifestRes.json();
  const chunks = manifest.chunks || [];
  if (!chunks.length) return null;

  reportProgress(onProgress, { phase: 'manifest', loaded: 1, total: 1 });

  const teamById = buildTeamLookup();
  PLAYER_DB = [];
  PLAYER_BY_ID = new Map();
  PLAYERS_BY_COMBO = new Map();

  let indexed = 0;
  const total = manifest.total || chunks.reduce((sum, c) => sum + (c.count || 0), 0);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const res = await fetch(chunk.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${chunk.file} (${res.status})`);

    const data = await res.json();
    await indexPlayerBatch(data, teamById);
    indexed += data.length;

    reportProgress(onProgress, {
      phase: 'download',
      loaded: i + 1,
      total: chunks.length,
      playersLoaded: indexed,
      playersTotal: total,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return PLAYER_DB;
}

async function loadMonolithicPlayers(onProgress, teamById) {
  reportProgress(onProgress, { phase: 'download', loaded: 0, total: 1 });

  const res = await fetch('data/players.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load players.json (${res.status})`);

  reportProgress(onProgress, { phase: 'parse', loaded: 0, total: 1, message: 'Parsing player data…' });

  const raw = await res.json();
  reportProgress(onProgress, {
    phase: 'download',
    loaded: 1,
    total: 1,
    playersLoaded: raw.length,
    playersTotal: raw.length,
  });

  await indexPlayersAsync(raw, onProgress, teamById);
  return PLAYER_DB;
}

function reportProgress(onProgress, payload) {
  if (onProgress) onProgress(payload);
}

function buildTeamLookup() {
  return new Map(TEAMS.map((team) => [team.id, team]));
}

export async function loadDatabase(onProgress) {
  if (dbLoaded) return { players: PLAYER_DB, teams: TEAMS };
  if (dbLoadPromise) return dbLoadPromise;

  dbLoadPromise = (async () => {
    reportProgress(onProgress, { phase: 'init', message: 'Starting up…' });

    const teamsRes = await fetch('data/teams.json', { cache: 'no-cache' });
    if (!teamsRes.ok) throw new Error(`Failed to load teams.json (${teamsRes.status})`);
    TEAMS = await teamsRes.json();

    reportProgress(onProgress, { phase: 'teams', message: 'Teams loaded. Fetching players…' });

    let loadedFromManifest = false;
    try {
      const manifestPlayers = await loadPlayersFromManifest(onProgress);
      if (manifestPlayers?.length) loadedFromManifest = true;
    } catch (err) {
      console.warn('Chunked player load failed, falling back to monolithic file:', err);
    }

    if (!loadedFromManifest) {
      PLAYER_DB = [];
      PLAYER_BY_ID = new Map();
      PLAYERS_BY_COMBO = new Map();
      await loadMonolithicPlayers(onProgress, buildTeamLookup());
    }

    if (!PLAYER_DB.length) {
      throw new Error('Player database loaded empty');
    }

    dbLoaded = true;
    reportProgress(onProgress, {
      phase: 'done',
      loaded: PLAYER_DB.length,
      total: PLAYER_DB.length,
      message: 'Ready!',
    });
    return { players: PLAYER_DB, teams: TEAMS };
  })().catch((err) => {
    dbLoadPromise = null;
    throw err;
  });

  return dbLoadPromise;
}

export function getPlayerCount() {
  return PLAYER_DB.length;
}

export function getTeamById(id) {
  return TEAMS.find((t) => t.id === id);
}

export function getPlayersForSpin(teamId, eraId, options = {}) {
  const { openSlots = null } = options;
  const pool = PLAYERS_BY_COMBO.get(`${teamId}|${eraId}`) || [];
  if (!openSlots?.length) return pool;
  return pool.filter((pl) => playerFitsOpenSlot(pl, openSlots));
}

export function normalizeEraFilter(selectedIds) {
  if (!selectedIds?.length || selectedIds.length >= ALL_ERAS.length) return null;
  return selectedIds;
}

export function isEraFilterActive(eraFilter) {
  if (!eraFilter) return false;
  const ids = Array.isArray(eraFilter) ? eraFilter : [eraFilter];
  return ids.length > 0 && ids.length < ALL_ERAS.length;
}

export function getFilteredTeams(filterType, filterValue, eraFilter = null) {
  let teams;
  if (filterType === 'power5') {
    teams = TEAMS.filter((t) => POWER_CONFERENCES.includes(t.conf));
  } else if (filterType === 'team' && filterValue) {
    const id = Array.isArray(filterValue) ? filterValue[0] : filterValue;
    teams = TEAMS.filter((t) => t.id === id);
  } else if (filterType === 'conference' && filterValue) {
    const conferences = Array.isArray(filterValue) ? filterValue : [filterValue];
    teams = conferences.length
      ? TEAMS.filter((t) => conferences.includes(t.conf))
      : TEAMS;
  } else {
    teams = TEAMS;
  }

  if (eraFilter) {
    const eraIds = Array.isArray(eraFilter) ? eraFilter : [eraFilter];
    const active = normalizeEraFilter(eraIds);
    if (active) {
      const teamIds = new Set();
      for (const id of active) {
        for (const tid of getTeamIdsWithPlayersInEra(id)) {
          teamIds.add(tid);
        }
      }
      teams = teams.filter((t) => teamIds.has(t.id));
    }
  }

  return teams;
}

export function getTeamIdsWithPlayersInEra(eraId) {
  const teamIds = new Set();
  for (const pl of PLAYER_DB) {
    if (pl.era === eraId) teamIds.add(pl.team);
  }
  return teamIds;
}

export function getOpenRosterSlots(slots, slotKeys) {
  return slotKeys.filter((slot) => !slots[slot]);
}
