import { createChart, CrosshairMode, LineStyle } from 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.1/+esm';

const API_KEY = "enter-your-api-key-here"; // Get a free API key from https://www.coingecko.com/en/api
const $ = id => document.getElementById(id); // DOM Selector helper

// --- Global Chart States ---
let myChartJS = null, lwChart = null, lwSeries = {}, currentMode = 'chartjs', lastPrices = [];

// --- Global Portfolio States ---
let holdings = JSON.parse(localStorage.getItem('cryptoPortfolio_v1')) || [];
let currentPrices = {}, editingId = null, donutChart = null;
const PALETTE = ['#F7931A','#627EEA','#26A17B','#E84142','#A855F7','#3B82F6','#F59E0B','#10B981','#EC4899','#6366F1'];

document.addEventListener('DOMContentLoaded', () => {
    injectToolbarUI();
    
    // Bind Portfolio Events
    $('add-btn').onclick = handleAddOrSave;
    $('cancel-btn').onclick = cancelEdit;
    $('refresh-btn').onclick = refreshPortfolio;
    refreshPortfolio();
});

// ================= CHART TRACKING LOGIC =================

function injectToolbarUI() {
    const headerSearch = document.querySelector('.search-container');
    const chartSection = $('chart-section');

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'chartToggleBtn';
    toggleBtn.title = 'Switch to TradingView lightweight chart';
    toggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> <span>Lite Chart</span>`;
    toggleBtn.onclick = toggleChartMode;
    headerSearch.appendChild(toggleBtn);

    const toolbar = document.createElement('div');
    toolbar.id = 'indicatorToolbar';
    toolbar.innerHTML = `<span class="toolbar-label">Indicators</span>
        <button class="ind-btn active" data-ind="ma">MA</button>
        <button class="ind-btn active" data-ind="volume">Volume</button>
        <button class="ind-btn" data-ind="rsi">RSI</button>
        <button class="ind-btn" data-ind="macd">MACD</button>`;
    chartSection.insertBefore(toolbar, chartSection.firstChild);

    toolbar.querySelectorAll('.ind-btn').forEach(btn => {
        btn.onclick = () => {
            btn.classList.toggle('active');
            if (lastPrices.length) renderLightweightChart(lastPrices);
        };
    });

    chartSection.insertAdjacentHTML('beforeend', `
        <div id="lwChartContainer"></div>
        <div id="subCharts">
            <div id="rsiContainer" class="sub-chart"></div>
            <div id="macdContainer" class="sub-chart"></div>
        </div>
    `);
}

window.fetchData = async function () {
    const coinId = $('coinSearch').value.toLowerCase().trim();
    try {
        const searchRes = await fetch("https://api.coingecko.com/api/v3/coins/list", { headers: { "x-cg-demo-api-key": API_KEY } });
        const coin = (await searchRes.json()).find(c => c.id === coinId || c.symbol === coinId);
        if (!coin) throw new Error("Coin not found. Use a valid ID (e.g., 'bitcoin').");

        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=30`, { headers: { "x-cg-demo-api-key": API_KEY } });
        if (!response.ok) throw new Error(response.status === 401 ? "Invalid API Key." : "Error fetching coin data.");

        lastPrices = (await response.json()).prices;
        currentMode === 'chartjs' ? renderChartJS(lastPrices, coin.id) : renderLightweightChart(lastPrices);
        performPrediction(lastPrices);
        
        const titleEl = document.querySelector('#prediction-section h2');
        if (titleEl) titleEl.textContent = `What price will ${coin.id.toUpperCase()} hit next?`;
    } catch (error) {
        alert(error.message);
    }
};

function renderChartJS(priceData, coinId) {
    $('priceChart').style.display = 'block';
    $('lwChartContainer').style.display = $('subCharts').style.display = $('indicatorToolbar').style.display = 'none';

    if (myChartJS) myChartJS.destroy();
    myChartJS = new Chart($('priceChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: priceData.map(p => new Date(p[0]).toLocaleDateString()),
            datasets: [{ label: `${coinId.toUpperCase()} Price (USD)`, data: priceData.map(p => p[1]), borderColor: 'hsl(45, 80%, 50%)', fill: false, tension: 0.1 }]
        },
        options: { responsive: true, plugins: { zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } } } }
    });
}

function renderLightweightChart(priceData) {
    $('priceChart').style.display = 'none';
    $('lwChartContainer').style.display = 'block';
    $('indicatorToolbar').style.display = 'flex';

    const active = Object.fromEntries([...document.querySelectorAll('.ind-btn')].map(b => [b.dataset.ind, b.classList.contains('active')]));
    $('subCharts').style.display = (active.rsi || active.macd) ? 'flex' : 'none';
    $('rsiContainer').style.display = active.rsi ? 'block' : 'none';
    $('macdContainer').style.display = active.macd ? 'block' : 'none';

    destroyLW();
    lwChart = createChart($('lwChartContainer'), chartOptions($('lwChartContainer')));
    
    lwSeries.main = lwChart.addAreaSeries({ lineColor: '#F7931A', topColor: 'rgba(247,147,26,0.35)', bottomColor: 'rgba(247,147,26,0.02)', lineWidth: 2 });
    const times = priceData.map(p => Math.floor(p[0] / 1000));
    const prices = priceData.map(p => p[1]);
    
    lwSeries.main.setData(dedupeByTime(priceData.map((p, i) => ({ time: times[i], value: prices[i] }))));

    if (active.ma) {
        [20, 50].forEach((period, i) => {
            lwChart.addLineSeries({ color: i === 0 ? '#3B82F6' : '#A855F7', lineWidth: 1, lineStyle: LineStyle.Dashed, title: `MA${period}`, lastValueVisible: true })
                   .setData(dedupeByTime(calcMA(prices, times, period)));
        });
    }

    if (active.volume) {
        const volSeries = lwChart.addHistogramSeries({ color: 'rgba(247,147,26,0.3)', priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
        lwChart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        volSeries.setData(dedupeByTime(priceData.map((p, i) => ({
            time: times[i], value: Math.abs(p[1] - (i > 0 ? prices[i - 1] : p[1])) * 1000, color: p[1] >= (i > 0 ? prices[i - 1] : p[1]) ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'
        }))));
    }
    lwChart.timeScale().fitContent();

    if (active.rsi) {
        lwSeries.rsiChart = createChart($('rsiContainer'), subChartOptions($('rsiContainer'), 'RSI (14)'));
        lwSeries.rsiChart.addLineSeries({ color: '#F59E0B', lineWidth: 1, title: 'RSI' }).setData(dedupeByTime(calcRSI(prices, times)));
        [70, 30].forEach(level => lwSeries.rsiChart.addLineSeries({ color: level === 70 ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)', lineWidth: 1, lineStyle: LineStyle.Dotted }).setData(dedupeByTime(times.map(t => ({ time: t, value: level })))));
        lwSeries.rsiChart.timeScale().fitContent();
    }

    if (active.macd) {
        lwSeries.macdChart = createChart($('macdContainer'), subChartOptions($('macdContainer'), 'MACD (12,26,9)'));
        const { macdLine, signalLine, histogram } = calcMACD(prices, times);
        lwSeries.macdChart.addLineSeries({ color: '#3B82F6', lineWidth: 1, title: 'MACD' }).setData(dedupeByTime(macdLine));
        lwSeries.macdChart.addLineSeries({ color: '#F43F5E', lineWidth: 1, title: 'Signal' }).setData(dedupeByTime(signalLine));
        lwSeries.macdChart.addHistogramSeries({ title: 'Hist', priceLineVisible: false }).setData(dedupeByTime(histogram));
        lwSeries.macdChart.timeScale().fitContent();
    }
}

function toggleChartMode() {
    const btn = $('chartToggleBtn');
    currentMode = currentMode === 'chartjs' ? 'lightweight' : 'chartjs';
    btn.classList.toggle('active');
    btn.title = currentMode === 'chartjs' ? 'Switch to TradingView lightweight chart' : 'Switch back to Chart.js';

    destroyLW();
    if (lastPrices.length) {
        currentMode === 'chartjs' ? renderChartJS(lastPrices, $('coinSearch').value.trim()) : renderLightweightChart(lastPrices);
    } else {
        $('priceChart').style.display = currentMode === 'chartjs' ? 'block' : 'none';
        $('lwChartContainer').style.display = currentMode === 'lightweight' ? 'block' : 'none';
        $('indicatorToolbar').style.display = currentMode === 'lightweight' ? 'flex' : 'none';
        $('subCharts').style.display = 'none';
    }
}

function destroyLW() {
    ['rsiChart', 'macdChart'].forEach(c => lwSeries[c]?.remove());
    if (lwChart) lwChart.remove();
    lwChart = null; lwSeries = {};
}

function chartOptions(c) { return { width: c.clientWidth, height: 380, layout: { background: { color: '#0f1117' }, textColor: '#9CA3AF' }, grid: { vertLines: { color: '#1F2937' }, horzLines: { color: '#1F2937' } }, crosshair: { mode: CrosshairMode.Normal } }; }
function subChartOptions(c, t) { return { ...chartOptions(c), height: 140, watermark: { text: t, color: 'rgba(255,255,255,0.06)', fontSize: 14, horzAlign: 'left', vertAlign: 'top' } }; }
function dedupeByTime(arr) { const seen = new Set(); return arr.filter(d => seen.has(d.time) ? false : seen.add(d.time)).sort((a, b) => a.time - b.time); }

// --- Indicator Math Helpers ---
function calcMA(p, t, per) { return p.slice(per - 1).map((_, i) => ({ time: t[i + per - 1], value: p.slice(i, i + per).reduce((a, b) => a + b, 0) / per })); }
function calcEMA(p, per) { const k = 2 / (per + 1); return p.reduce((acc, val, i) => (acc.push(i === 0 ? val : val * k + acc[i - 1] * (1 - k)), acc), []); }
function calcRSI(p, t, per = 14) { 
    return p.slice(per).map((_, i) => {
        let g = 0, l = 0;
        for (let j = i + 1; j <= i + per; j++) { const d = p[j] - p[j - 1]; d >= 0 ? (g += d) : (l -= d); }
        return { time: t[i + per], value: l === 0 ? 100 : 100 - (100 / (1 + (g / l))) };
    });
}
function calcMACD(p, t, f = 12, s = 26, sig = 9) {
    const macdV = calcEMA(p, f).map((v, i) => v - calcEMA(p, s)[i]);
    const sigV = calcEMA(macdV.slice(s - 1), sig);
    const mLine = macdV.slice(s - 1).map((v, i) => ({ time: t[i + s - 1], value: v }));
    const sLine = sigV.map((v, i) => ({ time: t[i + s + sig - 2], value: v }));
    return { macdLine: mLine, signalLine: sLine, histogram: sLine.map((sv, i) => { const mv = mLine[i + sig - 1]; return mv ? { time: sv.time, value: mv.value - sv.value, color: mv.value >= sv.value ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)' } : null; }).filter(Boolean) };
}

function performPrediction(prices) {
    const n = prices.length; let [sX, sY, sXY, sXX] = [0, 0, 0, 0];
    prices.forEach((p, i) => { sX += i; sY += p[1]; sXY += i * p[1]; sXX += i * i; });
    $('predictionResult').innerText = `Predicted next price point: $${(((n * sXY - sX * sY) / (n * sXX - sX * sX)) * n + (sY - ((n * sXY - sX * sY) / (n * sXX - sX * sX)) * sX) / n).toFixed(2)}`;
}

// ================= PORTFOLIO LOGIC =================

const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const saveHoldings = () => localStorage.setItem('cryptoPortfolio_v1', JSON.stringify(holdings));

async function handleAddOrSave() {
    const coinId = $('coin-input').value.trim().toLowerCase(), qty = parseFloat($('qty-input').value), price = parseFloat($('price-input').value);
    
    if (!coinId || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) return alert('Fill in valid Coin ID, Quantity, and Buy Price.');
    
    $('add-btn').textContent = 'Loading…'; $('add-btn').disabled = true;

    try {
        const coin = (await (await fetch('https://api.coingecko.com/api/v3/coins/list', { headers: { 'x-cg-demo-api-key': API_KEY } })).json()).find(c => c.id === coinId || c.symbol === coinId);
        if (!coin) throw new Error('Coin not found.');

        const data = { coinId: coin.id, name: coin.name, symbol: coin.symbol.toUpperCase(), qty, buyPrice: price, buyDate: $('date-input').value };
        editingId ? Object.assign(holdings.find(h => h.id === editingId), data) : holdings.push({ id: Date.now(), ...data });
        
        editingId = null; saveHoldings(); clearForm(); await refreshPortfolio();
    } catch (e) { alert(e.message); } 
    finally { $('add-btn').textContent = 'Add'; $('add-btn').disabled = false; }
}

function clearForm() {
    ['coin-input', 'qty-input', 'price-input', 'date-input'].forEach(id => $(id).value = '');
    $('form-title').textContent = 'Add Holding';
    $('add-btn').textContent = 'Add';
    $('cancel-btn').style.display = 'none';
    editingId = null;
}

window.deleteHolding = id => {
    if (!confirm('Remove holding?')) return;
    holdings = holdings.filter(h => h.id !== id); saveHoldings(); refreshPortfolio();
};

window.startEdit = id => {
    const h = holdings.find(h => h.id === id); if (!h) return;
    editingId = id;
    $('coin-input').value = h.coinId; $('qty-input').value = h.qty;
    $('price-input').value = h.buyPrice; $('date-input').value = h.buyDate || '';
    $('form-title').textContent = `Edit — ${h.name}`;
    $('add-btn').textContent = 'Save'; $('cancel-btn').style.display = 'inline-flex';
    $('portfolio-section').scrollIntoView({ behavior: 'smooth' });
};

function cancelEdit() { clearForm(); }

async function refreshPortfolio() {
    if (!holdings.length) return renderPortfolio();

    try {
        const ids = [...new Set(holdings.map(h => h.coinId))].join(',');
        const data = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { headers: { 'x-cg-demo-api-key': API_KEY } })).json();
        holdings.forEach(h => { if (data[h.coinId]) currentPrices[h.coinId] = data[h.coinId].usd; });
    } catch { /* Suppress price update fail */ }
    renderPortfolio();
}

function renderPortfolio() {
    // 1. Render Table
    $('empty-state').style.display = holdings.length ? 'none' : 'block';
    $('portfolio-table').style.display = holdings.length ? 'table' : 'none';
    
    $('portfolio-tbody').innerHTML = holdings.map(h => {
        const cur = currentPrices[h.coinId] ?? null, cost = h.qty * h.buyPrice, val = cur !== null ? h.qty * cur : null;
        const pnl = val !== null ? val - cost : null, pnlClass = pnl === null ? '' : pnl >= 0 ? 'pos' : 'neg';
        return `<tr>
            <td><span class="coin-badge">${h.symbol}</span> ${h.name}</td>
            <td>${h.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
            <td>${fmt(h.buyPrice)}</td>
            <td>${cur ? fmt(cur) : '<span class="na-value">—</span>'}</td>
            <td>${val ? fmt(val) : '<span class="na-value">—</span>'}</td>
            <td>${fmt(cost)}</td>
            <td class="${pnlClass}">${pnl !== null ? (pnl >= 0 ? '+' : '') + fmt(pnl) : '<span class="na-value">—</span>'}</td>
            <td class="${pnlClass}">${pnl !== null ? (pnl >= 0 ? '+' : '') + (pnl / cost * 100).toFixed(2) + '%' : '<span class="na-value">—</span>'}</td>
            <td>${h.buyDate || '<span class="na-value">—</span>'}</td>
            <td class="action-btns"><button class="edit-btn" onclick="startEdit(${h.id})">✏️</button><button class="delete-btn" onclick="deleteHolding(${h.id})">🗑️</button></td>
        </tr>`;
    }).join('');

    // 2. Render Summary
    let totalCost = 0, totalVal = 0, hasPrice = false;
    holdings.forEach(h => { totalCost += h.qty * h.buyPrice; if (currentPrices[h.coinId]) { totalVal += h.qty * currentPrices[h.coinId]; hasPrice = true; }});
    
    const totPnl = hasPrice ? totalVal - totalCost : null;
    $('total-value').textContent = hasPrice ? fmt(totalVal) : '—';
    $('total-cost').textContent = fmt(totalCost);
    $('total-pnl').textContent = totPnl !== null ? (totPnl >= 0 ? '+' : '') + fmt(totPnl) : '—';
    $('total-pnl-pct').textContent = totPnl !== null ? (totPnl >= 0 ? '+' : '') + (totPnl / totalCost * 100).toFixed(2) + '%' : '—';
    ['total-pnl', 'total-pnl-pct'].forEach(id => $(id).className = `card-value ${totPnl >= 0 ? 'pos' : 'neg'}`);

    // 3. Render Chart
    const alloc = Object.values(holdings.reduce((acc, h) => {
        if (currentPrices[h.coinId]) acc[h.coinId] = { name: h.name, val: (acc[h.coinId]?.val || 0) + h.qty * currentPrices[h.coinId] };
        return acc;
    }, {})).filter(e => e.val > 0);

    $('allocation-wrapper').style.display = alloc.length ? 'flex' : 'none';
    if (!alloc.length) return;

    if (donutChart) donutChart.destroy();
    donutChart = new Chart($('donut-chart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: alloc.map(e => e.name), datasets: [{ data: alloc.map(e => e.val), backgroundColor: alloc.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 2, borderColor: '#0f1117' }] },
        options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmt(c.parsed)} (${(c.parsed / alloc.reduce((s, a) => s + a.val, 0) * 100).toFixed(1)}%)` } } } }
    });

    $('donut-legend').innerHTML = alloc.map((e, i) => `<div class="legend-item"><span class="legend-dot" style="background:${PALETTE[i % PALETTE.length]}"></span><span class="legend-name">${e.name}</span><span class="legend-pct">${(e.val / alloc.reduce((s, a) => s + a.val, 0) * 100).toFixed(1)}%</span></div>`).join('');
}