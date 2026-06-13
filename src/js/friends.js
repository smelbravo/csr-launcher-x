/* Friends list — GET /users/friends + invite/accept/delete (same as csrestored.fun) */

(function () {
  const state = {
    active: false,
    friends: [],
    onlineUsers: {},
    onlineLookup: new Set(),
    presenceTimer: null,
    openMenuId: null,
    listenerBound: false
  };

  function t(key) {
    return (typeof window._invTranslate === 'function' ? window._invTranslate(key) : key);
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function el(id) {
    return document.getElementById(id);
  }

  function avatarUrl(friend) {
    const id = friend?.id;
    if (friend?.avatar && id) {
      return `https://cdn.discordapp.com/avatars/${id}/${friend.avatar}.png?size=64`;
    }
    return '';
  }

  function normalizeFriend(raw) {
    if (!raw) return null;
    const id = raw.id ?? raw.discord_id;
    if (id == null) return null;
    return {
      ...raw,
      id: String(id),
      name: raw.name || raw.username || raw.display_name || 'Player',
      state: raw.state || 'accepted',
      incoming: !!raw.incoming,
      verified: raw.verified !== false
    };
  }

  function isPending(friend) {
    return friend.state === 'pending';
  }

  function isPendingIncoming(friend) {
    return isPending(friend) && friend.incoming;
  }

  function pendingStatusText(friend) {
    return friend.incoming ? t('friends_pending_incoming') : t('friends_pending_outgoing');
  }

  function setLoading(show) {
    const loading = el('friends-loading');
    if (loading) loading.style.display = show ? 'flex' : 'none';
  }

  function closeAllMenus() {
    state.openMenuId = null;
    document.querySelectorAll('.friends-options-menu').forEach((m) => {
      m.hidden = true;
    });
  }

  async function ensurePresence(forceRefresh = false) {
    if (!window.api?.csr?.getOnlineUsers) return;
    try {
      const res = await window.api.csr.getOnlineUsers(forceRefresh);
      if (res?.unauthorized) return;
      if (res?.ok && res.count > 0) {
        applyOnlinePayload(res.onlineUsers, res.ids);
        return;
      }
      if (res?.ok) {
        applyOnlinePayload(res.onlineUsers, res.ids);
      }
    } catch (e) {
      console.warn('[Friends] site presence failed:', e);
    }
  }

  function applyOnlinePayload(onlineUsers, ids) {
    state.onlineUsers = onlineUsers || {};
    const lookup = buildOnlineLookup(state.onlineUsers, null);
    (ids || []).forEach((id) => lookup.add(String(id)));
    state.onlineLookup = lookup;
  }

  function buildOnlineLookup(users, memberProfiles) {
    const lookup = new Set();
    const add = (value) => {
      if (value != null && value !== '') lookup.add(String(value));
    };

    Object.entries(users || {}).forEach(([key, entry]) => {
      add(key);
      const u = entry?.user || entry;
      if (u && typeof u === 'object') {
        add(u.id);
        add(u.user_id);
        add(u.discord_id);
      }
    });

    Object.entries(memberProfiles || {}).forEach(([key, profile]) => {
      add(key);
      if (profile && typeof profile === 'object') {
        add(profile.id);
        add(profile.user_id);
        add(profile.discord_id);
      }
    });

    return lookup;
  }

  function syncOnlineFromMm(mm) {
    state.onlineUsers = mm?.onlineUsers || {};
    state.onlineLookup = buildOnlineLookup(state.onlineUsers, mm?.memberProfiles);
  }

  function bindPresenceUpdates() {
    if (state.listenerBound || !window.api?.matchmaking?.onUpdate) return;
    state.listenerBound = true;
    window.api.matchmaking.onUpdate((data) => {
      if (!state.active) return;
      syncOnlineFromMm(data);
      renderList();
    });
  }

  async function waitForPresence(maxMs = 12000) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      if (window.api?.csr?.getOnlineUsers) {
        try {
          const res = await window.api.csr.getOnlineUsers();
          if (res?.ok && res.count > 0) {
            applyOnlinePayload(res.onlineUsers, res.ids);
            return;
          }
        } catch (_) { /* retry */ }
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async function refreshPresence() {
    await ensurePresence();
    renderList();
  }

  function startPresencePoll() {
    stopPresencePoll();
    state.presenceTimer = setInterval(() => refreshPresence(), 4000);
  }

  function stopPresencePoll() {
    if (state.presenceTimer) {
      clearInterval(state.presenceTimer);
      state.presenceTimer = null;
    }
  }

  function isOnline(friend) {
    const lookup = state.onlineLookup;
    if (!lookup || lookup.size === 0) return false;
    const id = String(friend.id);
    return lookup.has(id)
      || lookup.has(String(friend.discord_id))
      || lookup.has(String(friend.user_id));
  }

  function sortFriends(list) {
    return list.slice().sort((a, b) => {
      const ao = isOnline(a) ? 0 : 1;
      const bo = isOnline(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.state === 'accepted' && b.state !== 'accepted') return -1;
      if (a.state !== 'accepted' && b.state === 'accepted') return 1;
      if (isPending(a) && isPending(b)) {
        if (a.incoming && !b.incoming) return -1;
        if (!a.incoming && b.incoming) return 1;
      }
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function getSearchQuery() {
    return (el('friends-search')?.value || '').trim().toLowerCase();
  }

  function filteredFriends() {
    const q = getSearchQuery();
    return state.friends.filter((f) => {
      if (!q) return true;
      return String(f.name).toLowerCase().includes(q);
    });
  }

  function renderList() {
    const list = el('friends-list');
    if (!list) return;

    closeAllMenus();
    const rows = sortFriends(filteredFriends());

    if (!rows.length) {
      list.innerHTML = `
        <div class="empty-state friends-empty">
          <i class="fa-solid fa-user-group"></i>
          <p>${esc(state.friends.length ? t('friends_no_match') : t('friends_empty'))}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = rows.map((f) => {
      const online = isOnline(f);
      const pending = isPending(f);
      const pendingIncoming = isPendingIncoming(f);
      const statusClass = pending ? 'friends-status-pending' : (online ? 'friends-status-online' : 'friends-status-offline');
      const statusText = pending
        ? pendingStatusText(f)
        : (online ? t('friends_online') : t('friends_offline'));
      const avatar = avatarUrl(f);
      const menuId = `friends-menu-${f.id}`;

      return `
        <div class="friends-row${!pending ? ' friends-row-clickable' : ''}" data-friend-id="${esc(String(f.id))}"${!pending ? ` data-user-id="${esc(String(f.id))}"` : ''}>
          ${avatar
            ? `<img class="friends-avatar" src="${esc(avatar)}" alt="">`
            : `<span class="friends-avatar friends-avatar-fallback"><i class="fa-solid fa-user"></i></span>`}
          <div class="friends-meta">
            <span class="friends-name">${esc(f.name)}</span>
            <span class="friends-status ${statusClass}">${esc(statusText)}</span>
          </div>
          <div class="friends-actions">
            ${pendingIncoming ? `
              <button type="button" class="btn-secondary friends-accept-btn" data-friend-id="${esc(String(f.id))}">
                ${esc(t('friends_accept'))}
              </button>
            ` : ''}
            <div class="friends-options-wrap">
              <button type="button" class="btn-secondary friends-options-btn" data-menu-id="${esc(menuId)}" aria-expanded="false">
                ${esc(t('friends_options'))}
                <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
              </button>
              <div class="friends-options-menu" id="${esc(menuId)}" hidden>
                <button type="button" class="friends-menu-delete" data-friend-id="${esc(String(f.id))}">
                  ${esc(t('friends_delete'))}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.friends-options-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menuId = btn.dataset.menuId;
        const menu = document.getElementById(menuId);
        if (!menu) return;
        const willOpen = menu.hidden;
        closeAllMenus();
        if (willOpen) {
          menu.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          state.openMenuId = menuId;
        }
      });
    });

    list.querySelectorAll('.friends-menu-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.friendId;
        if (!id || !window.api?.csr?.deleteFriend) return;
        btn.disabled = true;
        const result = await window.api.csr.deleteFriend(id);
        if (result?.error) {
          alert(result.message || t('friends_delete_failed'));
          btn.disabled = false;
          return;
        }
        await loadFriends(false);
      });
    });

    list.querySelectorAll('.friends-accept-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.friendId;
        if (!id || !window.api?.csr?.acceptFriend) return;
        btn.disabled = true;
        const result = await window.api.csr.acceptFriend(id);
        if (result?.error) {
          alert(result.message || t('friends_accept_failed'));
          btn.disabled = false;
          return;
        }
        await loadFriends(false);
      });
    });

    list.querySelectorAll('.friends-row-clickable[data-user-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.friends-actions') || e.target.closest('button')) return;
        const uid = row.dataset.userId;
        if (uid && window.CSRApp?.openProfile) {
          CSRApp.openProfile(uid, 'friends');
        }
      });
    });
  }

  async function loadFriends(showSpinner = true) {
    const list = el('friends-list');
    if (!list) return;

    if (showSpinner) {
      setLoading(true);
      list.innerHTML = '';
    }

    try {
      const res = await window.api.csr.getFriends();
      setLoading(false);

      if (res?.unauthorized) {
        list.innerHTML = `
          <div class="empty-state friends-empty">
            <i class="fa-solid fa-user-lock"></i>
            <p>${esc(t('friends_login_required'))}</p>
          </div>
        `;
        return;
      }

      if (res?.error || !Array.isArray(res.friends)) {
        list.innerHTML = `
          <div class="empty-state friends-empty">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>${esc(t('friends_error'))}</p>
          </div>
        `;
        return;
      }

      state.friends = sortFriends(res.friends.map(normalizeFriend).filter(Boolean));

      await refreshPresence();
      renderList();
    } catch (e) {
      setLoading(false);
      if (list) {
        list.innerHTML = `
          <div class="empty-state friends-empty">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>${esc(e.message || t('friends_error'))}</p>
          </div>
        `;
      }
    }
  }

  async function inviteFriend() {
    const input = el('friends-search');
    const username = (input?.value || '').trim();
    if (!username) {
      input?.focus();
      return;
    }
    const btn = el('btn-friends-invite');
    if (btn) btn.disabled = true;
    try {
      const result = await window.api.csr.inviteFriend(username);
      if (result?.error) {
        alert(result.message || t('friends_invite_failed'));
        return;
      }
      if (input) input.value = '';
      await loadFriends(false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function setup() {
    const refreshBtn = el('btn-refresh-friends');
    const inviteBtn = el('btn-friends-invite');
    const search = el('friends-search');

    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = '1';
      refreshBtn.addEventListener('click', async () => {
        await ensurePresence(true);
        await loadFriends(true);
      });
    }
    if (inviteBtn && !inviteBtn.dataset.bound) {
      inviteBtn.dataset.bound = '1';
      inviteBtn.addEventListener('click', () => inviteFriend());
    }
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('input', () => renderList());
    }

    if (!document.body.dataset.friendsMenuBound) {
      document.body.dataset.friendsMenuBound = '1';
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.friends-options-wrap')) closeAllMenus();
      });
    }
  }

  async function start() {
    if (state.active) {
      await refreshPresence();
      await loadFriends(false);
      return;
    }
    state.active = true;
    setup();
    await ensurePresence();
    await waitForPresence();
    startPresencePoll();
    await loadFriends(true);
  }

  function pause() {
    state.active = false;
    stopPresencePoll();
    closeAllMenus();
  }

  window.CSRFriends = { setup, start, pause, load: loadFriends };
})();
