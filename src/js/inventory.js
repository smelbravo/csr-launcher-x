/* Inventory grid: rarities, seed, Doppler/CH badges, search & filters (aligned with CSR extension) */

const INVENTORY_RARITY = {
  1: { name: 'Consumer Grade', hex: '#b0c3d9', cls: 'item-rarity-consumer' },
  2: { name: 'Industrial Grade', hex: '#5e98d9', cls: 'item-rarity-industrial' },
  3: { name: 'Mil-Spec', hex: '#4b69ff', cls: 'item-rarity-mil-spec' },
  4: { name: 'Restricted', hex: '#8847ff', cls: 'item-rarity-restricted' },
  5: { name: 'Classified', hex: '#d32ce6', cls: 'item-rarity-classified' },
  6: { name: 'Covert / Knives / Gloves', hex: '#eb4b4b', cls: 'item-rarity-covert' },
  7: { name: 'Contraband', hex: '#e4ae39', cls: 'item-rarity-extraordinary' }
};

const WEAPON_TYPES = ['Gloves', 'Knife', 'Rifle', 'Heavy', 'Pistol', 'SMG', 'Equipment', 'Music', 'Case', 'Agent', ''];

const PHASE_ANY = '__phase__';
const GEMS_ONLY = '__gems__';
const CH_ANY = '__ch__';
const INVENTORY_PAGE_SIZE = 50;

function getItemTypeName(item) {
  const typeId = parseInt(item.item_type, 10);
  if (typeId >= 0 && typeId < WEAPON_TYPES.length && WEAPON_TYPES[typeId]) {
    return WEAPON_TYPES[typeId];
  }
  return 'Item';
}

let _items = [];
let _filterTimer = null;
let _renderLimit = INVENTORY_PAGE_SIZE;
let _cachedFiltered = [];

function invT(key) {
  return (typeof window._invTranslate === 'function' ? window._invTranslate(key) : key);
}

function invTf(key, params) {
  let str = invT(key);
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

function getCondition(f) {
  if (f == null || Number.isNaN(f)) return '';
  if (f < 0.07) return 'FN';
  if (f < 0.15) return 'MW';
  if (f < 0.38) return 'FT';
  if (f < 0.45) return 'WW';
  return 'BS';
}

function wearColor(f) {
  if (f == null || Number.isNaN(f)) return '#94a3b8';
  if (f < 0.07) return '#4ade80';
  if (f < 0.15) return '#86efac';
  if (f < 0.38) return '#fbbf24';
  if (f < 0.45) return '#fb923c';
  return '#f87171';
}

function compareRarity(a, b) {
  return b.rarity - a.rarity;
}

function normalizeItem(item) {
  if (!item) return null;
  const rarity = parseInt(item.rarity ?? item.item_rarity, 10);
  const floatRaw = item.float ?? item.skin_float;
  const floatVal = floatRaw != null ? parseFloat(floatRaw) : null;
  const seedRaw = item.seed ?? item.skin_seed ?? item.paint_seed;
  const seedVal = seedRaw != null && seedRaw !== '' ? parseInt(seedRaw, 10) : null;
  const normalized = {
    ...item,
    rarity: Number.isFinite(rarity) ? rarity : 1,
    float: floatVal != null && !Number.isNaN(floatVal) ? floatVal : null,
    seed: Number.isFinite(seedVal) ? seedVal : null,
    stattrak: !!item.stattrak,
    pattern: null
  };

  if (typeof CSR_resolveFinishCatalog === 'function') {
    const fc = CSR_resolveFinishCatalog(normalized);
    if (fc != null) normalized.finish_catalog = fc;
  }
  if (typeof CSR_resolveSkinPattern === 'function') {
    normalized.pattern = CSR_resolveSkinPattern(normalized);
  }

  return normalized;
}

function getRarityInfo(rarity) {
  const n = parseInt(rarity, 10);
  return INVENTORY_RARITY[n] || INVENTORY_RARITY[1];
}

function getItemSearchText(item) {
  const parts = [item.name || ''];
  if (item.name && item.name.includes(' | ')) {
    const [w, s] = item.name.split(' | ');
    parts.push(w, s);
  }
  const typeId = parseInt(item.item_type, 10);
  if (typeId >= 0 && typeId < WEAPON_TYPES.length && WEAPON_TYPES[typeId]) {
    parts.push(WEAPON_TYPES[typeId]);
  }
  return parts.join(' ').toLowerCase();
}

function dopplerFilterKey(item) {
  const pattern = item?.pattern;
  if (!pattern || pattern.type !== 'doppler') return null;
  return (pattern.short || '').toLowerCase().replace(/\s+/g, '');
}

function dopplerIsGem(item) {
  const pattern = item?.pattern;
  return !!(pattern && pattern.type === 'doppler' && pattern.kind === 'gem');
}

function chFilterKey(item) {
  const pattern = item?.pattern;
  if (!pattern || (pattern.type !== 'ch' && pattern.type !== 'ch-gold')) return null;
  if (pattern.tier == null) return null;
  const gold = pattern.gemKind === 'gold' || pattern.type === 'ch-gold';
  return gold ? `gold${pattern.tier}` : `ch${pattern.tier}`;
}

function patternBadgeHtml(pattern) {
  if (!pattern) return '';
  const css = pattern.css || 'csrx-pattern-phase';
  const title = pattern.type === 'doppler' && typeof CSR_formatDopplerPatternTitle === 'function'
    ? CSR_formatDopplerPatternTitle(pattern)
    : (pattern.label || '');

  let inner;
  if (pattern.type === 'doppler') {
    inner = `<span>${esc(pattern.short || pattern.label)}</span>`;
    if (pattern.finishCatalog != null) {
      inner += `<span class="inv-pattern-idx"> · ${esc(pattern.finishCatalog)}</span>`;
    }
  } else {
    inner = esc(pattern.short || pattern.label);
  }

  return `<span class="inv-pattern-badge csrx-pattern-badge ${css}" title="${esc(title)}">${inner}</span>`;
}

function readInventoryFilters() {
  return {
    q: (document.getElementById('inv-search')?.value || '').trim().toLowerCase(),
    type: document.getElementById('inv-type')?.value || '',
    rarity: document.getElementById('inv-rarity')?.value || '',
    wear: document.getElementById('inv-wear')?.value || '',
    phase: document.getElementById('inv-phase')?.value || '',
    chTier: document.getElementById('inv-ch')?.value || '',
    floatSort: document.getElementById('inv-float-sort')?.value || ''
  };
}

function itemPassesFilters(item, f) {
  if (f.q) {
    const hay = getItemSearchText(item);
    const terms = f.q.split(/\s+/).filter(Boolean);
    if (!terms.every(t => hay.includes(t))) return false;
  }
  if (f.type !== '' && String(parseInt(item.item_type, 10)) !== f.type) return false;
  if (f.rarity !== '' && String(item.rarity) !== f.rarity) return false;
  if (f.wear) {
    const w = item.float != null ? getCondition(item.float) : '';
    if (w !== f.wear) return false;
  }

  if (f.phase) {
    if (f.phase === GEMS_ONLY) {
      if (!dopplerIsGem(item)) return false;
    } else if (f.phase === PHASE_ANY) {
      if (!dopplerFilterKey(item)) return false;
    } else {
      const phaseKey = dopplerFilterKey(item);
      if (phaseKey !== f.phase) return false;
    }
  }

  if (f.chTier) {
    const chKey = chFilterKey(item);
    if (f.chTier === CH_ANY) {
      if (!chKey) return false;
    } else if (chKey !== f.chTier) {
      return false;
    }
  }

  return true;
}

function sortFilteredItems(items, f) {
  const floatMul = f.floatSort === 'asc' ? 1 : f.floatSort === 'desc' ? -1 : 0;
  if (!floatMul) {
    return [...items].sort((a, b) => compareRarity(a, b));
  }
  return [...items].sort((a, b) => {
    const fa = a.float ?? (floatMul > 0 ? Infinity : -Infinity);
    const fb = b.float ?? (floatMul > 0 ? Infinity : -Infinity);
    if (fa !== fb) return floatMul * (fa - fb);
    return compareRarity(a, b);
  });
}

function rawDigits(v) {
  const s = String(v ?? '').trim();
  return /^\d+$/.test(s) ? s : null;
}

function digitsGt(a, b) {
  return a.length === b.length ? a > b : a.length > b.length;
}

/** Skin/image CDN id — smaller of item_id / weapon_id (fields swap between /inventory/ and /users/…/inventory). */
function csrImageIdFromItem(item) {
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

function skinIconUrl(item) {
  const id = csrImageIdFromItem(item);
  if (!id) return null;
  return `https://cdn.csrestored.fun/skins/${id}.png`;
}

function createInventoryCard(item) {
  const el = document.createElement('div');
  const rInfo = getRarityInfo(item.rarity);
  const weaponName = getItemTypeName(item);

  el.className = `inventory-item ${rInfo.cls}${item.stattrak ? ' stattrak' : ''}`;
  el.dataset.rarity = String(item.rarity);

  const imgUrl = skinIconUrl(item);
  const patternHtml = patternBadgeHtml(item.pattern);
  const floatHtml = item.float != null
    ? `<div class="item-float" style="color:${wearColor(item.float)}">${getCondition(item.float)} · ${item.float.toFixed(4)}</div>`
    : '';
  const wearRowHtml = (patternHtml || floatHtml)
    ? `<div class="item-wear-row">${patternHtml}${floatHtml}</div>`
    : '';
  const seedHtml = item.seed != null
    ? `<div class="item-seed">#${item.seed}</div>`
    : '';

  const nameStyle = item.stattrak ? '' : ` style="color:${rInfo.hex}"`;

  el.innerHTML = `
    <div class="item-icon">
      ${imgUrl
    ? `<img src="${imgUrl}" alt="${esc(item.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-gun\\'></i>'">`
    : '<i class="fa-solid fa-gun"></i>'}
    </div>
    <div class="item-name"${nameStyle} title="${esc(item.name)}">${esc(item.name)}</div>
    <div class="item-type">${esc(weaponName)}</div>
    ${wearRowHtml}
    ${seedHtml}
  `;

  return el;
}

function updateFilterCount(rendered, filtered, inventoryTotal) {
  const el = document.getElementById('inv-filter-count');
  if (!el) return;
  if (rendered < filtered) {
    el.textContent = invTf('inv_showing_paged', { rendered, filtered });
  } else if (filtered === inventoryTotal) {
    el.textContent = invTf('inventory_count', { count: inventoryTotal });
  } else {
    el.textContent = invTf('inv_showing', { visible: filtered, total: inventoryTotal });
  }
}

function updateInventoryLoadMore(filteredTotal, rendered) {
  const wrap = document.getElementById('inv-load-more-wrap');
  const btn = document.getElementById('btn-inventory-load-more');
  if (!wrap) return;
  const hasMore = rendered < filteredTotal;
  wrap.style.display = hasMore ? '' : 'none';
  if (btn) btn.disabled = false;
}

function resetInventoryPagination() {
  _renderLimit = INVENTORY_PAGE_SIZE;
}

function renderInventoryGrid(options = {}) {
  const reset = options.reset !== false;
  const grid = document.getElementById('inventory-grid');
  const countEl = document.getElementById('inventory-count');
  if (!grid) return;

  const f = readInventoryFilters();
  _cachedFiltered = sortFilteredItems(_items.filter(item => itemPassesFilters(item, f)), f);

  if (reset) {
    resetInventoryPagination();
    grid.innerHTML = '';
  }

  if (!_cachedFiltered.length) {
    grid.innerHTML = `
      <div class="empty-state inventory-empty-filter">
        <i class="fa-solid fa-filter"></i>
        <p data-i18n="inv_no_results">${invT('inv_no_results')}</p>
      </div>
    `;
    updateFilterCount(0, 0, _items.length);
    updateInventoryLoadMore(0, 0);
    if (countEl) countEl.textContent = invTf('inventory_count', { count: _items.length });
    return;
  }

  const slice = _cachedFiltered.slice(0, _renderLimit);
  const startIndex = reset ? 0 : grid.querySelectorAll('.inventory-item').length;

  _cachedFiltered.slice(startIndex, _renderLimit).forEach(item => {
    grid.appendChild(createInventoryCard(item));
  });

  updateFilterCount(slice.length, _cachedFiltered.length, _items.length);
  updateInventoryLoadMore(_cachedFiltered.length, slice.length);
  if (countEl) countEl.textContent = invTf('inventory_count', { count: _items.length });
}

function loadMoreInventory() {
  if (_renderLimit >= _cachedFiltered.length) return;
  _renderLimit = Math.min(_renderLimit + INVENTORY_PAGE_SIZE, _cachedFiltered.length);
  renderInventoryGrid({ reset: false });
}

function clearInventoryFilters() {
  const search = document.getElementById('inv-search');
  const type = document.getElementById('inv-type');
  const rarity = document.getElementById('inv-rarity');
  const wear = document.getElementById('inv-wear');
  const phase = document.getElementById('inv-phase');
  const ch = document.getElementById('inv-ch');
  const floatSort = document.getElementById('inv-float-sort');
  if (search) search.value = '';
  if (type) type.value = '';
  if (rarity) rarity.value = '';
  if (wear) wear.value = '';
  if (phase) phase.value = '';
  if (ch) ch.value = '';
  if (floatSort) floatSort.value = '';
  renderInventoryGrid({ reset: true });
}

function scheduleInventoryFilters() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(() => renderInventoryGrid({ reset: true }), 120);
}

function populateTypeFilterOptions() {
  const sel = document.getElementById('inv-type');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">${invT('inv_all_types')}</option>`;

  const typesInInventory = new Set(
    _items.map(item => parseInt(item.item_type, 10)).filter(n => Number.isFinite(n))
  );

  WEAPON_TYPES.forEach((name, id) => {
    if (!name || !typesInInventory.has(id)) return;
    const opt = document.createElement('option');
    opt.value = String(id);
    opt.textContent = name;
    sel.appendChild(opt);
  });

  if (current && [...sel.options].some(o => o.value === current)) {
    sel.value = current;
  }
}

function populateRarityFilterOptions() {
  const sel = document.getElementById('inv-rarity');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">${invT('inv_all_rarities')}</option>`;
  Object.entries(INVENTORY_RARITY)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .forEach(([k, v]) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = v.name;
      sel.appendChild(opt);
    });
  if (current) sel.value = current;
}

function setupInventoryToolbar() {
  const search = document.getElementById('inv-search');
  const type = document.getElementById('inv-type');
  const rarity = document.getElementById('inv-rarity');
  const wear = document.getElementById('inv-wear');
  const phase = document.getElementById('inv-phase');
  const ch = document.getElementById('inv-ch');
  const floatSort = document.getElementById('inv-float-sort');
  const clearBtn = document.getElementById('inv-clear');
  const loadMoreBtn = document.getElementById('btn-inventory-load-more');

  populateTypeFilterOptions();
  populateRarityFilterOptions();

  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', scheduleInventoryFilters);
  }
  [type, rarity, wear, phase, ch, floatSort].forEach(el => {
    if (el && !el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('change', () => renderInventoryGrid({ reset: true }));
    }
  });
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = '1';
    clearBtn.addEventListener('click', clearInventoryFilters);
  }
  if (loadMoreBtn && !loadMoreBtn.dataset.bound) {
    loadMoreBtn.dataset.bound = '1';
    loadMoreBtn.addEventListener('click', loadMoreInventory);
  }
}

function setInventoryItems(rawItems) {
  if (typeof CSR_learnItemIdFinishBatch === 'function' && Array.isArray(rawItems)) {
    CSR_learnItemIdFinishBatch(rawItems);
  }
  if (typeof CSR_probePatternApiFields === 'function') {
    CSR_probePatternApiFields(rawItems);
  }

  _items = (rawItems || []).map(normalizeItem).filter(Boolean);
  _items.sort((a, b) => compareRarity(a, b));
  resetInventoryPagination();
  _cachedFiltered = [];
  populateTypeFilterOptions();
}

function showInventoryToolbar(show) {
  const bar = document.getElementById('inventory-toolbar');
  if (bar) bar.style.display = show ? 'block' : 'none';
}

window.CSRInventory = {
  setItems: setInventoryItems,
  render: renderInventoryGrid,
  setupToolbar: setupInventoryToolbar,
  refreshFilterLabels: () => {
    populateTypeFilterOptions();
    populateRarityFilterOptions();
  },
  showToolbar: showInventoryToolbar,
  getItems: () => _items
};
