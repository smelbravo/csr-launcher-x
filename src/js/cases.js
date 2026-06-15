/* Cases shop — CSR+ logic, launcher UI */

(function () {
  const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';
  const SPECIALS_KEY = 'csr-launcher:specials-v1';
  const SPECIALS_TTL = 7 * 24 * 3600e3;
  const REEL_WEIGHTS = { 1: 64, 2: 32, 3: 16, 4: 8, 5: 4, 6: 2, 7: 1 };
  const RARITY_PRICES = { 7: 6942, 6: 2013, 5: 530, 4: 255, 3: 118, 2: 94, 1: 56 };
  const SPECIAL_GT25 = new Set([52, 53, 54, 58, 60, 61, 65, 66, 70, 71, 73, 74, 75, 78, 79]);
  const NO_SPECIAL = new Set([51, 55, 56, 57, 59, 62, 63, 64, 67, 68, 69, 72, 76, 77]);
  const ITEM_W = 120;
  const GAP = 8;
  const STEP = ITEM_W + GAP;

  let _cases = [];
  let _loaded = false;
  let _bound = false;
  let _activeCase = null;
  let _detailItems = [];
  let _coins = null;
  let _spinning = false;
  let _lastQuick = false;
  let _search = '';
  let _sort = 'price';
  let _kind = 'all';
  let _specialsMemo = null;
  let _specialsPromise = null;
  let _viewToken = 0;
  let _spinToken = 0;
  let _buyArmed = null;
  let _sellArmed = null;
  let _lastDrop = null;
  let _activeSkip = null;

  function t(key) {
    return (typeof window._invTranslate === 'function' ? window._invTranslate(key) : key);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function el(id) {
    return document.getElementById(id);
  }

  function num(v) {
    if (v == null || v === '' || Number.isNaN(Number(v))) return null;
    return Number(v);
  }

  function formatCoins(n) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function caseArtUrl(id) {
    return `https://cdn.csrestored.fun/cases/${id}.webp`;
  }

  function skinIconUrl(skinId) {
    if (skinId == null) return null;
    return `https://cdn.csrestored.fun/skins/${skinId}.png`;
  }

  function getRarityInfo(rarity) {
    if (window.CSRInventory?.getRarityInfo) return CSRInventory.getRarityInfo(rarity);
    return { cls: 'item-rarity-consumer', hex: '#b0c3d9', name: 'Item' };
  }

  function wearLabel(f) {
    if (f == null) return null;
    if (f < 0.07) return { code: 'FN', label: 'Factory New' };
    if (f < 0.15) return { code: 'MW', label: 'Minimal Wear' };
    if (f < 0.38) return { code: 'FT', label: 'Field-Tested' };
    if (f < 0.45) return { code: 'WW', label: 'Well-Worn' };
    return { code: 'BS', label: 'Battle-Scarred' };
  }

  function splitSkinName(name) {
    const star = /^★\s*/.test(String(name || ''));
    const clean = String(name || '').replace(/^★\s*/, '').trim();
    const parts = clean.split(' | ');
    return { star, weapon: parts[0] || clean, skin: parts[1] || '' };
  }

  function normCaseName(s) {
    let n = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    n = n.replace(/^operation\s+/, '');
    n = n.replace(/ weapon case(?=\s|$)/, '').replace(/ case(?=\s|$)/, '').trim();
    if (n === 'gloves') n = 'glove';
    return n;
  }

  function hasSpecial(id) {
    const n = Number(id);
    return !NO_SPECIAL.has(n) && (n <= 25 || SPECIAL_GT25.has(n));
  }

  function isCapsuleName(name) {
    return /capsule|sticker|pins|legends|challengers|contenders|agents/i.test(name || '');
  }

  function isAgentsName(name) {
    return /agent/i.test(name || '');
  }

  function caseKind(c) {
    const name = String(c?.name || '');
    if (isCapsuleName(name) && !isAgentsName(name)) return 'capsule';
    if (isAgentsName(name)) return 'agents';
    if (/collection|inferno|dust ii|dust 2|mirage|ancient|norse|havoc|train|vertigo|bank|baggage|office|italy|lake|militia|safehouse|assault|aztec|anubis|canals|control|marc|x-ray|nuke|gods|rising|chop shop|ems/i.test(name)) {
      return 'collection';
    }
    return 'weapon';
  }

  function kindLabel(kind) {
    if (kind === 'collection') return t('cases_section_collections');
    if (kind === 'capsule') return t('cases_kind_capsule');
    if (kind === 'agents') return t('cases_kind_agents');
    return t('cases_kind_weapon');
  }

  function normalizeCase(c) {
    if (!c || c.id == null) return null;
    const id = parseInt(c.id, 10);
    const price = parseInt(c.price, 10);
    if (!Number.isFinite(id) || !Number.isFinite(price)) return null;
    return {
      id,
      name: c.name || `Case #${id}`,
      price,
      item_id: c.item_id != null ? parseInt(c.item_id, 10) : null,
      kind: caseKind(c)
    };
  }

  function caseImgHtml(c) {
    const src = caseArtUrl(c.id);
    const fb = skinIconUrl(c.item_id != null ? c.item_id : c.id);
    return `<img src="${src}" alt="" loading="lazy" data-fallback="${fb || ''}" onerror="window.CSRCases?._imgFallback?.(this)"><i class="fa-solid fa-box hidden"></i>`;
  }

  function imgFallback(img) {
    if (!img) return;
    const fb = img.dataset.fallback;
    if (fb && !img.dataset.retried) {
      img.dataset.retried = '1';
      img.src = fb;
      return;
    }
    img.style.display = 'none';
    img.nextElementSibling?.classList?.remove('hidden');
  }

  async function getSpecialsMap() {
    if (_specialsMemo) return _specialsMemo;
    if (_specialsPromise) return _specialsPromise;
    _specialsPromise = (async () => {
      try {
        const raw = localStorage.getItem(SPECIALS_KEY);
        if (raw) {
          const { t: ts, v } = JSON.parse(raw);
          if (Date.now() - ts < SPECIALS_TTL && v) {
            _specialsMemo = v;
            return v;
          }
        }
      } catch (_) {}
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        let r;
        try {
          r = await fetch(CRATES_URL, { signal: ctrl.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const crates = await r.json();
        const spec = {};
        const blob = {};
        const COLOR_WORDS = {
          'consumer grade': 'white gray grey',
          'industrial grade': 'light blue lightblue',
          'mil-spec grade': 'blue',
          restricted: 'purple',
          classified: 'pink',
          covert: 'red',
          extraordinary: 'gold yellow knife glove rare special'
        };
        for (const cr of crates) {
          const key = normCaseName(cr.name);
          const words = [];
          for (const it of [...(cr.contains || []), ...(cr.contains_rare || [])]) {
            words.push(it.name || '');
            if (it.phase) words.push(it.phase);
            const rn = (it.rarity && it.rarity.name || '').toLowerCase();
            if (rn) {
              words.push(rn);
              const cw = COLOR_WORDS[rn];
              if (cw) words.push(cw);
            }
          }
          if (words.length) blob[key] = ((blob[key] || '') + ' ' + words.join(' ')).toLowerCase();
          if (cr.type !== 'Case' || !Array.isArray(cr.contains_rare) || !cr.contains_rare.length) continue;
          spec[key] = cr.contains_rare.map((it) => {
            const { weapon, skin } = splitSkinName(it.name);
            return { n: weapon, s: skin, p: it.phase || null, i: it.image || null };
          });
        }
        _specialsMemo = { spec, blob };
        try {
          localStorage.setItem(SPECIALS_KEY, JSON.stringify({ t: Date.now(), v: _specialsMemo }));
        } catch (_) {}
        return _specialsMemo;
      } catch (_) {
        _specialsPromise = null;
        return null;
      }
    })();
    return _specialsPromise;
  }

  function visibleCases() {
    let list = _cases.slice();
    const q = _search.trim().toLowerCase();
    if (q) {
      const blob = _specialsMemo && _specialsMemo.blob;
      list = list.filter((c) => {
        if ((c.name || '').toLowerCase().includes(q)) return true;
        const b = blob && blob[normCaseName(c.name)];
        return !!(b && b.includes(q));
      });
    }
    if (_kind === 'special') list = list.filter((c) => hasSpecial(c.id));
    else if (_kind === 'cases') list = list.filter((c) => !isCapsuleName(c.name));
    else if (_kind === 'agents') list = list.filter((c) => isAgentsName(c.name));
    else if (_kind === 'other') list = list.filter((c) => isCapsuleName(c.name) && !isAgentsName(c.name));
    if (_sort === 'price') list.sort((a, b) => (a.price - b.price) || String(a.name).localeCompare(String(b.name)));
    else if (_sort === 'price-d') list.sort((a, b) => (b.price - a.price) || String(a.name).localeCompare(String(b.name)));
    else list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }

  function showMsg(text, ok) {
    const m = el('cases-msg');
    if (!m) return;
    m.hidden = false;
    m.textContent = text;
    m.classList.toggle('cases-msg-ok', !!ok);
    m.classList.toggle('cases-msg-err', !ok);
  }

  function hideMsg() {
    const m = el('cases-msg');
    if (m) m.hidden = true;
  }

  function renderBalance() {
    const wrap = el('cases-balance');
    const val = el('cases-balance-value');
    if (!wrap || !val) return;
    if (_coins == null) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    val.textContent = formatCoins(_coins);
    if (typeof updateInventoryCoinsDisplay === 'function') updateInventoryCoinsDisplay(_coins);
  }

  async function refreshCoins() {
    const userRes = await window.api.auth.getUser();
    if (!userRes.error && userRes.user) {
      _coins = num(userRes.user.coins);
      renderBalance();
    }
  }

  function syncActionButtons() {
    const price = _activeCase?.price || 0;
    const broke = _coins != null && _coins < price;
    ['btn-case-open', 'btn-case-quick-open'].forEach((id) => {
      const btn = el(id);
      if (!btn) return;
      btn.disabled = _spinning || broke;
      btn.title = broke ? t('cases_not_enough_coins').replace('{price}', formatCoins(price)) : '';
    });
  }

  function renderContainsItem(item, special) {
    const rInfo = getRarityInfo(parseInt(item.rarity, 10) || (special ? 7 : 1));
    const { weapon, skin } = splitSkinName(item.name);
    const img = item.image || skinIconUrl(item.id);
    if (special) {
      return `
        <div class="inventory-item item-rarity-extraordinary case-contains-item case-special-item">
          <span class="case-special-badge">RARE</span>
          <div class="item-icon">
            ${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-star\\'></i>'">` : '<i class="fa-solid fa-star"></i>'}
          </div>
          <div class="item-name" style="color:#ffd24a">★ ${esc(item.n || weapon)}</div>
          <div class="item-type">${esc(item.s || skin)}${item.p ? ' · ' + esc(item.p) : ''}</div>
        </div>`;
    }
    return `
      <div class="inventory-item ${rInfo.cls} case-contains-item">
        <div class="item-icon">
          ${img ? `<img src="${img}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-gun\\'></i>'">` : '<i class="fa-solid fa-gun"></i>'}
        </div>
        <div class="item-name" style="color:${rInfo.hex}">${esc(weapon)}</div>
        <div class="item-type">${esc(skin)}</div>
      </div>`;
  }

  function renderPreviewStrip(items) {
    const preview = el('case-detail-preview');
    if (!preview) return;
    const strip = (items || []).slice(0, 12);
    if (!strip.length) {
      preview.innerHTML = '';
      return;
    }
    preview.innerHTML = `
      <div class="case-preview-strip">
        ${strip.map((item) => {
          const img = skinIconUrl(item.id);
          const rInfo = getRarityInfo(parseInt(item.rarity, 10) || 1);
          return `<div class="case-preview-item ${rInfo.cls}">${img ? `<img src="${img}" alt="" loading="lazy">` : ''}</div>`;
        }).join('')}
      </div>`;
  }

  function showShopView() {
    if (_spinning) return;
    _activeCase = null;
    _detailItems = [];
    dismissOverlays();
    el('cases-shop-view')?.removeAttribute('hidden');
    el('cases-detail-view')?.setAttribute('hidden', '');
    el('cases-toolbar')?.removeAttribute('hidden');
  }

  function showDetailView() {
    el('cases-shop-view')?.setAttribute('hidden', '');
    el('cases-detail-view')?.removeAttribute('hidden');
    el('cases-toolbar')?.setAttribute('hidden', '');
  }

  async function appendSpecialCards(token) {
    const c = _activeCase;
    if (!c || !hasSpecial(c.id)) return;
    const map = await getSpecialsMap();
    if (token !== _viewToken || !_activeCase || _activeCase.id !== c.id) return;
    const list = map && map.spec && map.spec[normCaseName(c.name)];
    const grid = el('case-contains-grid');
    const sub = el('case-detail-sub');
    if (!grid) return;
    const frag = document.createDocumentFragment();
    const wrap = document.createElement('div');
    wrap.innerHTML = (list && list.length
      ? list.map((d) => renderContainsItem(d, true)).join('')
      : renderContainsItem({ n: 'Rare Special Item', s: t('cases_special_unknown'), p: null }, true));
    while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    grid.appendChild(frag);
    if (sub) {
      const extra = list && list.length ? ` · ★ ${list.length} ${t('cases_special_drops')}` : ` · ★ ${t('cases_special_possible')}`;
      sub.textContent = `${_detailItems.length} ${t('cases_items_inside')}${extra}`;
    }
  }

  async function openCaseDetail(caseId) {
    const c = _cases.find((x) => String(x.id) === String(caseId));
    if (!c || !window.api?.inventory?.getCaseDetail) return;

    const token = ++_viewToken;
    const loading = el('cases-loading');
    if (loading) loading.style.display = 'flex';
    hideMsg();

    try {
      const res = await window.api.inventory.getCaseDetail(caseId);
      if (token !== _viewToken) return;
      if (loading) loading.style.display = 'none';
      if (res?.error) {
        showMsg(res.message || t('cases_load_error'), false);
        return;
      }

      const data = res.data || {};
      const caseInfo = normalizeCase(data.case || data) || c;
      _activeCase = caseInfo;
      _detailItems = Array.isArray(data.items) ? data.items.slice() : [];

      el('case-detail-title').textContent = caseInfo.name;
      el('case-detail-price').innerHTML = `<span>${esc(t('cases_price'))}</span> <i class="fa-solid fa-coins"></i> ${formatCoins(caseInfo.price)}`;
      const sub = el('case-detail-sub');
      if (sub) {
        sub.textContent = `${_detailItems.length} ${t('cases_items_inside')}${hasSpecial(caseInfo.id) ? ` · ★ ${t('cases_special_possible')}` : ''}`;
      }

      renderPreviewStrip(_detailItems);
      const grid = el('case-contains-grid');
      if (grid) {
        const sorted = _detailItems.slice().sort((a, b) => (Number(b.rarity) - Number(a.rarity)) || String(a.name).localeCompare(String(b.name)));
        grid.innerHTML = sorted.length
          ? sorted.map((it) => renderContainsItem(it, false)).join('')
          : `<div class="empty-state"><p>${esc(t('cases_no_contents'))}</p></div>`;
      }

      showDetailView();
      syncActionButtons();
      appendSpecialCards(token);
    } catch (e) {
      if (loading) loading.style.display = 'none';
      showMsg(e.message || t('cases_load_error'), false);
    }
  }

  function renderGrid() {
    const grid = el('cases-grid');
    const countEl = el('cases-count');
    if (!grid) return;

    const list = visibleCases();
    if (countEl) countEl.textContent = `${list.length} / ${_cases.length}`;

    if (!_cases.length) {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-box"></i><p>${esc(t('cases_empty'))}</p></div>`;
      return;
    }
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state"><p>${esc(t('cases_no_match'))}</p></div>`;
      return;
    }

    const weaponCases = list.filter((c) => c.kind === 'weapon');
    const capsules = list.filter((c) => c.kind === 'capsule');
    const agents = list.filter((c) => c.kind === 'agents');
    const collections = list.filter((c) => c.kind === 'collection');

    const section = (title, items) => {
      if (!items.length) return '';
      const cards = items.map((c) => `
          <button type="button" class="case-card${hasSpecial(c.id) ? ' case-card-special' : ''}" data-case-id="${c.id}" data-case-price="${c.price}">
            ${hasSpecial(c.id) ? '<span class="case-special-star" title="Rare special possible">★</span>' : ''}
            <span class="case-price"><i class="fa-solid fa-coins"></i> ${formatCoins(c.price)}</span>
            <div class="case-art">${caseImgHtml(c)}</div>
            <span class="case-kind">${esc(kindLabel(c.kind))}</span>
            <span class="case-name">${esc(c.name)}</span>
          </button>`).join('');
      return `<h3 class="cases-section-title">${esc(title)}</h3><div class="cases-grid-row">${cards}</div>`;
    };

    grid.innerHTML =
      section(t('cases_section_weapon'), weaponCases) +
      section(t('cases_section_capsules'), capsules) +
      section(t('cases_kind_agents'), agents) +
      section(t('cases_section_collections'), collections);

    grid.querySelectorAll('.case-card').forEach((card) => {
      card.addEventListener('click', () => openCaseDetail(card.dataset.caseId));
    });
  }

  function normalizeDrop(data) {
    if (!data || typeof data !== 'object') return null;
    return (data.item && typeof data.item === 'object' && data.item)
      || (data.dropped_item && typeof data.dropped_item === 'object' && data.dropped_item)
      || (data.droppedItem && typeof data.droppedItem === 'object' && data.droppedItem)
      || data;
  }

  function isSpecialDrop(d) {
    return [0, 1].includes(Number(d?.item_type));
  }

  function sellPrice(r, f, st) {
    const fl = Math.min(Math.max(num(f) ?? 0, 0), 1);
    let p = Math.round((RARITY_PRICES[Number(r)] || 0) * (1 - fl * 0.25));
    if (st) p = Math.round(1.5 * p);
    return p;
  }

  function reelCardData() {
    const pool = [];
    for (const it of _detailItems) {
      const w = REEL_WEIGHTS[Number(it.rarity)] ?? 10;
      for (let i = 0; i < w; i++) pool.push({ id: it.id, name: it.name, rarity: it.rarity });
    }
    if (_activeCase && hasSpecial(_activeCase.id)) {
      pool.push({ special: true, name: '★ Rare Special Item', rarity: 7 });
    }
    return pool;
  }

  function reelItemHtml(d) {
    const rInfo = getRarityInfo(d.rarity || 7);
    if (d.special) {
      return `<div class="case-reel-item case-reel-special" style="--reel-color:${rInfo.hex}"><span class="case-reel-star">★</span><span class="case-reel-label">Rare</span></div>`;
    }
    const { weapon, skin } = splitSkinName(d.name);
    const img = skinIconUrl(d.id);
    return `<div class="case-reel-item" style="--reel-color:${rInfo.hex}">${img ? `<img src="${img}" alt="">` : ''}<span class="case-reel-label">${esc(weapon)}</span><span class="case-reel-skin">${esc(skin)}</span></div>`;
  }

  function buildReel(landCard) {
    const pool = reelCardData();
    const COUNT = 70;
    const LAND = 55 + Math.floor(Math.random() * 7);
    const reel = el('case-reel');
    if (!reel) return LAND;
    reel.classList.remove('done');
    reel.style.transform = 'translateX(0)';
    reel.innerHTML = '';
    for (let i = 0; i < COUNT; i++) {
      const d = i === LAND ? landCard : pool[Math.floor(Math.random() * pool.length)];
      reel.insertAdjacentHTML('beforeend', reelItemHtml(d));
    }
    return LAND;
  }

  function hideSpinStage() {
    const stage = el('case-spin-stage');
    if (stage) stage.hidden = true;
    _activeSkip = null;
  }

  function showSpinStage() {
    const stage = el('case-spin-stage');
    if (!stage || !_activeCase) return;
    el('case-spin-art').src = caseArtUrl(_activeCase.id);
    el('case-spin-title').textContent = _activeCase.name;
    stage.hidden = false;
  }

  function triggerSkip() {
    const skip = _activeSkip;
    if (!skip || skip.on) return;
    skip.on = true;
    skip.cbs.forEach((fn) => fn());
    skip.cbs.length = 0;
  }

  function animateReel(landIdx, skip, duration = 5500) {
    const token = ++_spinToken;
    return new Promise((resolve) => {
      const reel = el('case-reel');
      const win = reel?.parentElement;
      if (!reel || !win) return resolve();
      const center = win.clientWidth / 2;
      const jitter = (Math.random() - 0.5) * (ITEM_W * 0.5);
      const target = landIdx * STEP + ITEM_W / 2 - center + jitter;
      const start = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 5);
      const finish = () => {
        reel.style.transform = `translateX(${-target}px)`;
        reel.children[landIdx]?.classList.add('case-reel-win');
        reel.classList.add('done');
        resolve();
      };
      const frame = (now) => {
        if (token !== _spinToken) return resolve();
        if (skip.on) return finish();
        const t = Math.min(1, (now - start) / duration);
        reel.style.transform = `translateX(${-(target * ease(t))}px)`;
        if (t < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function dismissOverlays() {
    hideReveal();
    hideSpinStage();
    _spinning = false;
    syncActionButtons();
  }

  function hideReveal() {
    const ov = el('case-reveal');
    if (ov) ov.hidden = true;
    _lastDrop = null;
    clearTimeout(_sellArmed);
    _sellArmed = null;
  }

  function showReveal(drop, landCard) {
    if (!drop && !landCard) return;
    const special = drop ? isSpecialDrop(drop) : !!landCard?.special;
    const r = special ? 7 : Number(drop?.rarity ?? landCard?.rarity) || 0;
    const rInfo = getRarityInfo(r);
    const name = drop ? (drop.name || landCard?.name) : landCard?.name;
    const { star, weapon, skin } = splitSkinName(name || '');
    const fullName = `${star || special ? '★ ' : ''}${weapon}${skin ? ' | ' + skin : ''}`;

    el('case-reveal-tag').textContent = special ? t('cases_drop_special') : t('cases_drop_item');
    const art = el('case-reveal-art');
    const defId = drop ? num(drop.item_id) : (landCard?.special ? null : landCard?.id);
    art.innerHTML = defId != null
      ? `<img src="${skinIconUrl(defId)}" alt="" onerror="this.outerHTML='<i class=\\'fa-solid fa-star\\'></i>'">`
      : '<i class="fa-solid fa-star"></i>';
    art.style.setProperty('--reveal-color', rInfo.hex);

    const nameEl = el('case-reveal-name');
    nameEl.textContent = fullName;
    nameEl.style.color = rInfo.hex;

    const chips = el('case-reveal-chips');
    chips.innerHTML = `<span class="case-reveal-chip" style="color:${rInfo.hex}">${esc(rInfo.name)}</span>`;

    const stats = el('case-reveal-stats');
    const f = drop ? num(drop.float) : null;
    const seed = drop ? num(drop.seed ?? drop.pattern) : null;
    const w = wearLabel(f);
    stats.innerHTML = [
      w ? `<div><span>${esc(t('cases_wear'))}</span><strong>${w.code} — ${w.label}</strong></div>` : '',
      f != null ? `<div><span>${esc(t('cases_float'))}</span><strong>${f.toFixed(6)}</strong></div>` : '',
      seed != null ? `<div><span>${esc(t('cases_pattern'))}</span><strong>✿ ${Math.round(seed)}</strong></div>` : '',
      drop ? `<div><span>StatTrak™</span><strong>${drop.stattrak ? t('cases_yes') : t('cases_no')}</strong></div>` : ''
    ].filter(Boolean).join('');

    const sellBtn = el('btn-case-reveal-sell');
    const weaponId = drop?.weapon_id != null ? String(drop.weapon_id) : null;
    _lastDrop = drop;
    if (sellBtn) {
      clearTimeout(_sellArmed);
      _sellArmed = null;
      if (drop && weaponId) {
        const price = sellPrice(r, f, drop.stattrak);
        sellBtn.hidden = false;
        sellBtn.disabled = false;
        sellBtn.classList.remove('confirm');
        sellBtn.innerHTML = `${esc(t('cases_quick_sell'))} <strong>◎${formatCoins(price)}</strong>`;
        sellBtn.onclick = () => quickSellDrop(weaponId, price, sellBtn);
      } else {
        sellBtn.hidden = true;
        sellBtn.onclick = null;
      }
    }

    el('case-reveal').hidden = false;
  }

  async function quickSellDrop(weaponId, price, btn) {
    if (!window.api?.inventory?.sellWeapon) return;
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.innerHTML = `${esc(t('cases_confirm_sell'))} <strong>◎${formatCoins(price)}</strong>?`;
      _sellArmed = setTimeout(() => {
        btn.classList.remove('confirm');
        btn.innerHTML = `${esc(t('cases_quick_sell'))} <strong>◎${formatCoins(price)}</strong>`;
      }, 4000);
      return;
    }
    clearTimeout(_sellArmed);
    btn.disabled = true;
    btn.textContent = t('cases_selling');
    try {
      const res = await window.api.inventory.sellWeapon(weaponId);
      if (res?.error) {
        showMsg(res.message || t('cases_sell_failed'), false);
        btn.disabled = false;
        btn.classList.remove('confirm');
        btn.innerHTML = `${esc(t('cases_quick_sell'))} <strong>◎${formatCoins(price)}</strong>`;
        return;
      }
      const got = num(res.data?.price ?? res.data?.coins ?? res.data?.amount) ?? price;
      if (_coins != null) _coins += got;
      renderBalance();
      btn.innerHTML = `${esc(t('cases_sold'))} <strong>+◎${formatCoins(got)}</strong>`;
      _lastDrop = null;
    } catch (e) {
      showMsg(e.message || t('cases_sell_failed'), false);
      btn.disabled = false;
    }
  }

  async function spinCase(quick) {
    if (_spinning || !_activeCase) return;
    const price = _activeCase.price || 0;
    if (_coins != null && _coins < price) {
      showMsg(t('cases_not_enough_coins').replace('{price}', formatCoins(price)), false);
      return;
    }

    _spinning = true;
    _lastQuick = !!quick;
    syncActionButtons();
    hideMsg();
    showMsg(t('cases_opening'), true);

    try {
      const res = await window.api.inventory.openCase(_activeCase.id);
      if (res?.error) {
        showMsg(res.message || t('cases_open_failed'), false);
        return;
      }

      const drop = normalizeDrop(res.data);
      if (!drop) {
        showMsg(t('cases_open_failed'), false);
        return;
      }

      hideMsg();
      if (_coins != null) _coins -= price;
      renderBalance();

      const special = isSpecialDrop(drop);
      let landCard;
      if (!special) {
        const defId = num(drop.item_id);
        const known = _detailItems.find((it) => Number(it.id) === defId);
        landCard = known
          ? { id: known.id, name: known.name, rarity: known.rarity }
          : { id: defId, name: drop.name || 'Unknown', rarity: drop.rarity || 3 };
      } else {
        landCard = { special: true, name: '★ Rare Special Item', rarity: 7 };
      }

      if (!quick) {
        const skip = { on: false, cbs: [] };
        _activeSkip = skip;
        showSpinStage();
        const landIdx = buildReel(landCard);
        el('case-spin-stage')?.addEventListener('click', triggerSkip, { once: true });
        await sleep(300);
        await animateReel(landIdx, skip);
        await sleep(skip.on ? 200 : 600);
        hideSpinStage();
      }

      showReveal(drop, landCard);
      await refreshCoins();
      if (typeof window.loadInventorySkins === 'function') window.loadInventorySkins();
    } catch (e) {
      showMsg(e.message || t('cases_open_failed'), false);
    } finally {
      _spinning = false;
      syncActionButtons();
    }
  }

  async function buyCase() {
    if (!_activeCase || !window.api?.inventory?.buyCase || _spinning) return;
    const price = _activeCase.price || 0;
    if (_coins != null && _coins < price) {
      showMsg(t('cases_not_enough_coins').replace('{price}', formatCoins(price)), false);
      return;
    }
    const btn = el('btn-case-buy');
    if (!_buyArmed) {
      _buyArmed = setTimeout(() => {
        _buyArmed = null;
        if (btn) btn.textContent = t('cases_buy');
      }, 4000);
      if (btn) btn.textContent = t('cases_buy_confirm_btn').replace('{price}', formatCoins(price));
      return;
    }
    clearTimeout(_buyArmed);
    _buyArmed = null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('cases_buying');
    }
    try {
      const res = await window.api.inventory.buyCase(_activeCase.id);
      if (res?.error) {
        showMsg(res.message || t('cases_buy_failed'), false);
        return;
      }
      if (_coins != null) _coins -= price;
      renderBalance();
      showMsg(t('cases_buy_ok').replace('{name}', _activeCase.name), true);
      await refreshCoins();
    } catch (e) {
      showMsg(e.message || t('cases_buy_failed'), false);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('cases_buy');
      }
    }
  }

  async function load(force) {
    dismissOverlays();
    if (_loaded && !force) {
      showShopView();
      renderGrid();
      return;
    }
    showShopView();
    hideMsg();
    const loading = el('cases-loading');
    const grid = el('cases-grid');
    if (loading) loading.style.display = 'flex';
    if (grid) grid.innerHTML = '';

    try {
      await Promise.all([getSpecialsMap(), refreshCoins()]);
      const res = await window.api.inventory.getCases();
      if (loading) loading.style.display = 'none';
      if (res?.unauthorized) {
        if (grid) grid.innerHTML = `<div class="empty-state"><p>${esc(t('inventory_empty_login'))}</p></div>`;
        return;
      }
      if (res?.error) {
        if (grid) grid.innerHTML = `<div class="empty-state"><p>${esc(t('cases_load_error'))}</p></div>`;
        return;
      }
      _cases = (res.cases || []).map(normalizeCase).filter(Boolean);
      _loaded = true;
      renderGrid();
    } catch (e) {
      if (loading) loading.style.display = 'none';
      if (grid) grid.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
    }
  }

  function setup() {
    if (_bound) return;
    _bound = true;
    dismissOverlays();

    el('btn-case-back')?.addEventListener('click', () => {
      if (_spinning) {
        showMsg(t('cases_wait_open'), false);
        return;
      }
      showShopView();
      renderGrid();
    });
    el('btn-case-buy')?.addEventListener('click', buyCase);
    el('btn-case-open')?.addEventListener('click', () => spinCase(false));
    el('btn-case-quick-open')?.addEventListener('click', () => spinCase(true));
    el('btn-case-reveal-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideReveal();
    });
    el('case-reveal')?.addEventListener('click', (e) => {
      if (e.target === el('case-reveal')) hideReveal();
    });
    el('case-reveal-card')?.addEventListener('click', (e) => e.stopPropagation());
    el('btn-case-reveal-again')?.addEventListener('click', () => {
      hideReveal();
      spinCase(_lastQuick);
    });

    el('cases-search')?.addEventListener('input', (e) => {
      _search = e.target.value || '';
      renderGrid();
    });
    el('cases-sort')?.addEventListener('change', (e) => {
      _sort = e.target.value || 'price';
      renderGrid();
    });
    el('cases-kind-filter')?.addEventListener('change', (e) => {
      _kind = e.target.value || 'all';
      renderGrid();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const reveal = el('case-reveal');
      const spin = el('case-spin-stage');
      if (reveal && !reveal.hidden) hideReveal();
      else if (spin && !spin.hidden && _activeSkip) triggerSkip();
    });
  }

  window.CSRCases = {
    setup,
    load,
    dismissOverlays,
    invalidate: () => {
      _loaded = false;
      _cases = [];
      _activeCase = null;
      _specialsMemo = null;
      _specialsPromise = null;
    },
    _imgFallback: imgFallback
  };
})();
