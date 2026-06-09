import { createGame } from './game.js';
import {
  initHomeUI,
  showScreen,
  renderRoster,
  renderSpin,
  renderPlayerPool,
  renderPositionFilter,
  hidePositionFilter,
  showPositionModal,
  updateGameHeader,
  renderResults,
  renderSharedResults,
  openShareModal,
  initShareModal,
} from './ui.js';
import { POSITION_MAP, getOpenRosterSlots, loadDatabase, getPlayerCount } from './data.js';
import { parseShareFromUrl, clearShareHash } from './share.js';

let game = null;
let dbReady = false;
let homeInitialized = false;
let positionFilter = 'all';

async function ensureHomeReady() {
  const loading = document.getElementById('screen-loading');
  const home = document.getElementById('screen-home');
  if (!dbReady) {
    loading?.classList.add('active');
    home?.classList.remove('active');
    await loadDatabase(updateLoadingProgress);
    dbReady = true;
    const count = getPlayerCount();
    const sub = document.querySelector('.hero-sub');
    if (sub) sub.textContent = `Build your roster from ${count.toLocaleString()} college players. Can you go undefeated?`;
  }
  if (!homeInitialized) {
    initHomeUI({ startGame });
    homeInitialized = true;
  }
  loading?.classList.remove('active');
}

function updateLoadingProgress(progress) {
  const bar = document.getElementById('loading-progress-bar');
  const status = document.getElementById('loading-status');
  const hint = document.getElementById('loading-hint');
  if (!bar || !status) return;

  if (progress.message) status.textContent = progress.message;

  if (progress.phase === 'init' || progress.phase === 'teams') {
    bar.style.width = '8%';
    if (hint && progress.phase === 'init') hint.textContent = 'Connecting to database…';
  } else if (progress.phase === 'manifest') {
    bar.style.width = `${progress.loaded ? 15 : 10}%`;
    status.textContent = progress.loaded ? 'Loading database manifest…' : 'Fetching database manifest…';
  } else if (progress.phase === 'download') {
    const pct = progress.total ? 15 + Math.round((progress.loaded / progress.total) * 55) : 20;
    bar.style.width = `${pct}%`;
    status.textContent = 'Downloading player data…';
    if (hint) hint.textContent = 'Fetching roster database';
  } else if (progress.phase === 'parse') {
    bar.style.width = '72%';
    status.textContent = progress.message || 'Parsing player data…';
  } else if (progress.phase === 'index') {
    const pct = 72 + Math.round((progress.loaded / progress.total) * 23);
    bar.style.width = `${pct}%`;
    status.textContent = `Building index (${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()})…`;
    if (hint) hint.textContent = 'Almost ready';
  } else if (progress.phase === 'done') {
    bar.style.width = '100%';
    status.textContent = 'Ready!';
  }
}

function showLoadingError(message) {
  const msg = document.getElementById('loading-error');
  const status = document.getElementById('loading-status');
  if (status) status.textContent = '';
  if (msg) msg.textContent = message;
}

function getOpenSlots() {
  return getOpenRosterSlots(game.slots, game.slotKeys);
}

function getOpenPositions(player) {
  const open = [];
  for (const slot of game.slotKeys) {
    if (game.slots[slot]) continue;
    const allowed = POSITION_MAP[slot] || [];
    if (player.positions.some((pos) => allowed.includes(pos))) {
      open.push(slot);
    }
  }
  return open;
}

function refreshGameUI() {
  renderRoster(game);
  updateGameHeader(game);
  renderSpin(game.currentSpin);
  renderPositionFilter(game, positionFilter, (filterId) => {
    positionFilter = filterId;
    renderPlayerPool(game.currentSpin, game.mode, handlePlayerSelect, positionFilter, getOpenSlots());
  }, getOpenSlots());
  renderPlayerPool(game.currentSpin, game.mode, handlePlayerSelect, positionFilter, getOpenSlots());
}

function handlePlayerSelect(player) {
  const open = getOpenPositions(player);
  if (open.length === 0) return;

  if (open.length === 1) {
    confirmDraft(player, open[0]);
  } else {
    showPositionModal(player, open, (slot) => confirmDraft(player, slot));
  }
}

function confirmDraft(player, slot) {
  const result = game.draftPlayer(player.id, slot);
  if (!result.ok) return;

  if (game.isComplete()) {
    const sim = game.simulate();
    renderResults(sim);
    showScreen('screen-results');
    window._lastResult = sim;
    return;
  }

  refreshGameUI();
}

async function animateSpin() {
  const btn = document.getElementById('btn-spin');
  btn.disabled = true;

  renderSpin(null, true);
  await new Promise((r) => setTimeout(r, 1200));

  const spin = game.spin();
  renderSpin(spin, false);
  renderPositionFilter(game, positionFilter, (filterId) => {
    positionFilter = filterId;
    renderPlayerPool(spin, game.mode, handlePlayerSelect, positionFilter, getOpenSlots());
  }, getOpenSlots());
  renderPlayerPool(spin, game.mode, handlePlayerSelect, positionFilter, getOpenSlots());
  updateGameHeader(game);
}

function startGame(options) {
  if (!dbReady) return;
  positionFilter = 'all';
  game = createGame(options);
  showScreen('screen-game');
  refreshGameUI();
}

async function boot() {
  updateLoadingProgress({ phase: 'init', message: 'Starting Undefeated CBB…' });

  const loading = document.getElementById('screen-loading');
  const home = document.getElementById('screen-home');

  const sharedResult = parseShareFromUrl();
  if (sharedResult) {
    initShareModal();
    loading?.classList.remove('active');
    renderSharedResults(sharedResult, { isSharedView: true });
    showScreen('screen-results');
    window._lastResult = sharedResult;
    return;
  }

  try {
    await ensureHomeReady();
    initShareModal();
    home?.classList.add('active');
  } catch (err) {
    console.error('Database load failed:', err);
    showLoadingError(`Failed to load player database: ${err.message}. Try a hard refresh (Ctrl+Shift+R) or a desktop browser.`);
  }
}

window.addEventListener('error', (event) => {
  console.error(event.error || event.message);
  showLoadingError(`App error: ${event.message || 'Unknown error'}`);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
  const message = event.reason?.message || String(event.reason || 'Unknown promise error');
  showLoadingError(`Failed to load player database: ${message}`);
});

boot();

function bindClick(id, handler) {
  document.getElementById(id)?.addEventListener('click', handler);
}

bindClick('btn-spin', animateSpin);

bindClick('btn-reroll-team', async () => {
  if (!game.canRerollTeam()) return;
  document.getElementById('reel-team')?.classList.add('spinning');
  renderSpin(null, true);
  await new Promise((r) => setTimeout(r, 800));
  document.getElementById('reel-team')?.classList.remove('spinning');
  const spin = game.rerollTeam();
  if (!spin) {
    updateGameHeader(game);
    return;
  }
  renderSpin(spin, false);
  renderPositionFilter(game, positionFilter, (filterId) => {
    positionFilter = filterId;
    renderPlayerPool(spin, game.mode, handlePlayerSelect, positionFilter, getOpenSlots());
  }, getOpenSlots());
  renderPlayerPool(spin, game.mode, handlePlayerSelect, positionFilter, getOpenSlots());
  updateGameHeader(game);
});

bindClick('btn-reroll-era', async () => {
  if (!game.canRerollEra()) return;
  document.getElementById('reel-era')?.classList.add('spinning');
  renderSpin(null, true);
  await new Promise((r) => setTimeout(r, 800));
  document.getElementById('reel-era')?.classList.remove('spinning');
  const spin = game.rerollEra();
  if (!spin) {
    updateGameHeader(game);
    return;
  }
  renderSpin(spin, false);
  renderPositionFilter(game, positionFilter, (filterId) => {
    positionFilter = filterId;
    renderPlayerPool(spin, game.mode, handlePlayerSelect, positionFilter, getOpenSlots());
  }, getOpenSlots());
  renderPlayerPool(spin, game.mode, handlePlayerSelect, positionFilter, getOpenSlots());
  updateGameHeader(game);
});

bindClick('btn-quit', () => {
  if (confirm('Quit current game?')) {
    game = null;
    positionFilter = 'all';
    hidePositionFilter();
    showScreen('screen-home');
  }
});

bindClick('btn-play-again', async () => {
  clearShareHash();
  try {
    await ensureHomeReady();
    showScreen('screen-home');
  } catch (err) {
    alert(`Failed to load game: ${err.message}`);
  }
});

bindClick('btn-share', () => {
  const result = window._lastResult;
  if (!result) return;
  openShareModal(result);
});
