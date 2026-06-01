/**
 * Matchmaking page — UI + bridge to main-process Phoenix WebSocket.
 */
(function () {
  const MODES = [
    { id: '5v5', labelKey: 'mm_mode_competitive', icon: 'https://csrestored.fun/competitive.png' },
    { id: '5h5', labelKey: 'mm_mode_hostage', icon: 'https://csrestored.fun/hostage.png' },
    { id: '2v2', labelKey: 'mm_mode_wingman', icon: 'https://csrestored.fun/wingman.png' }
  ];

  const REGIONS = [
    { id: 'eu', labelKey: 'mm_region_eu', flag: 'https://csrestored.fun/de.png' },
    { id: 'na', labelKey: 'mm_region_na', flag: 'https://csrestored.fun/usa.png' },
    { id: 'oce', labelKey: 'mm_region_oce', flag: 'https://csrestored.fun/australia.png' },
    { id: 'ru', labelKey: 'mm_region_ru', flag: 'https://csrestored.fun/russia.png' }
  ];

  const state = {
    active: false,
    mm: null,
    user: null,
    selectedMode: '5v5',
    selectedRegion: 'eu'
  };

  function t(key) {
    return (window._invTranslate || ((k) => k))(key);
  }

  function tf(key, params) {
    let str = t(key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, v);
      });
    }
    return str;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function formatElapsed(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function queueCountForMode(modeId, status) {
    const q = status?.queue || {};
    return q[modeId] ?? 0;
  }

  function buildQueueType() {
    return `${state.selectedMode}:${state.selectedRegion}`;
  }

  function renderTeamSlots(mm) {
    const wrap = el('mm-team-slots');
    if (!wrap) return;
    wrap.innerHTML = '';

    const members = mm?.group?.members || [];
    const slots = 5;
    const centerIdx = 2;
    const userId = state.user?.id;

    for (let i = 0; i < slots; i++) {
      const slot = document.createElement('div');
      slot.className = 'mm-team-slot';

      if (i === centerIdx && state.user) {
        slot.classList.add('mm-team-slot-filled');
        slot.innerHTML = `
          <img class="mm-slot-avatar" src="${state.user.avatar || ''}" alt="">
          <span class="mm-slot-name">${escapeHtml(state.user.name || state.user.username || '')}</span>
          <span class="mm-slot-elo">${state.user.points ?? state.user.elo ?? ''} ELO</span>
        `;
      } else {
        const memberIdx = i < centerIdx ? i : i - 1;
        const memberId = members.filter((id) => String(id) !== String(userId))[memberIdx];
        if (memberId && mm?.group) {
          slot.classList.add('mm-team-slot-filled');
          const online = mm.onlineUsers?.[memberId]?.user;
          slot.innerHTML = `
            <img class="mm-slot-avatar" src="${online?.avatar || ''}" alt="">
            <span class="mm-slot-name">${escapeHtml(online?.name || online?.username || 'Player')}</span>
          `;
        } else {
          slot.classList.add('mm-team-slot-empty');
          slot.innerHTML = '<i class="fa-solid fa-plus"></i>';
        }
      }
      wrap.appendChild(slot);
    }
  }

  function renderOptions(mm) {
    const modeList = el('mm-mode-list');
    const regionList = el('mm-region-list');
    if (!modeList || !regionList) return;

    modeList.innerHTML = '';
    regionList.innerHTML = '';

    MODES.forEach((mode) => {
      const count = queueCountForMode(mode.id, mm?.status);
      const active = state.selectedMode === mode.id;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `mm-option-row${active ? ' active' : ''}`;
      row.innerHTML = `
        <img src="${mode.icon}" alt="" class="mm-option-icon">
        <span class="mm-option-label">${t(mode.labelKey)}</span>
        <span class="mm-option-online ${count > 0 ? 'online' : ''}">
          <i class="fa-solid fa-circle"></i> ${count} ${t('mm_online')}
        </span>
      `;
      row.addEventListener('click', () => {
        state.selectedMode = mode.id;
        applyQueueType();
        renderAll(mm);
      });
      modeList.appendChild(row);
    });

    REGIONS.forEach((region) => {
      const active = state.selectedRegion === region.id;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `mm-option-row${active ? ' active' : ''}`;
      row.innerHTML = `
        <img src="${region.flag}" alt="" class="mm-option-icon mm-flag">
        <span class="mm-option-label">${t(region.labelKey)}</span>
      `;
      row.addEventListener('click', () => {
        state.selectedRegion = region.id;
        applyQueueType();
        renderAll(mm);
      });
      regionList.appendChild(row);
    });
  }

  function renderLiveMatches(mm) {
    const body = el('mm-live-body');
    const empty = el('mm-live-empty');
    if (!body) return;

    const live = mm?.status?.live_matches || {};
    const rows = Object.values(live).filter(Boolean);

    if (!rows.length) {
      body.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';
    body.innerHTML = rows.map((m) => {
      const map = m.map || m.final_map?.name || m.map_name || '—';
      const mode = m.mode || m.type || '—';
      const score = m.score || `${m.team1_score ?? 0} : ${m.team2_score ?? 0}`;
      const duration = m.duration || m.time || '—';
      const region = m.region || '—';
      return `
        <tr>
          <td>${escapeHtml(String(mode))}</td>
          <td>${escapeHtml(String(map))}</td>
          <td colspan="2" class="mm-live-score">${escapeHtml(String(score))}</td>
          <td>${escapeHtml(String(duration))}</td>
          <td>${escapeHtml(String(region))}</td>
        </tr>
      `;
    }).join('');
  }

  function renderAll(mm) {
    state.mm = mm;

    const loading = el('mm-loading');
    const content = el('mm-content');
    const errorEl = el('mm-error');

    if (!mm?.connected) {
      if (loading) loading.style.display = 'flex';
      if (content) content.style.display = 'none';
    } else {
      if (loading) loading.style.display = 'none';
      if (content) content.style.display = 'block';
    }

    if (errorEl) {
      if (mm?.lastError) {
        errorEl.textContent = mm.lastError;
        errorEl.style.display = 'block';
      } else {
        errorEl.style.display = 'none';
      }
    }

    const stats = el('mm-stats-line');
    if (stats && mm?.status) {
      const q = mm.status.queue?.total ?? 0;
      stats.textContent = tf('mm_stats_line', {
        players: mm.activePlayers ?? 0,
        matches: mm.status.matches ?? 0,
        queue: q
      });
    }

    const groupName = el('mm-group-name');
    if (groupName) {
      const name = mm?.group?.name || (state.user?.name ? `team_${state.user.name}` : '—');
      groupName.textContent = name;
    }

    const eloBadge = el('mm-elo-badge');
    if (eloBadge && state.user) {
      eloBadge.textContent = `${state.user.points ?? state.user.elo ?? '—'} ELO`;
    }

    const queueHint = el('mm-queue-wait');
    if (queueHint) {
      queueHint.textContent = tf('mm_queue_waiting', { count: mm?.status?.queue?.total ?? 0 });
    }

    const btn = el('mm-queue-btn');
    if (btn) {
      if (mm?.inQueue) {
        btn.className = 'btn-secondary mm-queue-btn in-queue';
        btn.innerHTML = `<i class="fa-solid fa-xmark"></i> <span>${t('mm_leave_queue')}</span>`;
        if (mm.queueElapsed != null) {
          btn.title = formatElapsed(mm.queueElapsed);
        }
      } else {
        btn.className = 'btn-play mm-queue-btn';
        btn.innerHTML = `<span>${t('mm_join_queue')}</span>`;
        btn.title = '';
      }
      btn.disabled = !mm?.connected;
    }

    renderTeamSlots(mm);
    renderOptions(mm);
    renderLiveMatches(mm);
  }

  async function applyQueueType() {
    const type = buildQueueType();
    if (window.api?.matchmaking) {
      await window.api.matchmaking.setQueueType(type);
    }
  }

  async function loadUser() {
    try {
      const res = await window.api.auth.getUser();
      if (!res?.error && res?.user) state.user = res.user;
    } catch (_) { /* ignore */ }
  }

  async function start() {
    if (state.active) return;
    state.active = true;

    await loadUser();
    renderAll({ connected: false });

    if (!window.api?.matchmaking) return;

    window.api.matchmaking.onUpdate((data) => {
      if (!state.active) return;
      if (data.queueType && data.queueType.includes(':')) {
        const [m, r] = data.queueType.split(':');
        state.selectedMode = m;
        state.selectedRegion = r;
      }
      renderAll(data);
    });

    const result = await window.api.matchmaking.start();
    if (!result?.ok) {
      renderAll({
        connected: false,
        lastError: result?.error || t('mm_connect_error')
      });
      return;
    }

    const type = buildQueueType();
    await window.api.matchmaking.setQueueType(type);
    const snap = await window.api.matchmaking.getState();
    renderAll(snap);
  }

  async function stop() {
    state.active = false;
    if (window.api?.matchmaking) {
      await window.api.matchmaking.stop();
    }
  }

  function setup() {
    const btnQueue = el('mm-queue-btn');
    const btnLeave = el('mm-leave-group');

    if (btnQueue) {
      btnQueue.addEventListener('click', async () => {
        if (!window.api?.matchmaking) return;
        const snap = await window.api.matchmaking.getState();
        if (snap?.inQueue) {
          await window.api.matchmaking.leaveQueue();
        } else {
          await applyQueueType();
          await window.api.matchmaking.joinQueue();
        }
      });
    }

    if (btnLeave) {
      btnLeave.addEventListener('click', async () => {
        if (window.api?.matchmaking) {
          await window.api.matchmaking.leaveGroup();
          const snap = await window.api.matchmaking.getState();
          renderAll(snap);
        }
      });
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.CSRMatchmaking = { setup, start, stop, renderAll };
})();
