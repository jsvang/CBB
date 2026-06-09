import {
  ALL_ERAS,
  LEGEND_ERAS,
  MODERN_ERAS,
  POSITION_MAP,
  ROSTER_SLOTS,
  getFilteredTeams,
  getPlayersForSpin,
  isEraFilterActive,
  normalizeEraFilter,
} from './data.js';
import { simulateSeason } from './scoring.js';

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(options) {
  const {
    mode = 'classic',
    difficulty = 'normal',
    filterType = 'all',
    filterValue = null,
    eraFilter = null,
  } = options;

  const slotKeys = [...ROSTER_SLOTS];
  const seed = Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed);

  let teams = getFilteredTeams(filterType, filterValue, eraFilter);
  if (!teams.length && isEraFilterActive(eraFilter)) {
    teams = getFilteredTeams(filterType, filterValue);
  }

  const usedCombos = new Set();
  let legendUsed = false;
  const slots = Object.fromEntries(slotKeys.map((p) => [p, null]));

  let currentSpin = null;
  let teamRerollUsed = false;
  let eraRerollUsed = false;
  let draftRound = 0;
  const totalRounds = slotKeys.length;

  function pickRandom(arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function buildSpin(team, era, players) {
    return {
      teamId: team.id,
      teamName: team.name,
      conference: team.conf,
      eraId: era.id,
      eraLabel: era.label,
      isLegend: era.isLegend,
      players,
    };
  }

  function getOpenSlots() {
    return slotKeys.filter((p) => !slots[p]);
  }

  function getSpinPlayers(teamId, eraId) {
    return getPlayersForSpin(teamId, eraId, { openSlots: getOpenSlots() });
  }

  function getFilteredEraIds() {
    if (!isEraFilterActive(eraFilter)) {
      return ALL_ERAS.map((e) => e.id);
    }
    return Array.isArray(eraFilter) ? eraFilter : [eraFilter];
  }

  function hasAlternateTeam(excludeTeamId = null) {
    const id = excludeTeamId ?? currentSpin?.teamId;
    return teams.some((t) => t.id && t.id !== id);
  }

  function hasAlternateEra(excludeEraId = null) {
    const id = excludeEraId ?? currentSpin?.eraId;
    return getFilteredEraIds().some((eraId) => eraId !== id);
  }

  function pickEra(excludeEraId, forceLegend) {
    if (isEraFilterActive(eraFilter)) {
      const ids = new Set(Array.isArray(eraFilter) ? eraFilter : [eraFilter]);
      let pool = ALL_ERAS.filter((e) => ids.has(e.id));
      if (excludeEraId) pool = pool.filter((e) => e.id !== excludeEraId);
      return pool.length ? pickRandom(pool) : null;
    }

    const useLegend = forceLegend || (!legendUsed && rng() < 0.15);
    const eraPool = useLegend ? LEGEND_ERAS : MODERN_ERAS;
    const pool = excludeEraId ? eraPool.filter((e) => e.id !== excludeEraId) : eraPool;
    return pickRandom(pool.length ? pool : eraPool);
  }

  function getDraftedIds() {
    const ids = new Set();
    for (const slot of slotKeys) {
      if (slots[slot]) ids.add(slots[slot].id);
    }
    return ids;
  }

  function findSpin({
    fixedTeamId = null,
    fixedEraId = null,
    excludeTeamId = null,
    excludeEraId = null,
    forceLegend = false,
  } = {}) {
    const availableTeams = teams.filter((t) => t.id);
    const allowedEras = isEraFilterActive(eraFilter)
      ? ALL_ERAS.filter((e) => (Array.isArray(eraFilter) ? eraFilter : [eraFilter]).includes(e.id))
      : ALL_ERAS;
    const draftedIds = getDraftedIds();

    function tryCombo(team, era, allowReusedCombo = false) {
      const key = `${team.id}|${era.id}`;
      if (!allowReusedCombo && usedCombos.has(key)) return null;
      const players = getSpinPlayers(team.id, era.id).filter((pl) => !draftedIds.has(pl.id));
      if (!players.length) return null;
      usedCombos.add(key);
      if (era.isLegend) legendUsed = true;
      return buildSpin(team, era, players);
    }

    for (let attempt = 0; attempt < 300; attempt++) {
      let team;
      if (fixedTeamId) {
        team = availableTeams.find((t) => t.id === fixedTeamId);
      } else {
        const pool = excludeTeamId
          ? availableTeams.filter((t) => t.id !== excludeTeamId)
          : availableTeams;
        team = pickRandom(pool.length ? pool : availableTeams);
      }
      if (!team) continue;

      let era;
      if (fixedEraId) {
        era = ALL_ERAS.find((e) => e.id === fixedEraId);
      } else {
        era = pickEra(excludeEraId, forceLegend);
      }
      if (!era) continue;

      const spin = tryCombo(team, era);
      if (spin) return spin;
    }

    function exhaustiveSearch(teamPool, eraPool, allowReusedCombo) {
      for (const team of teamPool) {
        if (fixedTeamId && team.id !== fixedTeamId) continue;
        if (excludeTeamId && team.id === excludeTeamId) continue;
        for (const era of eraPool) {
          if (fixedEraId && era.id !== fixedEraId) continue;
          if (excludeEraId && era.id === excludeEraId) continue;
          const spin = tryCombo(team, era, allowReusedCombo);
          if (spin) return spin;
        }
      }
      return null;
    }

    // Widen the search progressively so a late-round spin never dead-ends:
    // reuse earlier combos, then ignore the era filter, then any team at all.
    return exhaustiveSearch(availableTeams, allowedEras, false)
      || exhaustiveSearch(availableTeams, allowedEras, true)
      || exhaustiveSearch(availableTeams, ALL_ERAS, true)
      || exhaustiveSearch(getFilteredTeams(), ALL_ERAS, true);
  }

  function releaseCurrentSpin() {
    if (currentSpin) {
      usedCombos.delete(`${currentSpin.teamId}|${currentSpin.eraId}`);
    }
  }

  function getOpenPositions(player) {
    const open = [];
    for (const slot of slotKeys) {
      if (slots[slot]) continue;
      const allowed = POSITION_MAP[slot] || [];
      if (player.positions.some((pos) => allowed.includes(pos))) {
        open.push(slot);
      }
    }
    return open;
  }

  return {
    mode,
    difficulty,
    slotKeys,
    seed,
    totalRounds,

    get slots() { return { ...slots }; },
    get currentSpin() { return currentSpin; },
    get eraFilter() { return eraFilter; },
    get draftRound() { return draftRound; },

    getOpenSlots() {
      return getOpenSlots();
    },

    canRerollTeam() {
      return !!currentSpin && !teamRerollUsed && hasAlternateTeam();
    },

    canRerollEra() {
      return !!currentSpin && !eraRerollUsed && hasAlternateEra();
    },

    rerollStatus() {
      return { team: teamRerollUsed, era: eraRerollUsed };
    },

    progressLabel() {
      const filled = slotKeys.filter((p) => slots[p]).length;
      return `Round ${filled + 1}/${totalRounds}`;
    },

    spin() {
      if (currentSpin && currentSpin.players.length > 0) return currentSpin;
      currentSpin = findSpin();
      return currentSpin;
    },

    rerollTeam() {
      if (!this.canRerollTeam()) return null;
      const eraId = currentSpin.eraId;
      const excludeTeamId = currentSpin.teamId;
      const previous = currentSpin;
      releaseCurrentSpin();
      teamRerollUsed = true;
      const next = findSpin({ fixedEraId: eraId, excludeTeamId });
      if (next) {
        currentSpin = next;
        return currentSpin;
      }
      teamRerollUsed = false;
      usedCombos.add(`${previous.teamId}|${previous.eraId}`);
      currentSpin = previous;
      return null;
    },

    rerollEra() {
      if (!this.canRerollEra()) return null;
      const teamId = currentSpin.teamId;
      const excludeEraId = currentSpin.eraId;
      const previous = currentSpin;
      releaseCurrentSpin();
      eraRerollUsed = true;
      const next = findSpin({ fixedTeamId: teamId, excludeEraId, forceLegend: !legendUsed });
      if (next) {
        currentSpin = next;
        return currentSpin;
      }
      eraRerollUsed = false;
      usedCombos.add(`${previous.teamId}|${previous.eraId}`);
      currentSpin = previous;
      return null;
    },

    draftPlayer(playerId, slotPosition) {
      if (!currentSpin) return { ok: false, error: 'No active spin' };

      const player = currentSpin.players.find((pl) => pl.id === playerId);
      if (!player) return { ok: false, error: 'Player not found' };

      const open = getOpenPositions(player);
      if (!open.includes(slotPosition)) return { ok: false, error: 'Invalid position' };
      if (slots[slotPosition]) return { ok: false, error: 'Slot filled' };

      slots[slotPosition] = { ...player, slot: slotPosition };
      draftRound++;
      currentSpin = null;

      return { ok: true, complete: slotKeys.every((p) => slots[p]) };
    },

    isComplete() {
      return slotKeys.every((p) => slots[p]);
    },

    simulate() {
      const result = simulateSeason({
        slots,
        slotKeys,
        rosterSize: totalRounds,
        difficulty,
      });
      return { ...result, mode, difficulty };
    },
  };
}

export function formatStats(stats) {
  if (!stats) return [];
  const labels = {
    ppg: 'PPG',
    rpg: 'RPG',
    apg: 'APG',
    spg: 'SPG',
    bpg: 'BPG',
    fgPct: 'FG%',
    threePct: '3PT%',
  };

  return Object.entries(stats)
    .slice(0, 5)
    .map(([k, v]) => ({ label: labels[k] || k, value: v }));
}
