import {
  CONFERENCES,
  TEAMS,
  ALL_ERAS,
  slotDisplayLabel,
  rosterDiagramLabels,
  normalizeEraFilter,
  POOL_FILTERS,
  playerMatchesPoolFilter,
  playerEligibleForDraftPool,
} from './data.js';
import { formatStats } from './game.js';
import { getDifficulty } from './scoring.js';
import {
  buildShareUrl,
  captureShareCard,
  copyText,
  downloadBlob,
  getShareFilename,
} from './share.js';

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

export function initHomeUI(handlers) {
  const filterType = document.getElementById('filter-type');
  const filterValue = document.getElementById('filter-value');
  const filterConferences = document.getElementById('filter-conferences');
  const filterEras = document.getElementById('filter-eras');
  const filterErasToggle = document.getElementById('filter-eras-toggle');

  function buildEraCheckboxes() {
    if (!filterEras) return;
    filterEras.innerHTML = '';
    ALL_ERAS.forEach((era) => {
      const label = document.createElement('label');
      label.className = 'conf-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'era';
      input.value = era.id;
      input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(era.isLegend ? `${era.label} ★` : era.label));
      filterEras.appendChild(label);
    });
    syncEraToggleLabel();
  }

  function getSelectedEraIds() {
    if (!filterEras) return [];
    return [...filterEras.querySelectorAll('input:checked')].map((el) => el.value);
  }

  function syncEraToggleLabel() {
    if (!filterErasToggle || !filterEras) return;
    const allChecked = filterEras.querySelectorAll('input:checked').length === ALL_ERAS.length;
    filterErasToggle.textContent = allChecked ? 'Clear all' : 'Select all';
  }

  function setAllErasChecked(checked) {
    filterEras?.querySelectorAll('input[name="era"]').forEach((input) => {
      input.checked = checked;
    });
    syncEraToggleLabel();
  }

  buildEraCheckboxes();
  filterEras?.addEventListener('change', syncEraToggleLabel);
  filterErasToggle?.addEventListener('click', () => {
    const allChecked = filterEras.querySelectorAll('input:checked').length === ALL_ERAS.length;
    setAllErasChecked(!allChecked);
  });

  document.querySelectorAll('#difficulty-toggle .scope-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#difficulty-toggle .scope-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  function getSelectedDifficulty() {
    return document.querySelector('#difficulty-toggle .scope-btn.active')?.dataset.difficulty || 'normal';
  }

  function updateRosterPreview() {
    const el = document.getElementById('preview-roster');
    if (el) {
      el.innerHTML = rosterDiagramLabels()
        .map((l) => `<span class="pos-chip">${l}</span>`)
        .join('');
    }
  }

  updateRosterPreview();

  function buildConferenceCheckboxes() {
    if (!filterConferences) return;
    filterConferences.innerHTML = '';
    Object.entries(CONFERENCES).forEach(([id, conf]) => {
      const label = document.createElement('label');
      label.className = 'conf-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'conference';
      input.value = id;
      label.appendChild(input);
      label.appendChild(document.createTextNode(conf.name));
      filterConferences.appendChild(label);
    });
  }

  function syncFilterValueControl() {
    const type = filterType.value;
    if (type === 'all' || type === 'power5') {
      filterValue.classList.add('hidden');
      filterConferences?.classList.add('hidden');
      return;
    }

    if (type === 'conference') {
      filterValue.classList.add('hidden');
      filterConferences?.classList.remove('hidden');
      if (filterConferences && !filterConferences.children.length) {
        buildConferenceCheckboxes();
      }
      return;
    }

    if (type === 'team') {
      filterConferences?.classList.add('hidden');
      filterValue.classList.remove('hidden');
      filterValue.innerHTML = '';
      TEAMS.sort((a, b) => a.name.localeCompare(b.name)).forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        filterValue.appendChild(opt);
      });
    }
  }

  filterType.addEventListener('change', syncFilterValueControl);

  function getFilterValue() {
    if (filterType.value === 'all') return null;
    if (filterType.value === 'conference') {
      const selected = [...filterConferences.querySelectorAll('input:checked')].map((el) => el.value);
      return selected.length ? selected : null;
    }
    return filterValue.value || null;
  }

  function getOptions(mode) {
    return {
      mode,
      difficulty: getSelectedDifficulty(),
      filterType: filterType.value,
      filterValue: getFilterValue(),
      eraFilter: normalizeEraFilter(getSelectedEraIds()),
    };
  }

  document.getElementById('btn-classic').addEventListener('click', () => {
    handlers.startGame(getOptions('classic'));
  });

  document.getElementById('btn-iq').addEventListener('click', () => {
    handlers.startGame(getOptions('iq'));
  });

  document.getElementById('btn-how-to-play').addEventListener('click', () => {
    showScreen('screen-rules');
  });

  document.querySelectorAll('.back-btn[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.target));
  });
}

export function renderRoster(game) {
  const container = document.getElementById('roster-slots');
  if (!container) return;

  const nextOpen = game.slotKeys.find((p) => !game.slots[p]);

  container.innerHTML = game.slotKeys
    .map((pos) => {
      const label = slotDisplayLabel(pos);
      const filled = game.slots[pos];
      if (filled) {
        const shortName = filled.name.split(' ').pop();
        return `
          <div class="roster-pos-chip filled" title="${filled.name} · ${filled.teamName}">
            <span class="chip-pos">${label}</span>
            <span class="chip-name">${shortName}</span>
          </div>`;
      }
      const isCurrent = pos === nextOpen;
      const classes = ['roster-pos-chip'];
      if (isCurrent) classes.push('current');
      return `
        <div class="${classes.join(' ')}">
          <span class="chip-pos">${label}</span>
        </div>`;
    })
    .join('');
}

export function renderSpin(spin, spinning = false) {
  const teamReel = document.getElementById('reel-team');
  const eraReel = document.getElementById('reel-era');

  [teamReel, eraReel].forEach((r) => r?.classList.toggle('spinning', spinning));

  if (spin && !spinning) {
    teamReel.querySelector('.reel-value').textContent = spin.teamName;
    eraReel.querySelector('.reel-value').textContent = spin.isLegend ? `${spin.eraLabel} ⭐` : spin.eraLabel;
  } else if (!spinning) {
    teamReel.querySelector('.reel-value').textContent = '—';
    eraReel.querySelector('.reel-value').textContent = '—';
  }
}

export function renderPositionFilter(game, activeFilter, onFilterChange, openSlots = []) {
  const container = document.getElementById('position-filter');
  const chips = document.getElementById('position-filter-chips');
  if (!container || !chips || !game) return;

  if (!openSlots.length) {
    container.classList.add('hidden');
    return;
  }

  const validIds = new Set(POOL_FILTERS.map((f) => f.id));
  let currentFilter = activeFilter;
  if (!validIds.has(currentFilter)) {
    currentFilter = 'all';
    onFilterChange('all');
  }

  container.classList.remove('hidden');
  chips.innerHTML = POOL_FILTERS
    .map((f) => {
      const active = f.id === currentFilter ? ' active' : '';
      return `<button type="button" class="pos-filter-chip${active}" data-filter="${f.id}">${f.label}</button>`;
    })
    .join('');

  chips.querySelectorAll('.pos-filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => onFilterChange(btn.dataset.filter));
  });
}

export function hidePositionFilter() {
  document.getElementById('position-filter')?.classList.add('hidden');
}

export function renderPlayerPool(spin, mode, onSelect, positionFilter = 'all', openSlots = []) {
  const pool = document.getElementById('player-pool');
  if (!spin || !spin.players.length) {
    pool.innerHTML = '<p class="pool-hint">Spin to reveal available players</p>';
    return;
  }

  if (!openSlots.length) {
    pool.innerHTML = '<p class="pool-hint">Roster full — simulating your season…</p>';
    return;
  }

  const filtered = spin.players.filter(
    (pl) => playerEligibleForDraftPool(pl, openSlots)
      && playerMatchesPoolFilter(pl, positionFilter),
  );
  const count = filtered.length;
  const total = spin.players.length;
  const hideStats = mode === 'iq';

  if (!count) {
    pool.innerHTML = '<p class="pool-hint">No players fit your open roster slots. Try another position filter or re-roll.</p>';
    return;
  }

  const cards = [...filtered]
    .sort((a, b) => b.rating - a.rating)
    .map((pl) => {
      const stats = formatStats(pl.stats);
      const statsHtml = stats
        .map((s) => `<span class="stat-pill">${s.label}: ${s.value}</span>`)
        .join('');
      const posTags = pl.positions.map((p) => `<span class="pos-tag">${p}</span>`).join('');

      return `
        <div class="player-card" data-id="${pl.id}">
          <div class="player-rating">${hideStats ? '??' : pl.rating}</div>
          <div class="player-info">
            <div class="player-name">${pl.name}</div>
            <div class="player-meta">${pl.teamName} · ${spin.eraLabel}${pl.awards ? ' · ' + pl.awards : ''}</div>
            <div class="player-positions">${posTags}</div>
            <div class="player-stats ${hideStats ? 'hidden-stats' : ''}">${statsHtml}</div>
          </div>
        </div>`;
    })
    .join('');

  const countLabel = positionFilter === 'all'
    ? `${count} player${count === 1 ? '' : 's'} available`
    : `${count} of ${total} players shown`;

  pool.innerHTML = `<p class="pool-count">${countLabel}</p>${cards}`;

  pool.querySelectorAll('.player-card').forEach((card) => {
    card.addEventListener('click', () => {
      const player = filtered.find((pl) => pl.id === card.dataset.id);
      onSelect(player);
    });
  });
}

export function showPositionModal(player, openPositions, callback) {
  const modal = document.getElementById('position-modal');
  document.getElementById('modal-player-name').textContent = `${player.name} — ${player.teamName}`;

  const options = document.getElementById('position-options');
  options.innerHTML = openPositions
    .map((pos) => `<button class="pos-option" data-pos="${pos}">${slotDisplayLabel(pos)}</button>`)
    .join('');

  options.querySelectorAll('.pos-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.close();
      callback(btn.dataset.pos);
    });
  });

  document.getElementById('modal-cancel').onclick = () => modal.close();
  modal.showModal();
}

export function updateGameHeader(game) {
  const modeLabel = game.mode === 'iq' ? 'Hoop IQ' : 'Classic';
  const diffLabel = getDifficulty(game.difficulty).label;
  const filled = game.slotKeys.filter((p) => game.slots[p]).length;
  const round = Math.min(filled + 1, game.totalRounds);
  document.getElementById('game-mode-label').textContent = modeLabel;
  document.getElementById('game-difficulty-label').textContent = diffLabel;
  document.getElementById('draft-progress').textContent = `Round ${round}/${game.totalRounds}`;

  const badge = document.getElementById('reroll-badge');
  const { team: teamUsed, era: eraUsed } = game.rerollStatus();
  const teamAvail = game.canRerollTeam();
  const eraAvail = game.canRerollEra();

  if (teamAvail || eraAvail) {
    const parts = [];
    if (teamAvail) parts.push('Team');
    if (eraAvail) parts.push('Era');
    badge.textContent = `Re-roll: ${parts.join(' · ')}`;
    badge.className = 'reroll-badge available';
  } else if (teamUsed || eraUsed) {
    badge.textContent = 'Re-rolls used';
    badge.className = 'reroll-badge used';
  } else {
    badge.textContent = 'No re-rolls available';
    badge.className = 'reroll-badge';
  }

  document.getElementById('btn-spin').disabled = !!game.currentSpin;
  document.getElementById('btn-reroll-team').disabled = !teamAvail;
  document.getElementById('btn-reroll-era').disabled = !eraAvail;
}

export function buildResultsRosterHtml(result) {
  const rows = result.roster
    .map((pl) => {
      const label = slotDisplayLabel(pl.slot);
      return `
        <div class="results-player">
          <span><span class="pos">${label}</span> ${pl.name} <span class="player-meta">${pl.teamName} · ${pl.era}</span></span>
          <span class="rating">${pl.rating}</span>
        </div>`;
    })
    .join('');
  return `<div class="results-section"><h4>STARTING FIVE</h4>${rows}</div>`;
}

function getResultsHeadline(result) {
  if (result.perfect) return 'NATIONAL CHAMPION!';
  if (result.wins >= 35) return 'FINAL FOUR';
  if (result.wins >= 31) return 'TOURNAMENT RUN';
  if (result.wins >= 27) return 'NCAA BOUND';
  if (result.wins >= 22) return 'NIT SEASON';
  return 'SEASON OVER';
}

function getResultsSubtitle(result) {
  const diffLabel = result.difficultyLabel || getDifficulty(result.difficulty).label;
  const milestone = result.tournamentMilestone || '';
  const seasonLine = `${result.record} across the regular season, conference tournament, and March Madness.`;

  if (result.perfect) {
    return `${seasonLine} Undefeated on ${diffLabel} difficulty — share it, then try again.`;
  }
  if (result.wins >= 35) {
    return `${seasonLine} ${milestone}. One or two better picks could have gone undefeated.`;
  }
  if (result.wins >= 31) {
    return `${seasonLine} ${milestone}. Target higher-rated stars and push deeper into March Madness.`;
  }
  if (result.wins >= 27) {
    return `${seasonLine} ${milestone}. Target legend eras and build a stronger tournament roster.`;
  }
  return `${seasonLine} ${milestone}. Rework your picks, use your re-rolls, and take another shot at going undefeated.`;
}

export function renderShareCard(result, container) {
  if (!container) return;
  const diffLabel = result.difficultyLabel || getDifficulty(result.difficulty).label;
  const modeLabel = result.mode === 'iq' ? 'Hoop IQ' : 'Classic';
  const stats = result.statTotals || {};

  const rows = result.roster.map((pl) => `
    <div class="share-card-player">
      <span class="share-card-pos">${slotDisplayLabel(pl.slot)}</span>
      <span class="share-card-name">${pl.name}</span>
      <span class="share-card-meta">${pl.teamName} · ${pl.era}</span>
      <span class="share-card-rating">${pl.rating}</span>
    </div>`).join('');

  container.innerHTML = `
    <div class="share-card-brand">Undefeated CBB</div>
    <div class="share-card-hero">
      <div class="share-card-record">${result.record}</div>
      <div class="share-card-grade">${result.grade}</div>
    </div>
    <div class="share-card-tagline">${getResultsHeadline(result)}</div>
    <div class="share-card-stats">
      <span>Team Power <strong>${result.avgRating}</strong></span>
      <span>${modeLabel} · ${diffLabel}</span>
      <span>PPG ${stats.ppg || '—'} · RPG ${stats.rpg || '—'} · APG ${stats.apg || '—'}</span>
    </div>
    <div class="share-card-roster">
      <div class="share-card-side"><div class="share-card-side-label">STARTING FIVE</div>${rows}</div>
    </div>
    <div class="share-card-footer">Can you go undefeated?</div>
  `;
}

export function openShareModal(result) {
  const modal = document.getElementById('share-modal');
  const preview = document.getElementById('share-card-preview');
  const linkInput = document.getElementById('share-link-input');
  const status = document.getElementById('share-status');
  if (!modal || !preview || !linkInput) return;

  renderShareCard(result, preview);
  linkInput.value = buildShareUrl(result);
  if (status) status.textContent = '';
  modal.showModal();
}

export function initShareModal() {
  const modal = document.getElementById('share-modal');
  const preview = document.getElementById('share-card-preview');
  const linkInput = document.getElementById('share-link-input');
  const status = document.getElementById('share-status');
  const closeBtn = document.getElementById('share-modal-close');

  function setStatus(msg) {
    if (status) status.textContent = msg;
  }

  closeBtn?.addEventListener('click', () => modal?.close());
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  });

  document.getElementById('btn-copy-link')?.addEventListener('click', async () => {
    const result = window._lastResult;
    if (!result) return;
    try {
      await copyText(buildShareUrl(result));
      setStatus('Link copied to clipboard!');
    } catch {
      linkInput?.select();
      setStatus('Select the link and copy manually.');
    }
  });

  document.getElementById('btn-save-image')?.addEventListener('click', async () => {
    const result = window._lastResult;
    if (!result || !preview) return;
    setStatus('Creating image…');
    try {
      const blob = await captureShareCard(preview);
      downloadBlob(blob, getShareFilename(result));
      setStatus('Image saved!');
    } catch (err) {
      setStatus(`Could not save image: ${err.message}`);
    }
  });

  document.getElementById('btn-share-native')?.addEventListener('click', async () => {
    const result = window._lastResult;
    if (!result) return;
    const url = buildShareUrl(result);
    const text = getShareText(result, url);
    setStatus('Preparing share…');

    try {
      let imageBlob = null;
      try {
        imageBlob = await captureShareCard(preview);
      } catch {
        /* optional */
      }

      if (navigator.share) {
        const shareData = { title: 'Undefeated CBB', text, url };
        if (imageBlob && navigator.canShare?.({ files: [new File([imageBlob], getShareFilename(result), { type: 'image/png' })] })) {
          shareData.files = [new File([imageBlob], getShareFilename(result), { type: 'image/png' })];
        }
        await navigator.share(shareData);
        setStatus('Shared!');
        return;
      }

      await copyText(`${text}\n\n${url}`);
      setStatus('Link and roster copied to clipboard!');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatus('Share cancelled or unavailable.');
      }
    }
  });
}

export function renderResults(result) {
  document.getElementById('record-display').textContent = result.record;
  document.getElementById('grade-display').textContent = result.grade;
  document.getElementById('weighted-avg').textContent = result.avgRating;

  const stats = result.statTotals || {};
  const statPpg = document.getElementById('stat-ppg');
  const statRpg = document.getElementById('stat-rpg');
  const statApg = document.getElementById('stat-apg');
  if (statPpg) statPpg.textContent = stats.ppg ?? '—';
  if (statRpg) statRpg.textContent = stats.rpg ?? '—';
  if (statApg) statApg.textContent = stats.apg ?? '—';

  const title = document.getElementById('results-title');
  const subtitle = document.getElementById('results-subtitle');
  title.textContent = getResultsHeadline(result);
  subtitle.textContent = getResultsSubtitle(result);

  const gradeEl = document.getElementById('grade-display');
  if (result.perfect) {
    gradeEl.style.color = 'var(--accent)';
  } else if (result.wins >= 35) {
    gradeEl.style.color = 'var(--green)';
  } else if (result.wins >= 31) {
    gradeEl.style.color = 'var(--blue)';
  } else {
    gradeEl.style.color = 'var(--text-muted)';
  }

  const container = document.getElementById('results-roster');
  if (container) container.innerHTML = buildResultsRosterHtml(result);
}

export function renderSharedResults(result, { isSharedView = false } = {}) {
  renderResults(result);
  const playAgain = document.getElementById('btn-play-again');
  const shareBtn = document.getElementById('btn-share');
  const subtitle = document.getElementById('results-subtitle');
  if (isSharedView) {
    playAgain.textContent = 'Build Your Own Roster';
    shareBtn?.classList.add('hidden');
    if (subtitle) {
      subtitle.textContent = `Shared roster · ${subtitle.textContent}`;
    }
  } else {
    playAgain.textContent = 'Play Again';
    shareBtn?.classList.remove('hidden');
  }
}

export function getShareText(result, url = null) {
  const lines = result.roster.map((pl) => {
    const label = slotDisplayLabel(pl.slot);
    return `${label} ${pl.name} (${pl.teamName} ${pl.era})`;
  });

  const diff = result.difficultyLabel ? ` (${result.difficultyLabel})` : '';
  const linkLine = url ? `\n\n${url}` : '';
  return `Undefeated CBB${diff} — ${result.record} (${result.grade})\n\n${lines.join('\n')}\n\nCan you go undefeated?${linkLine}`;
}
