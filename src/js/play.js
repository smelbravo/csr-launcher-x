/* Leaderboard, match history & match detail (CS:R Play stats) */

let _leaderboardLoaded = false;
let _leaderboardHasMore = false;
let _leaderboardNextPage = 0;
let _leaderboardLoading = false;
let _leaderboardRemotePlayer = null;
let _leaderboardRemoteLookupId = '';
let _leaderboardPlayers = [];
let _historyLoaded = false;
let _historyMatches = [];
let _currentUserId = null;
let _matchReturnProfileId = null;

async function getCurrentUserId() {
  if (_currentUserId) return _currentUserId;
  try {
    const result = await window.api.auth.getUser();
    if (!result.error && result.user?.id) {
      _currentUserId = String(result.user.id);
    }
  } catch (e) { /* ignore */ }
  return _currentUserId;
}

function playT(key) {
  return (typeof window._playTranslate === 'function' ? window._playTranslate(key) : key);
}

function playTf(key, params) {
  let str = playT(key);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, v);
    });
  }
  return str;
}

function esc(text) {
  const d = document.createElement('div');
  d.textContent = text == null ? '' : String(text);
  return d.innerHTML;
}

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatMapName(raw) {
  if (!raw) return playT('stats_map_unknown');
  const s = String(raw).replace(/^de_/i, '').replace(/_/g, ' ');
  if (/^dust2$/i.test(s.replace(/\s/g, ''))) return 'Dust 2';
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function mapKey(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase();
  if (s.startsWith('de_')) return s;
  return 'de_' + s.replace(/\s+/g, '').replace('dust2', 'dust2');
}

function mapIconUrl(raw) {
  const key = mapKey(raw);
  if (!key) return '';
  return `https://cdn.csrestored.fun/maps/${key}.png`;
}

function formatMatchDate(raw) {
  if (raw == null) return '—';
  let d;
  if (typeof raw === 'number') {
    d = new Date(raw < 1e12 ? raw * 1000 : raw);
  } else {
    d = new Date(raw);
  }
  if (Number.isNaN(d.getTime())) return String(raw);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} ${time}`;
}

function avatarUrl(user) {
  if (!user) return '';
  if (user.avatar_url) return user.avatar_url;
  if (user.avatar && user.id) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  if (user.discord_id && user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png`;
  }
  return '';
}

function normalizeLeaderboardPlayer(p, index) {
  const id = p.id ?? p.discord_id ?? p.user_id;
  const avatarHash = p.avatar;
  return {
    id: id != null ? String(id) : '',
    rank: p.rank ?? p.position ?? index + 1,
    name: p.name ?? p.username ?? p.nickname ?? p.display_name ?? '—',
    avatar: avatarUrl(p) || (avatarHash && id ? `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.png` : ''),
    matches: num(p.matches ?? p.games ?? p.games_played ?? p.match_count),
    wins: num(p.wins ?? p.win_count),
    elo: num(p.points ?? p.elo ?? p.rating ?? p.elo_rating ?? p.score)
  };
}

function csrPlayerStats(m, userId) {
  if (!m?.players || !userId) return null;
  return m.players[userId] ?? m.players[String(userId)] ?? null;
}

function csrScoresForUser(m, player) {
  if (!m?.score) return null;
  const parts = String(m.score).split(/\s+/).map(s => parseInt(s.trim(), 10));
  if (parts.length < 2 || !parts.every(n => Number.isFinite(n))) return null;
  if (player?.team && m.teams) {
    const teamParts = String(m.teams).split(/\s+/);
    if (teamParts[0] && teamParts[0] !== player.team) return [parts[1], parts[0]];
  }
  return parts;
}

function normalizeCsrMatchPlayer(p, id) {
  const kills = num(p.kills ?? p.k);
  const deaths = num(p.deaths ?? p.d, 0);
  const assists = num(p.assists ?? p.a);
  const avatarHash = p.avatar;
  return {
    id: id != null ? String(id) : '',
    name: p.name ?? p.username ?? p.nickname ?? '—',
    avatar: avatarUrl(p) || (avatarHash && id ? `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.png` : ''),
    kills,
    deaths,
    assists,
    kdr: p.kdr ?? p.kd ?? (deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2)),
    score: num(p.score ?? p.points),
    mvps: num(p.mvps ?? p.mvp ?? p.mvp_count)
  };
}

function parseScoreParts(m) {
  if (m.score_text) {
    const parts = String(m.score_text).split(/[:\\-]/).map(s => parseInt(s.trim(), 10));
    if (parts.length >= 2 && parts.every(n => Number.isFinite(n))) return parts;
  }
  if (m.score && typeof m.score === 'string' && m.score.includes(':')) {
    const parts = m.score.split(':').map(s => parseInt(s.trim(), 10));
    if (parts.length >= 2) return parts;
  }
  const a = m.my_score ?? m.team_score ?? m.score_self ?? m.score_us;
  const b = m.enemy_score ?? m.opponent_score ?? m.score_them ?? m.score_enemy;
  if (a != null && b != null) return [num(a), num(b)];
  if (m.team1_score != null && m.team2_score != null) return [num(m.team1_score), num(m.team2_score)];
  return null;
}

function normalizeHistoryMatch(m, index, userId) {
  const self = csrPlayerStats(m, userId);
  const scores = csrScoresForUser(m, self) || parseScoreParts(m);
  const kills = num(self?.kills ?? m.kills ?? m.k);
  const deaths = num(self?.deaths ?? m.deaths ?? m.d, 0);
  const assists = num(self?.assists ?? m.assists ?? m.a);
  const kdr = self && self.deaths != null
    ? (num(self.deaths) > 0 ? (num(self.kills) / num(self.deaths)).toFixed(2) : `${num(self.kills)}.00`)
    : (m.kdr ?? m.kd ?? (deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2)));
  let won = m.won ?? m.win;
  if (won == null && scores) won = scores[0] > scores[1];
  if (won == null && m.result != null) won = /win/i.test(String(m.result));

  const mapRaw = m.map ?? m.map_name ?? m.mapName ?? m.map_id ?? '';
  const id = m.id ?? m.match_id ?? m.matchId ?? index;
  const playerCount = m.players ? Object.keys(m.players).length : 0;

  return {
    id,
    date: m.date ? `${m.date}Z` : (m.created_at ?? m.timestamp ?? m.played_at),
    won: !!won,
    scores,
    scoreText: scores ? `${scores[0]} : ${scores[1]}` : (m.score ?? '—'),
    kills,
    deaths,
    assists,
    kdr: typeof kdr === 'number' ? kdr.toFixed(2) : kdr,
    mapRaw,
    mapName: formatMapName(mapRaw),
    mode: m.mode ?? m.game_mode ?? (playerCount === 4 ? '2v2' : '5v5'),
    demoUrl: m.demo ? `https://demos.csrestored.fun/${m.demo}.dem.bz2` : (m.demo_url ?? m.demo_link ?? null),
    team1Name: m.teams ? String(m.teams).split(/\s+/)[0] : (m.team1_name ?? m.team_a ?? m.team1 ?? null),
    team2Name: m.teams ? String(m.teams).split(/\s+/)[1] : (m.team2_name ?? m.team_b ?? m.team2 ?? null),
    raw: m
  };
}

function normalizeMatchPlayer(p) {
  const kills = num(p.kills ?? p.k);
  const deaths = num(p.deaths ?? p.d, 0);
  const assists = num(p.assists ?? p.a);
  return {
    name: p.username ?? p.name ?? p.nickname ?? '—',
    avatar: avatarUrl(p),
    kills,
    deaths,
    assists,
    kdr: p.kdr ?? p.kd ?? (deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2)),
    score: num(p.score ?? p.points),
    mvps: num(p.mvps ?? p.mvp ?? p.mvp_count)
  };
}

function extractTeamsFromDetail(data) {
  if (data?.players && data?.teams) {
    const teamNames = String(data.teams).split(/\s+/);
    if (teamNames.length >= 2) {
      const scores = String(data.score || '').split(/\s+/).map(n => parseInt(n, 10));
      const entries = Object.entries(data.players);
      return teamNames.slice(0, 2).map((name, i) => ({
        name,
        score: Number.isFinite(scores[i]) ? scores[i] : 0,
        players: entries
          .filter(([, p]) => p.team === name)
          .map(([id, p]) => normalizeCsrMatchPlayer(p, id))
          .sort((a, b) => b.score - a.score)
      }));
    }
  }

  if (data.teams && Array.isArray(data.teams) && data.teams.length >= 2) {
    return data.teams.map((t, i) => ({
      name: t.name ?? t.team_name ?? `team_${i + 1}`,
      score: num(t.score ?? t.rounds_won ?? t.rounds),
      players: (t.players ?? t.members ?? []).map(normalizeMatchPlayer)
    }));
  }

  const team1Players = data.team1_players ?? data.team_a_players ?? data.players_team1 ?? data.team1?.players;
  const team2Players = data.team2_players ?? data.team_b_players ?? data.players_team2 ?? data.team2?.players;

  if (team1Players || team2Players) {
    const scores = parseScoreParts(data) || [0, 0];
    return [
      {
        name: data.team1_name ?? data.team_a ?? data.team1 ?? 'Team 1',
        score: scores[0],
        players: (team1Players || []).map(normalizeMatchPlayer)
      },
      {
        name: data.team2_name ?? data.team_b ?? data.team2 ?? 'Team 2',
        score: scores[1],
        players: (team2Players || []).map(normalizeMatchPlayer)
      }
    ];
  }

  if (Array.isArray(data.players)) {
    const scores = parseScoreParts(data) || [0, 0];
    const mid = Math.ceil(data.players.length / 2);
    return [
      { name: data.team1_name ?? 'Team 1', score: scores[0], players: data.players.slice(0, mid).map(normalizeMatchPlayer) },
      { name: data.team2_name ?? 'Team 2', score: scores[1], players: data.players.slice(mid).map(normalizeMatchPlayer) }
    ];
  }

  return null;
}

function normalizeMatchDetail(data, fallback) {
  const base = fallback || normalizeHistoryMatch(data, 0, _currentUserId);
  const teams = extractTeamsFromDetail(data);
  const scores = csrScoresForUser(data, csrPlayerStats(data, _currentUserId))
    || parseScoreParts(data)
    || base.scores
    || [0, 0];
  const mapRaw = data.map ?? data.map_name ?? base.mapRaw;
  const teamNames = data.teams ? String(data.teams).split(/\s+/) : [];

  return {
    id: data.id ?? data.match_id ?? base.id,
    date: data.date ? `${data.date}Z` : (data.created_at ?? data.timestamp ?? base.date),
    mapRaw,
    mapName: formatMapName(mapRaw),
    demoUrl: data.demo ? `https://demos.csrestored.fun/${data.demo}.dem.bz2` : (data.demo_url ?? data.demo_link ?? base.demoUrl),
    team1Name: teams?.[0]?.name ?? teamNames[0] ?? data.team1_name ?? base.team1Name ?? 'Team 1',
    team2Name: teams?.[1]?.name ?? teamNames[1] ?? data.team2_name ?? base.team2Name ?? 'Team 2',
    scores,
    teams: teams || [
      { name: base.team1Name || 'Team 1', score: scores[0], players: [] },
      { name: base.team2Name || 'Team 2', score: scores[1], players: [] }
    ]
  };
}

function setLoading(elId, show) {
  const el = document.getElementById(elId);
  if (el) el.style.display = show ? 'flex' : 'none';
}

function updateLeaderboardLoadMore() {
  const btn = document.getElementById('btn-leaderboard-load-more');
  if (!btn) return;
  btn.style.display = _leaderboardHasMore ? '' : 'none';
  btn.disabled = _leaderboardLoading;
}

function getLeaderboardSearchQuery() {
  return (document.getElementById('leaderboard-search')?.value || '').trim().toLowerCase();
}

function filterLeaderboardPlayers(players, query) {
  if (!query) return players;
  return players.filter(p => {
    const name = String(p.name).toLowerCase();
    const id = String(p.id || '').toLowerCase();
    return name.includes(query) || id.includes(query);
  });
}

function updateLeaderboardSearchClear() {
  const input = document.getElementById('leaderboard-search');
  const btn = document.getElementById('leaderboard-search-clear');
  if (!btn) return;
  btn.hidden = !(input?.value || '').trim();
}

function updateLeaderboardCount(visible, total, query) {
  const el = document.getElementById('leaderboard-count');
  if (!el) return;
  if (query) {
    el.textContent = playTf('stats_leaderboard_count_filtered', { shown: visible, total });
  } else {
    el.textContent = playTf('stats_leaderboard_count', { count: total });
  }
}

function isExactUserIdQuery(q) {
  return /^\d{17,21}$/.test(String(q || '').trim());
}

function renderLeaderboardTable() {
  const body = document.getElementById('leaderboard-body');
  if (!body) return;

  const query = getLeaderboardSearchQuery();
  let filtered = filterLeaderboardPlayers(_leaderboardPlayers, query);

  if (!query && _leaderboardRemotePlayer) {
    _leaderboardRemotePlayer = null;
    _leaderboardRemoteLookupId = '';
  }

  if (query && !filtered.length && isExactUserIdQuery(query)) {
    const id = query.trim();
    if (_leaderboardRemotePlayer && _leaderboardRemoteLookupId === id) {
      filtered = [_leaderboardRemotePlayer];
    } else if (_leaderboardRemoteLookupId !== id) {
      _leaderboardRemoteLookupId = id;
      _leaderboardRemotePlayer = null;
      body.innerHTML = `<tr><td colspan="5" class="stats-empty">${esc(playT('stats_loading'))}</td></tr>`;
      window.api.csr.getUserById(id).then((res) => {
        if (getLeaderboardSearchQuery() !== id) return;
        if (res?.user && !res.error) {
          _leaderboardRemotePlayer = normalizeLeaderboardPlayer({
            ...res.user,
            id,
            rank: '★'
          }, 0);
          renderLeaderboardTable();
        } else {
          body.innerHTML = `<tr><td colspan="5" class="stats-empty">${esc(playT('stats_leaderboard_no_results'))}</td></tr>`;
          updateLeaderboardCount(0, _leaderboardPlayers.length, query);
        }
      });
      return;
    }
  }

  if (!_leaderboardPlayers.length && !filtered.length) return;

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="5" class="stats-empty">${esc(playT('stats_leaderboard_no_results'))}</td></tr>`;
  } else {
    body.innerHTML = filtered.map(buildLeaderboardRow).join('');
  }

  updateLeaderboardCount(filtered.length, _leaderboardPlayers.length, query);
  updateLeaderboardSearchClear();
  updateLeaderboardLoadMore();
}

function clearLeaderboardSearch() {
  const input = document.getElementById('leaderboard-search');
  if (!input) return;
  input.value = '';
  updateLeaderboardSearchClear();
  renderLeaderboardTable();
}

function buildLeaderboardRow(p) {
  const userId = p.id ? esc(String(p.id)) : '';
  const clickAttr = userId ? ` class="stats-row-clickable" data-user-id="${userId}"` : '';
  return `
    <tr${clickAttr}>
      <td class="stats-rank">${esc(p.rank)}</td>
      <td class="stats-user">
        ${p.avatar ? `<img class="stats-avatar" src="${esc(p.avatar)}" alt="">` : '<span class="stats-avatar stats-avatar-fallback"><i class="fa-solid fa-user"></i></span>'}
        <span>${esc(p.name)}</span>
      </td>
      <td>${esc(p.matches)}</td>
      <td>${esc(p.wins)}</td>
      <td class="stats-elo">${esc(p.elo)} ELO</td>
    </tr>
  `;
}

function appendLeaderboardRows(players, startIndex) {
  if (!players?.length) return;
  const rows = players.map((p, i) => normalizeLeaderboardPlayer(p, startIndex + i));
  _leaderboardPlayers.push(...rows);
  renderLeaderboardTable();
}

async function fetchLeaderboardPage(page, append) {
  const body = document.getElementById('leaderboard-body');
  if (!body || _leaderboardLoading) return;

  _leaderboardLoading = true;
  updateLeaderboardLoadMore();

  if (!append) {
    setLoading('leaderboard-loading', true);
    body.innerHTML = '';
    _leaderboardPlayers = [];
    updateLeaderboardCount(0, 0, '');
  }

  try {
    const result = await window.api.csr.getLeaderboard(page);

    if (!append) setLoading('leaderboard-loading', false);

    if (result.error) {
      if (!append) {
        body.innerHTML = `<tr><td colspan="5" class="stats-empty">${esc(playT('stats_leaderboard_empty'))}</td></tr>`;
        updateLeaderboardCount(0, 0, getLeaderboardSearchQuery());
      }
      _leaderboardHasMore = false;
      return;
    }

    const batch = result.players || [];
    if (!batch.length && !append) {
      body.innerHTML = `<tr><td colspan="5" class="stats-empty">${esc(playT('stats_leaderboard_empty'))}</td></tr>`;
      updateLeaderboardCount(0, 0, getLeaderboardSearchQuery());
      _leaderboardHasMore = false;
      return;
    }

    const startIndex = _leaderboardPlayers.length;
    appendLeaderboardRows(batch, startIndex);

    _leaderboardHasMore = result.hasMore ?? false;
    _leaderboardNextPage = page + 1;
    _leaderboardLoaded = true;
  } catch (e) {
    if (!append) {
      setLoading('leaderboard-loading', false);
      body.innerHTML = `<tr><td colspan="5" class="stats-empty">${esc(e.message)}</td></tr>`;
    }
    _leaderboardHasMore = false;
  } finally {
    _leaderboardLoading = false;
    updateLeaderboardLoadMore();
  }
}

async function loadLeaderboard(force) {
  if (_leaderboardLoaded && !force) return;
  if (force) {
    _leaderboardHasMore = false;
    _leaderboardNextPage = 0;
    _leaderboardLoaded = false;
    _leaderboardPlayers = [];
    clearLeaderboardSearch();
  }
  await fetchLeaderboardPage(0, false);
}

async function loadMoreLeaderboard() {
  if (!_leaderboardHasMore || _leaderboardLoading) return;
  await fetchLeaderboardPage(_leaderboardNextPage, true);
}

async function loadHistory(force) {
  if (_historyLoaded && !force) return;
  const list = document.getElementById('history-list');
  if (!list) return;

  setLoading('history-loading', true);
  list.innerHTML = '';

  try {
    const userId = await getCurrentUserId();
    const result = await window.api.csr.getHistory();
    setLoading('history-loading', false);

    if (result.unauthorized) {
      list.innerHTML = `<div class="stats-empty-block"><i class="fa-solid fa-clock-rotate-left"></i><p>${esc(playT('stats_history_empty'))}</p></div>`;
      return;
    }

    if (result.error || !result.matches?.length) {
      list.innerHTML = `<div class="stats-empty-block"><i class="fa-solid fa-clock-rotate-left"></i><p>${esc(playT('stats_history_empty'))}</p></div>`;
      return;
    }

    _historyMatches = result.matches
      .filter(m => !userId || csrPlayerStats(m, userId))
      .map((m, i) => normalizeHistoryMatch(m, i, userId));

    if (!_historyMatches.length) {
      list.innerHTML = `<div class="stats-empty-block"><i class="fa-solid fa-clock-rotate-left"></i><p>${esc(playT('stats_history_empty'))}</p></div>`;
      return;
    }

    list.innerHTML = _historyMatches.map(m => renderHistoryRow(m)).join('');
    list.querySelectorAll('.history-row').forEach(row => {
      row.addEventListener('click', () => openMatchDetail(row.dataset.matchId));
    });

    _historyLoaded = true;
  } catch (e) {
    setLoading('history-loading', false);
    list.innerHTML = `<div class="stats-empty-block"><p>${esc(e.message)}</p></div>`;
  }
}

function renderHistoryRow(m) {
  const icon = mapIconUrl(m.mapRaw);
  return `
    <button type="button" class="history-row ${m.won ? 'history-win' : 'history-loss'}" data-match-id="${esc(m.id)}">
      <div class="history-date">${esc(formatMatchDate(m.date))}</div>
      <div class="history-score">
        <span class="history-badge ${m.won ? 'badge-win' : 'badge-loss'}">${m.won ? 'W' : 'L'}</span>
        <span>${esc(m.scoreText)}</span>
      </div>
      <div class="history-kda">${esc(m.kills)} / ${esc(m.deaths)} / ${esc(m.assists)}</div>
      <div class="history-kdr">${esc(m.kdr)}</div>
      <div class="history-map">
        ${icon ? `<img src="${esc(icon)}" alt="" onerror="this.style.display='none'">` : '<i class="fa-solid fa-map"></i>'}
        <div>
          <div class="history-map-name">${esc(m.mapName)}</div>
          <div class="history-map-mode">${esc(m.mode)}</div>
        </div>
      </div>
    </button>
  `;
}

function updateMatchBackButton() {
  const span = document.querySelector('#btn-match-back span');
  if (!span) return;
  span.textContent = _matchReturnProfileId
    ? playT('stats_back_profile')
    : playT('stats_back_history');
}

async function openMatchDetail(matchId, returnProfileId = null) {
  _matchReturnProfileId = returnProfileId ? String(returnProfileId) : null;
  updateMatchBackButton();

  const fallback = _historyMatches.find(m => String(m.id) === String(matchId)) || null;

  showMatchDetailPage(true, _matchReturnProfileId ? null : 'history');
  const content = document.getElementById('match-detail-content');
  if (!content) return;
  content.innerHTML = `<div class="stats-loading-inline"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

  let detail = fallback;
  try {
    const result = await window.api.csr.getMatch(matchId);
    if (!result.error && result.match) {
      detail = normalizeMatchDetail(result.match, fallback);
    } else if (fallback) {
      detail = normalizeMatchDetail(fallback.raw || fallback, fallback);
    }
  } catch (e) {
    if (fallback) detail = normalizeMatchDetail(fallback.raw || fallback, fallback);
  }

  if (!detail) {
    content.innerHTML = `<div class="stats-empty-block"><p>${esc(playT('stats_match_error'))}</p></div>`;
    return;
  }

  renderMatchDetail(detail);
}

function renderMatchDetail(detail) {
  const content = document.getElementById('match-detail-content');
  if (!content) return;

  const demoBtn = detail.demoUrl
    ? `<button type="button" class="btn-secondary" id="btn-download-demo"><i class="fa-solid fa-download"></i> ${esc(playT('stats_download_demo'))}</button>`
    : '';

  content.innerHTML = `
    <div class="match-detail-header">
      <div>
        <h2 class="match-detail-title">${esc(detail.team1Name)} <span class="match-vs">vs</span> ${esc(detail.team2Name)}</h2>
        <p class="match-detail-meta">${esc(formatMatchDate(detail.date))} · ${esc(detail.mapName)} (${esc(detail.mapRaw || '')})</p>
      </div>
      ${demoBtn}
    </div>
    <div class="match-teams">
      ${detail.teams.map((team, i) => renderTeamBlock(team, i)).join('')}
    </div>
  `;

  const demo = document.getElementById('btn-download-demo');
  if (demo && detail.demoUrl) {
    demo.addEventListener('click', () => {
      window.api.csr.openExternal(detail.demoUrl);
    });
  }

  content.querySelectorAll('tr[data-user-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const uid = row.dataset.userId;
      if (uid && window.CSRApp?.openProfile) {
        CSRApp.openProfile(uid, 'history');
      }
    });
  });
}

function renderTeamBlock(team, index) {
  const accent = index === 0 ? 'team-accent-a' : 'team-accent-b';
  return `
    <div class="match-team-card ${accent}">
      <div class="match-team-head">
        <span class="match-team-name">${esc(team.name)}</span>
        <span class="match-team-score">${esc(team.score)}</span>
      </div>
      <table class="stats-table match-player-table">
        <thead>
          <tr>
            <th>${esc(playT('stats_col_username'))}</th>
            <th>${esc(playT('stats_col_kda'))}</th>
            <th>${esc(playT('stats_col_kdr'))}</th>
            <th>${esc(playT('stats_col_score'))}</th>
            <th>${esc(playT('stats_col_mvps'))}</th>
          </tr>
        </thead>
        <tbody>
          ${team.players.length ? team.players.map(p => `
            <tr${p.id ? ` class="stats-row-clickable" data-user-id="${esc(String(p.id))}"` : ''}>
              <td class="stats-user">
                ${p.avatar ? `<img class="stats-avatar" src="${esc(p.avatar)}" alt="">` : ''}
                <span>${esc(p.name)}</span>
              </td>
              <td>${esc(p.kills)} / ${esc(p.deaths)} / ${esc(p.assists)}</td>
              <td>${esc(p.kdr)}</td>
              <td>${esc(p.score)}</td>
              <td>${p.mvps ? `<i class="fa-solid fa-star stats-mvp"></i> ${esc(p.mvps)}` : '—'}</td>
            </tr>
          `).join('') : `<tr><td colspan="5" class="stats-empty">${esc(playT('stats_no_player_data'))}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function showMatchDetailPage(show, highlightNav = 'history') {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-match-detail');
  if (page) page.classList.toggle('active', show);
  if (show) {
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', !!highlightNav && n.dataset.page === highlightNav);
    });
  }
}

function setupPlayStats() {
  const refreshLb = document.getElementById('btn-refresh-leaderboard');
  const loadMoreLb = document.getElementById('btn-leaderboard-load-more');
  const searchLb = document.getElementById('leaderboard-search');
  const clearSearchLb = document.getElementById('leaderboard-search-clear');
  const refreshHist = document.getElementById('btn-refresh-history');
  const backBtn = document.getElementById('btn-match-back');

  if (refreshLb && !refreshLb.dataset.bound) {
    refreshLb.dataset.bound = '1';
    refreshLb.addEventListener('click', () => loadLeaderboard(true));
  }
  if (loadMoreLb && !loadMoreLb.dataset.bound) {
    loadMoreLb.dataset.bound = '1';
    loadMoreLb.addEventListener('click', () => loadMoreLeaderboard());
  }
  if (searchLb && !searchLb.dataset.bound) {
    searchLb.dataset.bound = '1';
    searchLb.addEventListener('input', () => renderLeaderboardTable());
  }
  if (clearSearchLb && !clearSearchLb.dataset.bound) {
    clearSearchLb.dataset.bound = '1';
    clearSearchLb.addEventListener('click', () => clearLeaderboardSearch());
  }
  const lbBody = document.getElementById('leaderboard-body');
  if (lbBody && !lbBody.dataset.profileBound) {
    lbBody.dataset.profileBound = '1';
    lbBody.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-user-id]');
      if (!row) return;
      const uid = row.dataset.userId;
      if (uid && window.CSRApp?.openProfile) {
        CSRApp.openProfile(uid, 'leaderboard');
      }
    });
  }
  if (refreshHist && !refreshHist.dataset.bound) {
    refreshHist.dataset.bound = '1';
    refreshHist.addEventListener('click', () => loadHistory(true));
  }
  if (backBtn && !backBtn.dataset.bound) {
    backBtn.dataset.bound = '1';
    backBtn.addEventListener('click', () => {
      const profileId = _matchReturnProfileId;
      _matchReturnProfileId = null;
      updateMatchBackButton();
      if (profileId && window.CSRApp?.openProfile) {
        const backPage = window.CSRApp.getNavBackPage?.() || 'leaderboard';
        CSRApp.openProfile(profileId, backPage);
        return;
      }
      navigateToPage('history');
      if (window.CSRPlayStats) CSRPlayStats.loadHistory();
    });
  }
}

window.CSRPlayStats = {
  setup: setupPlayStats,
  loadLeaderboard,
  loadHistory,
  openMatch: openMatchDetail,
  invalidate: () => {
    _leaderboardLoaded = false;
    _leaderboardHasMore = false;
    _leaderboardNextPage = 0;
    _leaderboardLoading = false;
    _leaderboardPlayers = [];
    _leaderboardRemotePlayer = null;
    _leaderboardRemoteLookupId = '';
    clearLeaderboardSearch();
    updateLeaderboardLoadMore();
    _historyLoaded = false;
    _historyMatches = [];
    _currentUserId = null;
  }
};
