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
    { id: 'waterskin', name: "Waterskin (Leather)", cost: 8, effect: { water: 5 } },
    { id: 'handaxe', name: "Peasant's Handaxe", cost: 35, effect: { water: 18 } },
    { id: 'rope', name: 'Braided Rope', cost: 12, effect: { water: 0 } },
  ];

  // Map dimensions
  const MAP_COLS = 6;
  const MAP_ROWS = 4;
  const totalTiles = MAP_COLS * MAP_ROWS;

  // Tile pixel size used for the immersive world
  const TILE_W = 140;
  const TILE_H = 90;

  // World DOM pieces that will be created/managed by renderMap
  let worldInner = null;
  let playerEl = null;
  // camera state for smooth tweening
  let cameraX = 0;
  let cameraY = 0;
  // animation handles so we can cancel
  let _playerAnim = null;
  let _cameraAnim = null;

  // Simple rAF tween utility (returns a promise)
  function tween({ from, to, duration = 240, ease = t => (--t)*t*t+1, onUpdate }) {
    return new Promise(resolve => {
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const v = ease(t);
        const current = from + (to - from) * v;
        if (onUpdate) onUpdate(current);
        if (t < 1) {
          const id = requestAnimationFrame(frame);
          // store last id to allow cancellation if needed
          _playerAnim = id;
        } else {
          _playerAnim = null;
          resolve();
        }
      }
      frame(start);
    });
  }

  // Player position (grid index). Persisted in state.playerPosIndex
  if (typeof state.playerPosIndex === 'undefined' || state.playerPosIndex === null) {
    // default to center tile
    state.playerPosIndex = Math.floor(totalTiles / 2);
  }

  // Quest NPC: a single NPC tile index and availability flag
  if (typeof state.questNpcIndex === 'undefined' || state.questNpcIndex === null) {
    // place NPC near the top-left for accessibility
    state.questNpcIndex = 1;
  }
  if (typeof state.questAvailable === 'undefined' || state.questAvailable === null) {
    state.questAvailable = true;
  }

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

  // Reset game progress. If wipeCharacter is true, also remove saved name/avatar.
  // Respawn player to default and play a small respawn animation.
  function resetGame(wipeCharacter = false) {
    const keepName = (!wipeCharacter && state.playerName) ? state.playerName : null;
    const keepAvatar = (!wipeCharacter && state.avatar) ? state.avatar : null;
    // Reset fields to defaults
    state.funds = 100;
    state.waterDelivered = 0;
    state.selectedTool = null;
    state.placedItems = [];
    state.missionActive = false;
    state.missionTimeLeft = 0;
    state.achievements = [];
    // Reset quest state
    state.questAvailable = true;
    state.questAccepted = false;
    // Reset player pos to center
    state.playerPosIndex = Math.floor(totalTiles / 2);
    // restore character if requested to keep
    if (keepName) state.playerName = keepName; else delete state.playerName;
    if (keepAvatar) state.avatar = keepAvatar; else delete state.avatar;
    saveState();
    // Re-render UI
    renderShop();
    renderMap();
    updateInventory();
    updateHUD();
    // close any open dialogs
    try { hideNpcDialog(); } catch (e) {}
    if (statusTextEl) statusTextEl.textContent = 'Progress cleared. Player respawned.';
    // Play respawn animation on the player element if available
    try {
      if (playerEl) {
        playerEl.classList.remove('respawn');
        // trigger reflow then add
        // eslint-disable-next-line no-unused-expressions
        void playerEl.offsetWidth;
        playerEl.classList.add('respawn');
        // remove class after animation completes
        setTimeout(() => { if (playerEl) playerEl.classList.remove('respawn'); }, 700);
      }
    } catch (e) {
      // ignore animation errors
    }
  }

  function updateHUD() {
    fundsEl.textContent = state.funds;
    waterEl.textContent = state.waterDelivered;
    if (playerNameEl) playerNameEl.textContent = state.playerName || 'Player 1';
    if (playerAvatarEl) {
      playerAvatarEl.textContent = state.avatar || '';
      playerAvatarEl.classList.toggle('has-avatar', !!state.avatar);
    }
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
    // create the inner world container (big virtual map)
    mapGridEl.innerHTML = '';
    worldInner = document.createElement('div');
    worldInner.className = 'world-inner';
    // size the world according to tile counts
    worldInner.style.width = `${MAP_COLS * TILE_W}px`;
    worldInner.style.height = `${MAP_ROWS * TILE_H}px`;

    for (let i = 0; i < totalTiles; i++) {
      const x = i % MAP_COLS;
      const y = Math.floor(i / MAP_COLS);
      const tile = document.createElement('div');
      tile.className = 'map-tile';
      tile.dataset.x = String(x);
      tile.dataset.y = String(y);
      tile.dataset.index = i;
      tile.style.left = `${x * TILE_W + 12}px`;
      tile.style.top = `${y * TILE_H + 12}px`;
      tile.style.width = `${TILE_W - 24}px`;
      tile.style.height = `${TILE_H - 24}px`;
      tile.innerHTML = `<div class="tile-label">Plot ${i + 1}</div><div class="tile-item"></div>`;
      tile.addEventListener('click', () => onMapTileClick(i, tile));
      const placed = state.placedItems.find(p => p.index === i);
      if (placed) {
        tile.classList.add('placed');
        tile.querySelector('.tile-item').textContent = placed.item.name;
      }
      worldInner.appendChild(tile);
    }

    // add worldInner to the viewport
    mapGridEl.appendChild(worldInner);

    // create or update player element (use inline SVG sprite for a medieval look)
    if (!playerEl) {
      playerEl = document.createElement('div');
      playerEl.className = 'player-entity';
      playerEl.id = 'playerEntity';
      // simple medieval tunic SVG as a tiny sprite
      playerEl.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="none" fill-rule="evenodd">
            <path d="M6 8c0 3 6 6 6 6s6-3 6-6v-3l-3-2-3 1-3-1-3 2v3z" fill="#f97316"/>
            <circle cx="12" cy="4" r="2" fill="#fde68a"/>
            <path d="M8 14c0 1.5 4 3 4 3s4-1.5 4-3v4H8v-4z" fill="#fff" opacity="0.9"/>
          </g>
        </svg>`;
      worldInner.appendChild(playerEl);
    } else {
      if (!worldInner.contains(playerEl)) worldInner.appendChild(playerEl);
    }

    // Place the player at the saved index
    const px = state.playerPosIndex % MAP_COLS;
    const py = Math.floor(state.playerPosIndex / MAP_COLS);
  // position immediately on first render
  const startLeft = px * TILE_W + TILE_W / 2 - 23;
  const startTop = py * TILE_H + TILE_H / 2 - 23;
  playerEl.style.left = `${startLeft}px`;
  playerEl.style.top = `${startTop}px`;
  cameraX = 0; cameraY = 0;
    centerCameraOn(state.playerPosIndex, /*animate=*/false);
    // ensure background parallax starts in a neutral position
    try { updateParallax(cameraX, cameraY); } catch (e) {}

    // Render NPC entity
    renderNpc();
  }

  function renderNpc() {
    if (!worldInner) return;
    // remove previous npc if any
    let npc = worldInner.querySelector('.npc-entity');
    if (!npc) {
      npc = document.createElement('div');
      npc.className = 'npc-entity';
      npc.setAttribute('aria-hidden', 'true');
      const badge = document.createElement('div');
      badge.className = 'npc-indicator';
      npc.appendChild(badge);
      worldInner.appendChild(npc);
      // clicking the NPC opens the dialog
      npc.addEventListener('click', () => {
        if (state.questAvailable) showNpcDialog();
      });
    }
    const idx = state.questNpcIndex;
    const nx = idx % MAP_COLS;
    const ny = Math.floor(idx / MAP_COLS);
    npc.style.left = `${nx * TILE_W + TILE_W / 2 - 18}px`;
    npc.style.top = `${ny * TILE_H + TILE_H / 2 - 18}px`;
    // show or hide indicator
    const badge = npc.querySelector('.npc-indicator');
    if (state.questAvailable) {
      badge.textContent = '❗';
      npc.classList.remove('quest-complete');
      badge.title = 'Quest available';
    } else {
      badge.textContent = '✓';
      npc.classList.add('quest-complete');
      badge.title = 'Quest completed';
    }
  }

  // NPC dialog handlers
  const npcDialog = document.getElementById('npcDialog');
  const npcDialogText = document.getElementById('npcDialogText');
  const npcAcceptBtn = document.getElementById('npcAcceptBtn');
  const npcDeclineBtn = document.getElementById('npcDeclineBtn');
  const npcCloseBtn = document.getElementById('npcCloseBtn');
  // Reset confirmation dialog elements
  const confirmResetDialog = document.getElementById('confirmResetDialog');
  const wipeCharacterCheckbox = document.getElementById('wipeCharacterCheckbox');
  const resetCancelBtn = document.getElementById('resetCancelBtn');
  const resetConfirmBtn = document.getElementById('resetConfirmBtn');

  function showNpcDialog() {
    if (!npcDialog) return;
    npcDialog.classList.remove('hidden');
    npcDialog.setAttribute('aria-hidden', 'false');
    if (state.questAccepted) {
      npcDialogText.textContent = 'You have already accepted this quest. Return to the villager to hand it in.';
      npcAcceptBtn.textContent = 'Okay';
    } else {
      npcDialogText.textContent = 'A villager asks for aid. Accept the quest to receive a reward for returning supplies.';
      npcAcceptBtn.textContent = 'Accept Quest';
    }
  }

  function hideNpcDialog() {
    if (!npcDialog) return;
    npcDialog.classList.add('hidden');
    npcDialog.setAttribute('aria-hidden', 'true');
  }

  if (npcAcceptBtn) {
    npcAcceptBtn.addEventListener('click', () => {
      if (!state.questAccepted) {
        state.questAccepted = true;
        saveState();
        statusTextEl.textContent = 'Quest accepted: bring aid to the villager.';
      }
      hideNpcDialog();
    });
  }
  if (npcDeclineBtn) {
    npcDeclineBtn.addEventListener('click', () => {
      statusTextEl.textContent = 'You declined the villager. You can accept later.';
      hideNpcDialog();
    });
  }
  if (npcCloseBtn) {
    npcCloseBtn.addEventListener('click', () => hideNpcDialog());
  }

  // Show the confirm-reset modal and return a Promise resolving to {confirmed, wipe}
  function showConfirmReset() {
    return new Promise(resolve => {
      if (!confirmResetDialog) return resolve({ confirmed: false, wipe: false });
      // reset checkbox
      if (wipeCharacterCheckbox) wipeCharacterCheckbox.checked = false;
      confirmResetDialog.classList.remove('hidden');
      confirmResetDialog.setAttribute('aria-hidden', 'false');

      function cleanup() {
        confirmResetDialog.classList.add('hidden');
        confirmResetDialog.setAttribute('aria-hidden', 'true');
        resetConfirmBtn && resetConfirmBtn.removeEventListener('click', onConfirm);
        resetCancelBtn && resetCancelBtn.removeEventListener('click', onCancel);
      }

      function onConfirm() {
        const wipe = !!(wipeCharacterCheckbox && wipeCharacterCheckbox.checked);
        cleanup();
        resolve({ confirmed: true, wipe });
      }
      function onCancel() {
        cleanup();
        resolve({ confirmed: false, wipe: false });
      }

      resetConfirmBtn && resetConfirmBtn.addEventListener('click', onConfirm);
      resetCancelBtn && resetCancelBtn.addEventListener('click', onCancel);
    });
  }

  function centerCameraOn(index) {
    if (!worldInner || !mapGridEl) return;
    const viewW = mapGridEl.clientWidth;
    const viewH = mapGridEl.clientHeight;
    const px = index % MAP_COLS;
    const py = Math.floor(index / MAP_ROWS);
    const playerCenterX = px * TILE_W + TILE_W / 2;
    const playerCenterY = py * TILE_H + TILE_H / 2;
    const tx = Math.max(0, Math.min(playerCenterX - viewW / 2, worldInner.clientWidth - viewW));
    const ty = Math.max(0, Math.min(playerCenterY - viewH / 2, worldInner.clientHeight - viewH));
    // animate camera using rAF for smooth movement
    animateCameraTo(tx, ty);
  }

  // Subtle parallax: adjust map background-position based on camera position
  function updateParallax(cx, cy) {
    if (!mapGridEl || !worldInner) return;
    const maxPanX = Math.max(1, worldInner.clientWidth - mapGridEl.clientWidth);
    const maxPanY = Math.max(1, worldInner.clientHeight - mapGridEl.clientHeight);
    const parallaxX = 6; // percent max horizontal shift
    const parallaxY = 3; // percent max vertical shift
    const px = (cx / maxPanX) * parallaxX;
    const py = (cy / maxPanY) * parallaxY;
    const bgX = 50 - px; // center (50%) +/- small percent
    const bgY = 50 - py;
    mapGridEl.style.backgroundPosition = `${bgX}% ${bgY}%`;
  }

  function animateCameraTo(targetX, targetY, duration = 320) {
    if (!_cameraAnim && typeof worldInner.style.transform === 'string') {
      // parse current translate
      const m = worldInner.style.transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
      if (m) {
        cameraX = -parseFloat(m[1]);
        cameraY = -parseFloat(m[2]);
      } else {
        cameraX = cameraX || 0;
        cameraY = cameraY || 0;
      }
    }
    if (_cameraAnim) cancelAnimationFrame(_cameraAnim);
    const startX = cameraX;
    const startY = cameraY;
    const start = performance.now();
    return new Promise(resolve => {
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const easeT = (--t) * t * t + 1; // easeOut
        const curX = startX + (targetX - startX) * easeT;
        const curY = startY + (targetY - startY) * easeT;
        cameraX = curX; cameraY = curY;
        worldInner.style.transform = `translate(${-curX}px, ${-curY}px)`;
        // update parallax background to move subtly with camera
        try { updateParallax(cameraX, cameraY); } catch (e) { /* ignore in older browsers */ }
        if (t < 1) {
          _cameraAnim = requestAnimationFrame(step);
        } else {
          _cameraAnim = null;
          resolve();
        }
      }
      _cameraAnim = requestAnimationFrame(step);
    });
  }

  // Move player by grid delta (dx, dy)
  function movePlayer(dx, dy) {
    const idx = state.playerPosIndex;
    const x = idx % MAP_COLS;
    const y = Math.floor(idx / MAP_COLS);
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) return; // out of bounds
    const newIndex = ny * MAP_COLS + nx;
    // If target tile has a placed item, interact instead of moving
    const occupied = state.placedItems.find(p => p.index === newIndex);
    if (occupied) {
      interactWithTile(newIndex);
      return;
    }
    // update state immediately so other logic can read it
    state.playerPosIndex = newIndex;
    saveState();
    // compute target positions
    const left = nx * TILE_W + TILE_W / 2 - 23;
    const top = ny * TILE_H + TILE_H / 2 - 23;
    // cancel any ongoing player animation
    if (_playerAnim) cancelAnimationFrame(_playerAnim);
    // tween the player's left/top with two parallel tweens
    const p1 = tween({ from: parseFloat(playerEl.style.left || 0), to: left, duration: 220, onUpdate: v => playerEl.style.left = v + 'px' });
    const p2 = tween({ from: parseFloat(playerEl.style.top || 0), to: top, duration: 220, onUpdate: v => playerEl.style.top = v + 'px' });
    // stepping visual
    playerEl.classList.add('stepping');
    Promise.all([p1, p2]).then(() => {
      playerEl.classList.remove('stepping');
      // center camera after movement completes
      centerCameraOn(newIndex);
      // if player moved onto NPC, auto-open dialog when quest available and not yet accepted
      if (state.playerPosIndex === state.questNpcIndex && state.questAvailable && !state.questAccepted) {
        showNpcDialog();
      }
    });
  }

  function interactWithTile(index) {
    const placed = state.placedItems.find(p => p.index === index);
    if (!placed) return;
    // brief interaction: show message and highlight the tile
    const tile = worldInner.querySelector(`.map-tile[data-index="${index}"]`);
    statusTextEl.textContent = `This plot has ${placed.item.name}. You can't walk onto it. Use it or remove it.`;
    if (tile) {
      tile.style.transition = 'box-shadow 180ms ease';
      const old = tile.style.boxShadow;
      tile.style.boxShadow = '0 0 0 4px rgba(244,180,0,0.18)';
      setTimeout(() => { if (tile) tile.style.boxShadow = old; }, 420);
    }
  }

  // Keyboard handlers for movement (arrow keys + WASD)
  document.addEventListener('keydown', (e) => {
    // only accept movement when game screen is visible
    if (screen2.classList.contains('hidden')) return;
    const key = e.key;
    let moved = false;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') { movePlayer(-1, 0); moved = true; }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') { movePlayer(1, 0); moved = true; }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') { movePlayer(0, -1); moved = true; }
    if (key === 'ArrowDown' || key === 's' || key === 'S') { movePlayer(0, 1); moved = true; }
    if (moved) e.preventDefault();
  });

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
      // If player is at NPC
      if (state.playerPosIndex === state.questNpcIndex) {
        // If quest available but not accepted, open dialog
        if (state.questAvailable && !state.questAccepted) {
          showNpcDialog();
          return;
        }
        // If quest accepted and available, complete it
        if (state.questAvailable && state.questAccepted) {
          const questWater = 20;
          const questGold = 50;
          state.waterDelivered += questWater;
          state.funds += questGold;
          state.questAvailable = false;
          state.questAccepted = false;
          updateHUD();
          saveState();
          renderNpc();
          statusTextEl.textContent = `Quest complete! You delivered ${questWater} aid and earned ${questGold} gold.`;
          checkAchievements();
          return;
        }
      }

      // Otherwise perform a normal delivery from placed items
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
      statusTextEl.textContent = `Delivered ${gained} supplies to the hamlet. Earned ${reward} gold.`;
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
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      // Ask for confirmation before resetting progress
      showConfirmReset().then(({ confirmed, wipe }) => {
        if (!confirmed) return;
        showLoading('Restarting...', 700).then(() => {
          resetGame(!!wipe);
          screen1.classList.add('hidden');
          screen2.classList.remove('hidden');
          try { hideLoading(); } catch (e) {}
          statusTextEl.textContent = 'Quest restarted. Player respawned.';
        });
      });
    });
  }
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

  // Restart button in the mission panel should also reset progress and respawn
  const startMissionBtn = document.getElementById('startMission');
  if (startMissionBtn) {
    startMissionBtn.addEventListener('click', () => {
      showConfirmReset().then(({ confirmed, wipe }) => {
        if (!confirmed) return;
        showLoading('Restarting...', 600).then(() => {
          resetGame(!!wipe);
          // ensure we are showing the game screen
          screen1.classList.add('hidden');
          screen2.classList.remove('hidden');
          try { hideLoading(); } catch (e) {}
          statusTextEl.textContent = 'Quest restarted. Player respawned.';
        });
      });
    });
  }

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
