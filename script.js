// script.js
// DOM-based game logic: screen transitions, simple game mechanics, and localStorage persistence.
// Comments are intentionally beginner-friendly.

document.addEventListener('DOMContentLoaded', () => {
  // -- Elements
  const screen1 = document.getElementById('screen-1');
  const screen2 = document.getElementById('screen-2');
  const startBtn = document.getElementById('startBtn');
  const loadBtn = document.getElementById('loadBtn');
  const backBtn = document.getElementById('backBtn');

  // Game state with defaults
  const state = {
    funds: 100,
    waterDelivered: 0,
    selectedTool: null,
    placedItems: [],
    missionActive: false,
    missionTimeLeft: 0,
    achievements: [],
  };

  // Attempt to load saved state from localStorage
  try {
    const saved = localStorage.getItem('charity-game-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(state, parsed);
    }
  } catch (e) {
    console.warn('Failed to load saved state', e);
  }

  // Simple UI caches used in screen2
  const fundsEl = document.getElementById('funds');
  const waterEl = document.getElementById('waterDelivered');
  const shopListEl = document.getElementById('shopList');
  const inventoryEl = document.getElementById('inventoryList');
  const mapGridEl = document.getElementById('mapGrid');
  const statusTextEl = document.getElementById('statusText');
  const deliverBtn = document.getElementById('deliverWater');

  function logDebug(msg) {
    const el = document.getElementById('debugLog');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
    console.log('[DEBUG]', msg);
  }

  // Shop items
  const shopItems = [
    { id: 'bucket', name: 'Bucket', cost: 10, effect: { water: 5 } },
    { id: 'pump', name: 'Hand Pump', cost: 40, effect: { water: 20 } },
    { id: 'pipe', name: 'Pipe', cost: 15, effect: { water: 0 } },
  ];

  // Map dimensions
  const MAP_COLS = 6;
  const MAP_ROWS = 4;
  const totalTiles = MAP_COLS * MAP_ROWS;

  // Simple loader implementation using the small overlay added to index.html
  const simpleLoader = document.getElementById('simpleLoader');
  const simpleLoaderPercent = document.getElementById('simpleLoaderPercent');
  let _simpleTimeout = null;
  function showLoading(message = 'Loading...', durationMs = 300, taskPromise = null) {
    // If the jerry loader is visible, hide it to avoid double overlays
    if (jerryLoader) hideJerryLoading();
    // If there's no simple loader element (user removed it), fall back to the jerry loader
    if (!simpleLoader) return showJerryLoading(message, Math.max(durationMs, 300), taskPromise);
  simpleLoader.classList.remove('hidden');
  // Prevent body scrolling/interaction while loader is visible
  document.body.classList.add('no-scroll');
  document.documentElement.classList.add('no-scroll');
    simpleLoader.setAttribute('aria-hidden', 'false');
    if (simpleLoaderPercent) simpleLoaderPercent.textContent = '0%';

    return new Promise(resolve => {
      const start = performance.now();
      function step(now) {
        const t = Math.min(1, (now - start) / durationMs);
        const pct = Math.round(t * 100);
        if (simpleLoaderPercent) simpleLoaderPercent.textContent = pct + '%';
        if (t < 1) {
          _simpleTimeout = requestAnimationFrame(step);
        }
      }
      _simpleTimeout = requestAnimationFrame(step);

      // Wait for both the animation and optional task to finish
      const animDone = new Promise(res => setTimeout(res, durationMs));
      const waitFor = taskPromise ? Promise.all([animDone, taskPromise]) : animDone;
      // Safety timeout so it never hangs
      const safety = setTimeout(() => {
        console.warn('Simple loader safety timeout');
        resolve();
      }, durationMs + 3000);

      waitFor.finally(() => {
        clearTimeout(safety);
        if (_simpleTimeout) cancelAnimationFrame(_simpleTimeout);
        if (simpleLoaderPercent) simpleLoaderPercent.textContent = '100%';
        // small delay so user sees 100%
        setTimeout(() => {
          simpleLoader.classList.add('hidden');
          document.body.classList.remove('no-scroll');
          document.documentElement.classList.remove('no-scroll');
          resolve();
        }, 220);
      });
    });
  }

  function hideLoading() {
    if (!simpleLoader) return;
    simpleLoader.classList.add('hidden');
    if (_simpleTimeout) cancelAnimationFrame(_simpleTimeout);
    if (simpleLoaderPercent) simpleLoaderPercent.textContent = '0%';
    simpleLoader.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  document.documentElement.classList.remove('no-scroll');
  }

  // -------------------------
  // Jerrycan thematic loader
  // -------------------------
  const jerryLoader = document.getElementById('jerryLoader');
  const jerryLoaderPercent = document.getElementById('jerryLoaderPercent');
  const jerryLoaderMessage = document.getElementById('jerryLoaderMessage');
  const jerryWater = jerryLoader ? jerryLoader.querySelector('.water') : null;
  const jerryBox = jerryLoader ? jerryLoader.querySelector('.jerrycan-box') : null;
  // Also keep a reference to the SVG rect element so we can set attributes directly
  const jerryWaterRect = jerryWater;
  // internal timers for jerry loader so we can force-hide when stuck
  let _jerryRafId = null;
  let _jerrySafety = null;
  let _jerryHideTimeout = null;

  function _setJerryPercent(pct) {
    if (jerryLoaderPercent) jerryLoaderPercent.textContent = Math.round(pct) + '100%';
    if (jerryWater) {
      // scaleY from 0 -> 1
      jerryWater.style.transform = `scaleY(${pct / 100})`;
      // Fallback: set rect height and y so some browsers render the fill reliably
      try {
        const totalH = 68; // height used in the SVG for the water rect
        const height = Math.max(0, Math.min(totalH, Math.round((pct / 100) * totalH)));
        const y = 6 + (totalH - height);
        jerryWaterRect.setAttribute('height', String(height));
        jerryWaterRect.setAttribute('y', String(y));
      } catch (e) {
        // ignore if attribute setting fails
      }
      // If we've reached 100%, schedule a safe hide so UI doesn't get stuck
      if (pct >= 100) {
        if (_jerryHideTimeout) clearTimeout(_jerryHideTimeout);
        _jerryHideTimeout = setTimeout(() => {
          if (jerryLoader && !jerryLoader.classList.contains('hidden')) {
            try { hideJerryLoading(); } catch (e) { /* ignore */ }
          }
        }, 420);
      }
    }
  }

  function showJerryLoading(message = 'Loading...', durationMs = 600, taskPromise = null) {
    // If the simple loader is visible, hide it to avoid overlapping overlays
    if (simpleLoader) hideLoading();
    if (!jerryLoader) return Promise.resolve();
  jerryLoader.classList.remove('hidden');
  // Prevent page scrolling/interaction while jerry loader is visible
  document.body.classList.add('no-scroll');
  document.documentElement.classList.add('no-scroll');
    jerryLoader.setAttribute('aria-hidden', 'false');
    if (jerryLoaderMessage) jerryLoaderMessage.textContent = message;
    _setJerryPercent(0);

    return new Promise(resolve => {
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        _setJerryPercent(t * 100);
        if (t < 1) _jerryRafId = requestAnimationFrame(tick);
      }
      _jerryRafId = requestAnimationFrame(tick);

      const animDone = new Promise(res => setTimeout(res, durationMs));
      const waitFor = taskPromise ? Promise.all([animDone, taskPromise]) : animDone;

      // Safety timeout
      _jerrySafety = setTimeout(() => {
        console.warn('Jerry loader safety timeout');
        cleanup();
        resolve();
      }, durationMs + 400);

      function cleanup() {
        if (_jerryRafId) cancelAnimationFrame(_jerryRafId);
        _jerryRafId = null;
        // ensure full fill
        _setJerryPercent(100);
        // small splash effect: add .finish to the jerrycan box to trigger CSS drop animations
        if (jerryBox) jerryBox.classList.add('finish');
      }

      waitFor.finally(() => {
        if (_jerrySafety) { clearTimeout(_jerrySafety); _jerrySafety = null; }
        cleanup();
        // show final splash for a short moment, then hide
        _jerryHideTimeout = setTimeout(() => {
          if (jerryBox) jerryBox.classList.remove('finish');
          if (jerryLoader) {
            jerryLoader.classList.add('hidden');
            jerryLoader.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('no-scroll');
            document.documentElement.classList.remove('no-scroll');
          }
          _jerryHideTimeout = null;
          resolve();
        }, 520);
      });
    });
  }

  function hideJerryLoading() {
    if (!jerryLoader) return;
    jerryLoader.classList.add('hidden');
    jerryLoader.setAttribute('aria-hidden', 'true');
    if (jerryWater) jerryWater.style.transform = 'scaleY(0)';
    if (jerryLoaderPercent) jerryLoaderPercent.textContent = '0%';
    if (jerryLoaderMessage) jerryLoaderMessage.textContent = '';
    if (jerryBox) jerryBox.classList.remove('finish');
    if (_jerryRafId) { cancelAnimationFrame(_jerryRafId); _jerryRafId = null; }
    if (_jerrySafety) { clearTimeout(_jerrySafety); _jerrySafety = null; }
    if (_jerryHideTimeout) { clearTimeout(_jerryHideTimeout); _jerryHideTimeout = null; }
    document.body.classList.remove('no-scroll');
    document.documentElement.classList.remove('no-scroll');
  }

  function saveState() {
    try {
      localStorage.setItem('charity-game-state', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state', e);
    }
  }

  function updateHUD() {
    fundsEl.textContent = state.funds;
    waterEl.textContent = state.waterDelivered;
  }

  function renderShop() {
    if (!shopListEl) return;
    shopListEl.innerHTML = '';
    shopItems.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'shop-item';
      itemEl.innerHTML = `
        <div class="meta">
          <strong>${item.name}</strong><div style="font-size:0.85rem;color:#6b7280;">$${item.cost}</div>
        </div>
      `;
      const buyBtn = document.createElement('button');
      buyBtn.className = 'btn';
      buyBtn.textContent = 'Select';
      buyBtn.addEventListener('click', () => {
        state.selectedTool = item;
        statusTextEl.textContent = `Selected: ${item.name}. Click a map tile to place it.`;
        Array.from(shopListEl.querySelectorAll('.shop-item')).forEach(el => el.style.boxShadow = '');
        itemEl.style.boxShadow = '0 0 0 2px rgba(14,165,164,0.14)';
      });
      itemEl.appendChild(buyBtn);
      shopListEl.appendChild(itemEl);
    });
  }

  function renderMap() {
    if (!mapGridEl) return;
    mapGridEl.innerHTML = '';
    for (let i = 0; i < totalTiles; i++) {
      const tile = document.createElement('div');
      tile.className = 'map-tile';
      tile.dataset.index = i;
      tile.innerHTML = `<div class="tile-label">Plot ${i + 1}</div><div class="tile-item"></div>`;
      tile.addEventListener('click', () => onMapTileClick(i, tile));
      // If there's a placed item in saved state, show it
      const placed = state.placedItems.find(p => p.index === i);
      if (placed) {
        tile.classList.add('placed');
        tile.querySelector('.tile-item').textContent = placed.item.name;
      }
      mapGridEl.appendChild(tile);
    }
  }

  function updateInventory() {
    if (!inventoryEl) return;
    inventoryEl.innerHTML = '';
    if (state.placedItems.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No items placed yet.';
      inventoryEl.appendChild(li);
      return;
    }
    state.placedItems.forEach(p => {
      const li = document.createElement('li');
      li.textContent = `Plot ${p.index + 1}: ${p.item.name}`;
      inventoryEl.appendChild(li);
    });
  }

  function onMapTileClick(index, tileEl) {
    if (!state.selectedTool) {
      statusTextEl.textContent = 'Please select a tool from the shop first.';
      return;
    }

    const existing = state.placedItems.find(p => p.index === index);
    if (existing) {
      const refund = Math.ceil(existing.item.cost / 2);
      state.funds += refund;
      state.placedItems = state.placedItems.filter(p => p.index !== index);
      tileEl.classList.remove('placed');
      tileEl.querySelector('.tile-item').textContent = '';
      updateInventory();
      updateHUD();
      saveState();
      statusTextEl.textContent = `Removed ${existing.item.name} from this plot. Refunded $${refund}.`;
      return;
    }

    if (state.funds < state.selectedTool.cost) {
      statusTextEl.textContent = "You don't have enough funds for that item.";
      return;
    }

    state.funds -= state.selectedTool.cost;
    state.placedItems.push({ index, item: state.selectedTool });
    tileEl.classList.add('placed');
    tileEl.querySelector('.tile-item').textContent = state.selectedTool.name;
    updateInventory();
    updateHUD();
    saveState();
    statusTextEl.textContent = `${state.selectedTool.name} placed on Plot ${index + 1}. Click again to remove (partial refund).`;
  }

  // Deliver water logic
  if (deliverBtn) {
    deliverBtn.addEventListener('click', () => {
      let gained = 0;
      state.placedItems.forEach(p => {
        gained += (p.item.effect && p.item.effect.water) || 0;
      });
      if (gained === 0) gained = 2;
      state.waterDelivered += gained;
      const reward = Math.floor(gained / 2);
      state.funds += reward;
      updateHUD();
      saveState();
      statusTextEl.textContent = `Delivered ${gained} L of water to the village. Earned $${reward}.`;
      checkAchievements();
    });
  }

  // Achievements (simple examples)
  function checkAchievements() {
    if (state.waterDelivered >= 100 && !state.achievements.includes('100L')) {
      state.achievements.push('100L');
      alert('Achievement unlocked: 100 L delivered!');
    }
    saveState();
  }

  // Screen transitions
  startBtn.addEventListener('click', () => {
    // Basic start: show screen2 and initialize components
    screen1.classList.add('hidden');
    screen2.classList.remove('hidden');
    // Re-render UI elements
    renderShop();
    renderMap();
    updateInventory();
    updateHUD();
    statusTextEl.textContent = 'Mission started. Select an item from the shop.';
  });
  logDebug('startBtn handler attached');

  loadBtn.addEventListener('click', () => {
  logDebug('loadBtn clicked');
    // Show loading overlay and wait for the fill+finish to complete before hiding
    showLoading('Loading saved game...', 300).then(() => {
  logDebug('showLoading resolved for loadBtn');
      screen1.classList.add('hidden');
      screen2.classList.remove('hidden');
      renderShop();
      renderMap();
      updateInventory();
      updateHUD();
      statusTextEl.textContent = 'Loaded saved game state.';
      hideLoading();
    });
  });
  logDebug('loadBtn handler attached');

  // Demo load removed per user request

  backBtn.addEventListener('click', () => {
    // Return to main screen
    screen2.classList.add('hidden');
    screen1.classList.remove('hidden');
    statusTextEl.textContent = 'Returned to the main menu.';
  });
  logDebug('backBtn handler attached');

  // Help button exists in markup; attach listener if present
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      alert('Help:\n1) Select an item from the shop.\n2) Click a plot on the map to place it.\n3) Press Deliver Water to deliver resources and earn money.');
    });
  }
  logDebug('helpBtn handler attached');

  // If the user previously had screen2 open (persisted), show it directly
  if (state.placedItems && state.placedItems.length > 0) {
    // Show loading overlay while restoring
    showLoading('Restoring saved game...', 400).then(() => {
      // Start in screen2 so players return to their placed items quickly
      screen1.classList.add('hidden');
      screen2.classList.remove('hidden');
      renderShop();
      renderMap();
      updateInventory();
      updateHUD();
      hideLoading();
    });
  }
});
// Log a message to the console to ensure the script is linked correctly
console.log('JavaScript file is linked correctly.');
