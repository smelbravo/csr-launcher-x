/* Player profile — stats + history (site-style), inventory via launcher grid */

(function () {
  const state = {
    userId: null,
    profile: null,
    isOwnProfile: false,
    bound: false,
    historyRaw: [],
    historyPage: 0,
    historyHasMore: false,
    historyLoading: false
  };

  function t(key) {
    return (typeof window._profileTranslate === 'function' ? window._profileTranslate(key) : key);
  }

  function el(id) {
    return document.getElementById(id);
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function computeRating(profile, historyRows) {
    const games = historyRows.length;
    const kills = historyRows.reduce((s, r) => s + r.kills, 0);
    const deaths = historyRows.reduce((s, r) => s + r.deaths, 0);
    const rounds = historyRows.reduce((s, r) => s + r.rounds, 0);
    const assists = historyRows.reduce((s, r) => s + r.assists, 0);
    const lifeKD = profile && profile.deaths ? profile.kills / profile.deaths : 1;
    const kd = games ? (deaths ? kills / deaths : kills) : lifeKD;
    const kr = rounds ? kills / rounds : 0.68;
    const apr = rounds ? assists / rounds : 0;
    const adr = games ? clamp(kr * 100 + apr * 22, 30, 160) : 72;
    const krN = clamp((kr - 0.4) / 0.6, 0, 1);
    const kdN = clamp((kd - 0.5) / 1.0, 0, 1);
    const adrN = clamp((adr - 50) / 60, 0, 1);
    return clamp(0.5 * kdN + 0.3 * krN + 0.2 * adrN, 0, 1.5) * 0.95 + 0.05;
  }

  function historyRowsForProfile(hist, userId) {
    const out = [];
    for (const m of hist || []) {
      if (m.canceled) continue;
      const pl = m.players?.[userId] ?? m.players?.[String(userId)];
      if (!pl) continue;
      const teams = String(m.teams || '').split(/\s+/);
      const sc = String(m.score || '0 0').split(/\s+/).map(Number);
      let won = null;
      let myScore = null;
      let oppScore = null;
      if (teams.length >= 2 && sc.length === 2) {
        const idx = pl.team === teams[0] ? 0 : pl.team === teams[1] ? 1 : -1;
        if (idx >= 0) {
          won = sc[idx] > sc[idx ? 0 : 1];
          myScore = sc[idx];
          oppScore = sc[idx ? 0 : 1];
        }
      }
      const playerCount = m.players ? Object.keys(m.players).length : 0;
      const mode = playerCount >= 9 ? '5v5' : playerCount >= 5 ? '3v3' : playerCount ? '2v2' : '';
      out.push({
        kills: pl.kills || 0,
        deaths: pl.deaths || 0,
        assists: pl.assists || 0,
        rounds: (sc[0] || 0) + (sc[1] || 0) || 1,
        won,
        myScore,
        oppScore,
        date: m.date ? `${m.date}Z` : (m.created_at ?? m.timestamp),
        map: m.map,
        mode,
        id: m.id ?? m.match_id
      });
    }
    return out;
  }

  function faceitPerfUrl(profile) {
    const steam = profile?.steam;
    if (!steam) return null;
    return `https://faceitperf.pro/players/${encodeURIComponent(String(steam))}`;
  }

  function profileMapIcon(raw) {
    if (typeof mapIconUrl === 'function') return mapIconUrl(raw);
    const s = String(raw || '').toLowerCase().replace(/^de_/, '');
    return s ? `https://csrestored.fun/maps/icons/${s}.png` : '';
  }

  function formatProfileDate(raw) {
    if (typeof formatMatchDate === 'function') return formatMatchDate(raw);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '—';
    const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  }

  function formatMapLabel(raw) {
    if (typeof formatMapName === 'function') return formatMapName(raw);
    if (!raw) return '—';
    return String(raw).replace(/^de_/i, '').replace(/^\w/, (c) => c.toUpperCase());
  }

  async function resolveCurrentUserId() {
    try {
      if (typeof getCurrentUserId === 'function') {
        return await getCurrentUserId();
      }
      const res = await window.api.auth.getUser();
      if (!res?.error && res?.user?.id) return String(res.user.id);
    } catch (_) { /* ignore */ }
    return null;
  }

  function setLoading(show) {
    const loading = el('profile-loading');
    const content = el('profile-content');
    const error = el('profile-error');
    if (loading) loading.style.display = show ? 'flex' : 'none';
    if (content) content.style.display = show ? 'none' : '';
    if (error) error.style.display = 'none';
  }

  function showError(msg) {
    setLoading(false);
    const content = el('profile-content');
    const error = el('profile-error');
    if (content) content.style.display = 'none';
    if (error) {
      error.style.display = 'block';
      error.textContent = msg || t('profile_error');
    }
  }

  function renderStats(profile, ratingVal) {
    const grid = el('profile-stat-grid');
    if (!grid) return;

    const winratePct = profile.matches ? (profile.wins / profile.matches) * 100 : 0;
    const kdr = profile.deaths ? profile.kills / profile.deaths : profile.kills;
    const avg = profile.matches ? profile.kills / profile.matches : 0;

    const stats = [
      [t('profile_stat_winrate'), `${winratePct.toFixed(2)}%`, true],
      [t('profile_stat_elo'), String(profile.points ?? '—'), true],
      [t('profile_stat_kdr'), kdr.toFixed(2), true],
      [t('profile_stat_avg'), avg.toFixed(2), true],
      [t('profile_stat_rating'), ratingVal.toFixed(2), true],
      [t('profile_stat_kills'), String(profile.kills ?? 0)],
      [t('profile_stat_deaths'), String(profile.deaths ?? 0)],
      [t('profile_stat_matches'), String(profile.matches ?? 0)],
      [t('profile_stat_wins'), String(profile.wins ?? 0)]
    ];

    grid.innerHTML = stats.map(([label, value, accent]) => `
      <div class="profile-stat${accent ? ' profile-stat-accent' : ''}">
        <div class="profile-stat-value">${esc(value)}</div>
        <div class="profile-stat-label">${esc(label)}</div>
      </div>
    `).join('');
  }

  function renderHistory(rows) {
    const body = el('profile-history-body');
    const empty = el('profile-history-empty');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        empty.textContent = t('profile_history_empty');
      }
      return;
    }

    if (empty) empty.style.display = 'none';
    body.innerHTML = rows.map((r) => {
      const win = r.won === true;
      const loss = r.won === false;
      const rowClass = win ? 'profile-hrow-win' : loss ? 'profile-hrow-loss' : '';
      const res = win ? 'W' : loss ? 'L' : '—';
      const kdr = r.deaths ? (r.kills / r.deaths).toFixed(2) : r.kills.toFixed(2);
      const score = (r.myScore != null && r.oppScore != null)
        ? `<span class="profile-hs-res">${res}</span><span class="profile-hs-mine">${r.myScore}</span><span class="profile-hs-sep">:</span><span class="profile-hs-opp">${r.oppScore}</span>`
        : `<span class="profile-hs-res">${res}</span>`;
      const icon = profileMapIcon(r.map);
      const mapName = formatMapLabel(r.map);
      const clickAttr = r.id ? ` class="profile-hrow profile-hrow-click ${rowClass}" data-match-id="${esc(String(r.id))}"` : ` class="profile-hrow ${rowClass}"`;

      return `
        <tr${clickAttr}>
          <td class="profile-hc-date">${esc(formatProfileDate(r.date))}</td>
          <td class="profile-hc-score">${score}</td>
          <td class="profile-hc-kda">${r.kills} / ${r.deaths} / ${r.assists}</td>
          <td class="profile-hc-kdr">${esc(kdr)}</td>
          <td class="profile-hc-map">
            ${icon ? `<img class="profile-map-icon" src="${esc(icon)}" alt="" onerror="this.style.visibility='hidden'">` : ''}
            <span class="profile-map-text">
              <span>${esc(mapName)}</span>
              <span class="profile-map-mode">${esc(r.mode || '')}</span>
            </span>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('.profile-hrow-click').forEach((row) => {
      row.addEventListener('click', () => {
        const matchId = row.dataset.matchId;
        if (matchId && window.CSRPlayStats?.openMatch) {
          CSRPlayStats.openMatch(matchId, state.userId);
        }
      });
    });
  }

  function renderHeader(profile, userId, isOwn) {
    const avatarEl = el('profile-avatar');
    const nameEl = el('profile-name');
    const eloEl = el('profile-elo');
    const linksEl = el('profile-links');
    const invBtn = el('btn-profile-inventory');
    const siteLink = el('profile-site-link');

    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${userId}/${profile.avatar}.png?size=128`
      : '';

    if (avatarEl) {
      if (avatar) {
        avatarEl.src = avatar;
        avatarEl.style.display = '';
      } else {
        avatarEl.removeAttribute('src');
        avatarEl.style.display = 'none';
      }
    }

    if (nameEl) {
      const flag = profile.country
        ? `<img class="profile-flag" src="https://flagcdn.com/w40/${esc(profile.country)}.png" alt="">`
        : '';
      nameEl.innerHTML = `${esc(profile.name || 'Player')}${flag}`;
    }

    if (eloEl) {
      eloEl.textContent = profile.points != null ? `${profile.points} ELO` : '';
    }

    if (linksEl) {
      const steam = profile.steam;
      const faceitUrl = faceitPerfUrl(profile);
      const parts = [];
      if (steam) {
        parts.push(`
          <a class="profile-ext-link" href="https://steamcommunity.com/profiles/${esc(steam)}" target="_blank" rel="noopener" title="Steam">
            <i class="fa-brands fa-steam"></i>
          </a>
          <a class="profile-ext-link" href="https://steamdb.info/calculator/${esc(steam)}/" target="_blank" rel="noopener" title="SteamDB">
            <i class="fa-solid fa-database"></i>
          </a>
        `);
      }
      if (faceitUrl) {
        parts.push(`
          <a class="profile-ext-link profile-ext-faceit" href="${esc(faceitUrl)}" target="_blank" rel="noopener" title="${esc(t('profile_faceitperf'))}">
            <i class="fa-solid fa-chart-line"></i>
          </a>
        `);
      }
      linksEl.innerHTML = parts.join('');
    }

    if (invBtn) {
      invBtn.style.display = isOwn ? 'none' : '';
    }

    if (siteLink) {
      siteLink.href = `https://csrestored.fun/app/user/${userId}`;
    }
  }

  function updateHistoryLoadMore() {
    const wrap = el('profile-load-more-wrap');
    const btn = el('btn-profile-load-more');
    if (!wrap) return;
    wrap.style.display = state.historyHasMore ? '' : 'none';
    if (btn) btn.disabled = state.historyLoading;
  }

  function refreshProfileHistory() {
    const rows = historyRowsForProfile(state.historyRaw, state.userId);
    const ratingVal = computeRating(state.profile, rows);
    renderStats(state.profile, ratingVal);
    renderHistory(rows);
    updateHistoryLoadMore();
  }

  async function loadMoreHistory() {
    if (!state.userId || state.historyLoading || !state.historyHasMore) return;
    state.historyLoading = true;
    updateHistoryLoadMore();

    try {
      const nextPage = state.historyPage + 1;
      const histRes = await window.api.csr.getUserHistory(state.userId, nextPage);
      const batch = histRes?.matches || [];
      if (batch.length) {
        state.historyRaw.push(...batch);
        state.historyPage = nextPage;
      }
      state.historyHasMore = batch.length >= 10;
      refreshProfileHistory();
    } catch (e) {
      console.warn('[Profile] history load more failed:', e);
    } finally {
      state.historyLoading = false;
      updateHistoryLoadMore();
    }
  }

  async function load(userId) {
    if (!userId || !window.api?.csr?.getUserById) return;

    state.userId = String(userId);
    state.profile = null;
    state.historyRaw = [];
    state.historyPage = 0;
    state.historyHasMore = false;
    state.historyLoading = false;
    setLoading(true);

    const meId = await resolveCurrentUserId();
    state.isOwnProfile = meId && String(meId) === state.userId;

    try {
      const [userRes, histRes] = await Promise.all([
        window.api.csr.getUserById(state.userId),
        window.api.csr.getUserHistory(state.userId, 0)
      ]);

      if (userRes?.unauthorized) {
        showError(t('profile_login_required'));
        return;
      }

      if (userRes?.error || !userRes?.user) {
        showError(userRes?.message || t('profile_error'));
        return;
      }

      state.profile = userRes.user;
      state.historyRaw = histRes?.matches || [];
      state.historyHasMore = state.historyRaw.length >= 10;

      renderHeader(state.profile, state.userId, state.isOwnProfile);
      refreshProfileHistory();

      setLoading(false);
      const content = el('profile-content');
      if (content) content.style.display = '';
    } catch (e) {
      showError(e.message || t('profile_error'));
    }
  }

  function setup() {
    if (state.bound) return;
    state.bound = true;

    const backBtn = el('btn-profile-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (window.CSRApp?.goBack) {
          CSRApp.goBack();
        } else if (window.CSRApp?.navigateToPage) {
          CSRApp.navigateToPage('leaderboard');
        }
      });
    }

    const invBtn = el('btn-profile-inventory');
    if (invBtn) {
      invBtn.addEventListener('click', () => {
        if (!state.userId || !state.profile) return;
        if (window.CSRApp?.openPlayerInventory) {
          CSRApp.openPlayerInventory(state.userId, state.profile.name, state.userId);
        }
      });
    }

    bindTopbarOnce();

    const loadMoreBtn = el('btn-profile-load-more');
    if (loadMoreBtn && !loadMoreBtn.dataset.bound) {
      loadMoreBtn.dataset.bound = '1';
      loadMoreBtn.addEventListener('click', () => loadMoreHistory());
    }
  }

  function bindTopbarOnce() {
    const topbarUser = document.getElementById('topbar-user');
    if (!topbarUser || topbarUser.dataset.profileBound === '1') return;
    topbarUser.dataset.profileBound = '1';
    topbarUser.style.cursor = 'pointer';
    topbarUser.title = t('profile_view_profile');
    topbarUser.addEventListener('click', async (e) => {
      if (e.target.closest('#btn-logout')) return;
      const meId = await resolveCurrentUserId();
      if (meId && window.CSRApp?.openProfile) {
        CSRApp.openProfile(meId);
      }
    });
  }

  window._profileTranslate = (key) => {
    if (typeof window.t === 'function') return window.t(key);
    return key;
  };

  window.CSRProfile = {
    load,
    setup,
    bindTopbarOnce
  };
})();
