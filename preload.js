const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
  },
  game: {
    launch: () => ipcRenderer.invoke('launch-game'),
    onStateUpdate: (callback) => {
      ipcRenderer.on('game-state-update', (event, data) => callback(data));
    },
    onLaunchStatus: (callback) => {
      ipcRenderer.on('game-launch', (event, data) => callback(data));
    },
    getStatus: () => ipcRenderer.invoke('get-game-status'),
    checkBeforeLaunch: () => ipcRenderer.invoke('check-and-update-before-launch'),
    downloadWithProgress: (gameDir) => ipcRenderer.invoke('download-updates-with-progress', gameDir)
  },
  settings: {
    get: () => ipcRenderer.invoke('get-settings'),
    save: (data) => ipcRenderer.send('save-settings', data),
    onSaved: (callback) => {
      ipcRenderer.on('settings-saved', (event, data) => callback(data));
    }
  },
  inventory: {
    getCSR: () => ipcRenderer.invoke('get-csr-inventory')
  },
  dialog: {
    browseFolder: () => ipcRenderer.invoke('browse-folder'),
    browseFile: (filters) => ipcRenderer.invoke('browse-file', filters)
  },
  auth: {
    login: () => ipcRenderer.invoke('start-login'),
    logout: () => ipcRenderer.invoke('logout'),
    checkStatus: () => ipcRenderer.invoke('check-auth'),
    getUser: () => ipcRenderer.invoke('get-csr-user'),
    onStatusChange: (callback) => {
      ipcRenderer.on('auth-status', (event, data) => callback(data));
    }
  },
  matchmaking: {
    start: () => ipcRenderer.invoke('mm-start'),
    stop: (force) => ipcRenderer.invoke('mm-stop', force),
    getState: () => ipcRenderer.invoke('mm-get-state'),
    setQueueType: (type) => ipcRenderer.invoke('mm-set-queue-type', type),
    joinQueue: () => ipcRenderer.invoke('mm-join-queue'),
    leaveQueue: () => ipcRenderer.invoke('mm-leave-queue'),
    leaveGroup: () => ipcRenderer.invoke('mm-leave-group'),
    inviteUser: (userId) => ipcRenderer.invoke('mm-invite-user', userId),
    acceptGroupInvite: (groupId) => ipcRenderer.invoke('mm-accept-group-invite', groupId),
    declineGroupInvite: (inviteId) => ipcRenderer.invoke('mm-decline-group-invite', inviteId),
    joinMatch: (matchId) => ipcRenderer.invoke('mm-join-match', matchId),
    submitBanVotes: (votes) => ipcRenderer.invoke('mm-submit-ban-votes', votes),
    leaveMatch: () => ipcRenderer.invoke('mm-leave-match'),
    onUpdate: (callback) => {
      ipcRenderer.on('mm-state', (event, data) => callback(data));
    }
  },
  csr: {
    getFriends: () => ipcRenderer.invoke('get-csr-friends'),
    getHistory: () => ipcRenderer.invoke('get-csr-history'),
    getLeaderboard: () => ipcRenderer.invoke('get-csr-leaderboard'),
    getMatch: (id) => ipcRenderer.invoke('get-csr-match', id),
    openExternal: (url) => ipcRenderer.invoke('open-external-url', url),
    checkUpdates: () => ipcRenderer.invoke('check-csr-updates'),
    downloadFiles: (gameDir) => ipcRenderer.invoke('download-csr-files', gameDir),
    cancelDownload: () => ipcRenderer.send('cancel-download'),
    onUpdateProgress: (callback) => {
      ipcRenderer.on('update-progress', (event, data) => callback(data));
    }
  },
  language: {
    getCurrent: () => ipcRenderer.invoke('get-language'),
    save: (name) => ipcRenderer.invoke('save-language', name),
    getList: () => ipcRenderer.invoke('get-languages'),
    getData: (name) => ipcRenderer.invoke('get-language-data', name)
  }
});
