/* Inventory grid: rarities, seed, search & filters (aligned with CSR extension) */

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

function getItemTypeName(item) {
  const typeId = parseInt(item.item_type, 10);
  if (typeId >= 0 && typeId < WEAPON_TYPES.length && WEAPON_TYPES[typeId]) {
    return WEAPON_TYPES[typeId];
  }
  return 'Item';
}

let _items = [];
let _filterTimer = null;

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

function normalizeItem(item) {
  if (!item) return null;
  const rarity = parseInt(item.rarity ?? item.item_rarity, 10);
  const floatRaw = item.float ?? item.skin_float;
  const floatVal = floatRaw != null ? parseFloat(floatRaw) : null;
  const seedRaw = item.seed ?? item.skin_seed ?? item.paint_seed;
  const seedVal = seedRaw != null && seedRaw !== '' ? parseInt(seedRaw, 10) : null;
  return {
    ...item,
    rarity: Number.isFinite(rarity) ? rarity : 1,
    float: floatVal != null && !Number.isNaN(floatVal) ? floatVal : null,
    seed: Number.isFinite(seedVal) ? seedVal : null,
    stattrak: !!item.stattrak
  };
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

function readInventoryFilters() {
  return {
    q: (document.getElementById('inv-search')?.value || '').trim().toLowerCase(),
    type: document.getElementById('inv-type')?.value || '',
    rarity: document.getElementById('inv-rarity')?.value || '',
    wear: document.getElementById('inv-wear')?.value || '',
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
  return true;
}

function sortFilteredItems(items, f) {
  const floatMul = f.floatSort === 'asc' ? 1 : f.floatSort === 'desc' ? -1 : 0;
  if (!floatMul) {
    return [...items].sort((a, b) => a.rarity - b.rarity);
  }
  return [...items].sort((a, b) => {
    const fa = a.float ?? (floatMul > 0 ? Infinity : -Infinity);
    const fb = b.float ?? (floatMul > 0 ? Infinity : -Infinity);
    if (fa !== fb) return floatMul * (fa - fb);
    return a.rarity - b.rarity;
  });
}

function createInventoryCard(item) {
  const el = document.createElement('div');
  const rInfo = getRarityInfo(item.rarity);
  const weaponName = getItemTypeName(item);

  el.className = `inventory-item ${rInfo.cls}${item.stattrak ? ' stattrak' : ''}`;
  el.dataset.rarity = String(item.rarity);

  const imgUrl = `https://cdn.csrestored.fun/skins/${item.item_id}.png`;
  const floatHtml = item.float != null
    ? `<div class="item-float" style="color:${wearColor(item.float)}">${getCondition(item.float)} · ${item.float.toFixed(4)}</div>`
    : '';
  const seedHtml = item.seed != null
    ? `<div class="item-seed">#${item.seed}</div>`
    : '';

  const nameStyle = item.stattrak ? '' : ` style="color:${rInfo.hex}"`;

  el.innerHTML = `
    <div class="item-icon">
      <img src="${imgUrl}" alt="${item.name}" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-gun\\'></i>'">
    </div>
    <div class="item-name"${nameStyle} title="${item.name}">${item.name}</div>
    <div class="item-type">${weaponName}</div>
    ${floatHtml}
    ${seedHtml}
  `;

  return el;
}

function updateFilterCount(visible, total) {
  const el = document.getElementById('inv-filter-count');
  if (!el) return;
  if (visible === total) {
    el.textContent = invTf('inventory_count', { count: total });
  } else {
    el.textContent = invTf('inv_showing', { visible, total });
  }
}

function renderInventoryGrid() {
  const grid = document.getElementById('inventory-grid');
  const countEl = document.getElementById('inventory-count');
  if (!grid) return;

  const f = readInventoryFilters();
  let visible = _items.filter(item => itemPassesFilters(item, f));
  visible = sortFilteredItems(visible, f);

  grid.innerHTML = '';

  if (!visible.length) {
    grid.innerHTML = `
      <div class="empty-state inventory-empty-filter">
        <i class="fa-solid fa-filter"></i>
        <p data-i18n="inv_no_results">${invT('inv_no_results')}</p>
      </div>
    `;
    updateFilterCount(0, _items.length);
    if (countEl) countEl.textContent = invTf('inventory_count', { count: _items.length });
    return;
  }

  visible.forEach(item => grid.appendChild(createInventoryCard(item)));
  updateFilterCount(visible.length, _items.length);
  if (countEl) countEl.textContent = invTf('inventory_count', { count: _items.length });
}

function clearInventoryFilters() {
  const search = document.getElementById('inv-search');
  const type = document.getElementById('inv-type');
  const rarity = document.getElementById('inv-rarity');
  const wear = document.getElementById('inv-wear');
  const floatSort = document.getElementById('inv-float-sort');
  if (search) search.value = '';
  if (type) type.value = '';
  if (rarity) rarity.value = '';
  if (wear) wear.value = '';
  if (floatSort) floatSort.value = '';
  renderInventoryGrid();
}

function scheduleInventoryFilters() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(renderInventoryGrid, 120);
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
  const floatSort = document.getElementById('inv-float-sort');
  const clearBtn = document.getElementById('inv-clear');

  populateTypeFilterOptions();
  populateRarityFilterOptions();

  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', scheduleInventoryFilters);
  }
  [type, rarity, wear, floatSort].forEach(el => {
    if (el && !el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('change', renderInventoryGrid);
    }
  });
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = '1';
    clearBtn.addEventListener('click', clearInventoryFilters);
  }
}

function setInventoryItems(rawItems) {
  _items = (rawItems || []).map(normalizeItem).filter(Boolean);
  _items.sort((a, b) => a.rarity - b.rarity);
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
