const API_KEY = "enter your api key here";

const STORAGE_KEY = 'cryptoPortfolio_v1';

function loadHoldings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}

function saveHoldings(holdings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

let holdings     = loadHoldings(); // [{ id, coinId, name, symbol, qty, buyPrice, buyDate }]
let currentPrices = {};            // { coinId: price }
let editingId     = null;          // id of holding being edited

/* ──────────────────────────────────────────────────────────────────
   INIT  — HTML & CSS already live in index.html / style.css;
           this just wires up event listeners and fetches prices.
   ────────────────────────────────────────────────────────────────── */

export function initPortfolio() {
    bindEvents();
    refresh();
}

function bindEvents() {
    document.getElementById('pf-add-btn').onclick    = handleAddOrSave;
    document.getElementById('pf-cancel-btn').onclick = cancelEdit;
    document.getElementById('pf-refresh-btn').onclick = refresh;
}

/* ──────────────────────────────────────────────────────────────────
   ADD / EDIT HOLDING
   ────────────────────────────────────────────────────────────────── */

async function handleAddOrSave() {
    const coinRaw  = document.getElementById('pf-coin-input').value.trim().toLowerCase();
    const qty      = parseFloat(document.getElementById('pf-qty-input').value);
    const buyPrice = parseFloat(document.getElementById('pf-price-input').value);
    const buyDate  = document.getElementById('pf-date-input').value;

    if (!coinRaw || isNaN(qty) || qty <= 0 || isNaN(buyPrice) || buyPrice <= 0) {
        alert('Please fill in Coin ID, a valid Quantity, and Buy Price.');
        return;
    }

    const btn = document.getElementById('pf-add-btn');
    btn.textContent = 'Loading…';
    btn.disabled    = true;

    try {
        const listRes = await fetch('https://api.coingecko.com/api/v3/coins/list', {
            headers: { 'x-cg-demo-api-key': API_KEY }
        });
        const list = await listRes.json();
        const coin = list.find(c => c.id === coinRaw || c.symbol === coinRaw);
        if (!coin) throw new Error('Coin not found.');

        if (editingId !== null) {
            const idx = holdings.findIndex(h => h.id === editingId);
            if (idx !== -1) {
                holdings[idx] = {
                    ...holdings[idx],
                    coinId: coin.id,
                    name: coin.name,
                    symbol: coin.symbol.toUpperCase(),
                    qty, buyPrice, buyDate
                };
            }
            editingId = null;
        } else {
            holdings.push({
                id: Date.now(),
                coinId: coin.id,
                name:   coin.name,
                symbol: coin.symbol.toUpperCase(),
                qty, buyPrice, buyDate
            });
        }

        saveHoldings(holdings);
        clearForm();
        await refresh();

    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.textContent = editingId !== null ? 'Save' : 'Add';
        btn.disabled    = false;
    }
}

function deleteHolding(id) {
    if (!confirm('Remove this holding?')) return;
    holdings = holdings.filter(h => h.id !== id);
    saveHoldings(holdings);
    refresh();
}

function startEdit(id) {
    const h = holdings.find(h => h.id === id);
    if (!h) return;
    editingId = id;

    document.getElementById('pf-coin-input').value  = h.coinId;
    document.getElementById('pf-qty-input').value   = h.qty;
    document.getElementById('pf-price-input').value = h.buyPrice;
    document.getElementById('pf-date-input').value  = h.buyDate || '';

    document.getElementById('pf-form-title').textContent     = `Edit — ${h.name}`;
    document.getElementById('pf-add-btn').textContent        = 'Save';
    document.getElementById('pf-cancel-btn').style.display  = 'inline-flex';

    document.getElementById('portfolio-section').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    clearForm();
}

function clearForm() {
    ['pf-coin-input', 'pf-qty-input', 'pf-price-input', 'pf-date-input'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('pf-form-title').textContent    = 'Add Holding';
    document.getElementById('pf-add-btn').textContent       = 'Add';
    document.getElementById('pf-cancel-btn').style.display = 'none';
}

/* ──────────────────────────────────────────────────────────────────
   REFRESH  — fetch current prices then re-render everything
   ────────────────────────────────────────────────────────────────── */

async function refresh() {
    if (!holdings.length) { renderTable(); renderSummary(); renderDonut(); return; }

    const ids = [...new Set(holdings.map(h => h.coinId))].join(',');
    try {
        const res = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
            { headers: { 'x-cg-demo-api-key': API_KEY } }
        );
        const data = await res.json();
        holdings.forEach(h => {
            if (data[h.coinId]) currentPrices[h.coinId] = data[h.coinId].usd;
        });
    } catch { /* keep last known prices */ }

    renderTable();
    renderSummary();
    renderDonut();
}

/* ──────────────────────────────────────────────────────────────────
   RENDER: TABLE
   ────────────────────────────────────────────────────────────────── */

function renderTable() {
    const empty = document.getElementById('pf-empty');
    const table = document.getElementById('pf-table');
    const tbody = document.getElementById('pf-tbody');

    if (!holdings.length) {
        empty.style.display = 'block';
        table.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    table.style.display = 'table';
    tbody.innerHTML     = '';

    holdings.forEach(h => {
        const curPrice = currentPrices[h.coinId] ?? null;
        const cost     = h.qty * h.buyPrice;
        const value    = curPrice !== null ? h.qty * curPrice : null;
        const pnl      = value   !== null ? value - cost      : null;
        const pnlPct   = pnl    !== null ? (pnl / cost) * 100 : null;
        const pnlClass = pnl === null ? '' : pnl >= 0 ? 'pos' : 'neg';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="pf-coin-badge">${h.symbol}</span> ${h.name}</td>
            <td>${h.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
            <td>${fmt(h.buyPrice)}</td>
            <td>${curPrice !== null ? fmt(curPrice) : '<span class="pf-na">—</span>'}</td>
            <td>${value    !== null ? fmt(value)    : '<span class="pf-na">—</span>'}</td>
            <td>${fmt(cost)}</td>
            <td class="${pnlClass}">${pnl !== null
                ? (pnl >= 0 ? '+' : '') + fmt(pnl)
                : '<span class="pf-na">—</span>'}</td>
            <td class="${pnlClass}">${pnlPct !== null
                ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%'
                : '<span class="pf-na">—</span>'}</td>
            <td>${h.buyDate || '<span class="pf-na">—</span>'}</td>
            <td class="pf-actions">
                <button class="pf-edit-btn"   data-id="${h.id}" title="Edit">✏️</button>
                <button class="pf-delete-btn" data-id="${h.id}" title="Delete">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.pf-edit-btn').forEach(b =>
        b.onclick = () => startEdit(parseInt(b.dataset.id)));
    tbody.querySelectorAll('.pf-delete-btn').forEach(b =>
        b.onclick = () => deleteHolding(parseInt(b.dataset.id)));
}

/* ──────────────────────────────────────────────────────────────────
   RENDER: SUMMARY CARDS
   ────────────────────────────────────────────────────────────────── */

function renderSummary() {
    let totalCost = 0, totalValue = 0, hasPrice = false;

    holdings.forEach(h => {
        totalCost += h.qty * h.buyPrice;
        const cur = currentPrices[h.coinId];
        if (cur !== undefined) { totalValue += h.qty * cur; hasPrice = true; }
    });

    const pnl    = hasPrice ? totalValue - totalCost : null;
    const pnlPct = pnl !== null && totalCost > 0 ? (pnl / totalCost) * 100 : null;

    document.getElementById('pf-total-value').textContent =
        hasPrice ? fmt(totalValue) : '—';
    document.getElementById('pf-total-cost').textContent = fmt(totalCost);

    const pnlEl    = document.getElementById('pf-total-pnl');
    const pnlPctEl = document.getElementById('pf-total-pnl-pct');

    if (pnl !== null) {
        const sign = pnl >= 0 ? '+' : '';
        pnlEl.textContent    = sign + fmt(pnl);
        pnlPctEl.textContent = sign + pnlPct.toFixed(2) + '%';
        [pnlEl, pnlPctEl].forEach(el => {
            el.className = 'pf-card-value ' + (pnl >= 0 ? 'pos' : 'neg');
        });
        document.querySelector('.pf-card--pnl')?.classList.toggle('pf-card--pos', pnl >= 0);
        document.querySelector('.pf-card--pnl')?.classList.toggle('pf-card--neg', pnl < 0);
    } else {
        pnlEl.textContent = pnlPctEl.textContent = '—';
    }
}

/* ──────────────────────────────────────────────────────────────────
   RENDER: DONUT CHART
   ────────────────────────────────────────────────────────────────── */

let donutChart = null;
const PALETTE  = ['#F7931A','#627EEA','#26A17B','#E84142','#A855F7',
                  '#3B82F6','#F59E0B','#10B981','#EC4899','#6366F1'];

function renderDonut() {
    const wrap = document.getElementById('pf-alloc-wrap');
    if (!holdings.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';

    // Aggregate by coinId
    const map = {};
    holdings.forEach(h => {
        const cur = currentPrices[h.coinId];
        if (cur === undefined) return;
        if (!map[h.coinId]) map[h.coinId] = { name: h.name, value: 0 };
        map[h.coinId].value += h.qty * cur;
    });

    const entries = Object.values(map).filter(e => e.value > 0);
    if (!entries.length) { wrap.style.display = 'none'; return; }

    const labels = entries.map(e => e.name);
    const values = entries.map(e => e.value);
    const colors = entries.map((_, i) => PALETTE[i % PALETTE.length]);
    const total  = values.reduce((a, b) => a + b, 0);

    const ctx = document.getElementById('pf-donut').getContext('2d');
    if (donutChart) donutChart.destroy();

    donutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#0f1117',
                hoverOffset: 6
            }]
        },
        options: {
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx =>
                            ` ${fmt(ctx.parsed)} (${((ctx.parsed / total) * 100).toFixed(1)}%)`
                    }
                }
            },
            animation: { animateRotate: true, duration: 600 }
        }
    });

    // Custom legend
    const legend = document.getElementById('pf-legend');
    legend.innerHTML = entries.map((e, i) => `
        <div class="pf-legend-item">
            <span class="pf-legend-dot" style="background:${colors[i]}"></span>
            <span class="pf-legend-name">${e.name}</span>
            <span class="pf-legend-pct">${((e.value / total) * 100).toFixed(1)}%</span>
        </div>
    `).join('');
}

/* ──────────────────────────────────────────────────────────────────
   UTILS
   ────────────────────────────────────────────────────────────────── */

function fmt(n) {
    return '$' + n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}