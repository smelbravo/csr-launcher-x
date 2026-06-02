/**
 * Live match page — accept, pick/ban, connect (Phoenix match channel).
 */
(function () {
  const QUEUE_TYPES = {
    '5v5:eu': 'Competitive EU',
    '5h5:eu': 'Hostage EU',
    '2v2:eu': 'Wingman EU',
    '5v5:na': 'Competitive NA',
    '5h5:na': 'Hostage NA',
    '2v2:na': 'Wingman NA',
    '5v5:oce': 'Competitive OCE',
    '5h5:oce': 'Hostage OCE',
    '2v2:oce': 'Wingman OCE',
    '5v5:ru': 'Competitive RU',
    '5h5:ru': 'Hostage RU',
    '2v2:ru': 'Wingman RU'
  };

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
  const REGION_INFO = {
    eu: { label: 'Germany, Limburg', flag: 'https://csrestored.fun/germany.png' },
    na: { label: 'Chicago', flag: 'https://csrestored.fun/usa.png' },
    oce: { label: 'Sydney', flag: 'https://csrestored.fun/australia.png' },
    ru: { label: 'Russia, Moscow', flag: 'https://csrestored.fun/russia.png' },
    de: { label: 'Germany, Frankfurt', flag: 'https://csrestored.fun/de.png' }
  };

  const state = {
    active: false,
    user: null,
    mm: null,
    selectedBans: [],
    lastTurnIndex: null,
    acceptSeconds: 30,
    acceptTimer: null,
    serverIpVisible: false,
    submittedTurn: null,
    acceptMatchId: null
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

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function avatarUrl(userId, avatar) {
    if (!avatar || !userId) return '';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
  }

  function rankImageUrl(points) {
    const elo = Number(points) || 0;
    const row = RANK_LEVELS.find(([min]) => elo >= min);
    return row ? row[1] : RANK_LEVELS[RANK_LEVELS.length - 1][1];
  }

  function mapImageUrl(mapId) {
    return `https://csrestored.fun/maps/images/${mapId}.png`;
  }

  function queueLabel(type) {
    return QUEUE_TYPES[type] || type || '—';
  }

  function regionFromType(type) {
    if (!type) return REGION_INFO.eu;
    const suffix = type.split(':').pop();
    return REGION_INFO[suffix] || REGION_INFO.eu;
  }

  function formatTimer(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function myTeamIndex(match, userId) {
    if (!match?.members || !userId) return null;
    const uid = String(userId);
    if ((match.members[0] || []).map(String).includes(uid)) return 0;
    if ((match.members[1] || []).map(String).includes(uid)) return 1;
    return null;
  }

  function myTeamNumber(match, userId) {
    const idx = myTeamIndex(match, userId);
    return idx === 0 ? 1 : idx === 1 ? 2 : null;
  }

  function avgElo(teamIds, membersData) {
    if (!teamIds?.length) return 0;
    const sum = teamIds.reduce((acc, id) => acc + (membersData[id]?.points ?? 0), 0);
    return sum / teamIds.length;
  }

  async function loadUser() {
    try {
      const res = await window.api.auth.getUser();
      if (!res?.error && res?.user) state.user = res.user;
    } catch (_) { /* ignore */ }
  }

  function resetBanSelection(turnIndex) {
    if (state.lastTurnIndex !== turnIndex) {
      state.selectedBans = [];
      state.submittedTurn = null;
      state.lastTurnIndex = turnIndex;
    }
  }

  function toggleBan(mapId, maxBans) {
    const idx = state.selectedBans.indexOf(mapId);
    if (idx >= 0) {
      state.selectedBans.splice(idx, 1);
    } else if (state.selectedBans.length < maxBans) {
      state.selectedBans.push(mapId);
    } else if (maxBans > 0) {
      state.selectedBans = [...state.selectedBans.slice(1), mapId];
    }
  }

  async function submitBansIfNeeded(force) {
    const match = state.mm?.match;
    const userId = state.user?.id;
    if (!match?.map_pick || !userId || !window.api?.matchmaking) return;

    const teamNum = myTeamNumber(match, userId);
    const turnIndex = match.map_pick.turn_index ?? 0;
    const isOurTurn = match.map_pick.current_team === teamNum;
    if (!isOurTurn && !force) return;
    if (state.submittedTurn === turnIndex) return;

    state.submittedTurn = turnIndex;
    await window.api.matchmaking.submitBanVotes(state.selectedBans);
    state.selectedBans = [];
  }

  function renderPlayerCard(playerId, membersData) {
    const p = membersData[playerId];
    if (!p) return '';
    const country = p.country
      ? `<img class="live-match-flag" src="https://flagcdn.com/w40/${esc(p.country).toLowerCase()}.png" alt="">`
      : '';
    const kdr = p.deaths ? (p.kills / p.deaths).toFixed(2) : `${p.kills}.00`;
    const winrate = p.matches ? ((p.wins / p.matches) * 100).toFixed(2) : '0.00';
    const avg = p.matches ? (p.kills / p.matches).toFixed(2) : `${p.kills}.00`;

    return `
      <div class="live-player-card">
        <div class="live-player-side">
          <img class="live-player-avatar" src="${avatarUrl(playerId, p.avatar)}" alt="">
          <div class="live-player-mini-stat">
            <span>${esc(p.matches ?? 0)}</span>
            <small>${t('live_match_matches')}</small>
          </div>
        </div>
        <div class="live-player-main">
          <div class="live-player-top">
            <div>
              <div class="live-player-name-row">
                <span class="live-player-name">${esc(p.name || 'Player')}</span>
                ${country}
              </div>
              <span class="live-player-elo">${esc(p.points ?? 0)} ELO</span>
            </div>
            <img class="live-player-rank" src="${rankImageUrl(p.points)}" alt="">
          </div>
          <div class="live-player-stats">
            <div><span>${esc(p.wins ?? 0)}</span><small>${t('live_match_wins')}</small></div>
            <div><span>${winrate}%</span><small>${t('live_match_winrate')}</small></div>
            <div><span>${esc(p.kills ?? 0)}</span><small>${t('live_match_kills')}</small></div>
            <div><span>${kdr}</span><small>${t('live_match_kdr')}</small></div>
            <div><span>${avg}</span><small>${t('live_match_avg')}</small></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTeamColumn(teamIds, membersData, leaderId, label) {
    const elo = avgElo(teamIds, membersData).toFixed(0);
    return `
      <div class="live-match-team">
        <div class="live-match-team-head">
          <span class="live-match-team-name">${esc(label)}</span>
          <span class="live-match-team-elo">${tf('live_match_avg_elo', { elo })}</span>
        </div>
        <div class="live-match-players">
          ${teamIds.map((id) => renderPlayerCard(id, membersData)).join('')}
        </div>
      </div>
    `;
  }

  function renderMapBanList(match, teamNum) {
    const pick = match.map_pick || {};
    const remaining = pick.remaining_maps || {};
    const bannedMaps = pick.banned_maps || {};
    const isOurTurn = pick.current_team === teamNum;
    const maxBans = pick.turn_order?.[pick.turn_index] ?? 2;
    const votes = pick.votes?.[pick.current_team] || {};
    const bannedCount = Object.keys(bannedMaps).length;
    const remainingCount = Object.keys(remaining).length;
    const totalToBan = bannedCount + remainingCount - 1;
    const pickSec = state.mm?.matchPickSeconds ?? 20;
    const isFinalBan = remainingCount === 2 && maxBans === 1;

    let phaseTitle;
    if (isFinalBan) {
      phaseTitle = isOurTurn ? t('live_match_final_ban_yours') : t('live_match_final_ban_other');
    } else {
      phaseTitle = isOurTurn ? t('live_match_your_ban') : t('live_match_other_ban');
    }

    const bannedRows = Object.entries(bannedMaps).map(([mapId, mapInfo]) => `
      <div class="live-map-row banned" aria-hidden="true">
        <div class="live-map-row-left">
          <img src="${mapImageUrl(mapId)}" alt="" class="live-map-thumb">
          <span>${esc(mapInfo?.name || mapId)}</span>
        </div>
      </div>
    `).join('');

    const mapRows = Object.entries(remaining).map(([mapId, mapInfo]) => {
      const selected = state.selectedBans.includes(mapId);
      const voters = Object.entries(votes)
        .filter(([, maps]) => (maps || []).includes(mapId))
        .map(([uid]) => uid);
      const voterAvatars = voters.slice(0, 4).map((uid) => {
        const u = match.members_data?.[uid];
        if (!u) return '';
        return `<img class="live-vote-avatar" src="${avatarUrl(uid, u.avatar)}" alt="">`;
      }).join('');

      return `
        <button type="button"
          class="live-map-row${selected ? ' selected' : ''}${isOurTurn ? '' : ' disabled'}"
          data-map-id="${esc(mapId)}"
          ${isOurTurn ? '' : 'disabled'}>
          <div class="live-map-row-left">
            <img src="${mapImageUrl(mapId)}" alt="" class="live-map-thumb">
            <span>${esc(mapInfo?.name || mapId)}</span>
            <span class="live-map-votes">${voterAvatars}</span>
          </div>
          ${selected ? '<span class="live-map-selected-bar"></span>' : ''}
        </button>
      `;
    }).join('');

    return `
      <div class="live-match-center">
        <p class="live-match-phase-title">${phaseTitle}</p>
        <p class="live-match-mode">${tf('live_match_mode', { mode: queueLabel(match.type) })}</p>
        <p class="live-match-ban-meta">${tf('live_match_bans_meta', {
          banned: bannedCount,
          total: Math.max(totalToBan, 0),
          turn: maxBans
        })}</p>
        <p class="live-match-timer">00:${String(pickSec).padStart(2, '0')}</p>
        <div class="live-map-list">${bannedRows}${mapRows}</div>
      </div>
    `;
  }

  function renderConnectPhase(match) {
    const region = regionFromType(match.type);
    const connectSec = state.mm?.connectSeconds ?? 300;
    const ip = match.server_ip;
    const showIp = state.serverIpVisible ? ip : t('live_match_ip_hidden');

    return `
      <div class="live-match-center live-match-connect">
        <p class="live-match-phase-title">${t('live_match_connect_title')}</p>
        <p class="live-match-mode">${tf('live_match_mode', { mode: queueLabel(match.type) })}</p>
        <p class="live-match-timer">${formatTimer(connectSec)}</p>
        <p class="live-connect-label">${t('live_match_console')}</p>
        <div class="live-connect-ip-row">
          <button type="button" class="live-connect-ip" id="live-toggle-ip">${esc(showIp)}</button>
          <button type="button" class="live-connect-copy" id="live-copy-ip" title="${t('live_match_copy')}">
            <i class="fa-regular fa-copy"></i>
          </button>
        </div>
        <a class="btn-play live-steam-btn" href="steam://connect/${esc(ip || '')}">${t('live_match_steam')}</a>
        <p class="live-connect-label">${t('live_match_map')}</p>
        <div class="live-connect-map-row">
          <img src="${mapImageUrl(match.final_map?.id || '')}" alt="">
          <span>${esc(match.final_map?.name || '—')}</span>
        </div>
        <p class="live-connect-label">${t('live_match_server')}</p>
        <div class="live-connect-map-row">
          <img src="${region.flag}" alt="">
          <span>${esc(region.label)}</span>
        </div>
      </div>
    `;
  }

  function renderPreparingPhase(match) {
    const region = regionFromType(match.type);
    return `
      <div class="live-match-center live-match-connect">
        <p class="live-match-phase-title">${t('live_match_preparing')}</p>
        <p class="live-match-sub">${t('live_match_preparing_hint')}</p>
        <p class="live-connect-label">${t('live_match_console')}</p>
        <div class="live-connect-ip-row">
          <span class="live-connect-ip muted">${t('live_match_preparing_status')}</span>
        </div>
        <button type="button" class="btn-play live-steam-btn disabled" disabled>${t('live_match_steam')}</button>
        <p class="live-connect-label">${t('live_match_map')}</p>
        <div class="live-connect-map-row">
          <img src="${mapImageUrl(match.final_map?.id || '')}" alt="">
          <span>${esc(match.final_map?.name || '—')}</span>
        </div>
        <p class="live-connect-label">${t('live_match_server')}</p>
        <div class="live-connect-map-row">
          <img src="${region.flag}" alt="">
          <span>${esc(region.label)}</span>
        </div>
      </div>
    `;
  }

  function renderLiveMatch() {
    const root = el('live-match-root');
    if (!root) return;

    const match = state.mm?.match;
    if (!match?.id || !state.user) {
      root.innerHTML = `<p class="live-match-empty">${t('live_match_none')}</p>`;
      return;
    }

    const membersData = match.members_data || {};
    const team0 = match.members?.[0] || [];
    const team1 = match.members?.[1] || [];
    const leader0 = team0[0];
    const leader1 = team1[0];
    const teamNum = myTeamNumber(match, state.user.id);
    const phase = match.phase;

    if (phase === 'pickban') {
      resetBanSelection(match.map_pick?.turn_index ?? 0);
    }

    const teamLeft = renderTeamColumn(
      team0,
      membersData,
      leader0,
      leader0 && membersData[leader0] ? `team_${membersData[leader0].name}` : 'Team 1'
    );
    const teamRight = renderTeamColumn(
      team1,
      membersData,
      leader1,
      leader1 && membersData[leader1] ? `team_${membersData[leader1].name}` : 'Team 2'
    );

    let center = '';
    if (phase === 'connect') {
      center = renderConnectPhase(match);
    } else if (phase === 'preparing') {
      center = renderPreparingPhase(match);
    } else {
      center = renderMapBanList(match, teamNum);
    }

    root.innerHTML = `
      <div class="live-match-layout">
        ${teamLeft}
        ${center}
        ${teamRight}
      </div>
    `;

    root.querySelectorAll('.live-map-row:not(.disabled)').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mapId = btn.dataset.mapId;
        const maxBans = match.map_pick?.turn_order?.[match.map_pick?.turn_index] ?? 1;
        toggleBan(mapId, maxBans);
        if (state.selectedBans.length >= maxBans && maxBans > 0) {
          await submitBansIfNeeded(true);
        }
        renderLiveMatch();
      });
    });

    const toggleIp = el('live-toggle-ip');
    if (toggleIp) {
      toggleIp.addEventListener('click', () => {
        state.serverIpVisible = !state.serverIpVisible;
        renderLiveMatch();
      });
    }

    const copyBtn = el('live-copy-ip');
    if (copyBtn && match.server_ip) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(`connect ${match.server_ip}`);
      });
    }
  }

  function renderAcceptModal() {
    const modal = el('mm-accept-modal');
    const body = el('mm-accept-body');
    if (!modal || !body) return;

    const match = state.mm?.match;
    const show = !!(state.mm?.showAcceptModal ?? state.mm?.pendingAccept) && !!match?.id;

    if (!show) {
      modal.classList.remove('is-open');
      if (!match?.id) stopAcceptTimer();
      return;
    }

    if (state.acceptMatchId !== match.id) {
      state.acceptMatchId = match.id;
      stopAcceptTimer();
    }
    if (!state.acceptTimer) startAcceptTimer();

    modal.classList.add('is-open');
    const membersData = match.members_data || {};
    const active = (match.active || []).map(String);
    const allIds = (match.members || []).flat();
    const accepted = !!match.inChannel;

    body.innerHTML = `
      <p class="mm-accept-title">${t('live_match_found')}</p>
      <p class="mm-accept-sub">${tf('live_match_confirm', { mode: queueLabel(match.type) })}</p>
      <p class="mm-accept-timer">00:${String(state.acceptSeconds).padStart(2, '0')}</p>
      <div class="mm-accept-avatars">
        ${allIds.map((id) => {
          const u = membersData[id];
          const isActive = active.includes(String(id));
          return `<img class="mm-accept-avatar${isActive ? '' : ' pending'}" src="${avatarUrl(id, u?.avatar)}" alt="">`;
        }).join('')}
      </div>
      <button type="button" class="btn-play mm-accept-btn${accepted ? ' accepted' : ''}" id="mm-accept-btn" ${accepted ? 'disabled' : ''}>
        ${accepted ? t('live_match_accepted') : t('live_match_accept')}
      </button>
    `;

    const btn = el('mm-accept-btn');
    if (btn && !accepted) {
      btn.onclick = async () => {
        btn.disabled = true;
        await window.api.matchmaking.joinMatch(match.id);
      };
    }
  }

  function stopAcceptTimer() {
    if (state.acceptTimer) clearInterval(state.acceptTimer);
    state.acceptTimer = null;
    state.acceptSeconds = 30;
  }

  function startAcceptTimer() {
    stopAcceptTimer();
    state.acceptSeconds = 30;
    state.acceptTimer = setInterval(() => {
      if (state.acceptSeconds <= 1) {
        state.acceptSeconds = 0;
        stopAcceptTimer();
        closeAcceptModal();
      } else {
        state.acceptSeconds -= 1;
        renderAcceptModal();
      }
    }, 1000);
  }

  function closeAcceptModal() {
    const modal = el('mm-accept-modal');
    if (modal) modal.classList.remove('is-open');
    stopAcceptTimer();
  }

  function maybeNavigateToMatch(mm) {
    const match = mm?.match;
    if (!match?.id) return;
    const phase = match.phase;
    if (phase !== 'pickban' && phase !== 'preparing' && phase !== 'connect') return;
    if (window.CSRApp?.navigateToPage) {
      window.CSRApp.navigateToPage('live-match');
    }
  }

  async function handleUpdate(data) {
    state.mm = data;

    if (data.matchCancelled) {
      closeAcceptModal();
      state.selectedBans = [];
      if (state.active) renderLiveMatch();
      if (window.CSRApp?.navigateToPage) window.CSRApp.navigateToPage('matchmaking');
      return;
    }

    if (data.showAcceptModal || data.pendingAccept) {
      renderAcceptModal();
    } else {
      closeAcceptModal();
    }

    if (data.mapPickStarted || data.match?.phase === 'pickban' || data.match?.phase === 'preparing' || data.match?.phase === 'connect') {
      maybeNavigateToMatch(data);
    }

    if (data.pickTimerExpired) {
      await submitBansIfNeeded(true);
    }

    if (state.active) renderLiveMatch();
  }

  async function start() {
    state.active = true;
    state.serverIpVisible = false;
    await loadUser();
    const snap = await window.api.matchmaking.getState();
    state.mm = snap;
    renderLiveMatch();
    renderAcceptModal();
  }

  function stop() {
    state.active = false;
  }

  function setup() {
    const backBtn = el('btn-live-match-back');
    if (backBtn && !backBtn.dataset.bound) {
      backBtn.dataset.bound = '1';
      backBtn.addEventListener('click', () => {
        if (window.CSRApp?.navigateToPage) window.CSRApp.navigateToPage('matchmaking');
      });
    }

    const modal = el('mm-accept-modal');
    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = '1';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAcceptModal();
      });
    }
  }

  window.CSRMatch = { setup, start, stop, handleUpdate, renderAcceptModal, closeAcceptModal };
})();
