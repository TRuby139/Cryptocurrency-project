const API_KEY = "enter-your-api-key-here";  // Get a free key at https://www.coingecko.com/en/api   

const STORAGE_KEY = 'cryptoPortfolio_v1';

function loadHoldings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}

function saveHoldings(holdings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

let holdings = loadHoldings();   // [{ id, coinId, name, symbol, qty, buyPrice, buyDate }]
let currentPrices = {};          // { coinId: price }
let editingId = null;            // id of holding being edited

export function initPortfolio() {
    injectPortfolioHTML();
    injectPortfolioStyles();
    bindEvents();
    refresh();
}

function injectPortfolioHTML() {
    const main = document.querySelector('main');

    const section = document.createElement('section');
    section.id = 'portfolio-section';
    section.innerHTML = `
        <div class="pf-header">
            <div class="pf-title-row">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                    <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
                <h2>Portfolio</h2>
                <button id="pf-refresh-btn" title="Refresh prices">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    Refresh
                </button>
            </div>

            <!-- Summary cards -->
            <div class="pf-summary">
                <div class="pf-card">
                    <span class="pf-card-label">Total Value</span>
                    <span class="pf-card-value" id="pf-total-value">—</span>
                </div>
                <div class="pf-card">
                    <span class="pf-card-label">Total Cost</span>
                    <span class="pf-card-value" id="pf-total-cost">—</span>
                </div>
                <div class="pf-card pf-card--pnl">
                    <span class="pf-card-label">Total P&L</span>
                    <span class="pf-card-value" id="pf-total-pnl">—</span>
                </div>
                <div class="pf-card pf-card--pnl">
                    <span class="pf-card-label">P&L %</span>
                    <span class="pf-card-value" id="pf-total-pnl-pct">—</span>
                </div>
            </div>
        </div>

        <!-- Add / Edit form -->
        <div class="pf-form-wrap">
            <div class="pf-form-title" id="pf-form-title">Add Holding</div>
            <div class="pf-form">
                <input id="pf-coin-input"  type="text"   placeholder="Coin ID (e.g. bitcoin)" autocomplete="off"/>
                <input id="pf-qty-input"   type="number" placeholder="Quantity"  min="0" step="any"/>
                <input id="pf-price-input" type="number" placeholder="Buy Price (USD)" min="0" step="any"/>
                <input id="pf-date-input"  type="date"   title="Purchase date (optional)"/>
                <button id="pf-add-btn">Add</button>
                <button id="pf-cancel-btn" style="display:none">Cancel</button>
            </div>
        </div>

        <!-- Holdings table -->
        <div class="pf-table-wrap">
            <div id="pf-empty" class="pf-empty">No holdings yet. Add your first coin above.</div>
            <table id="pf-table" style="display:none">
                <thead>
                    <tr>
                        <th>Coin</th>
                        <th>Qty</th>
                        <th>Buy Price</th>
                        <th>Current Price</th>
                        <th>Value</th>
                        <th>Cost</th>
                        <th>P&L</th>
                        <th>P&L %</th>
                        <th>Date</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="pf-tbody"></tbody>
            </table>
        </div>

        <!-- Donut allocation chart -->
        <div id="pf-alloc-wrap" class="pf-alloc-wrap" style="display:none">
            <div class="pf-alloc-title">Allocation</div>
            <div class="pf-alloc-inner">
                <canvas id="pf-donut" width="200" height="200"></canvas>
                <div id="pf-legend" class="pf-legend"></div>
            </div>
        </div>
    `;

    main.appendChild(section);
}

function bindEvents() {
    document.getElementById('pf-add-btn').onclick    = handleAddOrSave;
    document.getElementById('pf-cancel-btn').onclick = cancelEdit;
    document.getElementById('pf-refresh-btn').onclick = refresh;
}

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
    btn.disabled = true;

    try {
        // Resolve coin metadata
        const listRes = await fetch('https://api.coingecko.com/api/v3/coins/list', {
            headers: { 'x-cg-demo-api-key': API_KEY }
        });
        const list = await listRes.json();
        const coin = list.find(c => c.id === coinRaw || c.symbol === coinRaw);
        if (!coin) throw new Error('Coin not found.');

        if (editingId !== null) {
            const idx = holdings.findIndex(h => h.id === editingId);
            if (idx !== -1) {
                holdings[idx] = { ...holdings[idx], coinId: coin.id, name: coin.name, symbol: coin.symbol.toUpperCase(), qty, buyPrice, buyDate };
            }
            editingId = null;
        } else {
            holdings.push({
                id: Date.now(),
                coinId: coin.id,
                name: coin.name,
                symbol: coin.symbol.toUpperCase(),
                qty,
                buyPrice,
                buyDate
            });
        }

        saveHoldings(holdings);
        clearForm();
        await refresh();

    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.textContent = editingId !== null ? 'Save' : 'Add';
        btn.disabled = false;
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
    document.getElementById('pf-form-title').textContent = `Edit — ${h.name}`;
    document.getElementById('pf-add-btn').textContent    = 'Save';
    document.getElementById('pf-cancel-btn').style.display = 'inline-flex';

    document.getElementById('portfolio-section').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    clearForm();
}

function clearForm() {
    ['pf-coin-input','pf-qty-input','pf-price-input','pf-date-input'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('pf-form-title').textContent = 'Add Holding';
    document.getElementById('pf-add-btn').textContent    = 'Add';
    document.getElementById('pf-cancel-btn').style.display = 'none';
}

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
    tbody.innerHTML = '';

    holdings.forEach(h => {
        const curPrice = currentPrices[h.coinId] ?? null;
        const cost     = h.qty * h.buyPrice;
        const value    = curPrice !== null ? h.qty * curPrice : null;
        const pnl      = value !== null ? value - cost : null;
        const pnlPct   = pnl  !== null ? (pnl / cost) * 100 : null;

        const pnlClass = pnl === null ? '' : pnl >= 0 ? 'pos' : 'neg';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="pf-coin-badge">${h.symbol}</span> ${h.name}</td>
            <td>${h.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
            <td>${fmt(h.buyPrice)}</td>
            <td>${curPrice !== null ? fmt(curPrice) : '<span class="pf-na">—</span>'}</td>
            <td>${value   !== null ? fmt(value)    : '<span class="pf-na">—</span>'}</td>
            <td>${fmt(cost)}</td>
            <td class="${pnlClass}">${pnl !== null ? (pnl >= 0 ? '+' : '') + fmt(pnl) : '<span class="pf-na">—</span>'}</td>
            <td class="${pnlClass}">${pnlPct !== null ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '<span class="pf-na">—</span>'}</td>
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

let donutChart = null;
const PALETTE = ['#F7931A','#627EEA','#26A17B','#E84142','#A855F7','#3B82F6','#F59E0B','#10B981','#EC4899','#6366F1'];

function renderDonut() {
    const wrap = document.getElementById('pf-alloc-wrap');
    if (!holdings.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';

    // Aggregate by coinId (in case of multiple entries of same coin)
    const map = {};
    holdings.forEach(h => {
        const cur = currentPrices[h.coinId];
        if (cur === undefined) return;
        map[h.coinId] = (map[h.coinId] || { name: h.name, value: 0 });
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
            datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#0f1117', hoverOffset: 6 }]
        },
        options: {
            cutout: '68%',
            plugins: { legend: { display: false }, tooltip: {
                callbacks: {
                    label: ctx => ` ${fmt(ctx.parsed)} (${((ctx.parsed / total) * 100).toFixed(1)}%)`
                }
            }},
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

function fmt(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function injectPortfolioStyles() {
    const s = document.createElement('style');
    s.textContent = `
    #portfolio-section {
        margin: 32px auto 0;
        max-width: 1100px;
        background: #0f1117;
        border: 1px solid #1F2937;
        border-radius: 16px;
        overflow: hidden;
        font-family: inherit;
    }

    .pf-header { padding: 20px 24px 0; }
    .pf-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 18px;
    }
    .pf-title-row h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: #F3F4F6;
        flex: 1;
    }
    .pf-title-row svg { color: #F7931A; flex-shrink: 0; }

    #pf-refresh-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border: 1.5px solid #374151;
        border-radius: 7px;
        background: transparent;
        color: #9CA3AF;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
    }
    #pf-refresh-btn:hover { border-color: #F7931A; color: #F7931A; }

    .pf-summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 20px;
    }
    @media (max-width: 700px) { .pf-summary { grid-template-columns: repeat(2,1fr); } }

    .pf-card {
        background: #161B22;
        border: 1px solid #1F2937;
        border-radius: 10px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .pf-card-label { font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: .06em; }
    .pf-card-value { font-size: 20px; font-weight: 700; color: #F3F4F6; }
    .pf-card-value.pos { color: #22C55E; }
    .pf-card-value.neg { color: #EF4444; }
    .pf-card--pnl { border-color: #374151; }

    .pf-form-wrap { padding: 0 24px 16px; border-bottom: 1px solid #1F2937; }
    .pf-form-title { font-size: 13px; font-weight: 600; color: #9CA3AF; margin-bottom: 10px; text-transform: uppercase; letter-spacing: .06em; }
    .pf-form {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
    }
    .pf-form input {
        flex: 1 1 140px;
        padding: 9px 12px;
        background: #161B22;
        border: 1.5px solid #374151;
        border-radius: 8px;
        color: #F3F4F6;
        font-size: 13px;
        outline: none;
        transition: border-color .15s;
        min-width: 0;
    }
    .pf-form input::placeholder { color: #4B5563; }
    .pf-form input:focus { border-color: #F7931A; }
    .pf-form input[type="date"] { color-scheme: dark; }

    #pf-add-btn {
        padding: 9px 20px;
        background: #F7931A;
        border: none;
        border-radius: 8px;
        color: #0f1117;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity .15s, transform .1s;
        white-space: nowrap;
    }
    #pf-add-btn:hover { opacity: .88; transform: translateY(-1px); }
    #pf-add-btn:disabled { opacity: .5; cursor: not-allowed; }

    #pf-cancel-btn {
        padding: 9px 16px;
        background: transparent;
        border: 1.5px solid #374151;
        border-radius: 8px;
        color: #9CA3AF;
        font-size: 13px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        transition: border-color .15s, color .15s;
    }
    #pf-cancel-btn:hover { border-color: #EF4444; color: #EF4444; }

    .pf-table-wrap { overflow-x: auto; }
    #pf-empty {
        padding: 32px;
        text-align: center;
        color: #4B5563;
        font-size: 14px;
    }
    #pf-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }
    #pf-table thead tr {
        background: #161B22;
        border-bottom: 1px solid #1F2937;
    }
    #pf-table th {
        padding: 11px 14px;
        text-align: left;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: #6B7280;
        white-space: nowrap;
    }
    #pf-table td {
        padding: 12px 14px;
        color: #D1D5DB;
        border-bottom: 1px solid #1a2030;
        white-space: nowrap;
    }
    #pf-table tbody tr:hover { background: rgba(255,255,255,0.025); }
    #pf-table td.pos { color: #22C55E; font-weight: 600; }
    #pf-table td.neg { color: #EF4444; font-weight: 600; }
    .pf-na { color: #374151; }
    .pf-coin-badge {
        display: inline-block;
        padding: 2px 6px;
        background: rgba(247,147,26,0.15);
        border: 1px solid rgba(247,147,26,0.3);
        border-radius: 4px;
        color: #F7931A;
        font-size: 10px;
        font-weight: 700;
        margin-right: 4px;
    }

    .pf-actions { display: flex; gap: 4px; }
    .pf-edit-btn, .pf-delete-btn {
        background: transparent;
        border: 1px solid #1F2937;
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 13px;
        transition: border-color .15s, background .15s;
    }
    .pf-edit-btn:hover   { border-color: #3B82F6; background: rgba(59,130,246,0.1); }
    .pf-delete-btn:hover { border-color: #EF4444; background: rgba(239,68,68,0.1); }

    .pf-alloc-wrap {
        padding: 20px 24px 24px;
        border-top: 1px solid #1F2937;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .pf-alloc-title { font-size: 13px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: .06em; }
    .pf-alloc-inner { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; }
    #pf-donut { width: 160px !important; height: 160px !important; flex-shrink: 0; }

    .pf-legend { display: flex; flex-direction: column; gap: 8px; }
    .pf-legend-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .pf-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .pf-legend-name { color: #D1D5DB; flex: 1; }
    .pf-legend-pct  { color: #9CA3AF; font-variant-numeric: tabular-nums; }
    `;
    document.head.appendChild(s);
}