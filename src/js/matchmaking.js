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
    { id: 'eu', labelKey: 'mm_region_eu', flag: 'https://csrestored.fun/germany.png' },
    { id: 'na', labelKey: 'mm_region_na', flag: 'https://csrestored.fun/usa.png' },
    { id: 'oce', labelKey: 'mm_region_oce', flag: 'https://csrestored.fun/australia.png' },
    { id: 'ru', labelKey: 'mm_region_ru', flag: 'https://csrestored.fun/russia.png' }
  ];

  const RANK_LEVELS = [
    [2001, 'https://csrestored.fun/level/levelTen.png'],
    [1851, 'https://csrestored.fun/level/levelNine.png'],
    [1701, 'https://csrestored.fun/level/levelEight.png'],
    [1551, 'https://csrestored.fun/level/levelSeven.png'],
    [1401, 'https://csrestored.fun/level/levelSix.png'],
    [1251, 'https://csrestored.fun/level/levelFive.png'],
    [1101, 'https://csrestored.fun/level/levelFour.png'],
    [951, 'https://csrestored.fun/level/levelThree.png'],
    [801, 'https://csrestored.fun/level/levelTwo.png'],
    [-Infinity, 'https://csrestored.fun/level/levelOne.png']
  ];

  const state = {
    active: false,
    listenerBound: false,
    mm: null,
    user: null,
    friends: [],
    friendsById: {},
    selectedMode: '5v5',
    selectedRegion: 'eu',
    inviteOpen: false,
    leavingGroup: false,
    lastInviteRenderKey: ''
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

  function avatarUrl(user) {
    const id = user?.id != null ? String(user.id) : null;
    const hash = user?.avatar;
    if (hash && id) {
      return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`;
    }
    if (id) {
      try {
        const idx = Number((BigInt(id) >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
      } catch (_) {
        return 'https://cdn.discordapp.com/embed/avatars/0.png';
      }
    }
    return '';
  }

  function formatElapsed(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function queueCountModeRegion(modeId, regionId, status) {
    const q = status?.queue || {};
    return Number(q[`${modeId}:${regionId}`]) || 0;
  }

  function queueCountRegion(regionId, status) {
    const q = status?.queue || {};
    return Object.entries(q)
      .filter(([key]) => key.endsWith(`:${regionId}`))
      .reduce((sum, [, val]) => sum + (Number(val) || 0), 0);
  }

  function buildQueueType() {
    return `${state.selectedMode}:${state.selectedRegion}`;
  }

  function openInviteModal() {
    state.inviteOpen = true;
    const modal = el('mm-invite-modal');
    if (modal) modal.classList.add('is-open');
    loadFriendsForInvite();
  }

  function closeInviteModal() {
    state.inviteOpen = false;
    const modal = el('mm-invite-modal');
    if (modal) modal.classList.remove('is-open');
    const list = el('mm-invite-list');
    if (list) list.innerHTML = '';
    const search = el('mm-invite-search');
    if (search) search.value = '';
  }

  async function loadFriendsForInvite() {
    const list = el('mm-invite-list');
    const search = el('mm-invite-search');
    if (list) list.innerHTML = `<p class="mm-invite-loading">${t('stats_loading')}</p>`;

    try {
      const res = await window.api.csr.getFriends();
      if (res?.error || !res?.friends) {
        if (list) list.innerHTML = `<p class="mm-invite-empty">${t('mm_friends_error')}</p>`;
        return;
      }
      state.friends = res.friends;
      state.friendsById = {};
      res.friends.forEach((f) => {
        state.friendsById[String(f.id)] = f;
      });
      if (list) renderInviteList(search?.value || '');
    } catch (_) {
      if (list) list.innerHTML = `<p class="mm-invite-empty">${t('mm_friends_error')}</p>`;
    }
  }

  function renderInviteList(query) {
    const list = el('mm-invite-list');
    if (!list) return;

    const mm = state.mm || {};
    const onlineUsers = mm.onlineUsers || {};
    const q = query.trim().toLowerCase();

    const rows = (state.friends || [])
      .filter((f) => f.state === 'accepted')
      .filter((f) => f.verified !== false)
      .map((f) => ({
        ...f,
        online: !!onlineUsers[String(f.id)] || !!onlineUsers[f.id]
      }))
      .filter((f) => f.online)
      .filter((f) => !q || (f.name || '').toLowerCase().includes(q));

    if (!rows.length) {
      list.innerHTML = `<p class="mm-invite-empty">${t('mm_friends_none_online')}</p>`;
      return;
    }

    list.innerHTML = rows.map((f) => `
      <div class="mm-invite-row">
        <img class="mm-invite-avatar" src="${avatarUrl(f)}" alt="">
        <div class="mm-invite-meta">
          <span class="mm-invite-name">${escapeHtml(f.name || 'Player')}</span>
          <span class="mm-invite-status">${t('mm_friend_online')}</span>
        </div>
        <button type="button" class="btn-secondary mm-invite-btn" data-friend-id="${escapeHtml(String(f.id))}">
          ${t('mm_invite')} +
        </button>
      </div>
    `).join('');

    list.querySelectorAll('.mm-invite-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.friendId;
        if (!id || !window.api?.matchmaking) return;
        btn.disabled = true;
        const result = await window.api.matchmaking.inviteUser(id);
        if (!result?.ok) {
          btn.disabled = false;
          const err = el('mm-error');
          if (err) {
            err.textContent = result?.error || t('mm_invite_failed');
            err.style.display = 'block';
          }
        } else {
          btn.textContent = t('mm_invited');
        }
      });
    });
  }

  function rankImageUrl(points) {
    const elo = Number(points) || 0;
    const row = RANK_LEVELS.find(([min]) => elo >= min);
    return row ? row[1] : RANK_LEVELS[RANK_LEVELS.length - 1][1];
  }

  function resolveMemberUser(mm, memberId) {
    const id = String(memberId);
    const uid = state.user?.id != null ? String(state.user.id) : null;
    if (uid && id === uid) return state.user;
    const profiles = mm?.memberProfiles || {};
    if (profiles[id]) return profiles[id];
    const roomUser = mm?.roomUsers?.[id]?.user;
    if (roomUser) return roomUser;
    const presence = mm?.onlineUsers?.[id]?.user;
    if (presence) return presence;
    const friend = state.friendsById[id];
    if (friend) return friend;
    return { id, name: 'Player' };
  }

  function renderEmptySlot(canInvite) {
    const slot = document.createElement('div');
    slot.className = `mm-team-slot mm-team-slot-empty${canInvite ? ' mm-team-slot-invite' : ''}`;
    slot.innerHTML = '<i class="fa-solid fa-plus"></i>';
    return slot;
  }

  function renderFilledSlot(mm, memberId, leaderId) {
    const user = resolveMemberUser(mm, memberId);
    const id = String(memberId);
    const isLeader = leaderId && id === String(leaderId);
    const country = user.country
      ? `<img class="mm-slot-flag" src="https://flagcdn.com/w40/${escapeHtml(user.country).toLowerCase()}.png" alt="">`
      : '';
    const rank = user.steam !== false
      ? `<img class="mm-slot-rank" src="${rankImageUrl(user.points ?? user.elo)}" alt="">`
      : '';
    const elo = user.points ?? user.elo;

    const slot = document.createElement('div');
    slot.className = 'mm-team-slot mm-team-slot-filled';
    slot.innerHTML = `
      <img class="mm-slot-avatar" src="${avatarUrl(user)}" alt="">
      <div class="mm-slot-name-row">
        <span class="mm-slot-name">${escapeHtml(user.name || user.username || 'Player')}</span>
        ${country}
        ${isLeader ? '<i class="fa-solid fa-crown mm-slot-crown"></i>' : ''}
      </div>
      <div class="mm-slot-elo-row">
        ${rank}
        <span class="mm-slot-elo">${elo != null ? `${elo} ELO` : ''}</span>
      </div>
    `;
    return slot;
  }

  function renderTeamSlots(mm) {
    const wrap = el('mm-team-slots');
    if (!wrap) return;
    wrap.innerHTML = '';

    const slots = 5;
    const members = (
      mm?.lobbyMemberIds?.length
        ? mm.lobbyMemberIds
        : (mm?.group?.members || [])
    ).map(String);
    const leaderId = mm?.group?.leader != null ? String(mm.group.leader) : null;
    const inQueue = !!mm?.inQueue;
    const canInvite = !inQueue && mm?.isLeader !== false;

    if (members.length > 0) {
      const cards = members.map((id) => renderFilledSlot(mm, id, leaderId));
      const padLeft = Math.floor(cards.length / 2);
      const padRight = slots - cards.length - padLeft;
      for (let i = 0; i < padLeft; i++) wrap.appendChild(renderEmptySlot(canInvite));
      cards.forEach((card) => wrap.appendChild(card));
      for (let i = 0; i < padRight; i++) wrap.appendChild(renderEmptySlot(canInvite));
      return;
    }

    if (!state.user) {
      for (let i = 0; i < slots; i++) wrap.appendChild(renderEmptySlot(canInvite));
      return;
    }

    const centerIdx = 2;
    for (let i = 0; i < slots; i++) {
      if (i === centerIdx) {
        wrap.appendChild(renderFilledSlot(mm, state.user.id, leaderId || String(state.user.id)));
      } else {
        wrap.appendChild(renderEmptySlot(canInvite));
      }
    }
  }

  function renderGroupInvites(mm) {
    const container = el('mm-group-invites');
    if (!container) return;

    const invites = mm?.pendingGroupInvites || [];
    if (!invites.length) {
      container.innerHTML = '';
      state.lastInviteRenderKey = '';
      return;
    }

    const renderKey = invites
      .map((i) => `${i._id}:${i.expiresAt}`)
      .join('|');
    if (renderKey === state.lastInviteRenderKey && container.childElementCount > 0) {
      return;
    }
    state.lastInviteRenderKey = renderKey;

    const onlineUsers = mm?.onlineUsers || {};
    const profiles = mm?.memberProfiles || {};
    container.innerHTML = invites.map((inv) => {
      const inviterId = String(inv.inviter_id);
      const inviter =
        (inv.inviter_name || inv.inviter_avatar)
          ? { id: inviterId, name: inv.inviter_name, avatar: inv.inviter_avatar }
          : null;
      const resolved =
        inviter ||
        profiles[inviterId] ||
        onlineUsers[inviterId]?.user ||
        state.friendsById[inviterId] ||
        { id: inviterId, name: 'Player' };
      const avatarSrc = avatarUrl(resolved);
      const elapsedSec = Math.max(0, (Date.now() - (inv.receivedAt || Date.now())) / 1000);

      return `
        <div class="mm-group-invite-toast" data-invite-id="${escapeHtml(inv._id)}">
          <p class="mm-group-invite-title">${t('mm_group_invite_title')}</p>
          <div class="mm-group-invite-user">
            <img src="${avatarSrc || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="" loading="lazy">
            <span>${escapeHtml(resolved.name || resolved.username || 'Player')}</span>
          </div>
          <div class="mm-group-invite-actions">
            <button type="button" class="btn-play mm-group-invite-accept" data-group-id="${escapeHtml(String(inv.group_id))}">
              ${t('mm_group_invite_accept')}
            </button>
            <button type="button" class="btn-secondary mm-group-invite-decline" data-invite-id="${escapeHtml(inv._id)}">
              ${t('mm_group_invite_decline')}
            </button>
          </div>
          <span class="mm-group-invite-timer-bar" style="animation-duration: 15s; animation-delay: -${elapsedSec}s"></span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.mm-group-invite-accept').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        if (!groupId || !window.api?.matchmaking) return;
        btn.disabled = true;
        await window.api.matchmaking.acceptGroupInvite(groupId);
      });
    });

    container.querySelectorAll('.mm-group-invite-decline').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const inviteId = btn.dataset.inviteId;
        if (!inviteId || !window.api?.matchmaking) return;
        await window.api.matchmaking.declineGroupInvite(inviteId);
      });
    });
  }

  function renderInvitedRow(mm) {
    const row = el('mm-invited-row');
    if (!row) return;

    const group = mm?.group;
    const members = (group?.members || []).map(String);
    const invited = (group?.invited || [])
      .map(String)
      .filter((id) => !members.includes(id));

    if (!invited.length) {
      row.style.display = 'none';
      row.innerHTML = '';
      return;
    }

    const onlineUsers = mm?.onlineUsers || {};
    row.style.display = 'flex';
    row.innerHTML = `
      <span class="mm-invited-label">${t('mm_invited_label')}</span>
      <div class="mm-invited-avatars">
        ${invited.map((id) => {
          const u = onlineUsers[id]?.user || state.friendsById[id] || { id };
          return `<img class="mm-invited-avatar" src="${avatarUrl(u)}" title="${escapeHtml(u.name || '')}" alt="">`;
        }).join('')}
      </div>
    `;
  }

  function renderOptions(mm) {
    const modeList = el('mm-mode-list');
    const regionList = el('mm-region-list');
    if (!modeList || !regionList) return;

    const inQueue = !!mm?.inQueue;
    const canChange = !inQueue && mm?.isLeader !== false;

    modeList.innerHTML = '';
    regionList.innerHTML = '';

    MODES.forEach((mode) => {
      const count = queueCountModeRegion(mode.id, state.selectedRegion, mm?.status);
      const active = state.selectedMode === mode.id;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `mm-option-row${active ? ' active' : ''}${canChange ? '' : ' disabled'}`;
      row.disabled = !canChange;
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
      const count = queueCountRegion(region.id, mm?.status);
      const active = state.selectedRegion === region.id;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `mm-option-row${active ? ' active' : ''}${canChange ? '' : ' disabled'}`;
      row.disabled = !canChange;
      row.innerHTML = `
        <img src="${region.flag}" alt="" class="mm-option-icon mm-flag">
        <span class="mm-option-label">${t(region.labelKey)}</span>
        <span class="mm-option-online ${count > 0 ? 'online' : ''}">
          <i class="fa-solid fa-circle"></i> ${count} ${t('mm_online')}
        </span>
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
      const leaderId = mm?.group?.leader != null ? String(mm.group.leader) : null;
      const leaderUser = leaderId
        ? resolveMemberUser(mm, leaderId)
        : state.user;
      const name = leaderUser?.name || state.user?.name;
      groupName.textContent = name ? `team_${name}` : '—';
    }

    renderInvitedRow(mm);
    renderGroupInvites(mm);

    const syncHint = el('mm-lobby-sync-hint');
    if (syncHint) {
      const soloInRoom = !!mm?.group?.id && (mm.lobbyMemberIds?.length || mm.group?.members?.length || 0) <= 1;
      if (soloInRoom && mm?.connected) {
        syncHint.textContent = t('mm_lobby_sync_hint');
        syncHint.style.display = 'block';
      } else {
        syncHint.style.display = 'none';
      }
    }

    const eloBadge = el('mm-elo-badge');
    if (eloBadge && state.user) {
      eloBadge.textContent = `${state.user.points ?? state.user.elo ?? '—'} ELO`;
    }

    const btn = el('mm-queue-btn');
    if (btn) {
      btn.disabled = false;
      if (mm?.inQueue) {
        btn.className = 'btn-play mm-queue-btn in-queue';
        const time = formatElapsed(mm.queueElapsed || 0);
        btn.innerHTML = `<span>${tf('mm_in_queue', { time })}</span>`;
      } else if (mm?.availableQueueType) {
        btn.className = 'btn-play mm-queue-btn';
        btn.innerHTML = `<span>${t('mm_accept_queue')}</span>`;
      } else if (mm?.isLeader === false) {
        btn.className = 'btn-play mm-queue-btn';
        btn.disabled = true;
        btn.innerHTML = `<span>${t('mm_not_leader')}</span>`;
      } else if (state.user && !state.user.steam) {
        btn.className = 'btn-play mm-queue-btn';
        btn.disabled = true;
        btn.innerHTML = `<span>${t('mm_steam_required')}</span>`;
      } else {
        btn.className = 'btn-play mm-queue-btn';
        btn.innerHTML = `<span>${t('mm_join_queue')}</span>`;
        btn.disabled = !mm?.connected;
      }
    }

    const btnLeave = el('mm-leave-group');
    if (btnLeave) {
      const showLeave = !!(mm?.group?.id);
      btnLeave.style.display = showLeave ? '' : 'none';
      btnLeave.disabled = state.leavingGroup;
    }

    renderTeamSlots(mm);
    renderOptions(mm);
    renderLiveMatches(mm);

    if (state.inviteOpen) renderInviteList(el('mm-invite-search')?.value || '');
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

  function bindMatchmakingUpdates() {
    if (state.listenerBound || !window.api?.matchmaking) return;
    state.listenerBound = true;

    window.api.matchmaking.onUpdate(async (data) => {
      if (window.CSRMatch) {
        await CSRMatch.handleUpdate(data);
      }

      if (data.groupInvite) {
        loadFriendsForInvite().catch(() => {});
      }

      if (state.active) {
        if (data.queueType && data.queueType.includes(':')) {
          const [m, r] = data.queueType.split(':');
          state.selectedMode = m;
          state.selectedRegion = r;
        }
        renderAll(data);
      } else {
        state.mm = data;
        if (data.groupInvite || data.pendingGroupInvites?.length) {
          renderGroupInvites(data);
        }
      }
    });
  }

  async function start() {
    if (state.active) return;
    state.active = true;
    closeInviteModal();

    await loadUser();
    await loadFriendsForInvite().catch(() => {});
    bindMatchmakingUpdates();

    if (!window.api?.matchmaking) return;

    const existing = await window.api.matchmaking.getState();
    if (existing?.connected) {
      if (existing.queueType && existing.queueType.includes(':')) {
        const [m, r] = existing.queueType.split(':');
        state.selectedMode = m;
        state.selectedRegion = r;
      }
      renderAll(existing);
      return;
    }

    renderAll({ connected: false });

    if (window.api.matchmaking.ensureWsSession) {
      await window.api.matchmaking.ensureWsSession();
    }

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

  function pause() {
    state.active = false;
    closeInviteModal();
  }

  async function stop() {
    pause();
    if (window.api?.matchmaking) {
      await window.api.matchmaking.stop(true);
    }
    state.listenerBound = false;
  }

  function setup() {
    const btnQueue = el('mm-queue-btn');
    const btnLeave = el('mm-leave-group');
    const inviteClose = el('mm-invite-close');
    const inviteSearch = el('mm-invite-search');
    const inviteModal = el('mm-invite-modal');
    const teamSlots = el('mm-team-slots');

    closeInviteModal();

    if (teamSlots && !teamSlots._inviteBound) {
      teamSlots._inviteBound = true;
      teamSlots.addEventListener('click', (e) => {
        if (e.target.closest('.mm-team-slot-invite')) {
          openInviteModal();
        }
      });
    }

    if (btnQueue) {
      btnQueue.addEventListener('click', async () => {
        if (!window.api?.matchmaking) return;
        const snap = await window.api.matchmaking.getState();
        if (snap?.inQueue) {
          await window.api.matchmaking.leaveQueue();
          const next = await window.api.matchmaking.getState();
          renderAll(next);
          return;
        }
        await applyQueueType();
        const result = await window.api.matchmaking.joinQueue();
        if (!result?.ok) {
          const next = await window.api.matchmaking.getState();
          renderAll({ ...next, lastError: next.lastError || t('mm_queue_failed') });
        }
      });
    }

    if (btnLeave && !btnLeave.dataset.bound) {
      btnLeave.dataset.bound = '1';
      btnLeave.addEventListener('click', async () => {
        if (state.leavingGroup || !window.api?.matchmaking) return;
        state.leavingGroup = true;
        btnLeave.disabled = true;
        try {
          await window.api.matchmaking.leaveGroup();
          const snap = await window.api.matchmaking.getState();
          renderAll(snap);
        } finally {
          state.leavingGroup = false;
          btnLeave.disabled = false;
        }
      });
    }

    if (inviteClose) inviteClose.addEventListener('click', closeInviteModal);
    if (inviteModal) {
      inviteModal.addEventListener('click', (e) => {
        if (e.target === inviteModal) closeInviteModal();
      });
    }
    if (inviteSearch) {
      inviteSearch.addEventListener('input', () => renderInviteList(inviteSearch.value));
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.CSRMatchmaking = { setup, start, pause, stop, renderAll };
})();
