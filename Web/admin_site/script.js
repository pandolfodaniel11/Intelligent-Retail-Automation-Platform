/**
 * VENDING MACHINE FLEET DASHBOARD - MAIN CONTROLLER
 * 
 * ARCHITECTURE NOTE (MVP PATTERN):
 * This frontend serves as a Minimum Viable Product (MVP) dashboard.
 * - Machine 1 (M1) is mapped to the live Firebase Realtime Database and 
 *   syncs directly with the physical ESP32.
 * - Machines M2-M6 utilize Mock Data to demonstrate scaling
 * 
 * NOTE ON FIREBASE KEYS:
 * Database keys (e.g., 'prodotti', 'nome1', '/percorso/inc') are kept in 
 * their original Italian to maintain strict compatibility with the ESP32 

*/

import { db, ref, set, get, onValue } from "./firebase.js";


// MOCK DATA & STATE MANAGEMENT

const FIXED_MACHINES = [
  {id:'m1',machine_name:'MILAZZO CENTRO',zone:'via Tre Monti 4',is_on:true,total_revenue:245.50,last_maintenance:'2026-06-02',notes:'Regular operation, clean tray',product_1_name:'Acqua Minerale',product_1_price:0.70,product_1_qty:4,product_1_expiry:'2026-06-15',product_2_name:'Coca Cola',product_2_price:1.20,product_2_qty:3,product_2_expiry:'2026-10-20',product_3_name:'Fanta',product_3_price:1.20,product_3_qty:2,product_3_expiry:'2026-06-18',product_4_name:'Biscotti',product_4_price:1.50,product_4_qty:1,product_4_expiry:'2026-07-05',product_5_name:'Patatine',product_5_price:1.30,product_5_qty:4,product_5_expiry:'2026-08-22',product_6_name:'Energy Drink',product_6_price:2.00,product_6_qty:0,product_6_expiry:'2026-09-01'},
  {id:'m2',machine_name:'BARCELLONA CENTRO',zone:'via Roma',is_on:true,total_revenue:380.25,last_maintenance:'2026-05-15',notes:'Optimal operation',product_1_name:'Sprite',product_1_price:1.20,product_1_qty:4,product_1_expiry:'2026-06-17',product_2_name:'Fanta',product_2_price:1.20,product_2_qty:3,product_2_expiry:'2026-10-15',product_3_name:'Aranciata',product_3_price:1.20,product_3_qty:0,product_3_expiry:'2026-08-20',product_4_name:'Crackers',product_4_price:1.50,product_4_qty:2,product_4_expiry:'2026-07-10',product_5_name:'Salatini',product_5_price:1.30,product_5_qty:3,product_5_expiry:'2026-08-30',product_6_name:'Barretta Proteica',product_6_price:2.50,product_6_qty:1,product_6_expiry:'2026-11-05'},
  {id:'m3',machine_name:'AREA COMMERCIALE SPINESANTE',zone:'via statale SS113',is_on:false,total_revenue:156.80,last_maintenance:'2026-04-10',notes:'Maintenance required',product_1_name:'The Freddo',product_1_price:1.50,product_1_qty:1,product_1_expiry:'2026-06-14',product_2_name:'Caffè',product_2_price:1.00,product_2_qty:2,product_2_expiry:'2026-08-15',product_3_name:"Succo d'arancia",product_3_price:1.30,product_3_qty:0,product_3_expiry:'2026-07-01',product_4_name:'',product_4_price:0,product_4_qty:0,product_4_expiry:'',product_5_name:'Popcorn',product_5_price:1.80,product_5_qty:1,product_5_expiry:'2026-09-12',product_6_name:'',product_6_price:0,product_6_qty:0,product_6_expiry:''},
  {id:'m4',machine_name:'OLIVARELLA NORD',zone:'via Olivarella 12',is_on:true,total_revenue:312.40,last_maintenance:'2026-05-28',notes:'Clean tray, counters OK',product_1_name:'Acqua Minerale',product_1_price:0.70,product_1_qty:3,product_1_expiry:'2026-06-20',product_2_name:'Sprite',product_2_price:1.20,product_2_qty:4,product_2_expiry:'2026-09-15',product_3_name:'Coca Cola',product_3_price:1.20,product_3_qty:2,product_3_expiry:'2026-10-10',product_4_name:'Biscotti',product_4_price:1.50,product_4_qty:3,product_4_expiry:'2026-07-22',product_5_name:'Cioccolata',product_5_price:1.80,product_5_qty:2,product_5_expiry:'2026-08-05',product_6_name:'Caffè',product_6_price:1.00,product_6_qty:4,product_6_expiry:'2026-07-15'},
  {id:'m5',machine_name:'SAN FILIPPO CENTRO',zone:'piazza San Filippo 8',is_on:true,total_revenue:428.75,last_maintenance:'2026-06-05',notes:'New installation, perfect operation',product_1_name:'Acqua Minerale',product_1_price:0.70,product_1_qty:4,product_1_expiry:'2026-06-25',product_2_name:'Coca Cola',product_2_price:1.20,product_2_qty:4,product_2_expiry:'2026-10-05',product_3_name:'Sprite',product_3_price:1.20,product_3_qty:3,product_3_expiry:'2026-09-20',product_4_name:'Crackers',product_4_price:1.50,product_4_qty:4,product_4_expiry:'2026-07-18',product_5_name:'Salatini',product_5_price:1.30,product_5_qty:3,product_5_expiry:'2026-09-01',product_6_name:'Energy Drink',product_6_price:2.00,product_6_qty:2,product_6_expiry:'2026-09-10'},
  {id:'m6',machine_name:'SANTA LUCIA EST',zone:'viale Santa Lucia 45',is_on:false,total_revenue:89.30,last_maintenance:'2026-03-20',notes:'Offline for maintenance',product_1_name:'The Freddo',product_1_price:1.50,product_1_qty:0,product_1_expiry:'2026-06-14',product_2_name:'Caffè',product_2_price:1.00,product_2_qty:1,product_2_expiry:'2026-07-15',product_3_name:"Succo d'arancia",product_3_price:1.30,product_3_qty:0,product_3_expiry:'2026-07-05',product_4_name:'Patatine',product_4_price:1.30,product_4_qty:1,product_4_expiry:'2026-08-10',product_5_name:'Popcorn',product_5_price:1.80,product_5_qty:0,product_5_expiry:'2026-09-15',product_6_name:'Barretta Proteica',product_6_price:2.50,product_6_qty:1,product_6_expiry:'2026-11-10'}
];

// App State
let activeMachineRevenue = 0;
let machines = JSON.parse(JSON.stringify(FIXED_MACHINES));
let selectedId = machines[0].id;
let editingMachineId = null;
let editingProductIndex = null;
let deleteArmed = false;

// DOM Selectors
const $ = id => document.getElementById(id);
const els = {
  machinesGrid: $('machines-grid'), machinesEmpty: $('machines-empty'), latest: $('latest-machines'),
  detailEmpty: $('detail-empty'), detailContent: $('detail-content'), detailName: $('detail-name'),
  detailZone: document.querySelector('#detail-zone span'), detailStatus: $('detail-status-pill'),
  revenue: $('revenue-value'), productCount: $('products-count-value'), availableCount: $('available-count-value'),
  alertCount: $('alert-count-value'), productsGrid: $('products-grid'),
  machineModal: $('machine-modal'), productModal: $('product-modal'),
  toast: $('toast'), sidebarAlerts: $('sidebar-alerts-list'), sidebarNoAlerts: $('sidebar-no-alerts'),
  expiringList: $('expiring-list'), expiringEmpty: $('expiring-empty')
};


// UTILITY FUNCTIONS


const euro = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

const formatDate = v => {
  if (!v) return '—';
  const d = new Date(v + 'T00:00:00');
  return isNaN(d) ? '—' : new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
};

const selectedMachine = () => machines.find(m => m.id === selectedId) || null;

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function getProducts(m) {
  return Array.from({ length: 6 }, (_, i) => ({
    index: i + 1,
    name: m[`product_${i + 1}_name`] || '',
    price: Number(m[`product_${i + 1}_price`] || 0),
    qty: Number(m[`product_${i + 1}_qty`] || 0),
    expiry: m[`product_${i + 1}_expiry`] || ''
  }));
}


// Determines product status based on existence, quantity, and expiry date.
function statusOf(p) {
  if (!p.name) return { label: 'EMPTY', bg: '#f6efe1', fg: '#151515' };
  if (p.qty <= 0) return { label: 'SOLD OUT', bg: '#ff2f2f', fg: '#fff' };
  if (p.expiry) {
    const today = new Date('2026-06-12T00:00:00'); // Simulated current date for demo stability
    const exp = new Date(p.expiry + 'T00:00:00');
    const diff = Math.ceil((exp - today) / 86400000);
    if (diff < 0) return { label: 'EXPIRED', bg: '#ff2f2f', fg: '#fff' };
    if (diff <= 7) return { label: 'EXPIRING', bg: '#ff9b1f', fg: '#151515' };
  }
  return { label: 'OK', bg: '#23c963', fg: '#151515' };
}

const alertCount = m => getProducts(m).filter(p => ['SOLD OUT', 'EXPIRED', 'EXPIRING'].includes(statusOf(p).label)).length;

function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === name));
  $('mobile-menu').classList.remove('mobile-menu-open');
  lucide.createIcons();
}


// UI RENDERING LOGIC

function machineCard(machine, index) {
  const products = getProducts(machine);
  const filled = products.filter(p => p.name).length;
  const alerts = alertCount(machine);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'machine-card focusable text-left bg-white p-2 rounded-lg panel-soft text-[11px]';
  card.innerHTML = `
    <div class="flex justify-between items-start gap-1">
      <div class="min-w-0 flex-1">
        <p class="text-[9px] uppercase font-black">#${String(index + 1).padStart(2, '0')} ${machine.machine_name}</p>
        <h3 class="display text-sm uppercase mt-0.5 mb-3">${machine.zone}</h3>
      </div>
      <span class="px-1.5 py-0.5 text-[8px] font-black uppercase rounded flex-shrink-0" style="background:${machine.is_on ? '#23c963' : '#ff2f2f'};color:${machine.is_on ? '#000' : '#fff'}">${machine.is_on ? 'ON' : 'OFF'}</span>
    </div>
    <div class="grid grid-cols-3 gap-1 mt-1">
      <div><p class="text-[10px] uppercase tracking-[.08em] font-black">€</p><p class="font-black text-base">${euro(machine.total_revenue)}</p></div>
      <div><p class="text-[10px] uppercase tracking-[.08em] font-black">Pr</p><p class="font-black text-base">${filled}/6</p></div>
      <div><p class="text-[10px] uppercase tracking-[.08em] font-black">Al</p><p class="font-black text-base">${alerts}</p></div>
    </div>
    <div class="mt-1 bg-[#ffe000] border-2 border-black rounded py-0.5 text-center text-[9px] uppercase font-black">Manage →</div>`;
  card.addEventListener('click', () => { selectedId = machine.id; renderDetail(); switchScreen('detail'); });
  return card;
}

function renderDashboard() {
  const total = machines.length;
  const online = machines.filter(m => m.is_on).length;
  const offline = total - online;
  const products = machines.reduce((sum, m) => sum + getProducts(m).filter(p => p.name).length, 0);
  const alerts = machines.reduce((sum, m) => sum + alertCount(m), 0);
  const revenue = machines.reduce((sum, m) => sum + Number(m.total_revenue || 0), 0);
  const pct = total ? Math.round((online / total) * 100) : 0;

  $('kpi-machines').textContent = total;
  $('kpi-alerts').textContent = alerts;
  $('vending-pop-percent').textContent = pct + '%';
  $('vending-pop-bar').style.width = pct + '%';
  $('vending-pop-att').textContent = online;
  $('vending-pop-off').textContent = offline;
  $('vending-pop-euro').textContent = euro(revenue);

  els.latest.innerHTML = '';
  machines.slice(0, 3).forEach((m, i) => els.latest.appendChild(machineCard(m, i)));

  els.sidebarAlerts.innerHTML = '';
  const critical = machines.map(m => ({ m, count: alertCount(m) })).filter(x => x.count > 0);
  els.sidebarNoAlerts.classList.toggle('hidden', critical.length > 0);
  critical.forEach(({ m, count }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'focusable text-left w-full bg-white/10 text-white p-3 rounded-lg text-sm flex justify-between items-center gap-2';
    btn.innerHTML = `<div class="min-w-0 flex-1"><p class="font-black uppercase truncate text-sm">${m.zone}</p><p class="text-[12px] text-white/70 truncate">${m.machine_name}</p></div><span class="bg-[#ff2f2f] text-white px-2 py-1 text-[11px] font-black whitespace-nowrap">${count}</span>`;
    btn.addEventListener('click', () => { selectedId = m.id; renderDetail(); switchScreen('detail'); });
    els.sidebarAlerts.appendChild(btn);
  });
  lucide.createIcons();
}

function renderExpiring() {
  const expiring = [];
  machines.forEach(m => getProducts(m).forEach(p => {
    const s = statusOf(p);
    if (['EXPIRING', 'EXPIRED'].includes(s.label)) expiring.push({ m, p, s });
  }));
  els.expiringEmpty.classList.toggle('hidden', expiring.length > 0);
  els.expiringList.innerHTML = '';
  expiring.forEach(({ m, p, s }) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'focusable w-full bg-white text-black border-2 border-black p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-left rounded-lg panel-soft';
    row.innerHTML = `<div class="flex-1 min-w-0"><p class="font-black uppercase">${p.name}</p><p class="text-xs text-black/60">${m.machine_name} — ${m.zone}</p></div><div class="flex gap-2 items-center flex-shrink-0"><span class="text-xs font-black text-[#ff2f2f]">${formatDate(p.expiry)}</span><span class="px-2 py-1 text-[10px] uppercase font-black" style="background:${s.bg};color:${s.fg}">${s.label}</span></div>`;
    row.addEventListener('click', () => { selectedId = m.id; renderDetail(); switchScreen('detail'); });
    els.expiringList.appendChild(row);
  });
  lucide.createIcons();
}

function renderMachines() {
  const q = $('machine-search').value.toLowerCase().trim();
  const filter = $('machine-filter').value;
  const visible = machines.filter(m => {
    const textMatch = `${m.machine_name} ${m.zone}`.toLowerCase().includes(q);
    const filterMatch = filter === 'all' || (filter === 'on' && m.is_on) || (filter === 'off' && !m.is_on) || (filter === 'alert' && alertCount(m) > 0);
    return textMatch && filterMatch;
  });
  els.machinesGrid.innerHTML = '';
  els.machinesEmpty.classList.toggle('hidden', visible.length !== 0);
  visible.forEach((m, i) => els.machinesGrid.appendChild(machineCard(m, i)));
  lucide.createIcons();
}

function renderDetail() {
  const m = selectedMachine();
  const has = !!m;
  els.detailEmpty.classList.toggle('hidden', has);
  els.detailContent.classList.toggle('hidden', !has);
  if (!m) return;

  els.detailName.textContent = m.zone;
  els.detailZone.textContent = m.machine_name;
  document.querySelector('#detail-maintenance-header span').textContent = formatDate(m.last_maintenance);
  els.detailStatus.textContent = m.is_on ? '● ONLINE' : '● OFFLINE';
  els.detailStatus.style.background = m.is_on ? '#23c963' : '#ff2f2f';
  els.detailStatus.style.color = m.is_on ? '#151515' : '#fff';
  els.revenue.textContent = euro(m.total_revenue);

  const products = getProducts(m);
  const filled = products.filter(p => p.name).length;
  const available = products.filter(p => {
    if (!p.name) return false;
    if (p.qty <= 0) return false;
    if (p.expiry) {
      const today = new Date('2026-06-12T00:00:00');
      const exp = new Date(p.expiry + 'T00:00:00');
      if (exp < today) return false;
    }
    return true;
  }).length;
  const alerts = alertCount(m);
  
  els.productCount.textContent = `${filled}/6`;
  els.availableCount.textContent = available;
  els.alertCount.textContent = alerts;

  els.productsGrid.innerHTML = '';
  products.forEach(p => {
    const s = statusOf(p);
    const exhausted = p.name && p.qty <= 0;
    const hasAlert = ['SOLD OUT', 'EXPIRED', 'EXPIRING'].includes(s.label);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'product-card focusable text-left panel-soft rounded-lg flex flex-col p-2';
    card.style.background = exhausted ? '#ff2f2f' : 'white';
    card.style.color = exhausted ? '#fff' : '#151515';
    card.innerHTML = `
      <div class="status-strip px-1.5 py-1 text-[9px] uppercase font-black flex justify-between flex-wrap flex-shrink-0" style="background:${s.bg};color:${s.fg}">
        <span>${s.label}</span><span>${p.expiry ? formatDate(p.expiry) : '—'}</span>
      </div>
      <h3 class="font-black uppercase text-[13px] leading-tight mt-1.5 mb-5">${p.name || 'Slot'}</h3>
      <div class="flex gap-1 text-[11px] font-black mb-5">
        <span class="border-2 border-current px-1 py-0.5 flex-1 text-center" style="background:${exhausted ? 'rgba(255,255,255,0.2)' : '#ffe000'};color:${exhausted ? '#fff' : '#000'};border-color:${exhausted ? 'rgba(255,255,255,0.4)' : '#000'}">${p.name ? euro(p.price) : '—'}</span>
        <span class="border-2 border-current px-1 py-0.5 flex-1 text-center" style="background:${exhausted ? 'rgba(255,255,255,0.2)' : '#2bc8ee'};color:${exhausted ? '#fff' : '#000'};border-color:${exhausted ? 'rgba(255,255,255,0.4)' : '#000'}">Q${p.name ? p.qty : '—'}</span>
      </div>
      <div class="grid grid-cols-4 gap-1">
        ${[0, 1, 2, 3].map(i => `<span class="h-1.5 border-2" style="border-color:${exhausted ? 'rgba(255,255,255,0.4)' : '#000'};background:${i < p.qty ? (exhausted ? 'rgba(255,255,255,0.6)' : '#2bc8ee') : (exhausted ? 'rgba(0,0,0,0.2)' : 'white')}"></span>`).join('')}
      </div>`;
    card.addEventListener('click', () => openProductModal(p.index));
    els.productsGrid.appendChild(card);
  });
  lucide.createIcons();
}

function renderAll() {
  if (!selectedId && machines.length) selectedId = machines[0].id;
  if (selectedId && !machines.some(m => m.id === selectedId)) {
    selectedId = machines[0]?.id || null;
  }
  renderDashboard();
  renderMachines();
  renderDetail();
  renderExpiring();
}


// 4. MODALS & FORMS

function openMachineModal(m = null) {
  editingMachineId = m ? m.id : null;
  $('machine-name').value = m?.machine_name || '';
  $('machine-zone').value = m?.zone || '';
  $('machine-status').value = String(m?.is_on ?? true);
  $('machine-revenue').value = m?.total_revenue ?? 0;
  $('machine-maintenance').value = m?.last_maintenance || '';
  $('machine-notes').value = m?.notes || '';
  els.machineModal.classList.remove('hidden');
  els.machineModal.classList.add('flex');
}

function closeMachineModal() { els.machineModal.classList.add('hidden'); els.machineModal.classList.remove('flex'); }

function openProductModal(index) {
  const m = selectedMachine();
  if (!m) return;
  editingProductIndex = index;
  $('product-name').value = m[`product_${index}_name`] || '';
  $('product-price').value = m[`product_${index}_price`] || 0;
  $('product-qty').value = m[`product_${index}_qty`] || 0;
  $('product-expiry').value = m[`product_${index}_expiry`] || '';
  els.productModal.classList.remove('hidden');
  els.productModal.classList.add('flex');
}

function closeProductModal() { els.productModal.classList.add('hidden'); els.productModal.classList.remove('flex'); }

// Form: Add/Edit Machine
$('machine-form').addEventListener('submit', e => {
  e.preventDefault();
  const payload = {
    machine_name: $('machine-name').value.trim(),
    zone: $('machine-zone').value.trim(),
    is_on: $('machine-status').value === 'true',
    total_revenue: Number($('machine-revenue').value || 0),
    last_maintenance: $('machine-maintenance').value,
    notes: $('machine-notes').value.trim()
  };
  
  if (editingMachineId) {
    const idx = machines.findIndex(m => m.id === editingMachineId);
    if (idx > -1) machines[idx] = { ...machines[idx], ...payload };
    showToast('Machine configuration updated.');
  } else {
    const nextId = 'm' + (Math.max(...machines.map(m => Number(m.id.replace('m', '')) || 0)) + 1);
    machines.push({
      id: nextId, ...payload,
      product_1_name: '', product_1_price: 0, product_1_qty: 0, product_1_expiry: '',
      product_2_name: '', product_2_price: 0, product_2_qty: 0, product_2_expiry: '',
      product_3_name: '', product_3_price: 0, product_3_qty: 0, product_3_expiry: '',
      product_4_name: '', product_4_price: 0, product_4_qty: 0, product_4_expiry: '',
      product_5_name: '', product_5_price: 0, product_5_qty: 0, product_5_expiry: '',
      product_6_name: '', product_6_price: 0, product_6_qty: 0, product_6_expiry: ''
    });
    selectedId = nextId;
    showToast('New machine added.');
  }
  closeMachineModal();
  renderAll();
});

// Form: Edit Product (Syncs with Firebase)
$('product-form').addEventListener('submit', async e => {
  e.preventDefault();

  const m = selectedMachine();
  if (!m) return;

  const idx = machines.findIndex(x => x.id === m.id);
  if (idx < 0) return;

  const i = editingProductIndex;

  const name = $('product-name').value.trim();
  const price = Number($('product-price').value || 0);
  const qty = Math.max(0, Math.min(4, Number($('product-qty').value || 0)));
  const expiry = $('product-expiry').value;

  // Local UI Update
  machines[idx][`product_${i}_name`] = name;
  machines[idx][`product_${i}_price`] = price;
  machines[idx][`product_${i}_qty`] = qty;
  machines[idx][`product_${i}_expiry`] = expiry;

  // FIREBASE WRITE: Pushing updates to the hardware
  try {
    await set(
      ref(db, `prodotti/prodotto${i}`),
      {
        [`nome${i}`]: name,
        [`prezzo${i}`]: price,
        [`quantita${i}`]: qty,
        [`expiry${i}`]: expiry
      }
    );
  } catch (err) {
    console.error("Firebase Error:", err);
    showToast("Error saving to database");
    return;
  }

  closeProductModal();
  renderAll();
  showToast('Product updated successfully.');
});

// Delete Machine Logic
$('delete-machine-btn').addEventListener('click', () => {
  const m = selectedMachine();
  if (!m) return;
  const btn = $('delete-machine-btn');
  if (!deleteArmed) {
    deleteArmed = true;
    btn.innerHTML = '<i data-lucide="triangle-alert" class="w-3 h-3"></i><span>Confirm</span>';
    lucide.createIcons();
    setTimeout(() => {
      if (deleteArmed) {
        deleteArmed = false;
        btn.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3"></i><span>Delete</span>';
        lucide.createIcons();
      }
    }, 3000);
    return;
  }
  machines = machines.filter(x => x.id !== m.id);
  selectedId = machines[0]?.id || null;
  deleteArmed = false;
  btn.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3"></i><span>Delete</span>';
  renderAll();
  switchScreen('machines');
  showToast('Machine removed from fleet.');
  lucide.createIcons();
});


// 5. FIREBASE REALTIME SYNC (DATA FETCHING & LISTENERS)

/**
 * Performs an initial load of the product catalog for Machine M1 
 * directly from the Firebase Realtime Database.
 */
async function fetchFirebaseProducts() {
  const snapshot = await get(ref(db, "prodotti"));
  if (!snapshot.exists()) return;

  const dati = snapshot.val();
  const macchina = machines.find(m => m.id === "m1");
  if (!macchina) return;

  for (let i = 1; i <= 6; i++) {
    macchina[`product_${i}_name`] = dati[`prodotto${i}`][`nome${i}`];
    macchina[`product_${i}_price`] = dati[`prodotto${i}`][`prezzo${i}`];
    macchina[`product_${i}_qty`] = dati[`prodotto${i}`][`quantita${i}`];
    macchina[`product_${i}_expiry`] = dati[`prodotto${i}`][`expiry${i}`];
  }
  renderAll();
}

/**
 * Performs an initial load of the total revenue for Machine M1.
 */
async function fetchRevenue() {
  const snapshot = await get(ref(db, "/percorso/inc"));
  const inc = Number(snapshot.val() || 0);
  activeMachineRevenue = inc;

  const macchina = machines.find(m => m.id === "m1");
  if (macchina) macchina.total_revenue = inc;
  renderAll();
}

// REALTIME LISTENER: Sync product changes triggered by the physical machine
onValue(ref(db, "prodotti"), (snapshot) => {
  const dati = snapshot.val();
  const macchina = machines.find(m => m.id === "m1");
  if(!macchina) return;

  for (let i = 1; i <= 6; i++) {
    macchina[`product_${i}_name`] = dati[`prodotto${i}`][`nome${i}`];
    macchina[`product_${i}_price`] = dati[`prodotto${i}`][`prezzo${i}`];
    macchina[`product_${i}_qty`] = dati[`prodotto${i}`][`quantita${i}`];
    macchina[`product_${i}_expiry`] = dati[`prodotto${i}`][`expiry${i}`];
  }
  renderAll();
});

// REALTIME LISTENER: Sync revenue changes triggered by coin insertion
onValue(ref(db, "/percorso/inc"), (snapshot) => {
  const inc = Number(snapshot.val() || 0);
  activeMachineRevenue = inc;

  const macchina = machines.find(m => m.id === "m1");
  if (macchina) macchina.total_revenue = inc;

  requestAnimationFrame(() => {
    renderAll();
  });
});

// OPTIONAL CONNECTION TEST
async function testFirebaseConnection() {
  await set(ref(db, "test"), { message: "Connection successful" });
  const snapshot = await get(ref(db, "test"));
  if (snapshot.exists()) console.log("Firebase Status:", snapshot.val());
}


// EVENT LISTENERS & INITIALIZATION

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchScreen(btn.dataset.screen)));
document.querySelectorAll('[data-go-machines]').forEach(btn => btn.addEventListener('click', () => switchScreen('machines')));
$('mobile-menu-btn').addEventListener('click', () => $('mobile-menu').classList.toggle('mobile-menu-open'));
$('machine-search').addEventListener('input', renderMachines);
$('machine-filter').addEventListener('change', renderMachines);
$('add-machine-btn').addEventListener('click', () => openMachineModal());
$('add-machine-btn-2').addEventListener('click', () => openMachineModal());
$('edit-machine-btn').addEventListener('click', () => { const m = selectedMachine(); if (m) openMachineModal(m); });
document.querySelectorAll('.close-machine-modal').forEach(btn => btn.addEventListener('click', closeMachineModal));
document.querySelectorAll('.close-product-modal').forEach(btn => btn.addEventListener('click', closeProductModal));


function initApp() {
  testFirebaseConnection();
  fetchFirebaseProducts();
  fetchRevenue();
  renderAll();
  lucide.createIcons();
}

// Start application
initApp();