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

  // Simple loader implementation using the small overlay added to index.html
  const simpleLoader = document.getElementById('simpleLoader');
  const simpleLoaderPercent = document.getElementById('simpleLoaderPercent');
  let _simpleTimeout = null;
  function showLoading(message = 'Loading...', durationMs = 300, taskPromise = null) {
    if (!simpleLoader) return Promise.resolve();
    simpleLoader.classList.remove('hidden');
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
    showLoading('Loading saved game...', 300).then(() => {
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

  // Demo load button: simulates a 1s network request to demonstrate waiting behavior
  const demoLoadBtn = document.getElementById('demoLoadBtn');
  if (demoLoadBtn) {
    demoLoadBtn.addEventListener('click', () => {
      // Simulated network task (1s)
      const fakeFetch = new Promise(res => setTimeout(res, 1000));
      showLoading('Demo loading...', 300, fakeFetch).then(() => {
        // After demo load, show the game screen
        screen1.classList.add('hidden');
        screen2.classList.remove('hidden');
        renderShop();
        renderMap();
        updateInventory();
        updateHUD();
        statusTextEl.textContent = 'Demo load complete.';
      });
    });
  }

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
