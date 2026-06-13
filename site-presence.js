/**
 * Read lobby online users from csrestored.fun (same React WebSocket context as the site).
 * More reliable than Phoenix in Electron main process for friends online status.
 */
const { BrowserWindow } = require('electron');

const EXTRACT_ONLINE_USERS = `
(() => {
  function findRootFiber() {
    let fiber;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (w.nextNode()) {
      const k = Object.keys(w.currentNode).find((x) => x.startsWith('__reactFiber$'));
      if (k) {
        fiber = w.currentNode[k];
        break;
      }
    }
    if (!fiber) return null;
    while (fiber.return) fiber = fiber.return;
    return fiber;
  }

  function findUsers(fiber) {
    let found = null;
    const visit = (node) => {
      if (!node || found) return;
      const value = node.memoizedProps?.value;
      if (value && value.users && typeof value.users === 'object' && !Array.isArray(value.users)) {
        found = value.users;
        return;
      }
      for (let child = node.child; child && !found; child = child.sibling) visit(child);
    };
    visit(fiber);
    return found;
  }

  const users = findUsers(findRootFiber());
  if (!users) {
    return { ok: false, ids: [], count: 0, onlineUsers: {} };
  }

  const onlineUsers = {};
  const ids = [];
  Object.entries(users).forEach(([id, entry]) => {
    ids.push(String(id));
    onlineUsers[String(id)] = entry;
  });

  return { ok: true, ids, count: ids.length, onlineUsers };
})();
`;

let presenceWindow = null;
let cache = { ts: 0, data: null };

function waitForLoad(win, timeoutMs = 20000) {
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

async function fetchSiteOnlineUsers(options = {}) {
  const { maxWaitMs = 18000, cacheMs = 2500 } = options;
  const now = Date.now();
  if (cache.data && now - cache.ts < cacheMs) {
    return cache.data;
  }

  if (!presenceWindow || presenceWindow.isDestroyed()) {
    presenceWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:auth'
      }
    });
  }

  const win = presenceWindow;
  let lastResult = { ok: false, ids: [], count: 0, onlineUsers: {} };

  try {
    const currentUrl = win.webContents.getURL();
    if (!currentUrl.includes('csrestored.fun/app')) {
      await win.loadURL('https://csrestored.fun/app');
      await waitForLoad(win);
    }

    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      try {
        const result = await win.webContents.executeJavaScript(EXTRACT_ONLINE_USERS, true);
        if (result?.ok && result.count > 0) {
          cache = { ts: Date.now(), data: result };
          return result;
        }
        if (result) lastResult = result;
      } catch (e) {
        lastResult = { ok: false, error: e.message, ids: [], count: 0, onlineUsers: {} };
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    cache = { ts: Date.now(), data: lastResult };
    return lastResult;
  } catch (e) {
    const fail = { ok: false, error: e.message, ids: [], count: 0, onlineUsers: {} };
    cache = { ts: Date.now(), data: fail };
    return fail;
  }
}

function clearSitePresenceCache() {
  cache = { ts: 0, data: null };
}

function destroySitePresenceWindow() {
  clearSitePresenceCache();
  if (presenceWindow && !presenceWindow.isDestroyed()) {
    presenceWindow.destroy();
  }
  presenceWindow = null;
}

module.exports = {
  fetchSiteOnlineUsers,
  clearSitePresenceCache,
  destroySitePresenceWindow
};
