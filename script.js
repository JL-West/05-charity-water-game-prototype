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
  const playerNameEl = document.getElementById('playerName');
  const playerAvatarEl = document.getElementById('playerAvatar');

  function logDebug(msg) {
    // debug helper removed — kept as a no-op to avoid runtime errors if calls remain
    // (originally showed a small on-page debug banner during development)
    // console.log('[DEBUG]', msg);
  }

  // Shop items (medieval-themed names; effects keep the same shape for the prototype)
  const shopItems = [
    { id: 'waterskin', name: 'Waterskin', cost: 10, effect: { water: 5 } },
    { id: 'handaxe', name: 'Hand Axe', cost: 40, effect: { water: 20 } },
    { id: 'rope', name: 'Rope', cost: 15, effect: { water: 0 } },
  ];

  // Map dimensions
  const MAP_COLS = 6;
  const MAP_ROWS = 4;
  const totalTiles = MAP_COLS * MAP_ROWS;

  // Simple loader implementation using the small overlay added to index.html
  // Inline indicator implementation (non-blocking)
  const inlineIndicator = document.getElementById('inlineIndicator');
  const inlineText = document.getElementById('inlineIndicatorText');
  const inlinePct = document.getElementById('inlineIndicatorPct');
  let _indicatorRaf = null;
  // Jerrycan SVG elements (decorative). We'll update the water rect attributes directly.
  const jerrySvg = document.getElementById('jerrySvg');
  const jerryWater = document.getElementById('jerryWater');
  const JERRY_TOTAL_H = 30; // matches SVG body height used in markup
  const JERRY_TOP_Y = 6; // top offset of the water area in the SVG
  let _jerryRaf = null;

  function setJerryPercent(pct) {
    if (!jerryWater) return;
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    const height = Math.round((clamped / 100) * JERRY_TOTAL_H);
    const y = JERRY_TOP_Y + (JERRY_TOTAL_H - height);
    try {
      jerryWater.setAttribute('height', String(height));
      jerryWater.setAttribute('y', String(y));
    } catch (e) {
      // ignore if attribute setting fails in some environment
    }
  }

  function animateJerryTo(targetPct, durationMs = 180) {
    if (!jerryWater) return;
    if (_jerryRaf) cancelAnimationFrame(_jerryRaf);
    const start = performance.now();
    const currentH = parseInt(jerryWater.getAttribute('height') || '0', 10);
    const initialPct = Math.round((currentH / JERRY_TOTAL_H) * 100);
    function step(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const pct = Math.round(initialPct + (targetPct - initialPct) * t);
      setJerryPercent(pct);
      if (t < 1) {
        _jerryRaf = requestAnimationFrame(step);
      }
    }
    _jerryRaf = requestAnimationFrame(step);
  }

  function showIndicator(message = 'Loading...', durationMs = 600, taskPromise = null) {
    if (!inlineIndicator) return Promise.resolve();
    inlineText.textContent = message;
    if (inlinePct) inlinePct.textContent = '0%';
    inlineIndicator.classList.remove('hidden');
    inlineIndicator.setAttribute('aria-hidden', 'false');

    // If provided a taskPromise, wait for it to settle; otherwise simulate progress
    if (taskPromise && typeof taskPromise.then === 'function') {
      // Optionally show indeterminate state; we'll keep percent at 0 until settled
      return taskPromise.finally(() => { hideIndicator(); });
    }

    return new Promise(resolve => {
      const start = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / durationMs);
          const pct = Math.round(t * 100);
          if (inlinePct) inlinePct.textContent = pct + '%';
          // Update decorative jerrycan to match percent
          try { animateJerryTo(pct, 120); } catch (e) { /* ignore */ }
          if (t < 1) {
            _indicatorRaf = requestAnimationFrame(step);
          } else {
            // ensure full fill briefly before hiding
            try { animateJerryTo(100, 120); } catch (e) {}
            setTimeout(() => { hideIndicator(); resolve(); }, 180);
          }
        }
        _indicatorRaf = requestAnimationFrame(step);
    });
  }

  function updateIndicator(pct) {
    if (!inlineIndicator || inlineIndicator.classList.contains('hidden')) return;
    if (!inlinePct) return;
    inlinePct.textContent = `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
  }

  function hideIndicator() {
    if (!inlineIndicator) return;
    inlineIndicator.classList.add('hidden');
    inlineIndicator.setAttribute('aria-hidden', 'true');
    if (inlinePct) inlinePct.textContent = '0%';
    if (_indicatorRaf) { cancelAnimationFrame(_indicatorRaf); _indicatorRaf = null; }
    // reset jerry water to empty
    try { setJerryPercent(0); } catch (e) {}
    if (_jerryRaf) { cancelAnimationFrame(_jerryRaf); _jerryRaf = null; }
  }

  // Keep the old loader API but wire to inline indicator (returns a Promise)
  function showLoading(message = 'Loading...', durationMs = 300, taskPromise = null) {
    return showIndicator(message, durationMs, taskPromise);
  }

  function hideLoading() {
    hideIndicator();
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
    if (playerNameEl) playerNameEl.textContent = state.playerName || 'Player 1';
    if (playerAvatarEl) playerAvatarEl.textContent = state.avatar || '';
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
      statusTextEl.textContent = `Delivered ${gained} supplies to the hamlet. Earned $${reward}.`;
      checkAchievements();
    });
  }

  // Achievements (simple examples)
  function checkAchievements() {
    if (state.waterDelivered >= 100 && !state.achievements.includes('100S')) {
      state.achievements.push('100S');
      alert('Achievement unlocked: 100 supplies delivered!');
    }
    saveState();
  }

  // Screen transitions
  startBtn.addEventListener('click', () => {
    // Show a brief non-blocking inline indicator while we initialize the mission
  showLoading('Starting quest...', 800).then(() => {
      // Basic start: show screen2 and initialize components
      screen1.classList.add('hidden');
      screen2.classList.remove('hidden');
      // Re-render UI elements
      renderShop();
      renderMap();
      updateInventory();
      updateHUD();
      // Ensure any loader overlays/indicators are hidden when starting
      try { hideLoading(); } catch (e) {}
  statusTextEl.textContent = 'Quest started. Select an item from the shop.';
    });
  });
  // startBtn handler attached

  // Character creator wiring
  const createCharBtn = document.getElementById('createCharBtn');
  const screen3 = document.getElementById('screen-3');
  const charNameInput = document.getElementById('charName');
  const avatarListEl = document.getElementById('avatarList');
  const saveCharBtn = document.getElementById('saveCharBtn');
  const cancelCharBtn = document.getElementById('cancelCharBtn');
  let selectedAvatar = null;

  if (createCharBtn) {
    createCharBtn.addEventListener('click', () => {
      // Use the same non-blocking inline indicator when opening the creator
      showLoading('Preparing character...', 600).then(() => {
        screen1.classList.add('hidden');
        screen3.classList.remove('hidden');
        // reset form
        if (charNameInput) charNameInput.value = state.playerName || '';
        if (avatarListEl) {
          avatarListEl.querySelectorAll('.avatar-option').forEach(btn => btn.classList.remove('selected'));
          selectedAvatar = state.avatar || null;
          if (selectedAvatar) {
            // find button by emoji textContent
            const sel = Array.from(avatarListEl.querySelectorAll('.avatar-option')).find(b => b.textContent.trim() === selectedAvatar);
            if (sel) sel.classList.add('selected');
          }
        }
      });
    });
  }

  if (avatarListEl) {
    avatarListEl.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.avatar-option');
      if (!btn) return;
      avatarListEl.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      // store the emoji itself as the avatar value (easier to display later)
      selectedAvatar = btn.textContent.trim();
    });
  }

  if (cancelCharBtn) {
    cancelCharBtn.addEventListener('click', () => {
      screen3.classList.add('hidden');
      screen1.classList.remove('hidden');
    });
  }

  if (saveCharBtn) {
    saveCharBtn.addEventListener('click', () => {
      const name = charNameInput ? charNameInput.value.trim() : '';
      if (!name) {
        alert('Please enter a name for your character.');
        return;
      }
      // Use the same non-blocking indicator while saving/creating
      showLoading('Creating character...', 800).then(() => {
        state.playerName = name;
        if (selectedAvatar) state.avatar = selectedAvatar;
        saveState();
        // Update player name in HUD if present
        if (playerNameEl) playerNameEl.textContent = state.playerName;
        if (playerAvatarEl) playerAvatarEl.textContent = state.avatar || '';
        // Move to game screen
        screen3.classList.add('hidden');
        screen2.classList.remove('hidden');
        renderShop();
        renderMap();
        updateInventory();
        updateHUD();
        statusTextEl.textContent = 'Welcome, ' + state.playerName + '! Select an item from the shop.';
      });
    });
  }

  loadBtn.addEventListener('click', () => {
  // loadBtn clicked
    // Show loading overlay and wait for the fill+finish to complete before hiding
  showLoading('Loading saved game...', 1000).then(() => {
  // showLoading resolved for loadBtn
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
  // loadBtn handler attached

  // Demo load removed per user request

  backBtn.addEventListener('click', () => {
    // Return to main screen
    screen2.classList.add('hidden');
    screen1.classList.remove('hidden');
    statusTextEl.textContent = 'Returned to the main menu.';
  });
  // backBtn handler attached

  // Help button exists in markup; attach listener if present
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      alert('Help:\n1) Select an item from the shop.\n2) Click a plot on the map to place it.\n3) Press Deliver Supplies to deliver resources and earn money.');
    });
  }
  // helpBtn handler attached

  // If the user previously had screen2 open (persisted), show it directly
  if (state.placedItems && state.placedItems.length > 0) {
    // Show loading overlay while restoring
  showLoading('Restoring saved game...', 1000).then(() => {
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
