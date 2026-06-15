const { app, BrowserWindow, ipcMain, Menu, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const langDir = path.join(__dirname, 'lang');

function getAppIcon() {
  const ico = path.join(__dirname, 'assets', 'icon.ico');
  const png = path.join(__dirname, 'assets', 'icon.png');
  if (process.platform === 'win32' && fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return undefined;
}

let customLangDir = null;

function getCustomLangDir() {
  if (customLangDir) return customLangDir;

  const launcherRoot = app.isPackaged
    ? path.dirname(process.execPath)
    : process.cwd();

  customLangDir = path.join(launcherRoot, 'custom_lang');
  console.log('[Lang] customLangDir resolved to:', customLangDir);
  console.log('[Lang] app.isPackaged:', app.isPackaged);
  console.log('[Lang] process.execPath:', process.execPath);
  console.log('[Lang] process.cwd():', process.cwd());
  return customLangDir;
}

let mainWindow;
let gsisServer = null;
let csrProcess = null;
let csrProcessPid = null;
let gameRunningMonitorTimer = null;
let lastReportedGameRunning = false;
let mmService = null;

const { fetchSiteOnlineUsers, clearSitePresenceCache, destroySitePresenceWindow } = require('./site-presence');

function sendMatchmakingState(state) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('mm-state', state);
  }
}

let loginWindow = null;
let downloadCancelled = false;

const API_BASE_URL = 'https://api.csrestored.fun';
const crypto = require('crypto');
const https = require('https');

const DOWNLOAD_API_URL = 'https://download-api.csrestored.fun/';
const DOWNLOAD_BASE_URL = 'https://download.csrestored.fun/';
const GSIS_PORT = 3000;
const GSIS_AUTH_TOKEN = 'csr_launcher_token_2024';
const IGNORED_FILES = ['index.nginx-debian.html'];

function isIgnored(file) {
  return IGNORED_FILES.includes(file.file || file);
}

const defaultSettings = {
  csgoDir: '',
  gsisPort: GSIS_PORT,
  gsisEnabled: true,
  theme: 'dark',
  animations: true,
  launchArgs: ''
};

function loadSettings() {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return { ...defaultSettings, ...saved };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return defaultSettings;
}

async function loadAuthCookies() {
  try {
    const cookiePath = path.join(app.getPath('userData'), 'auth_cookies.json');
    if (fs.existsSync(cookiePath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      const sess = session.defaultSession;

      for (const cookie of cookies) {
        try {
          await sess.cookies.set({
            url: cookie.url || cookieStoreUrl(cookie),
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain || '.csrestored.fun',
            path: cookie.path || '/',
            secure: cookie.secure !== false,
            httpOnly: cookie.httpOnly !== false,
            expirationDate: cookie.expirationDate || (Date.now() / 1000) + (30 * 24 * 60 * 60)
          });
        } catch (e) {
          console.error('[Auth] Failed to restore cookie:', cookie.name, e.message);
        }
      }
      console.log('[Auth] Loaded', cookies.length, 'cookies from storage');
    } else {
      console.log('[Auth] No saved cookies found');
    }
  } catch (e) {
    console.error('[Auth] Failed to load auth cookies:', e);
  }
}

async function saveAuthCookies() {
  try {
    const sess = session.defaultSession;
    const cookies = await sess.cookies.get({});

    const csrCookies = filterAuthCookies(cookies);

    const cookiePath = path.join(app.getPath('userData'), 'auth_cookies.json');
    fs.writeFileSync(cookiePath, JSON.stringify(csrCookies, null, 2));
    console.log('[Auth] Saved', csrCookies.length, 'cookies:', csrCookies.map(c => c.name));
  } catch (e) {
    console.error('[Auth] Failed to save auth cookies:', e);
  }
}

function isAuthCookie(cookie) {
  if (!cookie?.name) return false;
  if (cookie.name.includes('jwt') || cookie.name.includes('session') || cookie.name.includes('token')) return true;
  return cookie.domain && cookie.domain.includes('csrestored');
}

function filterAuthCookies(cookies) {
  return (cookies || []).filter(isAuthCookie);
}

function cookieStoreUrl(cookie) {
  const domain = (cookie.domain || '').replace(/^\./, '');
  if (domain.includes('api.csrestored')) return 'https://api.csrestored.fun';
  return 'https://csrestored.fun';
}

async function copyCookiesToDefaultSession(cookies) {
  const sess = session.defaultSession;
  for (const cookie of cookies) {
    try {
      await sess.cookies.set({
        url: cookieStoreUrl(cookie),
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '.csrestored.fun',
        path: cookie.path || '/',
        secure: cookie.secure !== false,
        httpOnly: cookie.httpOnly !== false,
        expirationDate: cookie.expirationDate || (Date.now() / 1000) + (30 * 24 * 60 * 60)
      });
    } catch (e) {
      console.error('[Auth] Failed to set cookie:', cookie.name, e.message);
    }
  }
}

async function sessionHasValidUser(sess) {
  const cookies = filterAuthCookies(await sess.cookies.get({}));
  if (!cookies.some((c) => c.name === 'jwt_session' && c.value)) return false;

  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const { net } = require('electron');
  return new Promise((resolve) => {
    const request = net.request({ method: 'GET', url: `${API_BASE_URL}/users/@me` });
    request.setHeader('Cookie', cookieHeader);
    request.setHeader('Accept', 'application/json');
    request.on('response', (response) => {
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.end();
  });
}

async function completeAuthFromPartition(authSession, loginWin, state) {
  if (state.completed) return true;

  const cookies = filterAuthCookies(await authSession.cookies.get({}));
  if (!cookies.some((c) => c.name === 'jwt_session' && c.value)) return false;

  const valid = await sessionHasValidUser(authSession);
  if (!valid) return false;

  state.completed = true;
  await copyCookiesToDefaultSession(cookies);
  await saveAuthCookies();
  await ensureWebsocketSessionCookie(true);

  if (loginWin && !loginWin.isDestroyed()) loginWin.close();
  loginWindow = null;

  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('auth-status', { loggedIn: true });
  }
  console.log('[Auth] Login completed');
  return true;
}

function saveSettings(settings) {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function ensureCustomLangFolder() {
  try {
    const dir = getCustomLangDir();

    console.log('[Lang] Checking custom_lang at:', dir);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('[Lang] custom_lang folder CREATED at:', dir);
    } else {
      console.log('[Lang] custom_lang folder already exists at:', dir);
    }

    const exampleFile = path.join(dir, 'example_language.json');

    if (!fs.existsSync(exampleFile)) {
      const template = {
        name: 'Example Language',
        code: 'example',
        title: 'CSR Launcher',
        nav_home: 'Home',
        nav_settings: 'Settings',
        nav_play: 'Play',
        button_play: 'PLAY',
        button_close: 'Close'
      };

      fs.writeFileSync(exampleFile, JSON.stringify(template, null, 2), 'utf8');
      console.log('[Lang] example_language.json CREATED at:', exampleFile);
    }
  } catch (e) {
    console.error('[Lang] Failed to create custom_lang:', e.code, e.message, e.path);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    transparent: false,
    backgroundColor: '#0a0a0f',
    hasShadow: true,
    focusable: true,
    icon: getAppIcon(),
    title: 'CSR Launcher Beta',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: process.env.NODE_ENV === 'development'
    }
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
    const settings = loadSettings();
    loadAuthCookies();
    if (settings.gsisEnabled) {
      startGSIS(settings.gsisPort);
    }
    startGameRunningMonitor();
  });

  Menu.setApplicationMenu(null);
}

function startGSIS(port) {
  if (gsisServer) return;

  const gsisApp = express();
  gsisApp.use(cors());
  gsisApp.use(express.json({ limit: '10mb' }));

  gsisApp.post('/gsis', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader !== GSIS_AUTH_TOKEN) {
      return res.status(401).send('Unauthorized');
    }

    const gameState = req.body;
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('game-state-update', gameState);
    }

    res.status(200).send('OK');
  });

  gsisApp.get('/status', (req, res) => {
    res.json({ status: 'running', port });
  });

  gsisServer = gsisApp.listen(port, '127.0.0.1', () => {
    console.log(`GSIS server running on http://127.0.0.1:${port}`);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('gsis-status', { running: true, port });
    }
  });

  gsisServer.on('error', (err) => {
    console.error('GSIS server error:', err);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('gsis-status', { running: false, error: err.message });
    }
  });
}

function isCsrExeRunning() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FI "IMAGENAME eq csr.exe" /NH', {
        encoding: 'utf8',
        windowsHide: true
      });
      return /\bcsr\.exe\b/i.test(out);
    }
    const pid = csrProcessPid || csrProcess?.pid;
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return e.code === 'EPERM';
    }
  } catch (e) {
    return false;
  }
}

function publishGameRunningState(force = false) {
  const running = isCsrExeRunning();
  if (!force && running === lastReportedGameRunning) return;
  lastReportedGameRunning = running;
  if (!running) {
    csrProcess = null;
    csrProcessPid = null;
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('game-running', { running });
  }
}

function startGameRunningMonitor() {
  publishGameRunningState(true);
  if (gameRunningMonitorTimer) return;
  gameRunningMonitorTimer = setInterval(() => publishGameRunningState(), 2500);
}

function launchCSR(settings, loginToken) {
  try {
    const gameDir = settings.csgoDir;
    const csrExe = path.join(gameDir, 'csr.exe');

    if (!gameDir || !fs.existsSync(gameDir)) {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('game-launch', {
          success: false,
          error: 'Game directory not set. Configure in Settings.'
        });
      }
      return;
    }

    if (!fs.existsSync(csrExe)) {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('game-launch', {
          success: false,
          error: 'csr.exe not found. Download CS:Restored files first.'
        });
      }
      return;
    }

    const launchArgs = settings.launchArgs.split(' ').filter(Boolean);

    launchArgs.push('-game', 'csgo/csr', '-tickrate', '128');

    if (loginToken) {
      launchArgs.push('-login_token', loginToken);
    }

    console.log('[Launch]', csrExe, launchArgs.join(' '));

    csrProcess = spawn(csrExe, launchArgs, {
      cwd: gameDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    csrProcessPid = csrProcess.pid;
    csrProcess.unref();

    csrProcess.on('exit', () => {
      console.log('[Launch] CSR spawn handle exited');
      csrProcess = null;
      setTimeout(() => publishGameRunningState(true), 500);
      setTimeout(() => publishGameRunningState(true), 2000);
    });

    csrProcess.on('error', (err) => {
      console.error('[Launch] CSR error:', err.message);
      csrProcess = null;
      csrProcessPid = null;
      publishGameRunningState(true);
    });

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('game-launch', { success: true });
    }

    setTimeout(() => publishGameRunningState(true), 800);
    setTimeout(() => publishGameRunningState(true), 2500);
  } catch (err) {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('game-launch', { success: false, error: err.message });
    }
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.csr.launcher');
  }
  ensureCustomLangFolder();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (gsisServer) {
    gsisServer.close();
    gsisServer = null;
  }
  // Game runs detached — closing the launcher must not kill csr.exe
  app.quit();
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.destroy();
});

ipcMain.handle('launch-game', async (event) => {
  const settings = loadSettings();
  const gameDir = settings.csgoDir;

  if (!gameDir || !fs.existsSync(gameDir)) {
    return { success: false, error: 'Game directory not set. Configure in Settings.' };
  }

  if (!fs.existsSync(path.join(gameDir, 'csr.exe'))) {
    return { success: false, error: 'csr.exe not found. Download CS:Restored files first.' };
  }

  const sess = session.defaultSession;
  const cookies = await sess.cookies.get({});
  const wsCookie = cookies.find(c => c.name === 'jwt_websocket_session');
  const sessionCookie = cookies.find(c => c.name === 'jwt_session');

  let loginToken = '';
  if (wsCookie) loginToken += `jwt_websocket_session=${wsCookie.value}`;
  if (wsCookie && sessionCookie) loginToken += '; ';
  if (sessionCookie) loginToken += `jwt_session=${sessionCookie.value}`;
  console.log(loginToken);

  if (!loginToken) {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('game-launch', {
        success: false,
        error: 'Not logged in. Please login first.'
      });
    }
    return { success: false, error: 'No login token. Please login first.' };
  }

  launchCSR(settings, loginToken);
  return { success: true, status: 'launched' };
});

ipcMain.handle('check-and-update-before-launch', async (event) => {
  const settings = loadSettings();
  const gameDir = settings.csgoDir;

  if (!gameDir || !fs.existsSync(gameDir)) {
    return { needsUpdate: false, error: 'Game directory not set' };
  }

  try {
    const manifest = await fetchDownloadManifest();
    if (!manifest) {
      return { needsUpdate: false, error: 'Failed to fetch manifest' };
    }

    const filesToDownload = [];
    let totalSize = 0;

    for (const file of manifest) {
      if (isIgnored(file)) continue;
      const localPath = path.join(gameDir, file.file);
      if (!fs.existsSync(localPath) || md5File(localPath) !== file.hash) {
        filesToDownload.push(file);
        totalSize += file.lenght || 0;
      }
    }

    if (filesToDownload.length === 0) {
      return { needsUpdate: false, files: [], totalSize: 0 };
    }

    return { needsUpdate: true, files: filesToDownload, totalSize };
  } catch (e) {
    return { needsUpdate: false, error: e.message };
  }
});

ipcMain.handle('download-updates-with-progress', async (event, gameDir) => {
  try {
    downloadCancelled = false;
    const manifest = await fetchDownloadManifest();
    if (!manifest) {
      return { error: true, message: 'Failed to fetch manifest' };
    }

    const filesToDownload = manifest.filter(file => {
      if (isIgnored(file)) return false;
      const localPath = path.join(gameDir, file.file);
      return !fs.existsSync(localPath) || md5File(localPath) !== file.hash;
    });

    const results = {
      total: filesToDownload.length,
      downloaded: 0,
      failed: 0,
      errors: [],
      currentFile: '',
      cancelled: false
    };

    for (const file of filesToDownload) {
      if (downloadCancelled) {
        results.cancelled = true;
        break;
      }

      results.currentFile = file.file;
      const localPath = path.join(gameDir, file.file);

      try {
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        await downloadFile(file.file, localPath);

        const newHash = md5File(localPath);
        if (newHash !== file.hash) {
          throw new Error(`MD5 mismatch after download: expected ${file.hash}, got ${newHash}`);
        }

        results.downloaded++;
        mainWindow.webContents.send('update-progress', {
          file: file.file,
          current: results.downloaded,
          total: results.total,
          percent: Math.round((results.downloaded / results.total) * 100)
        });
      } catch (e) {
        results.failed++;
        results.errors.push({ file: file.file, error: e.message });
        console.error(`[Update] Failed: ${file.file}`, e.message);
      }
    }

    results.currentFile = '';
    return results;
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.on('save-settings', (event, settings) => {
  saveSettings(settings);
  if (settings.gsisEnabled && !gsisServer) {
    startGSIS(settings.gsisPort);
  }
  event.reply('settings-saved', { success: true });
});

ipcMain.handle('get-settings', () => {
  return { ...loadSettings() };
});

ipcMain.handle('get-gsis-status', () => {
  return { running: !!gsisServer };
});

ipcMain.handle('browse-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select folder'
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('browse-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Folders', extensions: [] }],
    title: 'Select folder or file'
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-game-status', () => {
  const settings = loadSettings();
  const gameDir = settings.csgoDir;
  const running = isCsrExeRunning();
  lastReportedGameRunning = running;
  return {
    running,
    hasGame: gameDir ? fs.existsSync(path.join(gameDir, 'csr.exe')) : false
  };
});

ipcMain.handle('start-login', async () => {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }

  const authSession = session.fromPartition('persist:auth');
  const state = { completed: false };
  let cookieListener = null;
  let pollTimer = null;

  const cleanupLoginWatchers = () => {
    if (cookieListener) {
      authSession.cookies.removeListener('changed', cookieListener);
      cookieListener = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const tryCompleteLogin = async () => {
    if (!loginWindow || loginWindow.isDestroyed()) return;
    const done = await completeAuthFromPartition(authSession, loginWindow, state);
    if (done) cleanupLoginWatchers();
  };

  loginWindow = new BrowserWindow({
    width: 520,
    height: 720,
    parent: mainWindow,
    modal: true,
    icon: getAppIcon(),
    title: 'Login — CS:Restored',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:auth'
    }
  });

  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Auth] OAuth popup redirected in-window:', url);
    if (url.startsWith('http://') || url.startsWith('https://')) {
      loginWindow.loadURL(url);
    }
    return { action: 'deny' };
  });

  cookieListener = () => {
    tryCompleteLogin().catch((e) => console.error('[Auth] cookie listener:', e.message));
  };
  authSession.cookies.on('changed', cookieListener);
  pollTimer = setInterval(() => {
    tryCompleteLogin().catch(() => {});
  }, 800);

  loginWindow.webContents.on('did-finish-load', () => {
    tryCompleteLogin().catch(() => {});
  });

  loginWindow.webContents.on('did-navigate', (event, url) => {
    console.log('[Auth] Navigated to:', url);
    tryCompleteLogin().catch(() => {});
  });

  loginWindow.webContents.on('did-navigate-in-page', (event, url) => {
    console.log('[Auth] Navigate in page:', url);
    tryCompleteLogin().catch(() => {});
  });

  loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Auth] Failed to load:', errorCode, errorDescription, validatedURL);
  });

  loginWindow.on('closed', () => {
    cleanupLoginWatchers();
    loginWindow = null;
  });

  try {
    await loginWindow.loadURL('https://csrestored.fun/login');
  } catch (err) {
    console.error('[Auth] Login page load error:', err.message);
  }
});

ipcMain.handle('check-auth', async () => {
  try {
    const sess = session.defaultSession;
    const cookies = await sess.cookies.get({});
    const authCookies = filterAuthCookies(cookies);
    console.log('[Auth Check] Found', authCookies.length, 'auth cookies:', authCookies.map(c => c.name));

    if (authCookies.length === 0) {
      return { loggedIn: false };
    }

    const cookieHeader = authCookies.map(c => `${c.name}=${c.value}`).join('; ');

    const { net } = require('electron');
    return new Promise((resolve) => {
      const request = net.request({
        method: 'GET',
        url: `${API_BASE_URL}/users/@me`
      });

      request.setHeader('Cookie', cookieHeader);
      request.setHeader('Accept', 'application/json');

      request.on('response', (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          console.log('[Auth Check] Response:', response.statusCode, data.substring(0, 300));
          if (response.statusCode === 200) {
            try {
              const userData = JSON.parse(data);
              resolve({ loggedIn: true, user: userData });
            } catch (e) {
              console.error('[Auth Check] Parse error:', e);
              resolve({ loggedIn: false });
            }
          } else {
            resolve({ loggedIn: false, statusCode: response.statusCode });
          }
        });
      });

      request.on('error', (err) => {
        console.error('[Auth Check] Request error:', err);
        resolve({ loggedIn: false, error: err.message });
      });

      request.end();
    });
  } catch (e) {
    console.error('[Auth Check] Error:', e);
    return { loggedIn: false, error: e.message };
  }
});

ipcMain.handle('logout', async () => {
  try {
    if (mmService) mmService.disconnect(true);

    const authSes = session.fromPartition('persist:auth');
    const partCookies = await authSes.cookies.get({});
    for (const cookie of partCookies) {
      try {
        await authSes.cookies.remove(cookieStoreUrl(cookie), cookie.name);
      } catch (_) { /* ignore */ }
    }

    const sess = session.defaultSession;
    const cookies = await sess.cookies.get({ domain: '.csrestored.fun' });

    for (const cookie of cookies) {
      const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await sess.cookies.remove(url, cookie.name);
    }

    const cookiePath = path.join(app.getPath('userData'), 'auth_cookies.json');
    if (fs.existsSync(cookiePath)) {
      fs.unlinkSync(cookiePath);
    }

    if (mmService) mmService.disconnect(true);
    destroySitePresenceWindow();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-status', { loggedIn: false });
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('save-language', (event, lang) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    settings.language = lang;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-languages', () => {
  try {
    ensureCustomLangFolder();

    const result = [];
    const added = new Set();

    const loadLanguagesFrom = (directory) => {
      if (!fs.existsSync(directory)) return;

      const files = fs.readdirSync(directory);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const fullPath = path.join(directory, file);
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

          const fileName = path.basename(file, '.json');

          if (added.has(fileName)) continue;

          result.push({
            name: data.language || data.name || fileName,
            file: fileName
          });

          added.add(fileName);
        } catch (e) {
          console.error('[Lang] Failed to parse language:', file, e);
        }
      }
    };

    loadLanguagesFrom(langDir);
    loadLanguagesFrom(getCustomLangDir());

    return result;
  } catch (e) {
    console.error('[Lang] Failed to get language list:', e);
    return [];
  }
});

ipcMain.handle('get-language-data', (event, langName) => {
  try {
    const defaultPath = path.join(langDir, `${langName}.json`);
    const customPath = path.join(getCustomLangDir(), `${langName}.json`);

    let targetPath = null;

    if (fs.existsSync(customPath)) {
      targetPath = customPath;
    } else if (fs.existsSync(defaultPath)) {
      targetPath = defaultPath;
    }

    if (!targetPath) {
      console.warn('[Lang] Language not found:', langName);
      return null;
    }

    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch (e) {
    console.error('[Lang] Failed to load language data:', e);
    return null;
  }
});

ipcMain.handle('get-language', async () => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');

    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings.language || 'english';
    }
  } catch (e) { }

  return 'english';
});

ipcMain.handle('get-csr-inventory', async () => {
  try {
    const { net } = require('electron');
    const sess = session.defaultSession;
    const cookies = await sess.cookies.get({ domain: '.csrestored.fun' });

    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url: 'https://api.csrestored.fun/inventory/'
      });

      request.setHeader('Origin', 'https://csrestored.fun');
      request.setHeader('Referer', 'https://csrestored.fun/');
      request.setHeader('Accept', 'application/json');

      if (cookies.length > 0) {
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        request.setHeader('Cookie', cookieHeader);
      }

      request.on('response', (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (response.statusCode >= 200 && response.statusCode < 300) {
              const items = Array.isArray(parsed) ? parsed : (parsed.data || parsed.items || []);
              resolve({ error: false, items });
            } else {
              resolve({ error: true, items: [] });
            }
          } catch (e) {
            resolve({ error: true, items: [] });
          }
        });
      });

      request.on('error', (err) => {
        resolve({ error: true, items: [], message: err.message });
      });

      request.end();
    });
  } catch (e) {
    return { error: true, items: [], message: e.message };
  }
});

ipcMain.handle('get-csr-user', async () => {
  try {
    const { net } = require('electron');
    const sess = session.defaultSession;
    const cookies = await sess.cookies.get({ domain: '.csrestored.fun' });

    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url: 'https://api.csrestored.fun/users/@me'
      });

      request.setHeader('Origin', 'https://csrestored.fun');
      request.setHeader('Accept', 'application/json');

      if (cookies.length > 0) {
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        request.setHeader('Cookie', cookieHeader);
      }

      request.on('response', (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (response.statusCode === 200) {
              resolve({ error: false, user: parsed });
            } else {
              resolve({ error: true, status: response.statusCode });
            }
          } catch (e) {
            resolve({ error: true });
          }
        });
      });

      request.on('error', (err) => {
        resolve({ error: true, message: err.message });
      });

      request.end();
    });
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('get-csr-history', async () => {
  try {
    const cookies = await getCsrCookies();
    const matches = [];

    for (let page = 0; page < 100; page++) {
      const result = await fetchCsrApi(`${API_BASE_URL}/history/user/@me/${page}`, cookies);
      if (result.status === 401) {
        return { error: false, matches: [], unauthorized: true };
      }
      if (result.status === 404 || !result.ok) break;

      const batch = Array.isArray(result.data) ? result.data : extractApiArray(result.data, ['matches', 'history', 'data']);
      if (!batch.length) break;

      matches.push(...batch);
      if (batch.length < 10) break;
    }

    return { error: false, matches };
  } catch (e) {
    return { error: true, matches: [], message: e.message };
  }
});

ipcMain.handle('get-csr-user-by-id', async (event, userId) => {
  const id = String(userId ?? '').replace(/\D/g, '');
  if (!id) return { error: true, user: null, message: 'Invalid user id' };
  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/users/${id}`, cookies);
    if (result.status === 401) {
      return { error: true, user: null, unauthorized: true };
    }
    if (!result.ok || !result.data || result.data.message) {
      return { error: true, user: null, message: result.data?.message || `HTTP ${result.status}` };
    }
    return { error: false, user: result.data };
  } catch (e) {
    return { error: true, user: null, message: e.message };
  }
});

ipcMain.handle('get-csr-user-inventory', async (event, userId) => {
  const id = String(userId ?? '').replace(/\D/g, '');
  if (!id) return { error: true, items: [], message: 'Invalid user id' };
  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/users/${id}/inventory`, cookies);
    if (result.status === 401) {
      return { error: true, items: [], unauthorized: true };
    }
    if (result.status === 403 || result.status === 404) {
      return { error: true, items: [], private: true, message: 'Inventory not available' };
    }
    if (!result.ok) {
      return { error: true, items: [], message: `HTTP ${result.status}` };
    }
    const items = Array.isArray(result.data)
      ? result.data
      : extractApiArray(result.data, ['items', 'inventory', 'data']);
    return { error: false, items };
  } catch (e) {
    return { error: true, items: [], message: e.message };
  }
});

ipcMain.handle('get-csr-user-history', async (event, userId, pageNum) => {
  const id = String(userId ?? '').replace(/\D/g, '');
  const page = Math.max(0, parseInt(pageNum, 10) || 0);
  if (!id) return { error: true, matches: [], message: 'Invalid user id' };
  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/history/user/${id}/${page}`, cookies);
    if (result.status === 401) {
      return { error: false, matches: [], unauthorized: true };
    }
    if (result.status === 404 || !result.ok) {
      return { error: false, matches: [] };
    }
    const batch = Array.isArray(result.data)
      ? result.data
      : extractApiArray(result.data, ['matches', 'history', 'data']);
    return { error: false, matches: batch || [] };
  } catch (e) {
    return { error: true, matches: [], message: e.message };
  }
});

async function getCsrCookies() {
  const sess = session.defaultSession;
  let cookies = await sess.cookies.get({ domain: '.csrestored.fun' });
  if (!cookies.length) cookies = await sess.cookies.get({});
  return cookies;
}

async function syncPartitionCookiesToDefault(partition = 'persist:auth') {
  const authSession = session.fromPartition(partition);
  const authCookies = filterAuthCookies(await authSession.cookies.get({}));
  await copyCookiesToDefaultSession(authCookies);
  await saveAuthCookies();
}

async function waitForCookieInSession(sess, cookieName, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await sess.cookies.get({ url: 'https://csrestored.fun' });
    const found = list.find((c) => c.name === cookieName);
    if (found?.value) return found.value;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/** jwt_websocket_session is set when visiting /app — required for matchmaking. */
async function ensureWebsocketSessionCookie(forceRefresh = false, pageUrl = 'https://csrestored.fun/app') {
  let cookies = await getCsrCookies();
  let ws = cookies.find((c) => c.name === 'jwt_websocket_session');
  if (ws?.value && !forceRefresh) return ws.value;

  console.log('[MM] Refreshing jwt_websocket_session via', pageUrl);
  const authSession = session.fromPartition('persist:auth');
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:auth'
    }
  });

  try {
    await win.loadURL(pageUrl);
    const token = await waitForCookieInSession(authSession, 'jwt_websocket_session', 20000);
    await syncPartitionCookiesToDefault('persist:auth');
    if (token) return token;
    cookies = await getCsrCookies();
    ws = cookies.find((c) => c.name === 'jwt_websocket_session');
    return ws?.value || null;
  } catch (e) {
    console.error('[MM] ensureWebsocketSessionCookie:', e.message);
    return null;
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}

function extractApiArray(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of keys) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

function fetchCsrApi(url, cookies) {
  return new Promise((resolve) => {
    const { net } = require('electron');
    const request = net.request({ method: 'GET', url });

    request.setHeader('Origin', 'https://csrestored.fun');
    request.setHeader('Referer', 'https://csrestored.fun/');
    request.setHeader('Accept', 'application/json');

    if (cookies.length > 0) {
      request.setHeader('Cookie', cookies.map(c => `${c.name}=${c.value}`).join('; '));
    }

    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            data: parsed
          });
        } catch (e) {
          resolve({ ok: false, status: response.statusCode, data: null, raw: data });
        }
      });
    });

    request.on('error', (err) => {
      resolve({ ok: false, error: err.message, data: null });
    });

    request.end();
  });
}

function postCsrApi(url, body, cookies) {
  return new Promise((resolve) => {
    const { net } = require('electron');
    const request = net.request({ method: 'POST', url });

    request.setHeader('Origin', 'https://csrestored.fun');
    request.setHeader('Referer', 'https://csrestored.fun/');
    request.setHeader('Accept', 'application/json');
    request.setHeader('Content-Type', 'application/json');

    if (cookies.length > 0) {
      request.setHeader('Cookie', cookies.map(c => `${c.name}=${c.value}`).join('; '));
    }

    const payload = JSON.stringify(body || {});

    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            data: parsed
          });
        } catch (e) {
          resolve({ ok: false, status: response.statusCode, data: null, raw: data });
        }
      });
    });

    request.on('error', (err) => {
      resolve({ ok: false, error: err.message, data: null });
    });

    request.write(payload);
    request.end();
  });
}

function postCsrApiRaw(url, rawBody, cookies) {
  return new Promise((resolve) => {
    const { net } = require('electron');
    const request = net.request({ method: 'POST', url });

    request.setHeader('Origin', 'https://csrestored.fun');
    request.setHeader('Referer', 'https://csrestored.fun/');
    request.setHeader('Accept', 'application/json');
    request.setHeader('Content-Type', 'application/json');

    if (cookies.length > 0) {
      request.setHeader('Cookie', cookies.map(c => `${c.name}=${c.value}`).join('; '));
    }

    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            data: parsed
          });
        } catch (e) {
          resolve({ ok: false, status: response.statusCode, data: null, raw: data });
        }
      });
    });

    request.on('error', (err) => {
      resolve({ ok: false, error: err.message, data: null });
    });

    request.write(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}));
    request.end();
  });
}

function patchCsrApi(url, body, cookies) {
  return new Promise((resolve) => {
    const { net } = require('electron');
    const request = net.request({ method: 'PATCH', url });

    request.setHeader('Origin', 'https://csrestored.fun');
    request.setHeader('Referer', 'https://csrestored.fun/');
    request.setHeader('Accept', 'application/json');
    request.setHeader('Content-Type', 'application/json');

    if (cookies.length > 0) {
      request.setHeader('Cookie', cookies.map(c => `${c.name}=${c.value}`).join('; '));
    }

    const payload = JSON.stringify(body || {});

    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            data: parsed
          });
        } catch (e) {
          resolve({ ok: false, status: response.statusCode, data: null, raw: data });
        }
      });
    });

    request.on('error', (err) => {
      resolve({ ok: false, error: err.message, data: null });
    });

    request.write(payload);
    request.end();
  });
}

function makeApiRequest(url, cookies) {
  return fetchCsrApi(url, cookies).then((result) => ({
    error: !result.ok,
    matches: result.ok ? extractApiArray(result.data, ['data', 'matches', 'history', 'results']) : []
  }));
}

ipcMain.handle('get-csr-marketplace', async () => {
  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/inventory/marketplace/`, cookies);
    if (result.status === 401) return { error: true, offers: [], unauthorized: true };
    if (!result.ok) return { error: true, offers: [], message: `HTTP ${result.status}` };
    const offers = Array.isArray(result.data)
      ? result.data
      : extractApiArray(result.data, ['offers', 'listings', 'items', 'data']);
    return { error: false, offers };
  } catch (e) {
    return { error: true, offers: [], message: e.message };
  }
});

ipcMain.handle('post-csr-marketplace-add', async (event, weaponId, price) => {
  const wid = String(weaponId ?? '').replace(/\D/g, '');
  const p = Math.min(999999, Math.max(1, parseInt(price, 10) || 0));
  if (!wid) return { error: true, message: 'Invalid item id' };
  try {
    const cookies = await getCsrCookies();
    const result = await postCsrApi(`${API_BASE_URL}/inventory/marketplace/add`, { weapon_id: wid, price: p }, cookies);
    if (!result.ok) {
      return { error: true, message: result.data?.message || result.data?.error || `HTTP ${result.status}` };
    }
    return { error: false, data: result.data };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('get-csr-cases', async () => {
  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/inventory/cases`, cookies);
    if (result.status === 401) return { error: true, cases: [], unauthorized: true };
    if (!result.ok) return { error: true, cases: [], message: `HTTP ${result.status}` };
    const cases = Array.isArray(result.data)
      ? result.data
      : extractApiArray(result.data, ['cases', 'data']);
    return { error: false, cases };
  } catch (e) {
    return { error: true, cases: [], message: e.message };
  }
});

ipcMain.handle('post-csr-cases-buy', async (event, caseId) => {
  const id = String(caseId ?? '').replace(/\D/g, '');
  if (!id) return { error: true, message: 'Invalid case id' };
  try {
    const cookies = await getCsrCookies();
    const result = await postCsrApi(`${API_BASE_URL}/inventory/cases/buy/${id}`, {}, cookies);
    if (!result.ok) {
      return { error: true, message: result.data?.message || result.data?.error || `HTTP ${result.status}` };
    }
    return { error: false, data: result.data };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('get-csr-case-detail', async (event, caseId) => {
  const id = String(caseId ?? '').replace(/\D/g, '');
  if (!id) return { error: true, message: 'Invalid case id' };
  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/inventory/cases/${id}`, cookies);
    if (result.status === 401) return { error: true, unauthorized: true };
    if (!result.ok) return { error: true, message: `HTTP ${result.status}` };
    return { error: false, data: result.data };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('post-csr-cases-open', async (event, caseId) => {
  const id = String(caseId ?? '').replace(/\D/g, '');
  if (!id) return { error: true, message: 'Invalid case id' };
  try {
    const cookies = await getCsrCookies();
    const result = await postCsrApi(`${API_BASE_URL}/inventory/cases/open/${id}`, {}, cookies);
    if (!result.ok) {
      return { error: true, message: result.data?.message || result.data?.error || `HTTP ${result.status}` };
    }
    return { error: false, data: result.data };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('post-csr-sell', async (event, weaponId) => {
  const id = String(weaponId ?? '').replace(/\D/g, '');
  if (!id) return { error: true, message: 'Invalid weapon id' };
  try {
    const cookies = await getCsrCookies();
    const result = await postCsrApi(`${API_BASE_URL}/inventory/sell/${id}`, {}, cookies);
    if (!result.ok) {
      return { error: true, message: result.data?.message || result.data?.error || `HTTP ${result.status}` };
    }
    return { error: false, data: result.data };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('get-csr-trades', async () => {
  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/api/trades`, cookies);
    if (result.status === 401) return { error: true, trades: [], unauthorized: true };
    if (!result.ok) return { error: true, trades: [], message: `HTTP ${result.status}` };
    const trades = Array.isArray(result.data)
      ? result.data
      : extractApiArray(result.data, ['all', 'trades', 'data']);
    return { error: false, trades };
  } catch (e) {
    return { error: true, trades: [], message: e.message };
  }
});

ipcMain.handle('post-csr-trades', async (event, rawBody) => {
  if (!rawBody || typeof rawBody !== 'string') return { error: true, message: 'Invalid body' };
  try {
    const cookies = await getCsrCookies();
    const result = await postCsrApiRaw(`${API_BASE_URL}/api/trades`, rawBody, cookies);
    if (!result.ok) {
      return { error: true, message: result.data?.message || result.data?.error || `HTTP ${result.status}`, status: result.status };
    }
    return { error: false, data: result.data };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('patch-csr-trade-accept', async (event, tradeId) => {
  const id = String(tradeId ?? '').replace(/\D/g, '');
  if (!id) return { error: true, message: 'Invalid trade id' };
  try {
    const cookies = await getCsrCookies();
    const result = await patchCsrApi(`${API_BASE_URL}/api/trades/${id}/accept`, {}, cookies);
    if (!result.ok) return { error: true, message: result.data?.message || `HTTP ${result.status}` };
    return { error: false, data: result.data };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('patch-csr-trade-reject', async (event, tradeId) => {
  const id = String(tradeId ?? '').replace(/\D/g, '');
  if (!id) return { error: true, message: 'Invalid trade id' };
  try {
    const cookies = await getCsrCookies();
    const result = await patchCsrApi(`${API_BASE_URL}/api/trades/${id}/reject`, {}, cookies);
    if (!result.ok) return { error: true, message: result.data?.message || `HTTP ${result.status}` };
    return { error: false, data: result.data };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('get-csr-leaderboard', async (event, page) => {
  const LEADERBOARD_PAGE_SIZE = 50;
  const pageNum = parseInt(page, 10);
  const safePage = Number.isFinite(pageNum) && pageNum >= 0 ? pageNum : 0;

  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/users/top/${safePage}`, cookies);

    if (result.status === 404 || !result.ok) {
      return {
        error: safePage === 0,
        players: [],
        hasMore: false,
        page: safePage,
        message: safePage === 0 ? 'Leaderboard unavailable' : undefined
      };
    }

    const batch = Array.isArray(result.data)
      ? result.data
      : extractApiArray(result.data, ['players', 'data']);

    const hasMore = batch.length >= LEADERBOARD_PAGE_SIZE;

    return { error: false, players: batch, hasMore, page: safePage };
  } catch (e) {
    return { error: true, players: [], hasMore: false, page: safePage, message: e.message };
  }
});

ipcMain.handle('get-csr-match', async (event, matchId) => {
  try {
    const cookies = await getCsrCookies();
    const id = String(matchId ?? '').replace(/\D/g, '');
    if (!id) return { error: true, match: null, message: 'Invalid match id' };

    const endpoints = [
      `${API_BASE_URL}/history/match/${id}`,
      `${API_BASE_URL}/matches/${id}`,
      `${API_BASE_URL}/match/${id}`
    ];

    for (const endpoint of endpoints) {
      const result = await fetchCsrApi(endpoint, cookies);
      if (result.ok && result.data) {
        return { error: false, match: result.data };
      }
    }

    return { error: true, match: null, message: 'Match not found' };
  } catch (e) {
    return { error: true, match: null, message: e.message };
  }
});

ipcMain.handle('mm-ensure-ws-session', async () => {
  const token = await ensureWebsocketSessionCookie(false);
  return { ok: !!token, token: token || null };
});

function mmDisabledResponse() {
  return { ok: false, disabled: true, error: 'Matchmaking is temporarily unavailable.' };
}

ipcMain.handle('mm-start', async () => mmDisabledResponse());

ipcMain.handle('mm-ensure-lobby-presence', async () => ({ ok: false, disabled: true }));

ipcMain.handle('mm-stop', async () => ({ ok: true }));

ipcMain.handle('mm-join-match', async () => mmDisabledResponse());

ipcMain.handle('mm-submit-ban-votes', async () => mmDisabledResponse());

ipcMain.handle('mm-leave-match', async () => mmDisabledResponse());

ipcMain.handle('mm-get-state', async () => ({ connected: false, disabled: true }));

ipcMain.handle('mm-ensure-group', async () => mmDisabledResponse());

ipcMain.handle('mm-set-queue-type', async () => mmDisabledResponse());

ipcMain.handle('mm-join-queue', async () => mmDisabledResponse());

ipcMain.handle('mm-leave-queue', async () => mmDisabledResponse());

ipcMain.handle('mm-leave-group', async () => mmDisabledResponse());

ipcMain.handle('mm-accept-group-invite', async () => mmDisabledResponse());

ipcMain.handle('mm-decline-group-invite', async () => mmDisabledResponse());

ipcMain.handle('mm-invite-user', async () => mmDisabledResponse());

ipcMain.handle('get-csr-online-users', async (event, forceRefresh) => {
  try {
    if (forceRefresh) clearSitePresenceCache();

    const cookies = await getCsrCookies();
    const hasSession = cookies.some((c) => c.name === 'jwt_session' || c.name === 'jwt_websocket_session');
    if (!hasSession) {
      return { ok: false, ids: [], count: 0, onlineUsers: {}, unauthorized: true };
    }

    let wsToken = await ensureWebsocketSessionCookie(false, 'https://csrestored.fun/app');
    if (!wsToken) {
      wsToken = await ensureWebsocketSessionCookie(true, 'https://csrestored.fun/app');
    }

    const site = await fetchSiteOnlineUsers({
      maxWaitMs: forceRefresh ? 25000 : 18000,
      cacheMs: forceRefresh ? 0 : 2500
    });
    return site ? { ...site, source: 'site' } : { ok: false, ids: [], count: 0, onlineUsers: {} };
  } catch (e) {
    return { ok: false, error: e.message, ids: [], count: 0, onlineUsers: {} };
  }
});

ipcMain.handle('get-csr-friends', async () => {
  try {
    const cookies = await getCsrCookies();
    const result = await fetchCsrApi(`${API_BASE_URL}/users/friends`, cookies);
    if (result.status === 401) {
      return { error: true, friends: [], unauthorized: true };
    }
    if (!result.ok) {
      return { error: true, friends: [], message: `HTTP ${result.status}` };
    }
    const friends = Array.isArray(result.data) ? result.data : extractApiArray(result.data, ['friends', 'data']);
    return { error: false, friends };
  } catch (e) {
    return { error: true, friends: [], message: e.message };
  }
});

ipcMain.handle('invite-csr-friend', async (event, username) => {
  const name = String(username || '').trim();
  if (!name) return { error: true, message: 'Username required' };
  try {
    const cookies = await getCsrCookies();
    const result = await postCsrApi(`${API_BASE_URL}/users/friends/invite`, { username: name }, cookies);
    if (result.status === 401) return { error: true, unauthorized: true };
    if (!result.ok) {
      const msg = result.data?.message || result.data?.error || `HTTP ${result.status}`;
      return { error: true, message: msg };
    }
    return { error: false };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('accept-csr-friend', async (event, friendId) => {
  const id = parseInt(friendId, 10);
  if (!Number.isFinite(id)) return { error: true, message: 'Invalid friend id' };
  try {
    const cookies = await getCsrCookies();
    const result = await postCsrApi(`${API_BASE_URL}/users/friends/accept`, { id }, cookies);
    if (result.status === 401) return { error: true, unauthorized: true };
    if (!result.ok) {
      const msg = result.data?.message || result.data?.error || `HTTP ${result.status}`;
      return { error: true, message: msg };
    }
    return { error: false };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('delete-csr-friend', async (event, friendId) => {
  const id = parseInt(friendId, 10);
  if (!Number.isFinite(id)) return { error: true, message: 'Invalid friend id' };
  try {
    const cookies = await getCsrCookies();
    const result = await postCsrApi(`${API_BASE_URL}/users/friends/delete`, { id }, cookies);
    if (result.status === 401) return { error: true, unauthorized: true };
    if (!result.ok) {
      const msg = result.data?.message || result.data?.error || `HTTP ${result.status}`;
      return { error: true, message: msg };
    }
    return { error: false };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('open-external-url', async (event, url) => {
  if (!url || typeof url !== 'string') return { success: false };
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('check-csr-updates', async () => {
  try {
    const manifest = await fetchDownloadManifest();
    if (!manifest) {
      return { error: true, message: 'Failed to fetch manifest' };
    }

    const settings = loadSettings();
    const gameDir = settings.csgoDir;
    if (!gameDir || !fs.existsSync(gameDir)) {
      return { error: true, message: 'Game directory not set' };
    }

    const filesToDownload = [];
    let totalSize = 0;

    for (const file of manifest) {
      if (isIgnored(file)) continue;
      const localPath = path.join(gameDir, file.file);
      let needsDownload = false;

      if (!fs.existsSync(localPath)) {
        needsDownload = true;
      } else {
        const localHash = md5File(localPath);
        if (localHash !== file.hash) {
          needsDownload = true;
        }
      }

      if (needsDownload) {
        filesToDownload.push(file);
        totalSize += file.lenght || 0;
      }
    }

    if (totalSize > 0) {
      const drive = path.parse(gameDir).root;
      const freeSpace = await getFreeDiskSpace(drive);
      if (freeSpace !== null && totalSize > freeSpace) {
        return {
          error: true,
          message: `Not enough disk space. Need ${(totalSize / 1024 / 1024).toFixed(1)} MB, but only ${(freeSpace / 1024 / 1024).toFixed(1)} MB free on ${drive}`,
          insufficientSpace: true
        };
      }
    }

    console.log(`[Update] ${filesToDownload.length} files need download (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
    return { error: false, files: filesToDownload, totalSize };
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.handle('download-csr-files', async (event, gameDir) => {
  try {
    downloadCancelled = false;

    const manifest = await fetchDownloadManifest();
    if (!manifest) {
      return { error: true, message: 'Failed to fetch manifest' };
    }

    const filteredManifest = manifest.filter(f => !isIgnored(f));
    const results = {
      total: filteredManifest.length,
      downloaded: 0,
      failed: 0,
      errors: [],
      currentFile: '',
      cancelled: false
    };

    for (const file of filteredManifest) {
      if (downloadCancelled) {
        results.cancelled = true;
        break;
      }

      results.currentFile = file.file;
      const localPath = path.join(gameDir, file.file);

      try {
        fs.mkdirSync(path.dirname(localPath), { recursive: true });

        const localHash = fs.existsSync(localPath) ? md5File(localPath) : null;
        if (localHash !== file.hash) {
          await downloadFile(file.file, localPath);

          const newHash = md5File(localPath);
          if (newHash !== file.hash) {
            throw new Error(`MD5 mismatch after download: expected ${file.hash}, got ${newHash}`);
          }
        }

        results.downloaded++;
        console.log(`[Update] Downloaded: ${file.file}`);

        mainWindow.webContents.send('update-progress', {
          file: file.file,
          current: results.downloaded,
          total: results.total,
          percent: Math.round((results.downloaded / results.total) * 100)
        });
      } catch (e) {
        results.failed++;
        results.errors.push({ file: file.file, error: e.message });
        console.error(`[Update] Failed: ${file.file}`, e.message);
      }
    }

    results.currentFile = '';
    return results;
  } catch (e) {
    return { error: true, message: e.message };
  }
});

ipcMain.on('cancel-download', () => {
  downloadCancelled = true;
});

function fetchDownloadManifest() {
  return new Promise((resolve, reject) => {
    https.get(DOWNLOAD_API_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : null);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    });
  });
}

function md5File(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (e) {
    return null;
  }
}

function getFreeDiskSpace(drive) {
  return new Promise((resolve) => {
    try {
      if (process.platform === 'win32') {
        const { exec } = require('child_process');
        const driveLetter = drive.charAt(0);
        exec(`powershell -NoProfile -Command "(Get-PSDrive '${driveLetter}').Free"`, (err, stdout) => {
          if (err || isNaN(stdout)) {
            resolve(null);
          } else {
            resolve(parseInt(stdout) * 1024);
          }
        });
      } else {
        const stat = fs.statfs(drive);
        const free = stat.bavail * stat.bsize;
        resolve(free);
      }
    } catch (e) {
      resolve(null);
    }
  });
}

function downloadFile(remotePath, localPath, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    const url = `${DOWNLOAD_BASE_URL}${remotePath}`;
    let attempts = 0;

    function attempt() {
      attempts++;
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          https.get(redirectUrl, (res2) => {
            if (res2.statusCode < 200 || res2.statusCode >= 300) {
              const err = new Error(`HTTP ${res2.statusCode} on redirect for ${remotePath}`);
              if (attempts < maxRetries) {
                setTimeout(attempt, 1000 * attempts);
              } else {
                reject(err);
              }
              return;
            }
            pipeResponseToFile(res2, localPath, resolve, (err) => {
              if (attempts < maxRetries) {
                setTimeout(attempt, 1000 * attempts);
              } else {
                reject(err);
              }
            });
          }).on('error', (err) => {
            if (attempts < maxRetries) {
              setTimeout(attempt, 1000 * attempts);
            } else {
              reject(err);
            }
          });
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`HTTP ${res.statusCode} for ${remotePath}`);
          if (attempts < maxRetries) {
            setTimeout(attempt, 1000 * attempts);
          } else {
            reject(err);
          }
          return;
        }

        pipeResponseToFile(res, localPath, resolve, (err) => {
          if (attempts < maxRetries) {
            setTimeout(attempt, 1000 * attempts);
          } else {
            reject(err);
          }
        });
      }).on('error', (err) => {
        if (attempts < maxRetries) {
          setTimeout(attempt, 1000 * attempts);
        } else {
          reject(err);
        }
      });
    }

    attempt();
  });
}

function pipeResponseToFile(res, localPath, onDone, onError) {
  const file = fs.createWriteStream(localPath);

  res.on('error', () => {
    file.destroy();
    fs.unlink(localPath, () => { });
    onError(new Error('Download stream error'));
  });

  res.pipe(file);

  file.on('finish', () => {
    file.close();
    onDone();
  });

  file.on('error', (err) => {
    fs.unlink(localPath, () => { });
    onError(err);
  });
}