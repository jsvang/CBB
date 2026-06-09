import { POSITION_WEIGHTS, LEGEND_ERAS, SEASON_LENGTH } from './data.js';

const LEGEND_ERA_IDS = new Set(LEGEND_ERAS.map((e) => e.id));

const NCAA_WIN_THRESHOLDS = [
  [85, 39], [83, 38], [81, 37], [79, 36], [77, 35], [75, 34], [73, 33], [71, 32],
  [69, 31], [67, 30], [65, 29], [63, 28], [61, 27], [59, 26], [57, 25], [55, 24],
  [53, 22], [51, 20], [49, 18], [47, 16], [45, 14], [43, 12],
];

export const GRADE_THRESHOLDS = {
  a: 35,
  b: 31,
  c: 27,
  d: 22,
};

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    undefeatedPower: 79,
    winThresholds: NCAA_WIN_THRESHOLDS.map(([power, wins]) => [power - 6, wins]),
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    undefeatedPower: 85,
    winThresholds: NCAA_WIN_THRESHOLDS,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    undefeatedPower: 91,
    winThresholds: NCAA_WIN_THRESHOLDS.map(([power, wins]) => [power + 6, wins]),
  },
};

export function getDifficulty(id = 'normal') {
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}

/** Era-adjusted stat totals across all five categories. */
const ERA_STAT_MULT = {
  '1960s': 1.08,
  '1970s': 1.05,
  '1980s': 1.02,
  '1990s': 1.0,
  '2000-04': 0.98,
  '2005-09': 0.97,
  '2010-14': 0.96,
  '2015-19': 0.95,
  '2020-24': 0.94,
};

function eraMult(eraId) {
  return ERA_STAT_MULT[eraId] ?? 1.0;
}

export function computeStatTotals(roster) {
  const totals = { ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0 };
  for (const pl of roster) {
    const m = eraMult(pl.era);
    const s = pl.stats || {};
    totals.ppg += (s.ppg || 0) * m;
    totals.rpg += (s.rpg || 0) * m;
    totals.apg += (s.apg || 0) * m;
    totals.spg += (s.spg || 0) * m;
    totals.bpg += (s.bpg || 0) * m;
  }
  return {
    ppg: Math.round(totals.ppg * 10) / 10,
    rpg: Math.round(totals.rpg * 10) / 10,
    apg: Math.round(totals.apg * 10) / 10,
    spg: Math.round(totals.spg * 10) / 10,
    bpg: Math.round(totals.bpg * 10) / 10,
  };
}

export function computeRosterRating(slots, slotKeys) {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const slot of slotKeys) {
    const pl = slots[slot];
    if (!pl) continue;
    const w = POSITION_WEIGHTS[slot] ?? 1.0;
    weightedSum += pl.rating * w;
    weightTotal += w;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/**
 * Team power blends roster rating, top-end talent, and stat totals
 * (all five stat categories matter for a perfect run).
 */
export function computeTeamPower(roster, rosterRating) {
  if (!roster.length) return { teamPower: 0, starCount: 0, legendCount: 0, topThreeAvg: 0 };

  const ratings = roster.map((pl) => pl.rating).sort((a, b) => b - a);
  const topThreeAvg = ratings.length >= 3
    ? ratings.slice(0, 3).reduce((sum, r) => sum + r, 0) / 3
    : ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

  const stats = computeStatTotals(roster);
  const statPower = (
    stats.ppg * 0.28
    + stats.rpg * 0.55
    + stats.apg * 0.72
    + stats.spg * 2.8
    + stats.bpg * 3.2
  ) / 5;

  const eliteCount = roster.filter((pl) => pl.rating >= 88).length;
  const starCount = roster.filter((pl) => pl.rating >= 90).length;
  const legendCount = roster.filter((pl) => LEGEND_ERA_IDS.has(pl.era)).length;

  let teamPower = rosterRating * 0.48 + topThreeAvg * 0.22 + statPower * 0.3;
  teamPower += Math.min(1.5, eliteCount * 0.25);
  teamPower += Math.min(1.0, starCount * 0.15);
  teamPower += Math.min(0.4, legendCount * 0.08);

  return {
    teamPower,
    starCount,
    legendCount,
    topThreeAvg: Math.round(topThreeAvg * 10) / 10,
    statTotals: stats,
  };
}

export function getTournamentMilestone(wins) {
  if (wins === SEASON_LENGTH) return 'Undefeated national champion';
  if (wins >= 37) return 'Reached the national championship game';
  if (wins >= GRADE_THRESHOLDS.a) return 'Final Four run';
  if (wins >= GRADE_THRESHOLDS.b) return 'Sweet Sixteen run';
  if (wins >= 32) return 'Won an NCAA tournament game';
  if (wins >= GRADE_THRESHOLDS.b - 1) return 'Made the NCAA tournament';
  if (wins >= GRADE_THRESHOLDS.c) return 'NIT / bubble season';
  if (wins >= GRADE_THRESHOLDS.d) return 'Below .500 in league play';
  return 'Missed postseason play';
}

export function simulateSeason({ slots, slotKeys, rosterSize, difficulty = 'normal' }) {
  const roster = slotKeys
    .filter((pos) => slots[pos])
    .map((pos) => ({ ...slots[pos], slot: pos }));

  const rosterRating = computeRosterRating(slots, slotKeys);
  const {
    teamPower: rawPower,
    starCount,
    legendCount,
    topThreeAvg,
    statTotals,
  } = computeTeamPower(roster, rosterRating);

  const completeness = rosterSize > 0 ? roster.length / rosterSize : 1;
  const diff = getDifficulty(difficulty);
  const teamPower = rawPower * (0.92 + 0.08 * completeness);

  const wins = powerToWins(teamPower, difficulty);
  const losses = Math.max(0, SEASON_LENGTH - wins);
  const grade = winsToGrade(wins);
  const powerToUndefeated = Math.max(0, Math.round((diff.undefeatedPower - teamPower) * 10) / 10);

  return {
    wins,
    losses,
    record: `${wins}-${losses}`,
    grade,
    avgRating: Math.round(teamPower * 10) / 10,
    rosterRating: Math.round(rosterRating * 10) / 10,
    statTotals,
    topThreeAvg,
    starCount,
    legendCount,
    powerToUndefeated,
    difficulty: diff.id,
    difficultyLabel: diff.label,
    undefeatedPower: diff.undefeatedPower,
    tournamentMilestone: getTournamentMilestone(wins),
    roster,
    perfect: wins === SEASON_LENGTH,
  };
}

export function powerToWins(power, difficulty = 'normal') {
  const config = getDifficulty(difficulty);
  for (const [threshold, wins] of config.winThresholds) {
    if (power >= threshold) return wins;
  }
  return Math.max(2, Math.floor(power / 5));
}

export function winsToGrade(wins) {
  if (wins === SEASON_LENGTH) return 'S+';
  if (wins >= GRADE_THRESHOLDS.a) return 'A';
  if (wins >= GRADE_THRESHOLDS.b) return 'B';
  if (wins >= GRADE_THRESHOLDS.c) return 'C';
  if (wins >= GRADE_THRESHOLDS.d) return 'D';
  return 'F';
}

export { DIFFICULTIES as DIFFICULTY_MODES };
