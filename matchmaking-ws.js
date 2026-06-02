/**
 * CS:Restored matchmaking via Phoenix channels (socket.csrestored.fun).
 */
const { randomUUID } = require('crypto');
const { Socket, Presence } = require('phoenix');

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
      queue: { total: 0 },
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
    this.matchChannel = null;
    this.matchData = null;
    this._matchPickTimer = null;
    this._matchPickSeconds = 20;
    this._connectTimer = null;
    this._connectSeconds = null;
    this.pendingGroupInvites = [];
  }

  isGroupLeader() {
    if (!this.group) return true;
    if (!this.group.leader) {
      const members = this.group.members || [];
      return members.length <= 1 || String(members[0]) === String(this.userId);
    }
    return String(this.group.leader) === String(this.userId);
  }

  emptyMatchData() {
    return {
      id: null,
      type: '5v5:eu',
      members: [[], []],
      members_data: {},
      map_pick: {
        started: false,
        remaining_maps: {},
        turn_order: [],
        turn_index: 0,
        current_team: 1,
        votes: {},
        banned_maps: {},
        finished: false
      },
      final_map: null,
      server_ip: null,
      active: []
    };
  }

  getMatchPhase() {
    const m = this.matchData;
    if (!m?.id) return null;
    if (m.server_ip) return 'connect';
    if (m.final_map) return 'preparing';
    if (m.map_pick?.started) return 'pickban';
    if (this.matchChannel) return 'waiting';
    return 'accept';
  }

  shouldShowAcceptModal() {
    const m = this.matchData;
    return !!m?.id && !m.map_pick?.started;
  }

  getPublicState() {
    const [mode, region] = (this.localQueueType || '5v5:eu').split(':');
    const match = this.matchData;
    const matchPhase = this.getMatchPhase();
    return {
      connected: this.connected,
      status: this.status,
      activePlayers: Object.keys(this.onlineUsers).length,
      onlineUsers: this.onlineUsers,
      group: this.group,
      queueType: this.localQueueType,
      mode,
      region,
      queueState: this.queueState,
      inQueue: !!this.queueChannel,
      queueAccepted: !!this.queueState.accepted,
      availableQueueType: this.availableQueueType,
      groupQueueMembers: this.groupQueueMembers,
      isLeader: this.isGroupLeader(),
      queueElapsed: this._queueStartedAt
        ? Math.floor((Date.now() - this._queueStartedAt) / 1000)
        : 0,
      lastError: this.lastError,
      pendingGroupInvites: this.pendingGroupInvites,
      match: match?.id ? { ...match, phase: matchPhase, inChannel: !!this.matchChannel } : null,
      inMatch: !!match?.id,
      pendingAccept: this.shouldShowAcceptModal(),
      showAcceptModal: this.shouldShowAcceptModal(),
      matchPickSeconds: this._matchPickSeconds,
      connectSeconds: this._connectSeconds
    };
  }

  emit(extra) {
    if (this.notify) {
      this.notify(extra ? { ...this.getPublicState(), ...extra } : this.getPublicState());
    }
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
      if (!this.socket) return resolve({ channel: null, error: 'Socket not connected' });
      const ch = this.socket.channel(topic, {});
      ch.join()
        .receive('ok', () => resolve({ channel: ch, error: null }))
        .receive('error', (resp) => {
          const reason = resp?.reason || resp?.response?.reason || 'unknown';
          console.warn('[MM] join error', topic, reason);
          resolve({ channel: null, error: ERROR_MESSAGES[reason] || reason });
        })
        .receive('timeout', () => resolve({ channel: null, error: 'Channel join timeout' }));
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

    this.disconnect(true);
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
          const userResult = await this.joinUserChannel();
          if (!userResult.channel) {
            finish({ ok: false, error: userResult.error || 'Failed to join user channel' });
            return;
          }

          const lobbyResult = await this.joinLobby();
          if (!lobbyResult.channel) {
            console.warn('[MM] lobby join failed:', lobbyResult.error);
          }

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
        if (!settled && !this.connected) {
          finish({ ok: false, error: 'WebSocket connection timeout' });
        }
      }, 15000);
    });
  }

  disconnect(force) {
    if (!force && (this.matchChannel || this.matchData?.id || this.queueChannel)) {
      return;
    }
    this.leaveMatch();
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
    this.leaveMatch(true);
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

  stopMatchTimers() {
    if (this._matchPickTimer) clearInterval(this._matchPickTimer);
    this._matchPickTimer = null;
    if (this._connectTimer) clearInterval(this._connectTimer);
    this._connectTimer = null;
  }

  startPickTimer() {
    this.stopMatchTimers();
    this._matchPickSeconds = 20;
    this._matchPickTimer = setInterval(() => {
      if (this._matchPickSeconds <= 1) {
        this._matchPickSeconds = 0;
        this.stopMatchTimers();
        this.emit({ pickTimerExpired: true });
      } else {
        this._matchPickSeconds -= 1;
        this.emit();
      }
    }, 1000);
  }

  startConnectTimer() {
    this.stopMatchTimers();
    this._connectSeconds = 300;
    this._connectTimer = setInterval(() => {
      if (this._connectSeconds <= 1) {
        this._connectSeconds = 0;
        this.stopMatchTimers();
      } else {
        this._connectSeconds -= 1;
      }
      this.emit();
    }, 1000);
  }

  handleMatchFound(payload) {
    this.matchData = {
      ...(this.matchData || this.emptyMatchData()),
      ...payload,
      id: payload.id ?? this.matchData?.id
    };
    this.emit({ matchFound: true, matchId: this.matchData.id });
  }

  handleMatchAcceptedUsers(users) {
    if (!this.matchData) return;
    this.matchData = { ...this.matchData, active: users?.users || users || [] };
    this.emit();
  }

  handleMatchNotAccepted() {
    this.leaveMatch();
    this.matchData = null;
    this.emit({ matchCancelled: true });
  }

  handleEveryoneAccepted() {
    this.leaveQueue();
    this.availableQueueType = null;
    this.groupQueueMembers = [];
    this.emit();
  }

  bindUserMatchEvents(ch) {
    ch.on('match_found', (payload) => this.handleMatchFound(payload));
    ch.on('match_accepted_users', (payload) => this.handleMatchAcceptedUsers(payload));
    ch.on('match_everyone_accepted', () => this.handleEveryoneAccepted());
    ch.on('match_not_accepted', () => this.handleMatchNotAccepted());
  }

  bindQueueMatchEvents(ch) {
    ch.on('match_found', (payload) => this.handleMatchFound(payload));
    ch.on('match_accepted_users', (payload) => this.handleMatchAcceptedUsers(payload));
    ch.on('match_everyone_accepted', () => this.handleEveryoneAccepted());
    ch.on('match_not_accepted', () => this.handleMatchNotAccepted());
  }

  bindMatchChannel(ch) {
    this.matchChannel = ch;

    ch.on('match_not_accepted_user', (payload) => {
      console.log('[MM] user failed to accept:', payload?.user_id);
    });

    ch.on('map_pick_update', (payload) => {
      if (!this.matchData) return;
      const wasStarted = !!this.matchData.map_pick?.started;
      this.matchData = {
        ...this.matchData,
        map_pick: { ...(payload.state || payload), started: true }
      };
      this.startPickTimer();
      this.emit(wasStarted ? undefined : { mapPickStarted: true });
    });

    ch.on('map_pick_finished', (payload) => {
      if (!this.matchData) return;
      this.matchData = {
        ...this.matchData,
        map_pick: { ...this.matchData.map_pick, started: true, finished: true },
        final_map: payload.final_map || payload
      };
      this.stopMatchTimers();
      this.emit();
    });

    ch.on('server_prepared', (payload) => {
      if (!this.matchData) return;
      this.matchData = {
        ...this.matchData,
        map_pick: { ...this.matchData.map_pick, started: true },
        server_ip: payload.ip || payload.server_ip
      };
      this.startConnectTimer();
      this.emit({ serverReady: true });
    });

    ch.on('server_not_available', () => {
      this.setError('Server not available');
      this.emit({ serverError: true });
    });
  }

  async joinMatch(matchId) {
    const id = matchId ?? this.matchData?.id;
    if (!id || !this.connected) {
      return { ok: false, error: 'No match to join' };
    }

    if (this.matchChannel && String(this.matchData?.id) === String(id)) {
      return { ok: true };
    }

    this.leaveMatch(false);
    const { channel: ch, error } = await this.joinChannel(`match:${id}`);
    if (!ch) {
      this.setError(error || 'Could not join match');
      return { ok: false, error: error || 'Could not join match' };
    }

    if (!this.matchData?.id) {
      this.matchData = { ...this.emptyMatchData(), id };
    } else {
      this.matchData = { ...this.matchData, id };
    }

    this.bindMatchChannel(ch);
    this.clearError();
    this.emit({ matchJoined: true, matchId: id });
    return { ok: true };
  }

  submitBanVotes(votes) {
    if (!this.matchChannel) return { ok: false, error: 'Not in match' };
    const list = Array.isArray(votes) ? votes : [];
    this.matchChannel.push('submit_ban_votes', { votes: list });
    return { ok: true };
  }

  leaveMatch(clearData = true) {
    this.stopMatchTimers();
    this.leaveChannel(this.matchChannel);
    this.matchChannel = null;
    this._matchPickSeconds = 20;
    this._connectSeconds = null;
    if (clearData) this.matchData = null;
    this.emit();
  }

  async joinLobby() {
    const { channel: ch, error } = await this.joinChannel('room:lobby');
    if (!ch) return { channel: null, error };

    this.lobbyChannel = ch;

    ch.on('status_update', (payload) => {
      this.status = {
        matches: payload.matches ?? 0,
        queue: { total: 0, ...(payload.queue || {}) },
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

    return { channel: ch, error: null };
  }

  async joinUserChannel() {
    const { channel: ch, error } = await this.joinChannel(`user:${this.userId}`);
    if (!ch) return { channel: null, error };

    this.userChannel = ch;

    ch.on('group_channel', ({ id }) => {
      if (id) this.joinOrCreateGroup(id);
    });

    ch.on('group_invite', (payload) => {
      const invite = {
        _id: randomUUID(),
        group_id: payload.group_id,
        inviter_id: payload.inviter_id,
        receivedAt: Date.now()
      };
      this.pendingGroupInvites = [
        ...this.pendingGroupInvites.filter((i) => i.group_id !== invite.group_id),
        invite
      ];
      this.emit({ groupInvite: invite });
      setTimeout(() => {
        this.pendingGroupInvites = this.pendingGroupInvites.filter((i) => i._id !== invite._id);
        this.emit();
      }, 15000);
    });

    ch.on('match_channel', ({ id }) => {
      console.log('[MM] match channel invite, id:', id);
      if (id) this.joinMatch(id);
    });

    this.bindUserMatchEvents(ch);

    return { channel: ch, error: null };
  }

  bindRoomChannel(ch, id) {
    this.roomChannel = ch;

    ch.on('group_state', (payload) => {
      const group = payload.group || {};
      const members = (group.members || []).map(String);
      const invited = (group.invited || []).map(String);
      const uid = String(this.userId);

      if (members.length && !members.includes(uid)) {
        this.leaveGroup();
        return;
      }

      const prevCount = this.group?.members?.length ?? 0;
      if (prevCount && members.length !== prevCount) {
        this.leaveQueue();
      }

      this.group = {
        ...group,
        id,
        channel: ch,
        members,
        invited,
        leader: group.leader != null ? String(group.leader) : null
      };

      if (!this.group.leader && members.length === 1 && members[0] === uid) {
        this.group.leader = uid;
      }

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
      if (payload.type) {
        this.availableQueueType = payload.type;
        this.emit();
      }
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
  }

  async ensureGroup() {
    if (this.roomChannel) return this.roomChannel;
    return this.joinOrCreateGroup();
  }

  async acceptGroupInvite(groupId) {
    if (!groupId) return { ok: false, error: 'Invalid invite' };
    this.pendingGroupInvites = this.pendingGroupInvites.filter(
      (i) => i.group_id !== groupId
    );
    const ch = await this.joinOrCreateGroup(groupId);
    return ch ? { ok: true } : { ok: false, error: 'Could not join group' };
  }

  declineGroupInvite(inviteId) {
    this.pendingGroupInvites = this.pendingGroupInvites.filter((i) => i._id !== inviteId);
    this.emit();
    return { ok: true };
  }

  async joinOrCreateGroup(roomId) {
    if (!this.connected || !this.userChannel) return null;

    if (roomId && this.group?.id === roomId && this.roomChannel) {
      return this.roomChannel;
    }

    this.leaveQueue();
    if (this.roomChannel) {
      this.leaveChannel(this.roomChannel);
      this.roomChannel = null;
    }

    const id = roomId || randomUUID();
    const { channel: ch, error } = await this.joinChannel(`room:${id}`);
    if (!ch) {
      this.setError(error || 'Could not create team lobby');
      return null;
    }

    this.group = {
      id,
      leader: String(this.userId),
      members: [String(this.userId)],
      name: null,
      invited: []
    };

    this.bindRoomChannel(ch, id);
    ch.push('queue_type', { type: this.localQueueType });

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

    if (this.roomChannel && this.isGroupLeader()) {
      this.roomChannel.push('queue_type', { type });
    }
    this.emit();
  }

  async attachQueueChannel(type) {
    this.leaveQueue();
    const { channel: ch, error } = await this.joinChannel(`queue:${type}`);
    if (!ch) {
      this.setError(error || 'Could not join queue channel');
      return false;
    }

    this.queueChannel = ch;
    this.queueState = { type, accepted: false, count: 0 };
    this.availableQueueType = null;
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

    this.bindQueueMatchEvents(ch);

    this.emit();
    return true;
  }

  /** Mirror site: Accept (availableQueueType) or Join Queue (leader). */
  async joinQueue() {
    if (!this.connected || !this.userChannel) {
      this.setError('Not connected — log in via Discord first');
      return { ok: false };
    }
    this.clearError();

    const type = this.queueTypeState || this.localQueueType;

    if (this.availableQueueType) {
      return { ok: await this.attachQueueChannel(this.availableQueueType) };
    }

    if (this.roomChannel && this.isGroupLeader()) {
      this.roomChannel.push('queue', {});
      const ok = await this.attachQueueChannel(type);
      return { ok };
    }

    if (!this.group || this.isGroupLeader()) {
      await this.ensureGroup();
      if (this.roomChannel && this.isGroupLeader()) {
        this.roomChannel.push('queue', {});
      }
      const ok = await this.attachQueueChannel(type);
      return { ok };
    }

    this.setError('Only the group leader can start the queue');
    return { ok: false };
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
    this.availableQueueType = null;
    this.stopQueueTimer();
    this.emit();
  }

  async inviteUser(friendUserId) {
    const ch = await this.ensureGroup();
    if (!ch) {
      this.setError('Team lobby not ready');
      return { ok: false };
    }
    if (!this.isGroupLeader()) {
      this.setError('Only the group leader can invite');
      return { ok: false };
    }
    ch.push('invite_user', { user_id: String(friendUserId) });
    this.clearError();
    return { ok: true };
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
