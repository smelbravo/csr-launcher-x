/* Marketplace — browse listings, my offers, create offer */

(function () {
  const PAGE_SIZE = window.CSRInventory?.INVENTORY_PAGE_SIZE || 50;

  let _offers = [];
  let _loaded = false;
  let _myOffersOnly = false;
  let _myUserId = null;
  let _bound = false;
  let _createSel = null;
  let _ownedSkinIds = new Set();
  let _ownedNames = new Set();
  let _renderLimit = PAGE_SIZE;
  let _cachedFiltered = [];

  function t(key) {
    return (typeof window._invTranslate === 'function' ? window._invTranslate(key) : key);
  }

  function tf(key, params) {
    let str = t(key);
    if (params) Object.entries(params).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
    return str;
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

  function compareRarity(a, b) {
    if (window.CSRInventory?.compareRarity) return CSRInventory.compareRarity(a, b);
    return (b.rarity || 0) - (a.rarity || 0);
  }

  function rawDigits(v) {
    const s = String(v ?? '').trim();
    return /^\d+$/.test(s) ? s : null;
  }

  function digitsGt(a, b) {
    return a.length === b.length ? a > b : a.length > b.length;
  }

  function instanceId(item) {
    const a = rawDigits(item?.weapon_id);
    const b = rawDigits(item?.item_id);
    if (a == null && b == null) return null;
    if (a == null) return b;
    if (b == null) return a;
    return digitsGt(a, b) ? a : b;
  }

  function csrImageId(item) {
    if (window.CSRInventory?.csrImageIdFromItem) {
      const id = CSRInventory.csrImageIdFromItem(item);
      if (id) return id;
    }
    if (!item) return null;
    const nested = item.item || item.weapon || item.skin;
    const a = rawDigits(item.weapon_id ?? nested?.weapon_id);
    const b = rawDigits(item.item_id ?? item.skin_id ?? nested?.item_id ?? nested?.skin_id);
    if (a == null && b == null) {
      if (typeof CSR_skinDefinitionId === 'function') {
        const id = CSR_skinDefinitionId(item);
        return id != null ? String(id) : null;
      }
      return null;
    }
    if (a == null) return b;
    if (b == null) return a;
    return digitsGt(a, b) ? b : a;
  }

  function normalizeOffer(o) {
    if (!o || typeof o !== 'object') return null;
    const item = o.item || o.weapon || o.skin || o;
    const price = parseInt(o.price ?? o.list_price ?? item?.price, 10);
    const fl = o.skin_float ?? item?.skin_float ?? o.float ?? item?.float;
    const seed = o.skin_seed ?? item?.skin_seed ?? o.seed ?? item?.seed;
    const name = o.item_name ?? o.name ?? item?.name;
    if (!name && !Number.isFinite(price)) return null;
    const skinDefId = csrImageId(o);
    const normalized = {
      offer_id: o.id ?? o.offer_id ?? o.listing_id,
      name: name || 'Item',
      price: Number.isFinite(price) ? price : 0,
      float: fl != null ? parseFloat(fl) : null,
      seed: seed != null ? parseInt(seed, 10) : null,
      rarity: parseInt(o.item_rarity ?? o.rarity ?? item?.item_rarity ?? item?.rarity, 10) || 1,
      stattrak: !!(o.stat_trak ?? o.stattrak ?? item?.stattrak),
      item_type: parseInt(o.item_type ?? item?.item_type, 10) || 0,
      seller_id: String(o.seller_id ?? o.user_id ?? o.owner_id ?? item?.user_id ?? ''),
      seller_name: o.seller_name ?? o.username ?? o.user_name ?? '',
      seller_avatar: o.seller_avatar ?? o.avatar ?? null,
      weapon_id: skinDefId,
      pattern: null
    };
    if (typeof CSR_resolveSkinPattern === 'function') {
      normalized.pattern = CSR_resolveSkinPattern({ ...item, ...o, ...normalized });
    }
    return normalized;
  }

  function getWearCode(f) {
    if (f == null || Number.isNaN(f)) return '';
    if (f < 0.07) return 'FN';
    if (f < 0.15) return 'MW';
    if (f < 0.38) return 'FT';
    if (f < 0.45) return 'WW';
    return 'BS';
  }

  function patternBadge(pat) {
    if (!pat || !window.CSRInventory?.patternBadge) return '';
    return CSRInventory.patternBadge(pat);
  }

  function dopplerKey(item) {
    const p = item?.pattern;
    if (!p || p.type !== 'doppler') return null;
    return (p.short || '').toLowerCase().replace(/\s+/g, '');
  }

  function chKey(item) {
    const p = item?.pattern;
    if (!p || p.type !== 'ch') return null;
    return p.filterKey || p.tierKey || null;
  }

  function isOwned(o) {
    if (o.weapon_id && _ownedSkinIds.has(String(o.weapon_id))) return true;
    const key = String(o.name || '').toLowerCase().trim();
    return key && _ownedNames.has(key);
  }

  function readFilters() {
    return {
      q: (el('mp-search')?.value || '').trim().toLowerCase(),
      type: el('mp-type')?.value || '',
      rarity: el('mp-rarity')?.value || '',
      wear: el('mp-wear')?.value || '',
      phase: el('mp-phase')?.value || '',
      ch: el('mp-ch')?.value || '',
      floatSort: el('mp-float-sort')?.value || '',
      priceSort: el('mp-price-sort')?.value || ''
    };
  }

  function offerPasses(o, f) {
    if (_myOffersOnly && _myUserId && String(o.seller_id) !== String(_myUserId)) return false;
    if (f.q && !String(o.name).toLowerCase().includes(f.q)) return false;
    if (f.type !== '' && String(o.item_type) !== f.type) return false;
    if (f.rarity && String(o.rarity) !== f.rarity) return false;
    if (f.wear && getWearCode(o.float) !== f.wear) return false;
    if (f.phase) {
      const pk = dopplerKey(o);
      if (f.phase === '__phase__') { if (!pk) return false; }
      else if (f.phase === '__gems__') {
        if (!pk || !['ruby', 'sapphire', 'bp', 'emerald'].includes(pk)) return false;
      } else if (pk !== f.phase) return false;
    }
    if (f.ch) {
      const ck = chKey(o);
      if (f.ch === '__ch__') { if (!ck) return false; }
      else if (ck !== f.ch) return false;
    }
    return true;
  }

  function sortOffers(list, f) {
    const out = [...list];
    if (f.priceSort === 'asc') return out.sort((a, b) => a.price - b.price || compareRarity(a, b));
    if (f.priceSort === 'desc') return out.sort((a, b) => b.price - a.price || compareRarity(a, b));

    const floatMul = f.floatSort === 'asc' ? 1 : f.floatSort === 'desc' ? -1 : 0;
    if (floatMul) {
      return out.sort((a, b) => {
        const fa = a.float ?? (floatMul > 0 ? Infinity : -Infinity);
        const fb = b.float ?? (floatMul > 0 ? Infinity : -Infinity);
        if (fa !== fb) return floatMul * (fa - fb);
        return compareRarity(a, b);
      });
    }

    return out.sort((a, b) => compareRarity(a, b));
  }

  function renderOfferCard(o) {
    const rInfo = getRarityInfo(o.rarity);
    const imgUrl = o.weapon_id ? `https://cdn.csrestored.fun/skins/${o.weapon_id}.png` : null;
    const wear = getWearCode(o.float);
    const seed = o.seed != null ? `#${o.seed}` : '';
    const parts = o.name.split(' | ');
    const weapon = parts[0] || o.name;
    const skin = parts[1] || '';
    const pat = patternBadge(o.pattern);
    const avatar = o.seller_avatar && o.seller_id
      ? `https://cdn.discordapp.com/avatars/${o.seller_id}/${o.seller_avatar}.png?size=32`
      : '';
    const owned = isOwned(o);

    return `
      <div class="mp-offer-card inventory-item ${rInfo.cls}${o.stattrak ? ' stattrak' : ''}">
        <div class="mp-offer-top">
          <span class="mp-offer-wear">${wear}${o.float != null ? ` · ${o.float.toFixed(4)}` : ''}</span>
          <span class="mp-offer-seed">${seed}</span>
          <span class="mp-offer-price"><i class="fa-solid fa-coins"></i> ${Number(o.price).toLocaleString()}</span>
        </div>
        ${owned ? `<span class="mp-owned-badge" title="${esc(t('mp_owned'))}">${esc(t('mp_owned'))}</span>` : ''}
        <div class="item-icon">
          ${imgUrl ? `<img src="${imgUrl}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-gun\\'></i>'">` : '<i class="fa-solid fa-gun"></i>'}
        </div>
        <div class="item-info">
          <div class="item-name">${esc(weapon)}</div>
          <div class="item-type" style="color:${rInfo.hex}">${esc(skin)}</div>
          ${pat ? `<div class="item-wear-row">${pat}</div>` : ''}
        </div>
        <div class="mp-offer-seller">
          ${avatar ? `<img src="${avatar}" alt="">` : ''}
          <span>${esc(o.seller_name || 'Seller')}</span>
        </div>
      </div>`;
  }

  function updateFilterCount(rendered, filtered) {
    const node = el('mp-filter-count');
    if (!node) return;
    if (rendered < filtered) {
      node.textContent = tf('inv_showing_paged', { rendered, filtered });
    } else if (filtered === _offers.length) {
      node.textContent = tf('mp_listings_count', { count: filtered });
    } else {
      node.textContent = tf('inv_showing', { visible: filtered, total: _offers.length });
    }
  }

  function updateLoadMore(filteredTotal, rendered) {
    const wrap = el('mp-load-more-wrap');
    if (!wrap) return;
    wrap.style.display = rendered < filteredTotal ? '' : 'none';
  }

  function renderGrid(options = {}) {
    const reset = options.reset !== false;
    const grid = el('mp-grid');
    if (!grid) return;

    const f = readFilters();
    _cachedFiltered = sortOffers(_offers.filter((o) => offerPasses(o, f)), f);

    if (reset) {
      _renderLimit = PAGE_SIZE;
      grid.innerHTML = '';
    }

    if (!_cachedFiltered.length) {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-store"></i><p>${esc(t('mp_empty'))}</p></div>`;
      updateFilterCount(0, 0);
      updateLoadMore(0, 0);
      return;
    }

    const slice = _cachedFiltered.slice(0, _renderLimit);
    const startIndex = reset ? 0 : grid.querySelectorAll('.mp-offer-card').length;

    if (reset) grid.innerHTML = '';

    _cachedFiltered.slice(startIndex, _renderLimit).forEach((o) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderOfferCard(o);
      grid.appendChild(tmp.firstElementChild);
    });

    updateFilterCount(slice.length, _cachedFiltered.length);
    updateLoadMore(_cachedFiltered.length, slice.length);
  }

  function loadMore() {
    if (_renderLimit >= _cachedFiltered.length) return;
    _renderLimit = Math.min(_renderLimit + PAGE_SIZE, _cachedFiltered.length);
    renderGrid({ reset: false });
  }

  function populateMpFilters() {
    const phaseSel = el('mp-phase');
    const chSel = el('mp-ch');
    const invPhase = el('inv-phase');
    const invCh = el('inv-ch');
    if (phaseSel && invPhase) phaseSel.innerHTML = invPhase.innerHTML;
    if (chSel && invCh) chSel.innerHTML = invCh.innerHTML;

    const raritySel = el('mp-rarity');
    const invRarity = el('inv-rarity');
    if (raritySel && invRarity) {
      raritySel.innerHTML = invRarity.innerHTML;
    } else if (raritySel && raritySel.options.length <= 1 && window.CSRInventory?.INVENTORY_RARITY) {
      raritySel.innerHTML = `<option value="">${t('inv_all_rarities')}</option>` +
        Object.entries(CSRInventory.INVENTORY_RARITY)
          .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
          .map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
    }

    const typeSel = el('mp-type');
    if (typeSel) {
      const current = typeSel.value;
      const types = new Set(_offers.map((o) => o.item_type).filter((n) => Number.isFinite(n)));
      typeSel.innerHTML = `<option value="">${t('inv_all_types')}</option>`;
      const names = ['', 'Knife', 'Rifle', 'Heavy', 'Pistol', 'SMG', '', '', 'Container', 'Agent', 'Sticker'];
      types.forEach((tp) => {
        const opt = document.createElement('option');
        opt.value = String(tp);
        opt.textContent = names[tp] || `Type ${tp}`;
        typeSel.appendChild(opt);
      });
      if (current && [...typeSel.options].some((o) => o.value === current)) typeSel.value = current;
    }
  }

  async function loadOwnedSet() {
    _ownedSkinIds = new Set();
    _ownedNames = new Set();
    try {
      const res = await window.api.inventory.getCSR();
      if (res.error || !res.items?.length) return;
      res.items.forEach((raw) => {
        const id = csrImageId(raw);
        if (id) _ownedSkinIds.add(String(id));
        const name = raw.name || raw.item_name;
        if (name) _ownedNames.add(String(name).toLowerCase().trim());
      });
    } catch (_) {}
  }

  async function ensureMyId() {
    if (_myUserId) return _myUserId;
    const res = await window.api.auth.getUser();
    if (!res.error && res.user?.id) _myUserId = String(res.user.id);
    return _myUserId;
  }

  async function load(force) {
    if (_loaded && !force) {
      renderGrid({ reset: true });
      return;
    }
    const loading = el('mp-loading');
    const grid = el('mp-grid');
    if (loading) loading.style.display = 'flex';
    if (grid) grid.innerHTML = '';

    try {
      await ensureMyId();
      await loadOwnedSet();
      const res = await window.api.inventory.getMarketplace();
      if (loading) loading.style.display = 'none';
      if (res?.unauthorized) {
        if (grid) grid.innerHTML = `<div class="empty-state"><p>${esc(t('inventory_empty_login'))}</p></div>`;
        return;
      }
      if (res?.error) {
        if (grid) grid.innerHTML = `<div class="empty-state"><p>${esc(t('mp_load_error'))}</p></div>`;
        return;
      }
      _offers = (res.offers || []).map(normalizeOffer).filter(Boolean);
      if (typeof CSR_learnItemIdFinishBatch === 'function') CSR_learnItemIdFinishBatch(_offers);
      _loaded = true;
      populateMpFilters();
      renderGrid({ reset: true });
    } catch (e) {
      if (loading) loading.style.display = 'none';
      if (grid) grid.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
    }
  }

  function openCreateModal() {
    const modal = el('mp-create-modal');
    if (!modal) return;
    _createSel = null;
    modal.hidden = false;
    loadCreateGrid();
  }

  function closeCreateModal() {
    const modal = el('mp-create-modal');
    if (modal) modal.hidden = true;
    _createSel = null;
  }

  async function loadCreateGrid() {
    const grid = el('mp-create-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="stats-loading-inline"><i class="fa-solid fa-spinner fa-spin"></i></div>`;
    try {
      const res = await window.api.inventory.getCSR();
      if (res.error || !res.items?.length) {
        grid.innerHTML = `<div class="empty-state"><p>${esc(t('inventory_empty'))}</p></div>`;
        return;
      }
      grid.innerHTML = '';
      res.items.slice(0, 300).forEach((raw) => {
        if (!window.CSRInventory?.normalizeItem || !window.CSRInventory?.createCard) return;
        const item = CSRInventory.normalizeItem(raw);
        if (!item) return;
        const inst = instanceId(raw);
        if (!inst) return;
        const card = CSRInventory.createCard(item);
        card.dataset.weaponId = inst;
        card.classList.add('mp-create-pick');
        card.addEventListener('click', () => {
          grid.querySelectorAll('.mp-create-pick.selected').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          _createSel = inst;
        });
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
    }
  }

  async function submitCreate() {
    const price = parseInt(el('mp-create-price')?.value, 10);
    if (!_createSel) {
      alert(t('mp_pick_item'));
      return;
    }
    if (!Number.isFinite(price) || price < 1) {
      alert(t('mp_invalid_price'));
      return;
    }
    const btn = el('btn-mp-create-submit');
    if (btn) btn.disabled = true;
    try {
      const res = await window.api.inventory.addMarketplaceOffer(_createSel, price);
      if (res?.error) {
        alert(res.message || t('mp_list_failed'));
        return;
      }
      closeCreateModal();
      _loaded = false;
      load(true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function setup() {
    if (_bound) return;
    _bound = true;

    el('btn-mp-my-offers')?.addEventListener('click', async () => {
      _myOffersOnly = !_myOffersOnly;
      el('btn-mp-my-offers')?.classList.toggle('active', _myOffersOnly);
      await ensureMyId();
      renderGrid({ reset: true });
    });
    el('btn-mp-create')?.addEventListener('click', openCreateModal);
    el('btn-mp-create-close')?.addEventListener('click', closeCreateModal);
    el('btn-mp-create-cancel')?.addEventListener('click', closeCreateModal);
    el('btn-mp-create-submit')?.addEventListener('click', submitCreate);
    el('btn-mp-load-more')?.addEventListener('click', loadMore);

    ['mp-search', 'mp-type', 'mp-rarity', 'mp-wear', 'mp-phase', 'mp-ch', 'mp-float-sort', 'mp-price-sort'].forEach((id) => {
      const node = el(id);
      if (!node) return;
      node.addEventListener('input', () => renderGrid({ reset: true }));
      node.addEventListener('change', () => renderGrid({ reset: true }));
    });
    el('mp-clear')?.addEventListener('click', () => {
      ['mp-search', 'mp-type', 'mp-rarity', 'mp-wear', 'mp-phase', 'mp-ch', 'mp-float-sort', 'mp-price-sort'].forEach((id) => {
        const node = el(id);
        if (node) node.value = '';
      });
      _myOffersOnly = false;
      el('btn-mp-my-offers')?.classList.remove('active');
      renderGrid({ reset: true });
    });
  }

  window.CSRMarketplace = {
    setup,
    load,
    invalidate: () => { _loaded = false; _offers = []; _ownedSkinIds = new Set(); }
  };
})();
