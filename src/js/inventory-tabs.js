/* Inventory area sub-tabs: Skins | Cases | Quests | Marketplace | Trades */

(function () {
  let _tab = 'skins';
  let _bound = false;

  const TITLES = {
    skins: 'page_inventory_title',
    cases: 'inv_tab_cases_title',
    quests: 'inv_tab_quests_title',
    marketplace: 'inv_tab_marketplace_title',
    trades: 'inv_tab_trades_title'
  };

  function t(key) {
    return (typeof window._invTranslate === 'function' ? window._invTranslate(key) : key);
  }

  function el(id) {
    return document.getElementById(id);
  }

  function isViewingOther() {
    return !!(window.CSRApp?.getInventoryViewUserId?.());
  }

  function setSubnavVisible(show) {
    const nav = el('inventory-subnav');
    if (nav) nav.hidden = !show;
  }

  function showPanel(tab) {
    document.querySelectorAll('.inv-panel').forEach((p) => {
      const on = p.dataset.invPanel === tab;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
    document.querySelectorAll('.inv-subnav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.invTab === tab);
    });

    const controls = el('inventory-controls-bar');
    const coinTabs = ['skins', 'cases', 'marketplace', 'trades'];
    const showCoins = coinTabs.includes(tab);
    if (controls) {
      controls.style.display = showCoins ? '' : 'none';
    }
    const refreshBtn = el('btn-refresh-inventory');
    const countEl = el('inventory-count');
    const coinsWrap = el('inventory-coins-wrap');
    if (refreshBtn) refreshBtn.style.display = tab === 'skins' ? '' : 'none';
    if (countEl) countEl.style.display = tab === 'skins' ? '' : 'none';
    if (coinsWrap) coinsWrap.style.display = showCoins ? '' : 'none';

    const titleEl = el('page-inventory-title');
    if (titleEl && !isViewingOther()) {
      const key = TITLES[tab] || TITLES.skins;
      titleEl.textContent = t(key);
    }

    const toolbar = el('inventory-toolbar');
    if (toolbar && tab !== 'skins') toolbar.style.display = 'none';
  }

  function loadTab(tab) {
    if (isViewingOther() && tab !== 'skins') return;
    switch (tab) {
      case 'skins':
        if (typeof window.loadInventorySkins === 'function') window.loadInventorySkins();
        break;
      case 'cases':
        if (window.CSRCases) CSRCases.load();
        break;
      case 'quests':
        break;
      case 'marketplace':
        if (window.CSRMarketplace) CSRMarketplace.load();
        break;
      case 'trades':
        if (window.CSRTrades) CSRTrades.activateFromTab();
        break;
      default:
        break;
    }
  }

  function switchTab(tab) {
    if (!tab || tab === _tab) {
      if (tab) loadTab(tab);
      return;
    }
    if (_tab === 'cases' && tab !== 'cases' && window.CSRCases?.dismissOverlays) {
      CSRCases.dismissOverlays();
    }
    _tab = tab;
    showPanel(tab);
    loadTab(tab);
  }

  function refreshCurrent() {
    loadTab(_tab);
  }

  function getTab() {
    return _tab;
  }

  function resetToSkins() {
    _tab = 'skins';
    showPanel('skins');
    setSubnavVisible(true);
  }

  function onViewModeChange(viewingOther) {
    setSubnavVisible(!viewingOther);
    if (viewingOther) {
      showPanel('skins');
    } else {
      showPanel(_tab);
    }
  }

  function setup() {
    if (_bound) return;
    _bound = true;
    document.querySelectorAll('.inv-subnav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (isViewingOther()) return;
        switchTab(btn.dataset.invTab);
      });
    });
    showPanel('skins');
  }

  window.CSRInventoryTabs = {
    setup,
    switchTab,
    refreshCurrent,
    getTab,
    resetToSkins,
    onViewModeChange
  };
})();
