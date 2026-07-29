/**
 * VENDING MACHINE - KIOSK SCRIPT

 * Architecture & Core Logic:
 * - Single Page Application (SPA): Manages view states via CSS classes
 *   (hidden/flex) without page reloads, ensuring instant touch response.
 * - Real-Time Sync: Subscribes to Firebase Realtime Database to instantly 
 *   reflect product availability, stock, and credit updates from the ESP32.
 * - Auto-Timeout: Implements inactivity timers (inactivityTimeout) to reset 
 *   the UI to the Home screen if the user abandons the transaction.
 * - Hardware Emulation: Simulates NFC card reads and coin insertions by
 *   writing state flags to Firebase, waiting for hardware (ESP32) response.
 * 
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// FIREBASE CONFIGURATION TEMPLATE
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// INIT FIREBASE
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const percorsoChiave = ref(db, 'saldo');
const statoNfcRef = ref(db, "/percorso/stato_nfc");
const prodottiRef = ref(db, "/prodotti");

function getProductPath(index) {
  return `/prodotti/prodotto${index + 1}`;
}

function getEmoji(id) {
  const emojis = ["🥔","🥤","🍫","💧","🍪","🧃"];
  return emojis[id - 1] || "📦";
}

function getColor(id) {
  const colors = ["#FFD700","#FF1493","#7FFF00","#00BFFF","#FF6347","#00FF7F"];
  return colors[id - 1] || "#FFFFFF";
}

// Global Application State
let products = [];
let credit = 0;
let selectedProduct = null;
let quantity = 1;
let totalPrice = 0;
let inactivityTimeout = null;
let stato_nfc = 0;
let currentStock = 0;

// Listen for Real-Time Products Updates
onValue(prodottiRef, (snapshot) => {
  const data = snapshot.val();

  if (!data) return;

  products = Object.keys(data).map((key, index) => {
    const p = data[key];
    const expiryRaw = p[`expiry${index + 1}`]; 
    const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
    const now = new Date();
    const isExpired = expiryDate ? expiryDate < now : false;

    return {
      id: index + 1,
      name: p[`nome${index + 1}`],
      price: parseFloat(p[`prezzo${index + 1}`]),
      quantity: p[`quantita${index + 1}`],
      expiry: expiryRaw,
      expired: isExpired,
      emoji: getEmoji(index + 1),
      bg: getColor(index + 1)
    };
  });

  // Update UI if currently on the products page
  const productsPage = document.getElementById("page-products");
  if (productsPage && !productsPage.classList.contains("hidden")) {
    renderProducts();
  }
});

// View Navigation Logic
function showPage(page) {
  // Reset inactivity timer on screen change
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    clearInterval(inactivityTimeout);
    inactivityTimeout = null;
  }

  const pages = [
    'home',
    'products',
    'detail',
    'payment',
    'credit',
    'thankyou',
    'card-processing',
    'card-prompt',
    'coins-prompt',
    'coins-processing',
    'payment-success',
    'payment-failed'
  ];
  
  pages.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('flex');
    }
  });

  const activePage = document.getElementById('page-' + page);
  if (activePage) {
    activePage.classList.remove('hidden');
    activePage.classList.add('flex');
  }

  // HANDLE SINGLE PAGE BEHAVIOR
  if (page === 'coins-prompt') {

    // WRITE TOTAL PRICE TO FIREBASE
    set(ref(db, "/percorso/prezzo"), totalPrice);

    // UPDATE STOCK
    const productIndex = selectedProduct.id;
    const newStock = currentStock - quantity;
    set(ref(db, `/prodotti/prodotto${productIndex}/quantita${productIndex}`), newStock);

    // Wait 3 seconds on the coins prompt, then go to credit screen
    setTimeout(() => {
      inactivityTimeout = setTimeout(() => showPage('home'), 60000); // 1 min timeout
      showPage('credit');
    }, 3000);
  }

  if (page === 'credit') {
    const unsubscribe = onValue(percorsoChiave, (snapshot) => {
      credit = snapshot.val();
      updateCreditDisplay();
      if (credit >= totalPrice && totalPrice > 0) {
        unsubscribe();
        setTimeout(() => showPage('coins-processing'), 2000);
        setTimeout(() => showPage('thankyou'), 5000);
        credit = 0;
      }
    });
  }

  if (page === 'thankyou') {
    let countdown = 10;
    const timerElement = document.getElementById('thankyou-timer');
    if (timerElement) timerElement.textContent = `Torna alla home tra ${countdown} secondi...`;
    
    inactivityTimeout = setInterval(() => {
      countdown--;
      if (timerElement) timerElement.textContent = `Torna alla home tra ${countdown} secondi...`;
      if (countdown <= 0) {
        showPage('home');
      }
    }, 1000);
  }

  if (page === 'products') renderProducts();
  if (page === 'home') credit = 0;
  
  if (window.lucide) lucide.createIcons();
  updateDateTime();
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  grid.innerHTML = products.map(p => `
    <button onclick="selectProduct(${p.id})" class="btn-pop pop-border pop-shadow rounded-2xl p-4 flex flex-col items-center gap-2 hover:opacity-80" style="background: ${p.bg};">
      <span class="text-5xl">${p.emoji}</span>
      <span class="pop-title text-lg" style="color: #000;">${p.name}</span>
      <span class="font-bold text-sm pop-border rounded-full px-3 py-1" style="background: #FFF;">€${p.price.toFixed(2)}</span>
    </button>
  `).join('');
}

function selectProduct(id) {
  selectedProduct = products.find(p => p.id === id) || null;

  if (!selectedProduct) return;

  currentStock = selectedProduct.quantity;

  if (currentStock <= 0) {
    showModal("NON DISPONIBILE", "Prodotto terminato!", "❌");
    return;
  }

  if (selectedProduct.expired) {
    showModal("NON DISPONIBILE", "Questo prodotto è scaduto!", "⛔");
    return;
  }

  quantity = 1;

  document.getElementById('detail-image').innerHTML = `<span class="text-8xl">${selectedProduct.emoji}</span>`;
  document.getElementById('detail-image').style.background = selectedProduct.bg;
  document.getElementById('detail-name').textContent = selectedProduct.name;
  document.getElementById('detail-price').textContent = `€${selectedProduct.price.toFixed(2)}`;
  document.getElementById('quantity-display').textContent = quantity;

  showPage('detail');
}

function increaseQuantity() {
  if (quantity >= currentStock) {
    showModal("LIMITE RAGGIUNTO", "Non puoi selezionare più quantità disponibili!", "🚫");
    return;
  }
  quantity++;
  document.getElementById('quantity-display').textContent = quantity;
}

function decreaseQuantity() {
  if (quantity > 1) {
    quantity--;
    document.getElementById('quantity-display').textContent = quantity;
  }
}

function processCardPayment() {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }

  stato_nfc = 1;
  set(ref(db, "/percorso/stato_nfc"), stato_nfc);
  set(ref(db, "/percorso/prezzo"), totalPrice);

  const productIndex = selectedProduct.id;
  const newStock = currentStock - quantity;
  set(ref(db, `/prodotti/prodotto${productIndex}/quantita${productIndex}`), newStock);

  // Show the "Tap Card" prompt
  showPage('card-prompt');

  const unsubscribeNfc = onValue(statoNfcRef, (snapshot) => {
    const stato = snapshot.val();

    if (stato == 2) { // Success
      unsubscribeNfc(); // stop listener
      stato_nfc = 0;
      set(ref(db, "/percorso/stato_nfc"), stato_nfc);
      showPage('card-processing');
      setTimeout(() => showPage('payment-success'), 2000);
      setTimeout(() => showPage('thankyou'), 4000);
    }

    if (stato == 3) { // Failed
      unsubscribeNfc(); // stop listener
      stato_nfc = 0;
      set(ref(db, "/percorso/stato_nfc"), stato_nfc);
      showPage('card-processing');
      setTimeout(() => showPage('payment-failed'), 2000);
      setTimeout(() => showPage('thankyou'), 4000);
    }
  });
}

function showModal(title, text, icon = "⚠️") {
  const modal = document.getElementById("custom-modal");
  if (!modal) return;

  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-text").textContent = text;
  document.getElementById("modal-icon").textContent = icon;

  modal.classList.remove("hidden");
}

function closeModal() {
  const modal = document.getElementById("custom-modal");
  if (!modal) return;

  modal.classList.add("hidden");
}

function processCashPayment() {
  showPage('coins-prompt');
}

function proceedToPayment() {
  if (!selectedProduct) return;

  document.getElementById('payment-image').innerHTML = `<span class="text-6xl">${selectedProduct.emoji}</span>`;
  document.getElementById('payment-name').textContent = selectedProduct.name;
  document.getElementById('payment-qty').textContent = `Quantità: ${quantity}`;
  
  totalPrice = selectedProduct.price * quantity;
  document.getElementById('payment-total').textContent = `Totale: €${totalPrice.toFixed(2)}`;
  document.getElementById('payment-msg').textContent = '';

  showPage('payment');
}

function updateCreditDisplay() {
  document.getElementById('credit-display-full').textContent = `€${credit.toFixed(2)}`;
}

function updateDateTime() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const dateTimeStr = now.toLocaleDateString('it-IT', options);
  const dateTimeElement = document.getElementById('date-time');
  if (dateTimeElement) {
    dateTimeElement.textContent = dateTimeStr;
  }
}

function createStars(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const stars = ['⭐', '✨', '💫', '🌟'];

  for (let i = 0; i < 8; i++) {
    const star = document.createElement('div');
    star.className = 'mini-star';
    star.textContent = stars[Math.floor(Math.random() * stars.length)];
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    container.appendChild(star);
  }
}

setInterval(updateDateTime, 30000);


// Element SDK - Protected initialization to avoid crashes if SDK is missing
if (window.elementSdk) {
  const defaultConfig = {
    welcome_title: "SNACK & DRINK",
    welcome_subtitle: "La tua vending machine preferita!",
    button_text: "SCEGLI IL TUO SNACK!",
    background_color: "#FFD700",
    surface_color: "#FF1493",
    text_color: "#FFFFFF",
    primary_action_color: "#7FFF00",
    secondary_action_color: "#00BFFF",
    font_family: "Bangers",
    font_size: 16
  };

  function applyConfig(config) {
    document.getElementById('home-title').textContent = config.welcome_title || defaultConfig.welcome_title;
    document.getElementById('home-subtitle').textContent = config.welcome_subtitle || defaultConfig.welcome_subtitle;
    document.getElementById('home-btn').textContent = config.button_text || defaultConfig.button_text;
  }

  window.elementSdk.init({
    defaultConfig,
    onConfigChange: async (config) => { applyConfig(config); },
    mapToCapabilities: (config) => ({
      recolorables: [
        { get: () => config.background_color || defaultConfig.background_color, set: (v) => { config.background_color = v; window.elementSdk.setConfig({ background_color: v }); document.getElementById('page-home').style.background = v; } },
        { get: () => config.surface_color || defaultConfig.surface_color, set: (v) => { config.surface_color = v; window.elementSdk.setConfig({ surface_color: v }); } },
        { get: () => config.text_color || defaultConfig.text_color, set: (v) => { config.text_color = v; window.elementSdk.setConfig({ text_color: v }); } },
        { get: () => config.primary_action_color || defaultConfig.primary_action_color, set: (v) => { config.primary_action_color = v; window.elementSdk.setConfig({ primary_action_color: v }); } },
        { get: () => config.secondary_action_color || defaultConfig.secondary_action_color, set: (v) => { config.secondary_action_color = v; window.elementSdk.setConfig({ secondary_action_color: v }); } }
      ],
      borderables: [],
      fontEditable: { get: () => config.font_family || defaultConfig.font_family, set: (v) => { config.font_family = v; window.elementSdk.setConfig({ font_family: v }); } },
      fontSizeable: { get: () => config.font_size || defaultConfig.font_size, set: (v) => { config.font_size = v; window.elementSdk.setConfig({ font_size: v }); } }
    }),
    mapToEditPanelValues: (config) => new Map([
      ["welcome_title", config.welcome_title || defaultConfig.welcome_title],
      ["welcome_subtitle", config.welcome_subtitle || defaultConfig.welcome_subtitle],
      ["button_text", config.button_text || defaultConfig.button_text]
    ])
  });
}

// Initialize icons on load
if (window.lucide) lucide.createIcons();
updateDateTime();

// EXPORT FUNCTIONS TO WINDOW SCOPE FOR HTML INLINE HANDLERS
window.showPage = showPage;
window.renderProducts = renderProducts;
window.selectProduct = selectProduct;
window.increaseQuantity = increaseQuantity;
window.decreaseQuantity = decreaseQuantity;
window.proceedToPayment = proceedToPayment;
window.processCardPayment = processCardPayment;
window.processCashPayment = processCashPayment;
window.showModal = showModal;
window.closeModal = closeModal;