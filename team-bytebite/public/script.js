/**
 * Problem 10: Smart Canteen Hub with Live Kitchen KDS, Dietary Tags & Ready Alert
 * Team: ByteBite
 */

// Application State
const state = {
  menu: [],
  cart: new Map(), // menuId -> { item, qty }
  filters: {
    dietaryType: 'all',
    maxSpice: 'all',
    category: 'all'
  },
  activeOrderId: null,
  activeOrderToken: null,
  activeOrderStatus: null,
  activeOrderPrepTime: 0,
  activeOrderStartTime: null,
  trackerInterval: null,
  countdownInterval: null,
  kdsInterval: null,
  currentTab: 'customer'
};

// Web Audio API Context
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Play Cheerful Two-Tone Alert Chime (523.25Hz -> 659.25Hz)
function playReadyAlertChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // First Tone: C5 (523.25Hz)
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);

    // Second Tone: E5 (659.25Hz)
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.16);

    // Envelope
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.setValueAtTime(0.3, now + 0.35);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.16);

    osc2.start(now + 0.16);
    osc2.stop(now + 0.9);
  } catch (err) {
    console.warn('Web Audio chime could not play:', err);
  }
}

// Trigger HTML5 Device Vibration
function triggerDeviceVibration() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    // Distinct ready pattern: 300ms buzz, 150ms pause, 300ms buzz, 150ms pause, 500ms long buzz
    navigator.vibrate([300, 150, 300, 150, 500]);
  }
}

// Test Chime button in header
function testChimeSound() {
  playReadyAlertChime();
  triggerDeviceVibration();
  showReadyAlertBanner('T-DEMO', 'Sound chime and vibration alert test successful!');
}

// Show Ready Alert Banner
function showReadyAlertBanner(tokenNumber, message) {
  const banner = document.getElementById('readyAlertBanner');
  const title = document.getElementById('readyAlertTitle');
  const msg = document.getElementById('readyAlertMsg');

  title.textContent = `🔔 YOUR FOOD IS READY!`;
  msg.textContent = message || `Token #${tokenNumber} is freshly prepared and waiting at the counter!`;
  banner.classList.remove('hidden');

  // Auto-scroll to top so customer notices immediately
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function dismissReadyBanner() {
  document.getElementById('readyAlertBanner').classList.add('hidden');
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================
function switchTab(tabName) {
  state.currentTab = tabName;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));

  if (tabName === 'customer') {
    document.getElementById('tabCustomerBtn').classList.add('active');
    document.getElementById('customerView').classList.add('active');
    fetchMenu();
  } else if (tabName === 'kds') {
    document.getElementById('tabKdsBtn').classList.add('active');
    document.getElementById('kdsView').classList.add('active');
    fetchKdsData(true);
  } else if (tabName === 'admin') {
    document.getElementById('tabAdminBtn').classList.add('active');
    document.getElementById('adminView').classList.add('active');
    renderAdminInventoryTable();
  }
}

// ============================================================================
// MENU & FILTER LOGIC
// ============================================================================
function setDietFilter(diet) {
  state.filters.dietaryType = diet;
  document.querySelectorAll('.btn-group .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diet === diet);
  });
  fetchMenu();
}

function setSpiceFilter(spice) {
  state.filters.maxSpice = spice;
  fetchMenu();
}

function setCategoryFilter(category) {
  state.filters.category = category;
  fetchMenu();
}

async function fetchMenu() {
  const spinner = document.getElementById('menuLoadingSpinner');
  const menuGrid = document.getElementById('menuGrid');

  try {
    spinner.classList.remove('hidden');

    const params = new URLSearchParams();
    if (state.filters.dietaryType !== 'all') {
      params.append('dietaryType', state.filters.dietaryType);
    }
    if (state.filters.maxSpice !== 'all') {
      params.append('maxSpice', state.filters.maxSpice);
    }
    if (state.filters.category !== 'all') {
      params.append('category', state.filters.category);
    }

    const res = await fetch(`/menu?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const items = await res.json();
    state.menu = items;

    renderMenuGrid(items);
    if (state.currentTab === 'admin') {
      renderAdminInventoryTable();
    }
  } catch (err) {
    console.error('Failed to load menu:', err);
    menuGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #ef4444;">
        ⚠️ Failed to load menu. Please make sure the server and MongoDB are running.
      </div>
    `;
  } finally {
    spinner.classList.add('hidden');
  }
}

function renderDietaryBadge(dietaryType) {
  if (dietaryType === 'veg') {
    return `<span class="dietary-badge veg">🥦 Veg</span>`;
  } else if (dietaryType === 'egg') {
    return `<span class="dietary-badge egg">🥚 Egg</span>`;
  } else {
    return `<span class="dietary-badge non-veg">🥩 Non-Veg</span>`;
  }
}

function renderSpiceEmojis(spiceLevel) {
  const level = Math.max(1, Math.min(5, spiceLevel || 1));
  return '🌶️'.repeat(level);
}

function renderMenuGrid(items) {
  const grid = document.getElementById('menuGrid');

  if (!items || items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <p style="font-size: 2.5rem; margin-bottom: 0.5rem;">🍽️</p>
        <h3>No menu items match your current filter.</h3>
        <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 0.25rem;">Try choosing a different dietary type or spice level.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => {
    const isOutOfStock = item.availableUnits <= 0;
    const isLowStock = item.availableUnits > 0 && item.availableUnits <= 5;

    let stockBadgeClass = 'in-stock';
    let stockBadgeText = `${item.availableUnits} units left`;
    if (isOutOfStock) {
      stockBadgeClass = 'out-of-stock';
      stockBadgeText = 'Out of Stock';
    } else if (isLowStock) {
      stockBadgeClass = 'low-stock';
      stockBadgeText = `Only ${item.availableUnits} left!`;
    }

    const inCartQty = state.cart.has(item._id) ? state.cart.get(item._id).qty : 0;

    return `
      <div class="food-card" id="card-${item._id}">
        ${renderDietaryBadge(item.dietaryType)}

        <div class="food-card-top">
          <span class="category-tag">${escapeHtml(item.category || 'General')}</span>
          <h3 class="food-title">${escapeHtml(item.name)}</h3>
          <div class="food-price">₹${item.amount}</div>
        </div>

        <div class="food-card-body">
          <div class="food-meta-row">
            <span class="meta-pill" title="Preparation time">⏱ ${item.prepTime} mins</span>
            <span class="meta-pill spice-meter" title="Spice level: ${item.spiceLevel}/5">${renderSpiceEmojis(item.spiceLevel)}</span>
            <span class="stock-pill ${stockBadgeClass}">${stockBadgeText}</span>
          </div>

          <button 
            class="btn-primary w-full"
            onclick="addToCart('${item._id}')"
            ${isOutOfStock ? 'disabled' : ''}
          >
            ${isOutOfStock ? 'Sold Out' : (inCartQty > 0 ? `Add More (${inCartQty} in cart)` : 'Add to Cart +')}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// CART MANAGEMENT
// ============================================================================
function toggleCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartBackdrop');
  const isOpen = drawer.classList.contains('open');

  if (isOpen) {
    drawer.classList.remove('open');
    backdrop.classList.add('hidden');
  } else {
    drawer.classList.add('open');
    backdrop.classList.remove('hidden');
    renderCart();
  }
}

function addToCart(menuId) {
  const item = state.menu.find(m => m._id === menuId);
  if (!item || item.availableUnits <= 0) return;

  const currentCartEntry = state.cart.get(menuId);
  const currentQty = currentCartEntry ? currentCartEntry.qty : 0;

  if (currentQty + 1 > item.availableUnits) {
    alert(`Cannot add more. Only ${item.availableUnits} units available in stock.`);
    return;
  }

  state.cart.set(menuId, {
    item,
    qty: currentQty + 1
  });

  updateCartBadge();
  renderMenuGrid(state.menu); // refresh card buttons
}

function updateCartItemQty(menuId, delta) {
  const entry = state.cart.get(menuId);
  if (!entry) return;

  const newQty = entry.qty + delta;
  if (newQty <= 0) {
    state.cart.delete(menuId);
  } else {
    if (newQty > entry.item.availableUnits) {
      alert(`Only ${entry.item.availableUnits} units available.`);
      return;
    }
    entry.qty = newQty;
  }

  updateCartBadge();
  renderCart();
  renderMenuGrid(state.menu);
}

function updateCartBadge() {
  let totalQty = 0;
  for (const entry of state.cart.values()) {
    totalQty += entry.qty;
  }
  document.getElementById('cartCount').textContent = totalQty;
}

function renderCart() {
  const container = document.getElementById('cartItemsList');
  const summaryQty = document.getElementById('cartSummaryQty');
  const summaryAmount = document.getElementById('cartSummaryAmount');
  const placeOrderBtn = document.getElementById('placeOrderBtn');
  const errorBox = document.getElementById('orderErrorBox');

  errorBox.classList.add('hidden');

  if (state.cart.size === 0) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <span class="empty-icon">🍽️</span>
        <p>Your cart is empty.</p>
        <span class="hint">Select delicious meals from the menu to place an order.</span>
      </div>
    `;
    summaryQty.textContent = '0';
    summaryAmount.textContent = '₹0';
    placeOrderBtn.disabled = true;
    return;
  }

  placeOrderBtn.disabled = false;

  let totalQty = 0;
  let totalEstimated = 0;
  const rows = [];

  for (const [menuId, { item, qty }] of state.cart.entries()) {
    totalQty += qty;
    totalEstimated += qty * item.amount;

    rows.push(`
      <div class="cart-item-row">
        <div class="cart-item-info">
          <h4>${escapeHtml(item.name)}</h4>
          <span class="cart-item-price">₹${item.amount} each</span>
        </div>
        <div class="cart-qty-controls">
          <button class="qty-btn" onclick="updateCartItemQty('${menuId}', -1)">−</button>
          <span style="font-weight: 700; min-width: 20px; text-align: center;">${qty}</span>
          <button class="qty-btn" onclick="updateCartItemQty('${menuId}', 1)">+</button>
        </div>
      </div>
    `);
  }

  container.innerHTML = rows.join('');
  summaryQty.textContent = totalQty;
  summaryAmount.textContent = `₹${totalEstimated}`;
}

// ============================================================================
// ORDER PLACEMENT
// ============================================================================
async function submitOrder() {
  const nameInput = document.getElementById('custNameInput');
  const usnInput = document.getElementById('custUsnInput');
  const errorBox = document.getElementById('orderErrorBox');
  const placeBtn = document.getElementById('placeOrderBtn');

  errorBox.classList.add('hidden');
  errorBox.textContent = '';

  const customerName = nameInput.value.trim();
  const usn = usnInput.value.trim().toUpperCase();

  if (!customerName) {
    errorBox.textContent = 'Please enter your name.';
    errorBox.classList.remove('hidden');
    nameInput.focus();
    return;
  }

  if (!usn) {
    errorBox.textContent = 'Please enter your college USN.';
    errorBox.classList.remove('hidden');
    usnInput.focus();
    return;
  }

  if (state.cart.size === 0) {
    errorBox.textContent = 'Your cart is empty.';
    errorBox.classList.remove('hidden');
    return;
  }

  const items = [];
  for (const [menuId, { qty }] of state.cart.entries()) {
    items.push({ menuId, qty });
  }

  try {
    placeBtn.disabled = true;
    placeBtn.textContent = 'Processing Order...';

    // Sound context unlock on user click
    getAudioContext();

    const res = await fetch('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName, usn, items })
    });

    const data = await res.json();

    if (!res.ok) {
      // 409 Conflict (Stock issues) or 400 Bad Request
      errorBox.textContent = data.error || 'Failed to place order.';
      errorBox.classList.remove('hidden');
      await fetchMenu(); // update stock visuals
      return;
    }

    // Success! Clear cart
    state.cart.clear();
    updateCartBadge();
    toggleCartDrawer();

    // Show Receipt Modal
    showReceiptModal(data);

    // Refresh menu and KDS
    await fetchMenu();
    if (state.currentTab === 'kds') {
      fetchKdsData(false);
    }
  } catch (err) {
    console.error('Error placing order:', err);
    errorBox.textContent = 'Network or server error while placing order.';
    errorBox.classList.remove('hidden');
  } finally {
    placeBtn.disabled = false;
    placeBtn.textContent = 'Place Order & Get Token';
  }
}

function showReceiptModal(order) {
  document.getElementById('receiptToken').textContent = order.tokenNumber;
  document.getElementById('receiptCustomer').textContent = order.customerName;
  document.getElementById('receiptUsn').textContent = order.usn;
  document.getElementById('receiptPrepTime').textContent = `${order.estimatedPrepTime} mins`;
  document.getElementById('receiptTotal').textContent = `₹${order.totalAmount}`;

  const container = document.getElementById('receiptItemsContainer');
  container.innerHTML = order.items.map(item => `
    <div class="receipt-item-row">
      <span>${item.qty}x ${escapeHtml(item.name)}</span>
      <strong>₹${item.amount * item.qty}</strong>
    </div>
  `).join('');

  document.getElementById('receiptModal').classList.remove('hidden');

  // Initialize live tracker with this order
  startOrderTracking(order);
}

function closeReceiptAndTrack() {
  document.getElementById('receiptModal').classList.add('hidden');
  // Scroll to tracker
  const trackerSection = document.getElementById('orderTrackerSection');
  trackerSection.scrollIntoView({ behavior: 'smooth' });
}

// ============================================================================
// LIVE ORDER TRACKER & READY ALERT FEATURE
// ============================================================================
function startOrderTracking(order) {
  state.activeOrderId = order._id;
  state.activeOrderToken = order.tokenNumber;
  state.activeOrderStatus = order.status;
  state.activeOrderPrepTime = order.estimatedPrepTime;
  state.activeOrderStartTime = Date.now();

  const tracker = document.getElementById('orderTrackerSection');
  tracker.classList.remove('hidden');

  document.getElementById('trackerTokenDisplay').textContent = `Token #${order.tokenNumber}`;
  document.getElementById('trackerMetaDisplay').textContent = `Ordered by ${order.customerName} (${order.usn})`;

  updateTrackerStepUI(order.status);
  startTrackerCountdown(order.estimatedPrepTime);

  // Poll /orders/:id every 4 seconds
  if (state.trackerInterval) clearInterval(state.trackerInterval);
  state.trackerInterval = setInterval(() => pollActiveOrder(), 4000);
}

async function pollActiveOrder() {
  if (!state.activeOrderId) return;

  try {
    const res = await fetch(`/orders/${state.activeOrderId}`);
    if (!res.ok) return;
    const order = await res.json();

    const previousStatus = state.activeOrderStatus;
    state.activeOrderStatus = order.status;

    updateTrackerStepUI(order.status);

    // CRITICAL: When transitioning to "ready", trigger Vibration & Web Audio chime!
    if (order.status === 'ready' && previousStatus !== 'ready') {
      triggerDeviceVibration();
      playReadyAlertChime();
      showReadyAlertBanner(order.tokenNumber, `Token #${order.tokenNumber} is ready at the pickup counter!`);
    }

    if (order.status === 'collected') {
      if (state.trackerInterval) clearInterval(state.trackerInterval);
      if (state.countdownInterval) clearInterval(state.countdownInterval);
      document.getElementById('trackerCountdownDisplay').textContent = 'Completed';
    }
  } catch (err) {
    console.error('Error polling active order:', err);
  }
}

function updateTrackerStepUI(status) {
  const steps = ['placed', 'preparing', 'ready', 'collected'];
  const currentIndex = steps.indexOf(status);

  const fill = document.getElementById('progressLineFill');
  const fillWidths = ['15%', '48%', '82%', '100%'];
  fill.style.width = fillWidths[currentIndex] || '15%';

  const stepElements = [
    document.getElementById('stepPlaced'),
    document.getElementById('stepPreparing'),
    document.getElementById('stepReady'),
    document.getElementById('stepCollected')
  ];

  stepElements.forEach((el, index) => {
    el.classList.remove('active', 'completed');
    if (index < currentIndex) {
      el.classList.add('completed');
    } else if (index === currentIndex) {
      el.classList.add('active');
    }
  });

  const note = document.getElementById('trackerStatusNote');
  if (status === 'placed') {
    note.innerHTML = `Status: <strong>Order Placed</strong>. Your ticket is in the kitchen queue.`;
  } else if (status === 'preparing') {
    note.innerHTML = `Status: <strong>Kitchen Preparing</strong>. Chefs are cooking your order right now! 🔥`;
  } else if (status === 'ready') {
    note.innerHTML = `Status: <strong>Ready for Pickup!</strong> Please collect your order from the canteen counter.`;
  } else if (status === 'collected') {
    note.innerHTML = `Status: <strong>Collected</strong>. Hope you enjoyed your meal! 🎉`;
  }
}

function startTrackerCountdown(prepMinutes) {
  if (state.countdownInterval) clearInterval(state.countdownInterval);

  let remainingSeconds = Math.max(0, prepMinutes * 60);
  const display = document.getElementById('trackerCountdownDisplay');

  function tick() {
    if (state.activeOrderStatus === 'ready') {
      display.textContent = 'READY! 🎉';
      return;
    }
    if (state.activeOrderStatus === 'collected') {
      display.textContent = 'Collected';
      return;
    }

    if (remainingSeconds <= 0) {
      display.textContent = 'Any moment now...';
      return;
    }

    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    display.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    remainingSeconds--;
  }

  tick();
  state.countdownInterval = setInterval(tick, 1000);
}

function resetActiveTracker() {
  if (state.trackerInterval) clearInterval(state.trackerInterval);
  if (state.countdownInterval) clearInterval(state.countdownInterval);
  state.activeOrderId = null;
  state.activeOrderStatus = null;
  document.getElementById('orderTrackerSection').classList.add('hidden');
}

// ============================================================================
// KITCHEN DISPLAY SYSTEM (KDS)
// ============================================================================
async function fetchKdsData(showIndicators = false) {
  try {
    const [ordersRes, statsRes] = await Promise.all([
      fetch('/orders'),
      fetch('/orders/stats')
    ]);

    if (ordersRes.ok) {
      const orders = await ordersRes.json();
      renderKanbanBoard(orders);
    }

    if (statsRes.ok) {
      const stats = await statsRes.json();
      renderKdsMetrics(stats);
    }
  } catch (err) {
    console.error('Error fetching KDS data:', err);
  }
}

function renderKdsMetrics(stats) {
  document.getElementById('statRevenue').textContent = `₹${stats.totalRevenue || 0}`;
  document.getElementById('statTotalOrders').textContent = stats.totalOrders || 0;
  document.getElementById('statActiveCount').textContent = stats.activeOrdersCount || 0;
  document.getElementById('statTopSelling').textContent = stats.topSellingItem || 'None yet';
  document.getElementById('kdsBadgeCount').textContent = stats.activeOrdersCount || 0;
}

function formatElapsedTime(createdAt) {
  const diffSec = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  return `${diffHrs}h ago`;
}

function renderKanbanBoard(orders) {
  const placedCol = document.getElementById('colPlacedList');
  const preparingCol = document.getElementById('colPreparingList');
  const readyCol = document.getElementById('colReadyList');

  const placedOrders = orders.filter(o => o.status === 'placed');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready');

  document.getElementById('placedCountBadge').textContent = placedOrders.length;
  document.getElementById('preparingCountBadge').textContent = preparingOrders.length;
  document.getElementById('readyCountBadge').textContent = readyOrders.length;

  placedCol.innerHTML = renderKanbanTickets(placedOrders, 'placed');
  preparingCol.innerHTML = renderKanbanTickets(preparingOrders, 'preparing');
  readyCol.innerHTML = renderKanbanTickets(readyOrders, 'ready');
}

function renderKanbanTickets(orders, columnType) {
  if (orders.length === 0) {
    return `<div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-dim); font-size: 0.85rem;">No tickets in this column</div>`;
  }

  return orders.map(order => {
    let actionBtn = '';
    if (columnType === 'placed') {
      actionBtn = `
        <button class="btn-ticket-action prepare" onclick="advanceOrderStatus('${order._id}', 'preparing')">
          🔥 Start Preparing
        </button>
      `;
    } else if (columnType === 'preparing') {
      actionBtn = `
        <button class="btn-ticket-action ready" onclick="advanceOrderStatus('${order._id}', 'ready')">
          🔔 Mark Ready
        </button>
      `;
    } else if (columnType === 'ready') {
      actionBtn = `
        <button class="btn-ticket-action collected" onclick="advanceOrderStatus('${order._id}', 'collected')">
          ✓ Mark Collected
        </button>
      `;
    }

    const itemsHtml = order.items.map(it => `
      <div class="ticket-item-row">
        <div class="item-name-tag">
          ${renderDietaryBadge(it.dietaryType)}
          <span>${escapeHtml(it.name)}</span>
          <span title="Spice">${renderSpiceEmojis(it.spiceLevel)}</span>
        </div>
        <span class="item-qty-badge">x${it.qty}</span>
      </div>
    `).join('');

    return `
      <div class="ticket-card" id="ticket-${order._id}">
        <div class="ticket-header">
          <span class="ticket-token">${order.tokenNumber}</span>
          <span class="ticket-time">⏱ ${formatElapsedTime(order.createdAt)}</span>
        </div>

        <div class="ticket-customer">
          <strong>${escapeHtml(order.customerName)}</strong> • USN: ${escapeHtml(order.usn)}
        </div>

        <div class="ticket-items">
          ${itemsHtml}
        </div>

        <div class="ticket-footer">
          <div class="ticket-meta">
            <span>Est. Prep: ${order.estimatedPrepTime}m</span>
            <span>Total: ₹${order.totalAmount}</span>
          </div>
          ${actionBtn}
        </div>
      </div>
    `;
  }).join('');
}

async function advanceOrderStatus(orderId, nextStatus) {
  try {
    const res = await fetch(`/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to update order status');
      return;
    }

    // Refresh KDS board immediately
    await fetchKdsData(false);

    // If active order is being tracked on this client, update tracker immediately
    if (state.activeOrderId === orderId) {
      pollActiveOrder();
    }
  } catch (err) {
    console.error('Error advancing status:', err);
    alert('Network error while updating status');
  }
}

// ============================================================================
// ADMIN & STOCK MANAGEMENT
// ============================================================================
async function handleAddNewMenuItem(e) {
  e.preventDefault();
  const feedback = document.getElementById('addMenuFeedback');
  feedback.className = 'form-feedback hidden';

  const name = document.getElementById('newItemName').value.trim();
  const category = document.getElementById('newItemCategory').value;
  const amount = parseFloat(document.getElementById('newItemAmount').value);
  const availableUnits = parseInt(document.getElementById('newItemUnits').value, 10);
  const prepTime = parseFloat(document.getElementById('newItemPrepTime').value);
  const spiceLevel = parseInt(document.getElementById('newItemSpice').value, 10);
  const dietaryType = document.getElementById('newItemDiet').value;

  try {
    const res = await fetch('/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        amount,
        availableUnits,
        prepTime,
        spiceLevel,
        dietaryType
      })
    });

    const data = await res.json();
    if (!res.ok) {
      feedback.textContent = data.error || 'Failed to add menu item.';
      feedback.className = 'form-feedback error';
      return;
    }

    feedback.textContent = `✓ "${data.name}" added successfully!`;
    feedback.className = 'form-feedback success';
    document.getElementById('addMenuForm').reset();

    await fetchMenu();
  } catch (err) {
    console.error('Error adding menu item:', err);
    feedback.textContent = 'Network or server error.';
    feedback.className = 'form-feedback error';
  }
}

function renderAdminInventoryTable() {
  const tbody = document.getElementById('adminInventoryTableBody');
  if (!state.menu || state.menu.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim);">No items loaded</td></tr>`;
    return;
  }

  tbody.innerHTML = state.menu.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${renderDietaryBadge(item.dietaryType)}</td>
      <td>
        <span class="stock-pill ${item.availableUnits > 5 ? 'in-stock' : (item.availableUnits > 0 ? 'low-stock' : 'out-of-stock')}">
          ${item.availableUnits} units
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <button class="btn-sm btn-ghost" onclick="restockItem('${item._id}', 5)">+5 Units</button>
          <button class="btn-sm btn-ghost" onclick="restockItem('${item._id}', 10)">+10 Units</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function restockItem(id, unitsToAdd) {
  try {
    const res = await fetch(`/menu/${id}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addUnits: unitsToAdd })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to update stock');
      return;
    }

    await fetchMenu();
  } catch (err) {
    console.error('Error restocking:', err);
  }
}

// Utility: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  fetchMenu();
  fetchKdsData(false);

  // Auto-refresh KDS every 6 seconds
  state.kdsInterval = setInterval(() => {
    fetchKdsData(false);
  }, 6000);
});
