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

  // --- Functions
  const loadingOverlay = document.getElementById('loadingOverlay');
  // jerrycan fill animation controls
  const jerryWaterEl = loadingOverlay ? loadingOverlay.querySelector('.jerrycan .water') : null;
  const jerryCanEl = loadingOverlay ? loadingOverlay.querySelector('.jerrycan') : null;
  const loaderPercentEl = loadingOverlay ? document.getElementById('loaderPercent') : null;
  let _fillAnim = null;
  function animateFill(durationMs) {
    if (!jerryWaterEl) return;
    // Clear any previous transition and timeouts
    jerryWaterEl.style.transition = 'none';
    jerryWaterEl.style.transform = 'scaleY(0)';
    if (animateFill._timeout) {
      clearTimeout(animateFill._timeout);
      animateFill._timeout = null;
    }

    // Force a reflow
    void jerryWaterEl.getBoundingClientRect();

    // Apply transition and scale to 1 (100% fill)
    jerryWaterEl.style.transition = `transform ${durationMs}ms linear`;
    jerryWaterEl.style.transform = 'scaleY(1)';

    animateFill._timeout = setTimeout(() => {
      if (jerryCanEl) {
        jerryCanEl.classList.remove('finish');
        void jerryCanEl.getBoundingClientRect();
        jerryCanEl.classList.add('finish');
      }
      if (typeof animateFill._onComplete === 'function') animateFill._onComplete();
    }, durationMs);
  }

  // showLoading now returns a Promise that resolves when the fill and splash complete
  function showLoading(message = 'Loading...', durationMs = 400, taskPromise = null) {
    // Returns a Promise that resolves when animation + optional task complete.
    if (!loadingOverlay) return Promise.resolve();
    loadingOverlay.querySelector('.loader-text').textContent = message;
    loadingOverlay.classList.remove('hidden');

    // Install ESC handler so user can dismiss if necessary
    function onKey(e) {
      if (e.key === 'Escape') {
        hideLoading();
      }
    }
    document.addEventListener('keydown', onKey);

    return new Promise(resolve => {
      if (!jerryWaterEl) {
        // still wait for taskPromise if provided
        if (taskPromise) {
          taskPromise.finally(() => {
            document.removeEventListener('keydown', onKey);
            resolve();
          });
        } else {
          document.removeEventListener('keydown', onKey);
          resolve();
        }
        return;
      }

      // progress updater using requestAnimationFrame
      let rafId = null;
      const startTime = performance.now();
      function updatePercent(now) {
        const elapsed = now - startTime;
        const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
        if (loaderPercentEl) loaderPercentEl.textContent = pct + '%';
        if (pct < 100) rafId = requestAnimationFrame(updatePercent);
      }

      // animation completion promise
      let animResolve;
      const animPromise = new Promise(res => { animResolve = res; });
      animateFill._onComplete = () => {
        // let the splash play, then resolve animPromise
        setTimeout(() => {
          if (jerryCanEl) jerryCanEl.classList.remove('finish');
          if (loaderPercentEl) loaderPercentEl.textContent = '100%';
          animResolve();
        }, 300); // shorter wait so splash is visible
      };

      // Start percent RAF and animateFill
      rafId = requestAnimationFrame(updatePercent);
      setTimeout(() => animateFill(durationMs), 20);

      // Safety timeout in case something hangs (duration + extra)
      const safety = setTimeout(() => {
        console.warn('Loading safety timeout fired');
        if (rafId) cancelAnimationFrame(rafId);
        if (animateFill._timeout) { clearTimeout(animateFill._timeout); animateFill._timeout = null; }
        if (jerryCanEl) jerryCanEl.classList.remove('finish');
        if (loaderPercentEl) loaderPercentEl.textContent = '100%';
        animResolve();
      }, durationMs + 3000);

      // Wait for both animation and optional task to finish
      const waitFor = taskPromise ? Promise.all([animPromise, taskPromise]) : animPromise;
      waitFor.finally(() => {
        clearTimeout(safety);
        if (rafId) cancelAnimationFrame(rafId);
        document.removeEventListener('keydown', onKey);
        // small delay to let splash finish visually
        setTimeout(() => {
          resolve();
        }, 500);
      });
    });
  }

  function hideLoading() {
    if (!loadingOverlay) return;
    // quickly empty the jerrycan for next time
    if (jerryWaterEl) {
      jerryWaterEl.style.transition = 'transform 200ms linear';
      jerryWaterEl.style.transform = 'scaleY(0)';
    }
    loadingOverlay.classList.add('hidden');
    if (animateFill._timeout) {
      clearTimeout(animateFill._timeout);
      animateFill._timeout = null;
    }
    if (loaderPercentEl) loaderPercentEl.textContent = '0%';
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

  loadBtn.addEventListener('click', () => {
    // Show loading overlay and wait for the fill+finish to complete before hiding
    showLoading('Loading saved game...', 400).then(() => {
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

  backBtn.addEventListener('click', () => {
    // Return to main screen
    screen2.classList.add('hidden');
    screen1.classList.remove('hidden');
    statusTextEl.textContent = 'Returned to the main menu.';
  });

  // Help button exists in markup; attach listener if present
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      alert('Help:\n1) Select an item from the shop.\n2) Click a plot on the map to place it.\n3) Press Deliver Water to deliver resources and earn money.');
    });
  }

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
