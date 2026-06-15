/**
 * Doppler / Gamma Doppler phases (Finish Catalog), Case Hardened gem tiers,
 * Fade % (paint seed), and Marble Fade patterns (Fire & Ice / Red Tip).
 *
 * CH seed lists: community databases (bundled offline — no external API calls):
 * - https://bluegemlab.com/
 * - https://csgobluegem.com/
 * - https://www.steamanalyst.com/guides/blue-gem
 * - https://www.isitabluegem.com/
 *
 * Fade %: Valve paint-seed rotation (chescos/csgo-fade-percentage-calculator);
 * cross-checked with pattern.wiki, CSFloat, CSBoard fade guides.
 *
 * Marble Fade: Fire & Ice / Red Tip seed tiers from community consensus
 * (Steam guides, cs-resource.com, SteamAnalyst fire-ice guide, pattern.wiki, cs2.ad).
 *
 * Loaded before content.js.
 */
(function (global) {
    'use strict';

    const PATTERN_SOURCES = [
        'https://bluegemlab.com/',
        'https://csgobluegem.com/',
        'https://www.steamanalyst.com/guides/blue-gem',
        'https://www.isitabluegem.com/',
        'https://csfloat.com/',
        /* Fade % */
        'https://pattern.wiki/',
        'https://csboard.com/en/blog/cs2-fade-percentage-guide-prices',
        /* Marble Fade */
        'https://www.steamanalyst.com/guides/fire-ice',
        'https://cs2.ad/tools/pattern-index/marble-fade',
        'https://cs-resource.com/en/marble-fade-guide/',
    ];

    const DOPPLER_FINISH = {
        415: { label: 'Ruby', short: 'Ruby', kind: 'gem', family: 'doppler' },
        416: { label: 'Sapphire', short: 'Sapphire', kind: 'gem', family: 'doppler' },
        417: { label: 'Black Pearl', short: 'BP', kind: 'gem', family: 'doppler' },
        418: { label: 'Phase 1', short: 'P1', kind: 'phase', family: 'doppler' },
        419: { label: 'Phase 2', short: 'P2', kind: 'phase', family: 'doppler' },
        420: { label: 'Phase 3', short: 'P3', kind: 'phase', family: 'doppler' },
        421: { label: 'Phase 4', short: 'P4', kind: 'phase', family: 'doppler' },
        /* CS:R alt Doppler gems (Kukri, Butterfly, Shadow Daggers, etc.) — not CS:GO 415–417 order */
        617: { label: 'Black Pearl', short: 'BP', kind: 'gem', family: 'doppler' },
        618: { label: 'Ruby', short: 'Ruby', kind: 'gem', family: 'doppler' },
        619: { label: 'Sapphire', short: 'Sapphire', kind: 'gem', family: 'doppler' },
        /* CS:R alt Doppler phases on some newer knives */
        852: { label: 'Phase 1', short: 'P1', kind: 'phase', family: 'doppler' },
        853: { label: 'Phase 2', short: 'P2', kind: 'phase', family: 'doppler' },
        854: { label: 'Phase 3', short: 'P3', kind: 'phase', family: 'doppler' },
        855: { label: 'Phase 4', short: 'P4', kind: 'phase', family: 'doppler' },
        568: { label: 'Emerald', short: 'Emerald', kind: 'gem', family: 'gamma' },
        569: { label: 'Phase 1', short: 'P1', kind: 'phase', family: 'gamma' },
        570: { label: 'Phase 2', short: 'P2', kind: 'phase', family: 'gamma' },
        571: { label: 'Phase 3', short: 'P3', kind: 'phase', family: 'gamma' },
        572: { label: 'Phase 4', short: 'P4', kind: 'phase', family: 'gamma' },
        /* Glock-18 | Gamma Doppler — CS:R uses 1119–1123 (not 568–572) */
        1119: { label: 'Emerald', short: 'Emerald', kind: 'gem', family: 'gamma-glock' },
        1120: { label: 'Phase 1', short: 'P1', kind: 'phase', family: 'gamma-glock' },
        1121: { label: 'Phase 2', short: 'P2', kind: 'phase', family: 'gamma-glock' },
        1122: { label: 'Phase 3', short: 'P3', kind: 'phase', family: 'gamma-glock' },
        1123: { label: 'Phase 4', short: 'P4', kind: 'phase', family: 'gamma-glock' },
    };

    const FINISH_CATALOG_KEYS = [
        'finish_catalog', 'finish_catalogue', 'finishCatalog', 'finishCatalogue',
        'skin_finish_catalog', 'skin_finish_catalogue',
        'paint_index', 'paintindex', 'paintIndex', 'skin_paint_index',
        'finish_id', 'finish_index',
        /* CS:R inventory API uses skin_index as Finish Catalog on Doppler / Gamma Doppler */
        'skin_index',
    ];

    /** Order matters: specific knives before generic "bayonet". */
    const CH_WEAPON_RULES = [
        { key: 'ak47', re: /ak-47/ },
        { key: 'mac10', re: /mac-10/ },
        { key: 'fiveseven', re: /five-seve[nn]/ },
        { key: 'm9', re: /m9 bayonet/ },
        { key: 'karambit', re: /karambit/ },
        { key: 'butterfly', re: /butterfly/ },
        { key: 'skeleton', re: /skeleton/ },
        { key: 'talon', re: /talon/ },
        { key: 'stiletto', re: /stiletto/ },
        { key: 'ursus', re: /ursus/ },
        { key: 'nomad', re: /nomad/ },
        { key: 'paracord', re: /paracord/ },
        { key: 'survival', re: /survival/ },
        { key: 'navaja', re: /navaja/ },
        { key: 'falchion', re: /falchion/ },
        { key: 'huntsman', re: /huntsman/ },
        { key: 'bowie', re: /bowie/ },
        { key: 'flip', re: /flip knife/ },
        { key: 'gut', re: /gut knife/ },
        { key: 'classic', re: /classic knife/ },
        { key: 'kukri', re: /kukri/ },
        { key: 'shadow', re: /shadow daggers/ },
        { key: 'bayonet', re: /bayonet/ },
    ];

    function toInt(v) {
        if (v == null || v === '') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    }

    const ITEM_ID_FINISH_STORAGE_KEY = 'csrItemIdFinishMap';
    let itemIdFinishMap = Object.create(null);
    let itemIdFinishMapLoaded = false;
    let itemIdFinishPersistTimer = null;
    let itemIdFinishMapReady = null;

    function isGlockWeaponName(name) {
        return /glock-18/i.test(name || '');
    }

    function dopplerInfoMatchesWeapon(info, name) {
        if (!info || !isDopplerFamilyName(name)) return false;
        const gamma = isGammaDopplerName(name);
        const glock = isGlockWeaponName(name);
        if (info.family === 'gamma-glock') return gamma && glock;
        if (info.family === 'gamma') return gamma && !glock;
        if (info.family === 'doppler') return !gamma;
        return false;
    }

    function finishCatalogMatchesName(finishCatalog, name) {
        const info = DOPPLER_FINISH[finishCatalog];
        if (!info) return false;
        return dopplerInfoMatchesWeapon(info, name);
    }

    /** CS:R skin/image id (CDN + marketplace) — smaller of item_id / weapon_id when both set. */
    function skinDefinitionId(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const item = raw.item || raw.weapon || raw.skin;
        const a = toInt(raw.item_id ?? item?.item_id ?? raw.skin_id ?? item?.skin_id);
        const b = toInt(raw.weapon_id ?? item?.weapon_id);
        if (a == null && b == null) return null;
        if (a == null) return b;
        if (b == null) return a;
        return Math.min(a, b);
    }

    function finishFromItemId(itemId, name) {
        if (itemId == null || !isDopplerFamilyName(name)) return null;
        const fc = toInt(itemIdFinishMap[String(itemId)]);
        if (fc == null || !finishCatalogMatchesName(fc, name)) return null;
        return fc;
    }

    function learnItemIdFinish(itemId, finishCatalog, name) {
        if (itemId == null || finishCatalog == null || !finishCatalogMatchesName(finishCatalog, name)) return false;
        const key = String(itemId);
        if (itemIdFinishMap[key] === finishCatalog) return false;
        itemIdFinishMap[key] = finishCatalog;
        schedulePersistItemIdFinishMap();
        return true;
    }

    function schedulePersistItemIdFinishMap() {
        clearTimeout(itemIdFinishPersistTimer);
        itemIdFinishPersistTimer = setTimeout(() => {
            try {
                const st = typeof chrome !== 'undefined' && chrome.storage?.local;
                if (!st) return;
                st.set({ [ITEM_ID_FINISH_STORAGE_KEY]: { ...itemIdFinishMap } });
            } catch (_) {}
        }, 400);
    }

    function mergeItemIdFinishMap(map) {
        if (!map || typeof map !== 'object') return false;
        let changed = false;
        for (const [k, v] of Object.entries(map)) {
            if (k.startsWith('_')) continue;
            const fc = toInt(v);
            if (fc == null || !DOPPLER_FINISH[fc]) continue;
            if (itemIdFinishMap[k] === fc) continue;
            itemIdFinishMap[k] = fc;
            changed = true;
        }
        return changed;
    }

    function storageGetLocal(keys) {
        const st = typeof chrome !== 'undefined' && chrome.storage?.local;
        if (!st) return Promise.resolve({});
        return new Promise((resolve) => {
            try {
                st.get(keys, (data) => {
                    const err = chrome.runtime?.lastError;
                    resolve(err ? {} : (data || {}));
                });
            } catch (_) {
                resolve({});
            }
        });
    }

    function loadBundledItemIdFinishMap() {
        const rt = typeof chrome !== 'undefined' && chrome.runtime?.getURL;
        if (!rt) return Promise.resolve(false);
        return fetch(rt('data/csr-doppler-item-map.json'), { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => mergeItemIdFinishMap(data))
            .catch(() => false);
    }

    function loadCommunityItemIdFinishMap() {
        const url = 'https://api.github.com/repos/smelbravo/CS-Restored-Inventory-Helper/contents/csr%20inventory%20plugin/data/csr-doppler-item-map.json?ref=develop';
        return fetch(url, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((meta) => {
                if (!meta?.content) return false;
                const json = JSON.parse(atob(meta.content.replace(/\n/g, '')));
                return mergeItemIdFinishMap(json);
            })
            .catch(() => false);
    }

    function loadItemIdFinishMap() {
        if (itemIdFinishMapReady) return itemIdFinishMapReady;
        itemIdFinishMapReady = storageGetLocal([ITEM_ID_FINISH_STORAGE_KEY])
            .then((data) => {
                mergeItemIdFinishMap(data[ITEM_ID_FINISH_STORAGE_KEY]);
                itemIdFinishMapLoaded = true;
                return loadBundledItemIdFinishMap();
            })
            .then(() => loadCommunityItemIdFinishMap())
            .then(() => itemIdFinishMap);
        return itemIdFinishMapReady;
    }

    function reloadItemIdFinishMapFromStorage() {
        for (const k of Object.keys(itemIdFinishMap)) delete itemIdFinishMap[k];
        itemIdFinishMapLoaded = false;
        itemIdFinishMapReady = null;
        return loadItemIdFinishMap();
    }

    function getItemIdFinishMapSnapshot() {
        const out = Object.create(null);
        for (const [k, v] of Object.entries(itemIdFinishMap)) {
            if (k.startsWith('_')) continue;
            const fc = toInt(v);
            if (fc != null && DOPPLER_FINISH[fc]) out[k] = fc;
        }
        return out;
    }

    function learnItemIdFinishBatch(items) {
        if (!Array.isArray(items)) return false;
        let changed = false;
        for (const raw of items) {
            if (!raw || typeof raw !== 'object') continue;
            const item = raw.item || raw.weapon || raw.skin;
            const name = raw.name ?? raw.item_name ?? item?.name ?? '';
            const fc = extractFinishCatalog(raw);
            if (fc == null) continue;
            for (const id of catalogIdsFromRaw(raw)) {
                if (learnItemIdFinish(id, fc, name)) changed = true;
            }
        }
        return changed;
    }

    function learnItemIdFinishFromPayload(data) {
        if (!data || typeof data !== 'object') return false;
        let changed = false;
        if (Array.isArray(data)) {
            if (learnItemIdFinishBatch(data)) changed = true;
            return changed;
        }
        if (data.skin_index != null || data.item_id != null) {
            if (learnItemIdFinishBatch([data])) changed = true;
        }
        for (const k of ['item', 'weapon', 'skin', 'items', 'inventory', 'data', 'reward', 'won_item', 'opened_item']) {
            const v = data[k];
            if (Array.isArray(v)) {
                if (learnItemIdFinishBatch(v)) changed = true;
            } else if (v && typeof v === 'object' && (v.skin_index != null || v.item_id != null)) {
                if (learnItemIdFinishBatch([v])) changed = true;
            }
        }
        return changed;
    }

    function paintSeedFromRaw(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const item = raw.item || raw.weapon || raw.skin;
        for (const k of ['seed', 'skin_seed', 'paint_seed']) {
            const n = toInt(raw[k] ?? item?.[k]);
            if (n != null) return n;
        }
        return null;
    }

    /** skin_index is finish catalog on CS:R — but can duplicate paint seed on phased knives (418–421). */
    function skinIndexLooksLikePaintSeed(skinIndex, seed) {
        if (skinIndex == null || seed == null || skinIndex !== seed) return false;
        const info = DOPPLER_FINISH[skinIndex];
        return !!(info && info.kind === 'phase');
    }

    function extractFinishCatalog(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const item = raw.item || raw.weapon || raw.skin;
        const name = raw.name ?? raw.item_name ?? item?.name ?? '';
        const seed = paintSeedFromRaw(raw);
        const sources = [raw, item].filter(Boolean);
        for (const src of sources) {
            for (const k of FINISH_CATALOG_KEYS) {
                const n = toInt(src[k]);
                if (n == null || !DOPPLER_FINISH[n]) continue;
                if (k === 'skin_index' && !isDopplerFamilyName(name)) continue;
                if (k === 'skin_index' && skinIndexLooksLikePaintSeed(n, seed)) continue;
                return n;
            }
        }
        return null;
    }

    function catalogIdsFromRaw(raw) {
        if (!raw || typeof raw !== 'object') return [];
        const item = raw.item || raw.weapon || raw.skin;
        const ids = new Set();
        const add = (v) => {
            const n = toInt(v);
            if (n != null) ids.add(n);
        };
        add(skinDefinitionId(raw));
        add(raw.item_id);
        add(raw.weapon_id);
        add(raw.skin_id);
        add(item?.item_id);
        add(item?.weapon_id);
        add(item?.skin_id);
        return [...ids];
    }

    function finishFromItemIds(raw, name) {
        if (!isDopplerFamilyName(name)) return null;
        for (const id of catalogIdsFromRaw(raw)) {
            const fc = finishFromItemId(id, name);
            if (fc != null) return fc;
        }
        return null;
    }

    function resolveFinishCatalog(raw) {
        const direct = extractFinishCatalog(raw);
        if (direct != null) return direct;
        if (!raw || typeof raw !== 'object') return null;
        const item = raw.item || raw.weapon || raw.skin;
        const name = raw.name ?? raw.item_name ?? item?.name ?? '';
        const mapped = finishFromItemIds(raw, name);
        if (mapped != null) return mapped;
        const cached = toInt(raw.finish_catalog);
        if (cached != null && finishCatalogMatchesName(cached, name)) return cached;
        return null;
    }

    function isGammaDopplerName(name) {
        return /gamma\s*doppler/i.test(name || '');
    }

    function isDopplerFamilyName(name) {
        return /doppler/i.test(name || '');
    }

    function isCaseHardenedName(name) {
        return /case\s*hardened/i.test(name || '');
    }

    function isMarbleFadeName(name) {
        return /marble\s*fade/i.test(name || '');
    }

    /** Fade finish (not Marble / Amber / Acid). */
    function isFadeKnifeName(name) {
        const n = (name || '');
        if (isMarbleFadeName(n) || /amber\s*fade|acid\s*fade/i.test(n)) return false;
        return /\|\s*fade\s*$/i.test(n) || /\|\s*fade\b/i.test(n);
    }

    const FADE_BADGE_MIN = 95;

  /** Fade % via Valve paint-seed rotation (chescos/csgo-fade-percentage-calculator). */
    const FADE_CALC_CONFIGS = {
        default: { x0: -0.7, x1: -0.7, y0: -0.7, y1: -0.7, r0: -55, r1: -65 },
        MP7: { x0: -0.9, x1: -0.3, y0: -0.7, y1: -0.5, r0: -55, r1: -65 },
        'M4A1-S': { x0: -0.14, x1: 0.05, y0: 0, y1: 0, r0: -45, r1: -45 },
    };

    const FADE_CALC_REVERSED = new Set(['AWP', 'Karambit', 'MP7', 'Talon Knife']);

    const FADE_WEAPON_CALC_NAMES = {
        karambit: 'Karambit',
        m9: 'M9 Bayonet',
        bayonet: 'Bayonet',
        butterfly: 'Butterfly Knife',
        flip: 'Flip Knife',
        gut: 'Gut Knife',
        falchion: 'Falchion Knife',
        huntsman: 'Huntsman Knife',
        bowie: 'Bowie Knife',
        shadow: 'Shadow Daggers',
        skeleton: 'Skeleton Knife',
        talon: 'Talon Knife',
        stiletto: 'Stiletto Knife',
        ursus: 'Ursus Knife',
        navaja: 'Navaja Knife',
        nomad: 'Nomad Knife',
        paracord: 'Paracord Knife',
        survival: 'Survival Knife',
        classic: 'Classic Knife',
        kukri: 'Kukri Knife',
    };

    const fadePercentTableCache = Object.create(null);

    function FadeRng() {
        this.mIdum = 0;
        this.mIy = 0;
        this.mIv = [];
        this.NTAB = 32;
        this.IA = 16807;
        this.IM = 2147483647;
        this.IQ = 127773;
        this.IR = 2836;
        this.NDIV = 1 + (this.IM - 1) / this.NTAB;
        this.AM = 1.0 / this.IM;
        this.RNMX = 1.0 - 1.2e-7;
    }

    FadeRng.prototype.setSeed = function (seed) {
        this.mIdum = seed >= 0 ? -seed : seed;
        this.mIy = 0;
    };

    FadeRng.prototype.generateRandomNumber = function () {
        let k;
        let j;
        if (this.mIdum <= 0 || this.mIy === 0) {
            if (-this.mIdum < 1) this.mIdum = 1;
            else this.mIdum = -this.mIdum;
            for (j = this.NTAB + 7; j >= 0; j -= 1) {
                k = Math.floor(this.mIdum / this.IQ);
                this.mIdum = Math.floor(this.IA * (this.mIdum - k * this.IQ) - this.IR * k);
                if (this.mIdum < 0) this.mIdum += this.IM;
                if (j < this.NTAB) this.mIv[j] = this.mIdum;
            }
            this.mIy = this.mIv[0];
        }
        k = Math.floor(this.mIdum / this.IQ);
        this.mIdum = Math.floor(this.IA * (this.mIdum - k * this.IQ) - this.IR * k);
        if (this.mIdum < 0) this.mIdum += this.IM;
        j = Math.floor(this.mIy / this.NDIV);
        this.mIy = Math.floor(this.mIv[j]);
        this.mIv[j] = this.mIdum;
        return this.mIy;
    };

    FadeRng.prototype.randomFloat = function (low, high) {
        let float = this.AM * this.generateRandomNumber();
        if (float > this.RNMX) float = this.RNMX;
        return float * (high - low) + low;
    };

    function buildFadePercentTable(weapon) {
        if (fadePercentTableCache[weapon]) return fadePercentTableCache[weapon];
        const c = FADE_CALC_CONFIGS[weapon] || FADE_CALC_CONFIGS.default;
        const maxSeed = 1000;
        const raw = [];
        for (let i = 0; i <= maxSeed; i += 1) {
            const rng = new FadeRng();
            rng.setSeed(i);
            const x = rng.randomFloat(c.x0, c.x1);
            rng.randomFloat(c.y0, c.y1);
            const rot = rng.randomFloat(c.r0, c.r1);
            const usesRot = c.r0 !== c.r1;
            const usesX = c.x0 !== c.x1;
            let r;
            if (usesRot && usesX) r = rot * x;
            else if (usesRot) r = rot;
            else r = x;
            raw.push(r);
        }
        const rev = FADE_CALC_REVERSED.has(weapon);
        const best = rev ? Math.min(...raw) : Math.max(...raw);
        const worst = rev ? Math.max(...raw) : Math.min(...raw);
        const range = worst - best;
        const table = raw.map((r) => {
            const pct = 80 + ((worst - r) / range) * 20;
            return Math.round(pct * 10) / 10;
        });
        fadePercentTableCache[weapon] = table;
        return table;
    }

    function fadeCalcWeaponFromName(name) {
        const n = (name || '').toLowerCase();
        for (const rule of CH_WEAPON_RULES) {
            if (FADE_WEAPON_CALC_NAMES[rule.key] && rule.re.test(n)) {
                return FADE_WEAPON_CALC_NAMES[rule.key];
            }
        }
        if (/glock-18/i.test(n)) return 'Glock-18';
        if (/mac-10/i.test(n)) return 'MAC-10';
        if (/\bawp\b/i.test(n)) return 'AWP';
        if (/m4a1-s/i.test(n)) return 'M4A1-S';
        if (/\bmp7\b/i.test(n)) return 'MP7';
        if (/r8 revolver/i.test(n)) return 'R8 Revolver';
        if (/ump-45/i.test(n)) return 'UMP-45';
        return null;
    }

    function formatFadePercentText(pct) {
        if (pct >= 100) return '100%';
        if (Number.isInteger(pct)) return `${pct}%`;
        return `${pct.toFixed(1)}%`;
    }

    function fadePatternCss(pct) {
        if (pct >= 100) return 'csrx-pattern-fade100';
        if (pct >= 99) return 'csrx-pattern-fade99';
        if (pct >= 97) return 'csrx-pattern-fade97';
        if (pct >= 95) return 'csrx-pattern-fade95';
        if (pct >= 90) return 'csrx-pattern-fade-mid';
        return 'csrx-pattern-fade-low';
    }

    function resolveFadePercent(name, seed) {
        if (seed == null || !isFadeKnifeName(name)) return null;
        const weapon = fadeCalcWeaponFromName(name);
        if (!weapon) return null;
        const table = buildFadePercentTable(weapon);
        const pct = table[seed];
        if (pct == null) return null;
        const text = formatFadePercentText(pct);
        return {
            type: 'fade',
            percentage: pct,
            highlight: pct >= FADE_BADGE_MIN,
            label: `${text} Fade`,
            short: text,
            css: fadePatternCss(pct),
        };
    }

    function buildMultiTierMap(tierSeedLists) {
        const out = new Map();
        tierSeedLists.forEach((seeds, tier) => {
            for (const s of seeds) {
                if (!out.has(s)) out.set(s, tier);
            }
        });
        return out;
    }

    /** Fire & Ice tiers (Karambit / Bayonet / Flip / Gut — community seed lists). */
    const MF_FI_TIER_SEEDS = [
        [412],
        [16, 146, 241, 359, 393, 541, 602, 649, 688, 701],
        [152, 281, 292, 344, 628, 673, 743, 777, 792, 994],
        [48, 126, 129, 332, 780, 787, 874, 908, 918, 923],
        [182, 204, 252, 457, 522, 578, 652, 660, 685, 705, 736, 832, 988],
        [112, 230, 340, 356, 444, 452, 471, 607, 621, 631, 761, 773, 873, 876, 982],
        [8, 14, 32, 58, 108, 213, 233, 243, 274, 405, 454, 614, 653, 683, 728, 732, 770, 795, 803, 826, 867, 949],
        [5, 178, 188, 202, 337, 378, 406, 461, 539, 696, 702, 854, 966, 971],
        [68, 121, 149, 165, 171, 206, 287, 370, 493, 499, 516, 637, 655, 656, 672, 706, 766, 817, 922, 959, 997],
        [28, 156, 177, 238, 402, 545, 546, 553, 559, 589, 591, 725, 764, 791, 810, 844, 858, 868, 972, 977],
    ];

    const MF_FI_MAP = buildMultiTierMap(MF_FI_TIER_SEEDS);

    const MF_FI_LABELS = [
        'Fire & Ice',
        '2nd Max',
        '3rd Max',
        '4th Max',
        '5th Max',
        '6th Max',
        '7th Max',
        '8th Max',
        '9th Max',
        '10th Max',
    ];

    const MF_FI_SHORTS = ['F&I', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

    /** Merge seed lists (dedupe) for Max Red Tip maps. */
    function mfMergeSeedLists(...lists) {
        const s = new Set();
        for (const list of lists) {
            for (const n of list) s.add(n);
        }
        return [...s];
    }

    function mfRedTipMap(...seedLists) {
        return buildTierMap(mfMergeSeedLists(...seedLists), [], [], []);
    }

    /** Shared Max Red Tip tiers 578/728/764/364 (korenevskiy guides — most knives). */
    const MF_RT_STANDARD = [
        5, 8, 9, 14, 16, 27, 32, 48, 58, 60, 62, 68, 71, 90, 108, 110, 112, 121, 125, 126, 129,
        146, 149, 152, 156, 165, 170, 171, 177, 178, 182, 183, 188, 195, 196, 202, 203, 204,
        206, 213, 216, 222, 230, 232, 233, 234, 238, 241, 243, 252, 254, 266, 274, 281, 287,
        292, 304, 307, 309, 315, 321, 328, 329, 332, 333, 337, 340, 344, 351, 356, 359, 364,
        368, 370, 372, 378, 393, 397, 400, 402, 404, 405, 406, 412, 413, 415, 438, 441, 444,
        445, 448, 452, 454, 457, 459, 461, 463, 471, 473, 483, 485, 493, 496, 499, 506, 516,
        522, 535, 537, 539, 541, 545, 546, 553, 559, 561, 578, 582, 589, 590, 591, 602, 605,
        607, 614, 621, 626, 628, 631, 632, 637, 647, 649, 652, 653, 655, 656, 660, 663, 672,
        673, 674, 683, 685, 688, 691, 696, 701, 702, 705, 706, 710, 717, 725, 727, 728, 732,
        736, 743, 746, 753, 756, 761, 764, 766, 770, 773, 777, 780, 785, 787, 791, 792, 794,
        795, 803, 805, 809, 810, 817, 818, 826, 832, 844, 854, 858, 867, 868, 873, 874, 876,
        908, 909, 918, 922, 923, 930, 931, 941, 948, 949, 958, 959, 962, 966, 971, 972, 976,
        977, 980, 982, 988, 989, 994, 997,
    ];

    /** Ursus / Falchion-style curved-blade Max Red Tip (guide tier 1–2). */
    const MF_RT_CURVED_TOP = [
        10, 19, 25, 26, 38, 40, 50, 51, 52, 55, 56, 65, 67, 69, 70, 74, 82, 85, 86, 91, 97,
        123, 124, 128, 133, 139, 140, 175, 192, 199, 200, 207, 214, 215, 245, 255, 257, 267,
        270, 297, 300, 322, 327, 346, 347, 350, 363, 365, 367, 379, 390, 439, 460, 501, 524,
        533, 543, 548, 565, 567, 613, 615, 617, 619, 620, 625, 629, 635, 641, 643, 644, 662,
        700, 707, 713, 718, 722, 724, 729, 741, 765, 775, 778, 786, 797, 799, 814, 819, 823,
        830, 831, 836, 837, 841, 842, 847, 850, 870, 877, 879, 880, 888, 889, 900, 905, 932,
        934, 938, 950, 957, 963, 964, 970,
    ];

    /** M9-style Max Red Tip (also Stiletto / Nomad tier 1). */
    const MF_RT_M9_STYLE = [
        34, 41, 87, 93, 205, 256, 326, 341, 348, 380, 403, 422, 449, 468, 494, 517, 520, 521, 527,
        550, 571, 575, 576, 577, 583, 601, 636, 648, 651, 664, 668, 714, 742, 763, 807, 834, 848,
        892, 897, 910, 911, 925, 943, 944, 961, 975,
    ];

    /** Nomad Max Red Tip tier 2 (Steam #3489265494). */
    const MF_RT_NOMAD_T2 = [
        11, 29, 46, 84, 107, 136, 137, 141, 147, 150, 224, 236, 278, 308, 345, 375, 395, 396,
        399, 401, 428, 455, 465, 486, 597, 599, 639, 657, 690, 703, 712, 745, 747, 751, 754,
        781, 789, 793, 800, 824, 825, 827, 838, 840, 849, 856, 872, 914, 936, 956, 968, 981,
    ];

    /** Navaja knife-specific Max Red Tip tiers 1–3 + BTA (Steam #3339537774). */
    const MF_RT_NAVAJA_EXTRA = [
        0, 1, 3, 4, 11, 21, 29, 30, 42, 43, 45, 46, 54, 64, 73, 80, 84, 89, 96, 98, 102, 103,
        107, 109, 130, 136, 137, 138, 141, 142, 143, 145, 147, 148, 150, 151, 155, 162, 164,
        168, 172, 173, 181, 185, 211, 217, 223, 224, 229, 236, 246, 249, 253, 258, 260, 262,
        266, 269, 278, 280, 282, 283, 295, 296, 308, 310, 311, 313, 314, 334, 335, 345, 353,
        354, 358, 375, 377, 381, 384, 385, 387, 395, 396, 399, 401, 411, 428, 429, 430, 435,
        436, 440, 447, 451, 455, 462, 465, 466, 479, 481, 482, 486, 488, 489, 507, 508, 511,
        514, 515, 525, 530, 532, 536, 540, 547, 552, 555, 566, 568, 569, 570, 572, 579, 580,
        593, 597, 598, 599, 606, 608, 611, 624, 630, 639, 640, 642, 657, 665, 667, 670, 677,
        678, 686, 689, 690, 693, 703, 709, 712, 716, 723, 726, 733, 745, 747, 749, 751, 754,
        759, 767, 776, 781, 783, 789, 793, 798, 800, 812, 813, 822, 824, 825, 827, 838, 840,
        845, 846, 849, 853, 856, 872, 881, 891, 894, 899, 907, 914, 917, 929, 936, 939, 940,
        956, 968, 981,
    ];

    /** Skeleton knife Max Red Tip (Steam #3464071563 — unique tiers + BTA). */
    const MF_RT_SKELETON = [
        6, 11, 12, 18, 22, 23, 29, 33, 37, 46, 47, 76, 79, 84, 89, 94, 103, 104, 105, 107, 109,
        117, 137, 141, 147, 150, 154, 155, 157, 161, 168, 176, 179, 187, 191, 201, 210, 212, 224,
        227, 236, 276, 277, 285, 289, 293, 302, 324, 336, 345, 361, 375, 376, 380, 389, 392, 395,
        396, 399, 401, 416, 424, 428, 429, 430, 433, 440, 442, 446, 449, 458, 465, 481, 486, 487,
        494, 513, 517, 528, 538, 550, 564, 571, 577, 586, 587, 599, 612, 639, 645, 657, 658, 664,
        687, 690, 698, 719, 740, 745, 747, 749, 751, 752, 754, 757, 758, 762, 769, 774, 781, 782,
        789, 793, 798, 800, 808, 811, 815, 821, 824, 825, 827, 834, 835, 838, 840, 849, 851, 856,
        860, 863, 866, 872, 875, 878, 886, 887, 895, 898, 914, 915, 925, 933, 936, 943, 953, 955,
        956, 960, 968, 974, 979, 984, 990, 993, 995,
        ...MF_RT_M9_STYLE,
    ];

    /** Butterfly Marble Fade — Max Red Tip (Steam #2756666753). */
    const MF_BF_RED_TIP_MAP = mfRedTipMap([
        9, 27, 90, 125, 183, 203, 232, 254, 329, 351, 372, 397, 402, 404, 441, 459, 473, 483, 485,
        506, 537, 559, 626, 632, 647, 674, 725, 727, 753, 756, 764, 785, 791, 805, 810, 818, 858,
        868, 909, 941, 962, 976, 980,
    ]);

    const MF_M9_RED_TIP_MAP = mfRedTipMap(MF_RT_M9_STYLE);

    const MF_TALON_RED_TIP_MAP = mfRedTipMap([764, 87, 93, 326, 341, 468, 520, 575, 636, 668, 763, 897, 961]);

    const MF_HUNTSMAN_RED_TIP_MAP = mfRedTipMap(MF_RT_STANDARD);

    const MF_URSUS_RED_TIP_MAP = mfRedTipMap(MF_RT_CURVED_TOP, MF_RT_STANDARD);

    const MF_FALCHION_RED_TIP_MAP = mfRedTipMap(MF_RT_CURVED_TOP, MF_RT_STANDARD);

    const MF_BOWIE_RED_TIP_MAP = mfRedTipMap(MF_RT_M9_STYLE, MF_RT_STANDARD);

    const MF_STILETTO_RED_TIP_MAP = mfRedTipMap(MF_RT_M9_STYLE, MF_RT_NOMAD_T2, MF_RT_STANDARD);

    const MF_NOMAD_RED_TIP_MAP = mfRedTipMap(MF_RT_M9_STYLE, MF_RT_NOMAD_T2);

    const MF_NAVAJA_RED_TIP_MAP = mfRedTipMap(MF_RT_NAVAJA_EXTRA, MF_RT_M9_STYLE, MF_RT_STANDARD);

    const MF_SKELETON_RED_TIP_MAP = mfRedTipMap(MF_RT_SKELETON);

    const MF_RED_TIP_WEAPON_MAPS = {
        butterfly: MF_BF_RED_TIP_MAP,
        m9: MF_M9_RED_TIP_MAP,
        talon: MF_TALON_RED_TIP_MAP,
        huntsman: MF_HUNTSMAN_RED_TIP_MAP,
        ursus: MF_URSUS_RED_TIP_MAP,
        falchion: MF_FALCHION_RED_TIP_MAP,
        bowie: MF_BOWIE_RED_TIP_MAP,
        stiletto: MF_STILETTO_RED_TIP_MAP,
        nomad: MF_NOMAD_RED_TIP_MAP,
        navaja: MF_NAVAJA_RED_TIP_MAP,
        skeleton: MF_SKELETON_RED_TIP_MAP,
        shadow: MF_HUNTSMAN_RED_TIP_MAP,
        paracord: MF_HUNTSMAN_RED_TIP_MAP,
        survival: MF_HUNTSMAN_RED_TIP_MAP,
        classic: MF_HUNTSMAN_RED_TIP_MAP,
        kukri: MF_HUNTSMAN_RED_TIP_MAP,
    };

    const MF_FI_WEAPON_KEYS = new Set(['karambit', 'bayonet', 'flip', 'gut']);

    function marbleFadeWeaponKey(name) {
        const n = (name || '').toLowerCase();
        if (!isMarbleFadeName(name)) return null;
        for (const rule of CH_WEAPON_RULES) {
            if (rule.re.test(n)) return rule.key;
        }
        return null;
    }

    function marbleFadeFireIceBadge(tier) {
        const label = MF_FI_LABELS[tier] || 'Max Tier';
        const short = MF_FI_SHORTS[tier] || 'Max';
        const cssTier = Math.min(tier, 3);
        return {
            type: 'marble-fade',
            kind: 'fire-ice',
            tier,
            label: tier === 0 ? 'Fire & Ice (1st Max)' : `${label} Fire & Ice`,
            short: tier === 0 ? 'F&I' : short,
            css: `csrx-pattern-mf-fi${cssTier}`,
        };
    }

    function marbleFadeRedTipBadge() {
        return {
            type: 'marble-fade',
            kind: 'red-tip',
            tier: 0,
            label: 'Max Red Tip',
            short: 'Red Tip',
            css: 'csrx-pattern-mf-red',
        };
    }

    function resolveMarbleFadePattern(name, seed) {
        if (seed == null || !isMarbleFadeName(name)) return null;
        const key = marbleFadeWeaponKey(name);
        if (!key) return null;

        const redTipMap = MF_RED_TIP_WEAPON_MAPS[key];
        if (redTipMap) {
            const rt = lookupChTier({ [key]: redTipMap }, key, seed);
            if (rt != null) return marbleFadeRedTipBadge();
        }

        if (MF_FI_WEAPON_KEYS.has(key)) {
            const tier = MF_FI_MAP.get(seed);
            if (tier != null) return marbleFadeFireIceBadge(tier);
        }

        return null;
    }

    /** Browse filter keys: fade95 | mf-fi | mf-red */
    function browsePatternFilterKey(name, seed) {
        if (seed == null) return null;
        const fade = resolveFadePercent(name, seed);
        if (fade && fade.percentage >= FADE_BADGE_MIN) return 'fade95';
        const marble = resolveMarbleFadePattern(name, seed);
        if (marble?.kind === 'fire-ice') return 'mf-fi';
        if (marble?.kind === 'red-tip') return 'mf-red';
        return null;
    }

    function buildTierMap(rank1, tier1, tier2, tier3) {
        const out = new Map();
        const put = (seeds, tier) => {
            for (const s of seeds) {
                if (!out.has(s)) out.set(s, tier);
            }
        };
        put(rank1 || [], 0);
        put(tier1 || [], 1);
        put(tier2 || [], 2);
        put(tier3 || [], 3);
        return out;
    }

    /** #1 / co-#1 blue gem seeds per weapon (SteamAnalyst + BlueGemLab consensus). */
    const CH_BLUE_RANK1 = {
        ak47: [661],
        karambit: [387],
        m9: [601],
        butterfly: [494],
        bayonet: [555, 592, 670],
        talon: [146, 442],
        skeleton: [387, 601],
        flip: [670],
        bowie: [182],
        huntsman: [618],
        falchion: [494, 991],
        gut: [567],
        shadow: [56],
        navaja: [398, 407, 838],
        nomad: [888],
        stiletto: [182, 398],
        ursus: [916, 365],
        paracord: [398],
        survival: [403],
        classic: [387, 670],
        kukri: [371, 494],
        fiveseven: [278, 690],
        mac10: [],
    };

    /** Notable gold-dominant seeds (#1 / top gold where documented). */
    const CH_GOLD_RANK1 = {
        flip: [731],
        bowie: [],
        shadow: [],
    };

    const CH_BLUE_TIERS = {
        ak47: buildTierMap(
            CH_BLUE_RANK1.ak47,
            [151, 168, 179, 321, 387, 555, 592, 670, 760, 809, 955],
            [4, 13, 28, 32, 65, 74, 82, 92, 103, 122, 139, 147, 172, 189, 205, 228, 256, 323, 341, 426, 430, 442, 463, 479, 512, 525, 526, 532, 541, 571, 578, 605, 617, 627, 695, 698, 708, 713, 750, 752, 791, 828, 844, 868, 887, 888, 892, 903, 905, 922, 950, 969, 978, 996],
            [34, 81, 112, 278, 310, 312, 363, 381, 413, 428, 429, 450, 519, 557, 586, 610, 647, 685, 689, 690, 733, 754, 770, 819, 823, 856, 862, 872, 878, 935, 1000],
        ),
        karambit: buildTierMap(
            CH_BLUE_RANK1.karambit,
            [],
            [905, 698, 670, 130, 375, 664, 828, 74, 282, 453, 868, 377, 891, 798, 341, 541, 713, 661, 494, 4, 182, 823, 273, 838, 917, 82, 721, 510, 809, 470, 179],
            [262, 322, 30, 256, 139, 782, 989, 888, 11, 844, 92, 919, 112, 770, 330, 463, 306, 34, 429, 965, 811, 522, 803, 20, 575, 638, 914, 580, 236, 310, 916, 515, 631, 407, 371, 841, 555, 711, 632, 398, 598, 420, 283, 856, 202],
        ),
        m9: buildTierMap(
            CH_BLUE_RANK1.m9,
            [58, 107, 150, 239, 253, 349, 354, 403, 406, 417, 449, 503, 517, 523, 550, 585, 634, 675, 897, 946],
            [],
            [],
        ),
        fiveseven: buildTierMap(
            CH_BLUE_RANK1.fiveseven,
            [189, 363, 689, 868, 872],
            [],
            [],
        ),
        mac10: buildTierMap(
            [],
            [667, 114, 406, 95],
            [19, 22, 80, 199, 239, 251, 295, 313, 349, 503, 748, 807, 890, 944],
            [],
        ),
        butterfly: buildTierMap(CH_BLUE_RANK1.butterfly, [], [], []),
        bayonet: buildTierMap(CH_BLUE_RANK1.bayonet, [], [], []),
        talon: buildTierMap(CH_BLUE_RANK1.talon, [], [], []),
        skeleton: buildTierMap(CH_BLUE_RANK1.skeleton, [], [], []),
        flip: buildTierMap(CH_BLUE_RANK1.flip, [], [], []),
        bowie: buildTierMap(CH_BLUE_RANK1.bowie, [], [], []),
        huntsman: buildTierMap(CH_BLUE_RANK1.huntsman, [], [], []),
        falchion: buildTierMap(CH_BLUE_RANK1.falchion, [], [], []),
        gut: buildTierMap(CH_BLUE_RANK1.gut, [], [], []),
        shadow: buildTierMap(CH_BLUE_RANK1.shadow, [], [], []),
        navaja: buildTierMap(CH_BLUE_RANK1.navaja, [], [], []),
        nomad: buildTierMap(CH_BLUE_RANK1.nomad, [], [], []),
        stiletto: buildTierMap(CH_BLUE_RANK1.stiletto, [], [], []),
        ursus: buildTierMap(CH_BLUE_RANK1.ursus, [], [], []),
        paracord: buildTierMap(CH_BLUE_RANK1.paracord, [], [], []),
        survival: buildTierMap(CH_BLUE_RANK1.survival, [], [], []),
        classic: buildTierMap(CH_BLUE_RANK1.classic, [], [], []),
        kukri: buildTierMap(CH_BLUE_RANK1.kukri, [], [], []),
    };

    const CH_GOLD_TIERS = {
        flip: buildTierMap(CH_GOLD_RANK1.flip, [], [], []),
    };

    function caseHardenedWeaponKey(name) {
        const n = (name || '').toLowerCase();
        if (!n.includes('case hardened')) return null;
        for (const rule of CH_WEAPON_RULES) {
            if (rule.re.test(n)) return rule.key;
        }
        return null;
    }

    function tierBadge(tier, gemKind) {
        const isGold = gemKind === 'gold';
        if (tier === 0) {
            return {
                type: isGold ? 'ch-gold' : 'ch',
                tier: 0,
                gemKind,
                label: isGold ? '#1 Gold Gem' : '#1 Blue Gem',
                short: '#1',
                css: isGold ? 'csrx-pattern-gold0' : 'csrx-pattern-ch0',
            };
        }
        return {
            type: isGold ? 'ch-gold' : 'ch',
            tier,
            gemKind,
            label: isGold ? `Tier ${tier} Gold` : `Tier ${tier} Blue`,
            short: isGold ? `G${tier}` : `T${tier}`,
            css: isGold ? `csrx-pattern-gold${tier}` : `csrx-pattern-ch${tier}`,
        };
    }

    function lookupChTier(maps, key, seed) {
        if (!key || seed == null) return null;
        const map = maps[key];
        if (!map) return null;
        const tier = map.get(seed);
        return tier == null ? null : tier;
    }

    function resolveCaseHardenedTier(name, seed) {
        if (seed == null || !isCaseHardenedName(name)) return null;
        const key = caseHardenedWeaponKey(name);
        if (!key) return null;

        const blueTier = lookupChTier(CH_BLUE_TIERS, key, seed);
        if (blueTier != null) return tierBadge(blueTier, 'blue');

        const goldTier = lookupChTier(CH_GOLD_TIERS, key, seed);
        if (goldTier != null) return tierBadge(goldTier, 'gold');

        return null;
    }

    function resolveDopplerPhase(name, finishCatalog) {
        if (finishCatalog == null || !isDopplerFamilyName(name)) return null;
        const info = DOPPLER_FINISH[finishCatalog];
        if (!info || !dopplerInfoMatchesWeapon(info, name)) return null;
        const css = info.kind === 'gem'
            ? `csrx-pattern-gem csrx-pattern-${info.short.toLowerCase().replace(/\s+/g, '-')}`
            : `csrx-pattern-phase csrx-pattern-${info.short.toLowerCase()}`;
        return {
            type: 'doppler',
            label: info.label,
            short: info.short,
            kind: info.kind,
            finishCatalog,
            css,
        };
    }

    function dopplerPaintIndex(item) {
        if (!item || typeof item !== 'object') return null;
        const name = item.name || '';
        if (!isDopplerFamilyName(name)) return null;
        const fc = item.finish_catalog != null ? toInt(item.finish_catalog) : resolveFinishCatalog(item);
        if (fc == null) return null;
        return finishCatalogMatchesName(fc, name) ? fc : null;
    }

    function formatDopplerPatternText(pattern) {
        if (!pattern || pattern.type !== 'doppler') return pattern?.short || pattern?.label || '';
        const label = pattern.short || pattern.label;
        return pattern.finishCatalog != null ? `${label} · ${pattern.finishCatalog}` : label;
    }

    function formatDopplerPatternTitle(pattern) {
        if (!pattern) return '';
        if (pattern.type !== 'doppler') return pattern.label || '';
        return pattern.finishCatalog != null
            ? `${pattern.label} (paint index ${pattern.finishCatalog})`
            : pattern.label;
    }

    function resolveSkinPattern(item) {
        if (!item || typeof item !== 'object') return null;
        const name = item.name || '';
        const seed = item.seed != null ? toInt(item.seed) : paintSeedFromRaw(item);
        const finishCatalog = item.finish_catalog != null
            ? toInt(item.finish_catalog)
            : resolveFinishCatalog(item);
        const doppler = resolveDopplerPhase(name, finishCatalog);
        if (doppler) return doppler;
        const marble = resolveMarbleFadePattern(name, seed);
        if (marble) return marble;
        const fade = resolveFadePercent(name, seed);
        if (fade) return fade;
        return resolveCaseHardenedTier(name, seed);
    }

    function patternSignature(pattern) {
        if (!pattern) return '';
        if (pattern.type === 'doppler') return `d${pattern.finishCatalog}`;
        if (pattern.type === 'fade') return `f${pattern.percentage}`;
        if (pattern.type === 'marble-fade') return `mf${pattern.kind}${pattern.tier}`;
        if (pattern.type === 'ch' || pattern.type === 'ch-gold') {
            return `${pattern.gemKind || 'blue'}${pattern.tier}`;
        }
        return '';
    }

    let _apiProbeDone = false;
    function probePatternApiFields(inventoryArr) {
        if (_apiProbeDone || !Array.isArray(inventoryArr)) return;
        const dop = inventoryArr.find(i => isDopplerFamilyName(i?.name));
        if (!dop) return;
        _apiProbeDone = true;
        const fc = extractFinishCatalog(dop);
        if (fc == null) {
            const hint = dop.skin_index != null ? ` (skin_index=${dop.skin_index} — not a known phase id)` : '';
            console.info(
                '[CSR Inventory Helper] Doppler found but no phase id in API yet' + hint + '. Keys on item:',
                Object.keys(dop),
                '\nItem sample:',
                dop,
            );
        } else {
            const phase = resolveDopplerPhase(dop.name, fc);
            const via = dop.skin_index === fc ? 'skin_index' : 'finish catalog';
            console.info('[CSR Inventory Helper] Doppler phase via', via, fc, '→', phase?.label || '?', 'for', dop.name);
        }
    }

    global.CSR_extractFinishCatalog = extractFinishCatalog;
    global.CSR_resolveFinishCatalog = resolveFinishCatalog;
    global.CSR_skinDefinitionId = skinDefinitionId;
    global.CSR_dopplerPaintIndex = dopplerPaintIndex;
    global.CSR_formatDopplerPatternText = formatDopplerPatternText;
    global.CSR_formatDopplerPatternTitle = formatDopplerPatternTitle;
    global.CSR_finishFromItemId = finishFromItemId;
    global.CSR_finishFromItemIds = finishFromItemIds;
    global.CSR_catalogIdsFromRaw = catalogIdsFromRaw;
    global.CSR_learnItemIdFinishBatch = learnItemIdFinishBatch;
    global.CSR_learnItemIdFinishFromPayload = learnItemIdFinishFromPayload;
    global.CSR_loadItemIdFinishMap = loadItemIdFinishMap;
    global.CSR_reloadItemIdFinishMapFromStorage = reloadItemIdFinishMapFromStorage;
    global.CSR_getItemIdFinishMapSnapshot = getItemIdFinishMapSnapshot;
    global.CSR_ITEM_ID_FINISH_STORAGE_KEY = ITEM_ID_FINISH_STORAGE_KEY;
    global.CSR_resolveSkinPattern = resolveSkinPattern;
    global.CSR_resolveFadePercent = resolveFadePercent;
    global.CSR_resolveMarbleFadePattern = resolveMarbleFadePattern;
    global.CSR_FADE_BADGE_MIN = FADE_BADGE_MIN;
    global.CSR_browsePatternFilterKey = browsePatternFilterKey;
    global.CSR_patternSignature = patternSignature;
    global.CSR_probePatternApiFields = probePatternApiFields;
    global.CSR_DOPPLER_FINISH = DOPPLER_FINISH;
    global.CSR_PATTERN_SOURCES = PATTERN_SOURCES;

})(typeof globalThis !== 'undefined' ? globalThis : window);
