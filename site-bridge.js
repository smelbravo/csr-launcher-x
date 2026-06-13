/**
 * Single csrestored.fun /app session — owns the WebSocket (same as the website / CSR+).
 * Friends online, lobby stats, queue, and invites all go through this bridge.
 */
const { BrowserWindow } = require('electron');

const FIBER_HELPER = `
function __csrFindRootFiber() {
  let fiber;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (w.nextNode()) {
    const k = Object.keys(w.currentNode).find((x) => x.startsWith('__reactFiber$'));
    if (k) { fiber = w.currentNode[k]; break; }
  }
  if (!fiber) return null;
  while (fiber.return) fiber = fiber.return;
  return fiber;
}

function __csrFindWsContext(fiber) {
  let found = null;
  const visit = (node) => {
    if (!node || found) return;
    const value = node.memoizedProps?.value;
    if (value && value.socket && typeof value.isConnected === 'boolean' && value.users) {
      found = value;
      return;
    }
    for (let child = node.child; child && !found; child = child.sibling) visit(child);
  };
  visit(fiber);
  return found;
}

function __csrSerializeGroup(group) {
  if (!group) return null;
  return {
    id: group.id != null ? String(group.id) : null,
    leader: group.leader != null ? String(group.leader) : null,
    members: Array.isArray(group.members) ? group.members.map(String) : [],
    invited: Array.isArray(group.invited) ? group.invited.map(String) : [],
    name: group.name || null
  };
}
`;

const EXTRACT_STATE = `
(${FIBER_HELPER}
(() => {
  const ctx = __csrFindWsContext(__csrFindRootFiber());
  if (!ctx) return { ok: false, connected: false };

  const users = ctx.users || {};
  const onlineUsers = {};
  Object.entries(users).forEach(([id, entry]) => {
    onlineUsers[String(id)] = entry;
  });

  const qs = ctx.queueState || {};
  const queueType = ctx.queueTypeState || ctx.localQueueType || '5v5:eu';
  const [mode, region] = String(queueType).split(':');
  const uid = ctx.group?.leader != null ? String(ctx.group.leader) : null;
  const members = (ctx.group?.members || []).map(String);
  const isLeader = !ctx.group?.leader
    || String(ctx.group.leader) === String(ctx.group?.members?.[0])
    || members.length <= 1;

  let isLeaderFinal = isLeader;
  try {
    const me = document.querySelector('[data-user-id]')?.dataset?.userId;
    if (ctx.group?.leader && me) isLeaderFinal = String(ctx.group.leader) === String(me);
  } catch (_) {}

  const match = ctx.matchData || null;
  const matchOut = match?.id ? {
    id: match.id,
    type: match.type,
    members: match.members,
    members_data: match.members_data,
    map_pick: match.map_pick,
    final_map: match.final_map,
    server_ip: match.server_ip,
    active: match.active
  } : null;

  return {
    ok: true,
    connected: !!ctx.isConnected,
    status: ctx.status || { matches: 0, queue: { total: 0 }, live_matches: {} },
    activePlayers: Object.keys(onlineUsers).length,
    onlineUsers,
    group: __csrSerializeGroup(ctx.group),
    queueType,
    mode,
    region,
    queueState: {
      type: qs.type || queueType,
      accepted: !!qs.accepted,
      count: qs.count || 0
    },
    inQueue: !!qs.channel,
    queueAccepted: !!qs.accepted,
    availableQueueType: ctx.availableQueueType || null,
    groupQueueMembers: ctx.groupQueueMembers || [],
    isLeader: isLeaderFinal,
    queueElapsed: typeof ctx.queueElapsed === 'number' ? ctx.queueElapsed : 0,
    match: matchOut,
    inMatch: !!matchOut?.id,
    pendingGroupInvites: []
  };
})()
)`;

const RUN_ACTION = `
(${FIBER_HELPER}
async (action, arg) => {
  const ctx = __csrFindWsContext(__csrFindRootFiber());
  if (!ctx) return { ok: false, error: 'WebSocket context not ready' };

  try {
    switch (action) {
      case 'joinOrCreateGroup':
        if (ctx.joinOrCreateGroup) await ctx.joinOrCreateGroup(arg || undefined);
        return { ok: true };
      case 'setQueueType':
        if (ctx.setQueueType) ctx.setQueueType(arg);
        return { ok: true };
      case 'joinQueue':
        if (ctx.group?.channel && ctx.joinQueueAsLeader) {
          await ctx.joinQueueAsLeader();
        } else if (ctx.availableQueueType && ctx.joinQueue) {
          await ctx.joinQueue();
        } else if (ctx.joinQueueAsLeader) {
          await ctx.joinQueueAsLeader();
        } else if (ctx.joinQueue) {
          await ctx.joinQueue();
        }
        return { ok: true };
      case 'leaveQueue':
        if (ctx.leaveQueue) ctx.leaveQueue();
        return { ok: true };
      case 'leaveGroup':
        if (ctx.leaveGroup) ctx.leaveGroup();
        return { ok: true };
      case 'inviteUser':
        if (ctx.inviteUser) await ctx.inviteUser(String(arg));
        return { ok: true };
      case 'acceptMatch':
        if (ctx.acceptMatch) await ctx.acceptMatch(arg);
        return { ok: true };
      case 'submitBanVotes':
        if (ctx.submitBanVotes) await ctx.submitBanVotes(arg);
        return { ok: true };
      default:
        return { ok: false, error: 'Unknown action' };
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
})
`;

let bridgeWindow = null;
let pollTimer = null;
let notifyFn = null;
let lastStateJson = '';

function waitForLoad(win, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    if (win.webContents.isLoading()) {
      const timer = setTimeout(() => reject(new Error('Page load timeout')), timeoutMs);
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timer);
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function getWindow() {
  if (bridgeWindow && !bridgeWindow.isDestroyed()) return bridgeWindow;
  bridgeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:auth'
    }
  });
  return bridgeWindow;
}

async function ensureSiteBridge(maxWaitMs = 25000) {
  const win = getWindow();
  const url = win.webContents.getURL();
  if (!url.includes('csrestored.fun/app')) {
    await win.loadURL('https://csrestored.fun/app');
    await waitForLoad(win);
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const state = await win.webContents.executeJavaScript(EXTRACT_STATE, true);
      if (state?.ok && state.connected) return state;
      if (state?.ok) return state;
    } catch (_) { /* retry */ }
    await new Promise((r) => setTimeout(r, 400));
  }

  try {
    return await win.webContents.executeJavaScript(EXTRACT_STATE, true);
  } catch (e) {
    return { ok: false, connected: false, error: e.message };
  }
}

async function getSiteBridgeState() {
  const win = getWindow();
  if (bridgeWindow?.isDestroyed()) return { ok: false, connected: false };
  try {
    return await win.webContents.executeJavaScript(EXTRACT_STATE, true);
  } catch (e) {
    return { ok: false, connected: false, error: e.message };
  }
}

async function runSiteBridgeAction(action, arg) {
  await ensureSiteBridge();
  const win = getWindow();
  return win.webContents.executeJavaScript(`(${RUN_ACTION})(${JSON.stringify(action)}, ${JSON.stringify(arg ?? null)})`, true);
}

async function fetchSiteOnlineUsers(options = {}) {
  const force = options === true || options?.forceRefresh;
  const maxWaitMs = options?.maxWaitMs || (force ? 25000 : 20000);
  const state = await ensureSiteBridge(maxWaitMs);
  if (!state?.ok) {
    return { ok: false, ids: [], count: 0, onlineUsers: {}, error: state?.error };
  }
  const ids = Object.keys(state.onlineUsers || {});
  return {
    ok: ids.length > 0 || state.connected,
    ids,
    count: ids.length,
    onlineUsers: state.onlineUsers || {},
    source: 'site-bridge'
  };
}

function mapBridgeToMmState(raw, lastError = null) {
  if (!raw || !raw.ok) {
    return { connected: false, lastError: raw?.error || lastError || null };
  }
  return {
    connected: raw.connected,
    status: raw.status,
    activePlayers: raw.activePlayers,
    onlineUsers: raw.onlineUsers,
    group: raw.group,
    queueType: raw.queueType,
    mode: raw.mode,
    region: raw.region,
    queueState: raw.queueState,
    inQueue: raw.inQueue,
    queueAccepted: raw.queueAccepted,
    availableQueueType: raw.availableQueueType,
    groupQueueMembers: raw.groupQueueMembers,
    isLeader: raw.isLeader,
    queueElapsed: raw.queueElapsed,
    lastError,
    pendingGroupInvites: raw.pendingGroupInvites || [],
    roomUsers: {},
    memberProfiles: {},
    lobbyMemberIds: raw.group?.members || [],
    match: raw.match,
    inMatch: raw.inMatch,
    pendingAccept: !!(raw.match?.id && !raw.match?.map_pick?.started),
    showAcceptModal: !!(raw.match?.id && !raw.match?.map_pick?.started)
  };
}

function startBridgePolling(notify, intervalMs = 1000, mapFn) {
  notifyFn = notify;
  const mapper = mapFn || mapBridgeToMmState;
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      const raw = await getSiteBridgeState();
      const state = mapper(raw);
      if (notifyFn) notifyFn(state);
    } catch (_) { /* ignore */ }
  }, intervalMs);
}

function stopBridgePolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  lastStateJson = '';
}

function clearSitePresenceCache() {
  lastStateJson = '';
}

function destroySiteBridge() {
  stopBridgePolling();
  clearSitePresenceCache();
  if (bridgeWindow && !bridgeWindow.isDestroyed()) {
    bridgeWindow.destroy();
  }
  bridgeWindow = null;
}

module.exports = {
  ensureSiteBridge,
  getSiteBridgeState,
  runSiteBridgeAction,
  fetchSiteOnlineUsers,
  mapBridgeToMmState,
  startBridgePolling,
  stopBridgePolling,
  clearSitePresenceCache,
  destroySiteBridge,
  // legacy names
  destroySitePresenceWindow: destroySiteBridge
};
