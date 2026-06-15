/* Trades — list, create offer, accept/reject (CSR+ flow + Doppler/CH badges) */

(function () {
  const TYPES = { 1: 'Knife', 2: 'Rifle', 3: 'Heavy', 4: 'Pistol', 5: 'SMG', 8: 'Container', 9: 'Agent', 10: 'Sticker' };
  const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected', cancelled: 'Cancelled', canceled: 'Cancelled', expired: 'Expired', completed: 'Completed' };

  let _trades = [];
  let _loaded = false;
  let _myId = null;
  let _filter = 'all';
  let _view = 'list';
  let _bound = false;

  const state = {
    friends: [],
    partner: null,
    activeSide: 'me',
    me: { items: [], sel: new Set(), q: '', cat: 'all', loaded: false },
    them: { items: [], sel: new Set(), q: '', cat: 'all', loaded: false },
    sending: false
  };

  function t(key) {
    return (typeof window._invTranslate === 'function' ? window._invTranslate(key) : key);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function el(id) {
    return document.getElementById(id);
  }

  function getRarityInfo(r) {
    if (window.CSRInventory?.getRarityInfo) return CSRInventory.getRarityInfo(r);
    return { cls: 'item-rarity-consumer', hex: '#b0c3d9', name: 'Item' };
  }

  function rawDigits(v) {
    const s = String(v ?? '').trim();
    return /^\d+$/.test(s) ? s : null;
  }

  function digitsGt(a, b) {
    return a.length === b.length ? a > b : a.length > b.length;
  }

  function instanceAndImage(it) {
    const a = rawDigits(it.weapon_id);
    const b = rawDigits(it.item_id);
    if (a == null && b == null) return { instance: null, image: null };
    if (a == null) return { instance: b, image: b };
    if (b == null) return { instance: a, image: a };
    return digitsGt(a, b) ? { instance: a, image: b } : { instance: b, image: a };
  }

  function normalize(raw) {
    const it = raw || {};
    const { instance, image } = instanceAndImage(it);
    const n = {
      raw: it,
      id: instance != null ? String(instance) : null,
      weapon_id: image,
      name: it.name || 'Unknown item',
      float: it.float != null ? parseFloat(it.float) : null,
      seed: it.seed != null ? parseInt(it.seed, 10) : null,
      rarity: parseInt(it.rarity, 10) || 1,
      item_type: parseInt(it.item_type, 10) || 0,
      stattrak: !!it.stattrak,
      pattern: null
    };
    if (typeof CSR_resolveSkinPattern === 'function') n.pattern = CSR_resolveSkinPattern({ ...it, ...n });
    return n;
  }

  function wear(f) {
    if (f == null || Number.isNaN(f)) return null;
    if (f < 0.07) return { code: 'FN', c: '#4ade80' };
    if (f < 0.15) return { code: 'MW', c: '#86efac' };
    if (f < 0.38) return { code: 'FT', c: '#fbbf24' };
    if (f < 0.45) return { code: 'WW', c: '#fb923c' };
    return { code: 'BS', c: '#f87171' };
  }

  function splitName(name) {
    const star = /^★\s*/.test(name);
    const clean = String(name || '').replace(/^★\s*/, '').trim();
    const [weapon, skin] = clean.split('|').map((s) => s.trim());
    return { star, weapon: weapon || clean, skin: skin || '' };
  }

  function typeName(tp) {
    return TYPES[tp] || 'Other';
  }

  function patternRow(pat) {
    if (!pat || !window.CSRInventory?.patternBadge) return '';
    return `<div class="trade-pattern-row">${CSRInventory.patternBadge(pat)}</div>`;
  }

  function readCoins(inputId) {
    return Math.max(0, parseInt(el(inputId)?.value, 10) || 0);
  }

  function friendAvatarUrl(f) {
    const id = String(f.id ?? f.discord_id ?? '').replace(/\D/g, '');
    if (f.avatar && id) return `https://cdn.discordapp.com/avatars/${id}/${f.avatar}.png?size=64`;
    return '';
  }

  function tradeCard(it, side) {
    const id = it.id;
    const { star, weapon, skin } = splitName(it.name);
    const w = wear(it.float);
    const rInfo = getRarityInfo(it.rarity);
    const iconIds = [...new Set([it.weapon_id, it.id].filter(Boolean).map(String))];
    const card = document.createElement('div');
    card.className = `trade-item-card inventory-item ${rInfo.cls}`;
    card.style.setProperty('--trade-rarity', rInfo.hex);
    if (id && state[side].sel.has(String(id))) card.classList.add('selected');

    card.innerHTML = `
      <span class="trade-rarity-strip" style="background:${rInfo.hex}"></span>
      <div class="trade-card-top">
        ${it.stattrak ? '<span class="trade-st">ST™</span>' : '<span></span>'}
        ${w ? `<span class="trade-wear" style="color:${w.c}">${w.code}</span>` : ''}
      </div>
      <div class="trade-card-art"><img alt="" loading="lazy"><div class="trade-card-fallback">${esc(typeName(it.item_type))}</div></div>
      <div class="trade-card-meta">
        <div class="trade-card-name">${star ? '★ ' : ''}${esc(weapon)}</div>
        <div class="trade-card-skin" style="color:${rInfo.hex}">${esc(skin || rInfo.name)}</div>
      </div>
      <div class="trade-card-badges">
        ${w ? `<span class="trade-float" style="color:${w.c}">${w.code} · ${it.float.toFixed(4)}</span>` : ''}
        ${it.seed != null ? `<span class="trade-seed">#${it.seed}</span>` : ''}
      </div>
      ${patternRow(it.pattern)}`;

    const img = card.querySelector('img');
    if (img && iconIds.length) {
      let ii = 0;
      const tryNext = () => {
        if (ii >= iconIds.length) { card.classList.add('noimg'); return; }
        img.src = `https://cdn.csrestored.fun/skins/${iconIds[ii++]}.png`;
      };
      img.addEventListener('error', tryNext);
      tryNext();
    }

    card.addEventListener('click', () => {
      if (!id) return;
      const key = String(id);
      if (state[side].sel.has(key)) { state[side].sel.delete(key); card.classList.remove('selected'); }
      else { state[side].sel.add(key); card.classList.add('selected'); }
      updateSummary();
    });
    return card;
  }

  function itemsOf(data) {
    if (Array.isArray(data)) return data;
    return data?.items || data?.inventory || [];
  }

  function ingest(side, data) {
    state[side].items = itemsOf(data).map(normalize).filter((it) => it.id);
    state[side].loaded = true;
  }

  async function ensureMyId() {
    if (_myId) return _myId;
    const res = await window.api.auth.getUser();
    if (!res.error && res.user?.id) _myId = String(res.user.id);
    return _myId;
  }

  function perspective(tr, myId) {
    const iAmInitiator = String(tr.initiator_id) === String(myId);
    const ini = { items: tr.items_from_initiator || [], coins: tr.coins?.initiator_coins || 0 };
    const rec = { items: tr.items_from_recipient || [], coins: tr.coins?.recipient_coins || 0 };
    return {
      give: iAmInitiator ? ini : rec,
      get: iAmInitiator ? rec : ini,
      pending: String(tr.status).toLowerCase() === 'pending',
      iAmRecipient: String(tr.recipient_id) === String(myId)
    };
  }

  function sideSummary(side) {
    const bits = [];
    if (side.items.length) bits.push(`${side.items.length} items`);
    if (side.coins) bits.push(`${Number(side.coins).toLocaleString()} coins`);
    return bits.length ? bits.join(' + ') : 'nothing';
  }

  function renderTradeList() {
    const list = el('trades-list');
    if (!list) return;
    let rows = _trades.slice();
    if (_filter !== 'all') rows = rows.filter((tr) => String(tr.status).toLowerCase() === _filter);
    rows.sort((a, b) => new Date(b.completed_at || b.created_at || 0) - new Date(a.completed_at || a.created_at || 0));
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state"><p>${esc(t('trades_empty'))}</p></div>`;
      return;
    }
    list.innerHTML = '';
    rows.forEach((tr) => {
      const p = perspective(tr, _myId);
      const status = String(tr.status || '').toLowerCase();
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `trade-row trade-status-${status}`;
      row.innerHTML = `<div class="trade-row-main"><div class="trade-row-who">${esc(tr.initiator_name)} ↔ ${esc(tr.recipient_name)}</div><div class="trade-row-sub">${esc(sideSummary(p.give))} ↔ ${esc(sideSummary(p.get))}</div></div><span class="trade-row-status">${esc(STATUS_LABEL[status] || status)}</span>`;
      row.addEventListener('click', () => openTradeDetail(tr));
      list.appendChild(row);
    });
  }

  function itemDetailCard(raw) {
    const it = normalize(raw);
    const { star, weapon, skin } = splitName(it.name);
    const w = wear(it.float);
    const rInfo = getRarityInfo(it.rarity);
    const img = it.weapon_id ? `https://cdn.csrestored.fun/skins/${it.weapon_id}.png` : '';
    return `<div class="trade-detail-item">${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}<div><div>${star ? '★ ' : ''}${esc(weapon)}</div><div class="trade-detail-skin" style="color:${rInfo.hex}">${esc(skin)}</div>${w ? `<div style="color:${w.c}">${w.code} · ${it.float?.toFixed(4)} ${it.seed != null ? `#${it.seed}` : ''}</div>` : ''}${patternRow(it.pattern)}</div></div>`;
  }

  async function openTradeDetail(tr) {
    const modal = el('trades-detail-modal');
    const content = el('trades-detail-content');
    const actions = el('trades-detail-actions');
    if (!modal || !content) return;
    await ensureMyId();
    const p = perspective(tr, _myId);
    const status = String(tr.status || '').toLowerCase();
    content.innerHTML = `<h3>${esc(tr.initiator_name)} ↔ ${esc(tr.recipient_name)}</h3><p>${esc(STATUS_LABEL[status] || status)}</p><div class="trade-detail-cols"><div><h4>${esc(t('trades_you_give'))}</h4>${p.give.items.map(itemDetailCard).join('') || `<p>—</p>`}${p.give.coins ? `<p>${Number(p.give.coins).toLocaleString()} coins</p>` : ''}</div><div><h4>${esc(t('trades_you_receive'))}</h4>${p.get.items.map(itemDetailCard).join('') || `<p>—</p>`}${p.get.coins ? `<p>${Number(p.get.coins).toLocaleString()} coins</p>` : ''}</div></div>`;
    actions.innerHTML = '';
    if (p.pending && p.iAmRecipient) {
      const acc = document.createElement('button');
      acc.className = 'btn-primary';
      acc.textContent = t('trades_accept');
      acc.onclick = async () => {
        const r = await window.api.inventory.acceptTrade(tr.id);
        if (r?.error) alert(r.message);
        else { modal.hidden = true; _loaded = false; load(true); }
      };
      const rej = document.createElement('button');
      rej.className = 'btn-secondary';
      rej.textContent = t('trades_reject');
      rej.onclick = async () => {
        const r = await window.api.inventory.rejectTrade(tr.id);
        if (r?.error) alert(r.message);
        else { modal.hidden = true; _loaded = false; load(true); }
      };
      actions.append(acc, rej);
    }
    modal.hidden = false;
  }

  function visibleItems(side) {
    const s = state[side];
    let list = s.items;
    if (s.cat !== 'all') list = list.filter((it) => String(it.item_type) === s.cat);
    if (s.q) list = list.filter((it) => String(it.name).toLowerCase().includes(s.q));
    return list.sort((a, b) => b.rarity - a.rarity);
  }

  function renderItemGrid() {
    const grid = el('trades-item-grid');
    if (!grid) return;
    const side = state.activeSide;
    grid.innerHTML = '';
    const list = visibleItems(side);
    if (!list.length) { grid.innerHTML = `<div class="empty-state"><p>${esc(t('trades_no_items'))}</p></div>`; return; }
    list.slice(0, 200).forEach((it) => grid.appendChild(tradeCard(it, side)));
  }

  function buildCatChips() {
    const box = el('trades-cat-chips');
    if (!box) return;
    const side = state.activeSide;
    const counts = {};
    state[side].items.forEach((it) => { counts[it.item_type] = (counts[it.item_type] || 0) + 1; });
    box.innerHTML = '';
    const mk = (val, label, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'trade-cat-chip' + (state[side].cat === val ? ' active' : '');
      b.textContent = `${label} (${n})`;
      b.onclick = () => { state[side].cat = val; buildCatChips(); renderItemGrid(); };
      return b;
    };
    box.appendChild(mk('all', 'All', state[side].items.length));
    Object.keys(counts).forEach((tp) => box.appendChild(mk(String(tp), typeName(Number(tp)), counts[tp])));
  }

  function updateSummary() {
    const meCoins = readCoins('trades-me-coins');
    const themCoins = readCoins('trades-them-coins');
    const sum = el('trades-summary');
    if (sum) {
      sum.innerHTML = `<span>${esc(t('trades_you_give'))}: <strong>${state.me.sel.size}</strong> items${meCoins ? ` · <strong>${meCoins.toLocaleString()}</strong> coins` : ''}</span>` +
        `<span>${esc(t('trades_you_receive'))}: <strong>${state.them.sel.size}</strong> items${themCoins ? ` · <strong>${themCoins.toLocaleString()}</strong> coins` : ''}</span>`;
    }
    const btn = el('btn-trades-submit');
    const empty = !state.me.sel.size && !state.them.sel.size && !meCoins && !themCoins;
    if (btn) btn.disabled = state.sending || !state.partner || empty;
  }

  function switchSide(side) {
    state.activeSide = side;
    document.querySelectorAll('.trades-side-tab').forEach((b) => b.classList.toggle('active', b.dataset.tradeSide === side));
    if (side === 'them' && state.partner && !state.them.loaded) loadTheirInventory(state.partner.id).then(() => { buildCatChips(); renderItemGrid(); });
    else { buildCatChips(); renderItemGrid(); }
    updateSummary();
  }

  function renderFriends() {
    const grid = el('trades-friend-grid');
    if (!grid) return;
    const q = (el('trades-friend-search')?.value || '').trim().toLowerCase();
    const list = state.friends.filter((f) => {
      const name = String(f.name || f.username || '').toLowerCase();
      return !q || name.includes(q);
    });
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state"><p>${esc(state.friends.length ? t('trades_no_friends_match') : t('trades_no_friends'))}</p></div>`;
      return;
    }
    list.forEach((f) => {
      const id = String(f.id ?? '');
      const name = f.name || f.username || 'Player';
      const avatar = friendAvatarUrl(f);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'trade-friend-card';
      btn.innerHTML = `
        ${avatar ? `<img class="trade-friend-avatar" src="${esc(avatar)}" alt="">` : '<span class="trade-friend-avatar trade-friend-avatar-fallback"><i class="fa-solid fa-user"></i></span>'}
        <span class="trade-friend-name">${esc(name)}</span>`;
      btn.onclick = () => selectFriend(f);
      grid.appendChild(btn);
    });
  }

  async function loadFriends() {
    const res = await window.api.csr.getFriends();
    state.friends = (res?.friends || []).filter((f) => !f.state || f.state === 'accepted');
    renderFriends();
  }

  async function loadMyInventory() {
    if (state.me.loaded) return;
    await ensureMyId();
    const res = _myId ? await window.api.csr.getUserInventory(_myId) : await window.api.inventory.getCSR();
    ingest('me', res?.items || res);
    if (typeof CSR_learnItemIdFinishBatch === 'function') CSR_learnItemIdFinishBatch(state.me.items.map((i) => i.raw));
  }

  async function loadTheirInventory(id) {
    const res = await window.api.csr.getUserInventory(id);
    ingest('them', res?.items || []);
  }

  function selectFriend(f) {
    const name = f.name || f.username || 'Player';
    const avatar = friendAvatarUrl(f);
    state.partner = { id: String(f.id), name, avatar };
    state.me.sel.clear();
    state.them.sel.clear();
    state.them = { items: [], sel: new Set(), q: '', cat: 'all', loaded: false };
    el('trades-step-friend').hidden = true;
    el('trades-step-compose').hidden = false;
    el('trades-partner-name').textContent = t('trades_with').replace('{name}', name);
    const av = el('trades-partner-avatar');
    if (av) {
      if (avatar) { av.src = avatar; av.hidden = false; }
      else av.hidden = true;
    }
    const meCoins = el('trades-me-coins');
    const themCoins = el('trades-them-coins');
    if (meCoins) meCoins.value = '0';
    if (themCoins) themCoins.value = '0';
    switchSide('me');
    loadMyInventory().then(() => { buildCatChips(); renderItemGrid(); updateSummary(); });
    loadTheirInventory(f.id);
  }

  function showView(view) {
    _view = view;
    document.querySelectorAll('.trades-subtab').forEach((b) => b.classList.toggle('active', b.dataset.tradesView === view));
    el('trades-view-list').hidden = view !== 'list';
    el('trades-view-create').hidden = view !== 'create';
    if (view === 'create') {
      el('trades-step-friend').hidden = false;
      el('trades-step-compose').hidden = true;
      loadFriends();
    } else {
      load(true);
    }
  }

  async function sendTrade() {
    if (state.sending || !state.partner) return;
    const ownIds = new Set(state.me.items.map((it) => String(it.id)));
    const theirIds = new Set(state.them.items.map((it) => String(it.id)));
    const idList = (set, owned) => '[' + [...set].filter((x) => owned.has(x)).join(',') + ']';
    const initiatorCoins = readCoins('trades-me-coins');
    const recipientCoins = readCoins('trades-them-coins');
    if (!state.me.sel.size && !state.them.sel.size && !initiatorCoins && !recipientCoins) {
      showFormMsg(t('trades_need_items_or_coins'), true);
      return;
    }
    state.sending = true;
    updateSummary();
    const ref = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const body = `{"recipient_id":"${state.partner.id.replace(/[^\d]/g, '')}","initiator_items":${idList(state.me.sel, ownIds)},"initiator_coins":${initiatorCoins},"recipient_items":${idList(state.them.sel, theirIds)},"recipient_coins":${recipientCoins},"client_ref":"${ref}"}`;
    const res = await window.api.inventory.sendTrade(body);
    state.sending = false;
    if (res?.error) showFormMsg(res.message || t('trades_send_failed'), true);
    else {
      showFormMsg(t('trades_sent_ok'), false);
      state.me.sel.clear();
      state.them.sel.clear();
      if (el('trades-me-coins')) el('trades-me-coins').value = '0';
      if (el('trades-them-coins')) el('trades-them-coins').value = '0';
      renderItemGrid();
    }
    updateSummary();
  }

  function showFormMsg(text, err) {
    const m = el('trades-form-msg');
    if (!m) return;
    m.hidden = false;
    m.className = 'trades-form-msg' + (err ? ' err' : ' ok');
    m.textContent = text;
  }

  async function load(force) {
    await ensureMyId();
    if (_view !== 'list') return;
    if (_loaded && !force) { renderTradeList(); return; }
    const loading = el('trades-loading');
    if (loading) loading.style.display = 'flex';
    try {
      const res = await window.api.inventory.getTrades();
      if (loading) loading.style.display = 'none';
      if (res?.unauthorized) {
        _trades = [];
        const list = el('trades-list');
        if (list) list.innerHTML = `<div class="empty-state"><p>${esc(t('inventory_empty_login'))}</p></div>`;
        return;
      }
      if (res?.error) {
        _trades = [];
        const list = el('trades-list');
        if (list) list.innerHTML = `<div class="empty-state"><p>${esc(res.message || t('trades_load_error'))}</p></div>`;
        return;
      }
      _trades = res?.trades || [];
      _loaded = true;
      renderTradeList();
    } catch (e) {
      if (loading) loading.style.display = 'none';
      const list = el('trades-list');
      if (list) list.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
    }
  }

  function activateFromTab() {
    showView('list');
  }

  function setup() {
    if (_bound) return;
    _bound = true;
    document.querySelectorAll('.trades-subtab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.tradesView)));
    document.querySelectorAll('.trades-filter').forEach((b) => b.addEventListener('click', () => { _filter = b.dataset.tradesFilter; document.querySelectorAll('.trades-filter').forEach((x) => x.classList.toggle('active', x === b)); renderTradeList(); }));
    document.querySelectorAll('.trades-side-tab').forEach((b) => b.addEventListener('click', () => switchSide(b.dataset.tradeSide)));
    el('btn-trades-change-friend')?.addEventListener('click', () => { el('trades-step-compose').hidden = true; el('trades-step-friend').hidden = false; });
    el('btn-trades-submit')?.addEventListener('click', sendTrade);
    el('btn-trades-detail-close')?.addEventListener('click', () => { el('trades-detail-modal').hidden = true; });
    el('trades-item-search')?.addEventListener('input', () => { state[state.activeSide].q = el('trades-item-search').value.trim().toLowerCase(); renderItemGrid(); });
    el('trades-friend-search')?.addEventListener('input', renderFriends);
    ['trades-me-coins', 'trades-them-coins'].forEach((id) => {
      el(id)?.addEventListener('input', updateSummary);
    });
  }

  window.CSRTrades = { setup, load, activateFromTab, invalidate: () => { _loaded = false; } };
})();
