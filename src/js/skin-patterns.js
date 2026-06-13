/**
 * Doppler / Gamma Doppler phases (Finish Catalog) and Case Hardened gem tiers (paint seed).
 *
 * CH seed lists: community databases (bundled offline — no external API calls):
 * - https://bluegemlab.com/
 * - https://csgobluegem.com/
 * - https://www.steamanalyst.com/guides/blue-gem
 * - https://www.isitabluegem.com/
 * - CSFloat pattern filters (reference)
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
    ];

    const DOPPLER_FINISH = {
        415: { label: 'Ruby', short: 'Ruby', kind: 'gem', family: 'doppler' },
        416: { label: 'Sapphire', short: 'Sapphire', kind: 'gem', family: 'doppler' },
        417: { label: 'Black Pearl', short: 'BP', kind: 'gem', family: 'doppler' },
        418: { label: 'Phase 1', short: 'P1', kind: 'phase', family: 'doppler' },
        419: { label: 'Phase 2', short: 'P2', kind: 'phase', family: 'doppler' },
        420: { label: 'Phase 3', short: 'P3', kind: 'phase', family: 'doppler' },
        421: { label: 'Phase 4', short: 'P4', kind: 'phase', family: 'doppler' },
        /* CS:R alt Doppler gems (Kukri, Butterfly, Shadow Daggers, etc.) — not CS:GO 415–417 */
        617: { label: 'Ruby', short: 'Ruby', kind: 'gem', family: 'doppler' },
        618: { label: 'Black Pearl', short: 'BP', kind: 'gem', family: 'doppler' },
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
        const finishCatalog = item.finish_catalog != null
            ? toInt(item.finish_catalog)
            : resolveFinishCatalog(item);
        const doppler = resolveDopplerPhase(name, finishCatalog);
        if (doppler) return doppler;
        return resolveCaseHardenedTier(name, item.seed != null ? toInt(item.seed) : null);
    }

    function patternSignature(pattern) {
        if (!pattern) return '';
        if (pattern.type === 'doppler') return `d${pattern.finishCatalog}`;
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
    global.CSR_patternSignature = patternSignature;
    global.CSR_probePatternApiFields = probePatternApiFields;
    global.CSR_DOPPLER_FINISH = DOPPLER_FINISH;
    global.CSR_PATTERN_SOURCES = PATTERN_SOURCES;

})(typeof globalThis !== 'undefined' ? globalThis : window);
