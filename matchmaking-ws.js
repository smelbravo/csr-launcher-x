/**
 * CS:Restored matchmaking via Phoenix channels (socket.csrestored.fun).
 * Protocol mirrored from csrestored.fun/app client.
 */
const { randomUUID } = require('crypto');
const { Socket, Channel, Presence } = require('phoenix');

const WS_URL = 'https://socket.csrestored.fun/socket';

const ERROR_MESSAGES = {
  bad_request: 'Bad request',
  unauthorized: 'Unauthorized',
  forbidden: "You don't have permission to do that",
  already_in_queue: 'You are already in queue',
  already_in_match: 'You are already in a match',
  user_not_verified: 'Account not verified — join Discord on csrestored.fun',
  user_banned: 'Account banned',
  group_too_big: 'Your group is too big',
  user_in_match: 'That user is in a match',
  user_in_queue: 'This user is in queue'
};

class MatchmakingService {
  constructor(notify) {
    this.notify = notify;
    this.socket = null;
    this.presence = null;
    this.lobbyChannel = null;
    this.userChannel = null;
    this.roomChannel = null;
    this.queueChannel = null;
    this.userId = null;
    this.connected = false;
    this.status = {
      matches: 0,
      queue: { total: 0, '5w5': 0, '5v5': 0, '5h5': 0, '2v2': 0 },
      live_matches: {}
    };
    this.onlineUsers = {};
    this.group = null;
    this.localQueueType = '5v5:eu';
    this.queueTypeState = null;
    this.queueState = { type: '5v5:eu', accepted: false, count: 0 };
    this.availableQueueType = null;
    this.groupQueueMembers = [];
    this.lastError = null;
    this._queueTimer = null;
    this._queueStartedAt = null;
  }

  getPublicState() {
    const [mode, region] = (this.localQueueType || '5v5:eu').split(':');
    return {
      connected: this.connected,
      status: this.status,
      activePlayers: Object.keys(this.onlineUsers).length,
      group: this.group,
      queueType: this.localQueueType,
      mode,
      region,
      queueState: this.queueState,
      inQueue: !!this.queueChannel,
      queueAccepted: !!this.queueState.accepted,
      availableQueueType: this.availableQueueType,
      groupQueueMembers: this.groupQueueMembers,
      queueElapsed: this._queueStartedAt
        ? Math.floor((Date.now() - this._queueStartedAt) / 1000)
        : 0,
      lastError: this.lastError
    };
  }

  emit() {
    if (this.notify) this.notify(this.getPublicState());
  }

  setError(keyOrMsg) {
    this.lastError = ERROR_MESSAGES[keyOrMsg] || keyOrMsg || null;
    this.emit();
  }

  clearError() {
    this.lastError = null;
  }

  joinChannel(topic) {
    return new Promise((resolve) => {
      if (!this.socket) return resolve(null);
      const ch = this.socket.channel(topic, {});
      ch.join()
        .receive('ok', () => resolve(ch))
        .receive('error', (e) => {
          console.warn('[MM] join error', topic, e);
          resolve(null);
        })
        .receive('timeout', () => resolve(null));
    });
  }

  leaveChannel(ch) {
    if (ch) {
      try {
        ch.leave();
      } catch (_) { /* ignore */ }
    }
  }

  async connect(token, userId) {
    if (!token || !userId) {
      return { ok: false, error: 'Not logged in (missing WebSocket token)' };
    }

    this.disconnect();
    this.userId = String(userId);
    this.clearError();

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      this.socket = new Socket(WS_URL, { params: { token: String(token) } });

      this.socket.onOpen(async () => {
        this.connected = true;
        console.log('[MM] WebSocket connected');
        try {
          await this.joinLobby();
          await this.joinUserChannel();
          await this.joinOrCreateGroup();
          this.emit();
          finish({ ok: true });
        } catch (e) {
          finish({ ok: false, error: e.message || 'Failed to join channels' });
        }
      });

      this.socket.onError((err) => {
        console.error('[MM] socket error', err);
        this.setError('Connection error');
        finish({ ok: false, error: 'WebSocket error' });
      });

      this.socket.onClose(() => {
        console.log('[MM] WebSocket closed');
        this.connected = false;
        this.cleanupChannels();
        this.emit();
      });

      this.socket.connect();

      setTimeout(() => {
        if (!this.connected) finish({ ok: false, error: 'WebSocket connection timeout' });
      }, 15000);
    });
  }

  disconnect() {
    this.leaveQueue();
    this.leaveGroup();
    this.cleanupChannels();
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch (_) { /* ignore */ }
      this.socket = null;
    }
    this.connected = false;
    this.stopQueueTimer();
    this.emit();
  }

  cleanupChannels() {
    this.leaveChannel(this.userChannel);
    this.leaveChannel(this.lobbyChannel);
    this.leaveChannel(this.roomChannel);
    this.leaveChannel(this.queueChannel);
    this.userChannel = null;
    this.lobbyChannel = null;
    this.roomChannel = null;
    this.queueChannel = null;
    this.presence = null;
    this.onlineUsers = {};
  }

  async joinLobby() {
    const ch = await this.joinChannel('room:lobby');
    if (!ch) return;
    this.lobbyChannel = ch;

    ch.on('status_update', (payload) => {
      this.status = {
        matches: payload.matches ?? 0,
        queue: payload.queue || { total: 0 },
        live_matches: payload.live_matches || {}
      };
      this.emit();
    });

    this.presence = new Presence(ch);
    this.presence.onSync(() => {
      const users = {};
      this.presence.list((id, { metas, user }) => {
        users[id] = { metas, user };
      });
      this.onlineUsers = users;
      this.emit();
    });
  }

  async joinUserChannel() {
    const ch = await this.joinChannel(`user:${this.userId}`);
    if (!ch) return;
    this.userChannel = ch;

    ch.on('group_channel', ({ id }) => {
      if (id) this.joinOrCreateGroup(id);
    });

    ch.on('match_channel', ({ id }) => {
      console.log('[MM] match_channel', id);
    });
  }

  async joinOrCreateGroup(roomId) {
    if (!this.connected) return null;

    this.leaveQueue();
    if (this.roomChannel) {
      this.leaveChannel(this.roomChannel);
      this.roomChannel = null;
    }

    const id = roomId || randomUUID();
    const ch = await this.joinChannel(`room:${id}`);
    if (!ch) return null;

    this.roomChannel = ch;
    this.group = { id, leader: null, members: [], name: null, channel: ch };

    ch.push('queue_type', { type: this.localQueueType });

    ch.on('group_state', (payload) => {
      const members = payload.group?.members || [];
      if (this.userId && members.length && !members.includes(this.userId)) {
        this.leaveGroup();
        return;
      }
      this.group = {
        ...payload.group,
        id,
        channel: ch,
        members
      };
      this.emit();
    });

    ch.on('queue_type_state', (payload) => {
      if (payload.type) {
        this.queueTypeState = payload.type;
        this.localQueueType = payload.type;
        this.emit();
      }
    });

    ch.on('queue_channel', (payload) => {
      if (payload.type) this.availableQueueType = payload.type;
      this.emit();
    });

    ch.on('queue_confirmed', () => {
      this.queueState = { ...this.queueState, accepted: true };
      this.emit();
    });

    ch.on('queue_group_state', (payload) => {
      if (payload.members) this.groupQueueMembers = payload.members;
      if (payload.count != null) {
        this.queueState = { ...this.queueState, count: payload.count };
      }
      this.emit();
    });

    this.emit();
    return ch;
  }

  leaveGroup() {
    if (this.roomChannel) {
      this.leaveQueue();
      this.roomChannel.push('leave_group', {});
      this.leaveChannel(this.roomChannel);
      this.roomChannel = null;
    }
    this.group = null;
    this.groupQueueMembers = [];
    this.availableQueueType = null;
    this.emit();
  }

  setQueueType(type) {
    if (!type || !type.includes(':')) return;
    this.localQueueType = type;
    this.clearError();

    if (this.roomChannel && this.group?.leader === this.userId) {
      this.roomChannel.push('queue_type', { type });
    }
    this.emit();
  }

  async attachQueueChannel(type) {
    this.leaveQueue();
    const ch = await this.joinChannel(`queue:${type}`);
    if (!ch) {
      this.setError('Could not join queue channel');
      return false;
    }

    this.queueChannel = ch;
    this.queueState = { type, accepted: false, count: 0 };
    this.startQueueTimer();

    ch.on('queue_state', (payload) => {
      if (payload.count != null) {
        this.queueState = { ...this.queueState, count: payload.count };
        this.emit();
      }
    });

    ch.on('queue_confirmed', () => {
      this.queueState = { ...this.queueState, accepted: true };
      this.emit();
    });

    this.emit();
    return true;
  }

  async joinQueue() {
    if (!this.connected) {
      this.setError('Not connected');
      return { ok: false };
    }
    this.clearError();

    const type = this.localQueueType;
    const isLeader = this.group?.leader === this.userId;

    if (this.roomChannel && isLeader) {
      this.roomChannel.push('queue', {});
      const ok = await this.attachQueueChannel(this.queueTypeState || type);
      return { ok };
    }

    const queueType = this.availableQueueType || type;
    const ok = await this.attachQueueChannel(queueType);
    return { ok };
  }

  leaveQueue() {
    this.leaveChannel(this.queueChannel);
    this.queueChannel = null;
    this.queueState = {
      type: this.localQueueType,
      accepted: false,
      count: 0
    };
    this.groupQueueMembers = [];
    this.stopQueueTimer();
    this.emit();
  }

  startQueueTimer() {
    this.stopQueueTimer();
    this._queueStartedAt = Date.now();
    this._queueTimer = setInterval(() => this.emit(), 1000);
  }

  stopQueueTimer() {
    if (this._queueTimer) clearInterval(this._queueTimer);
    this._queueTimer = null;
    this._queueStartedAt = null;
  }
}

module.exports = { MatchmakingService, ERROR_MESSAGES };
