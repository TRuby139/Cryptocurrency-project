import { createChart, CrosshairMode, LineStyle } from 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.1/+esm';

let myChartJS = null;          // Chart.js instance
let lwChart = null;            // Lightweight-charts instance
let lwSeries = {};             // Named series inside lwChart
let currentMode = 'chartjs';   // 'chartjs' | 'lightweight'
let lastPrices = [];           // Cache last fetched prices for mode-switch

const API_KEY = "enter your coingecko api key here"; // Replace with your CoinGecko API key

document.addEventListener('DOMContentLoaded', () => {
    injectUI();
});

function injectUI() {
    // --- Toggle button (placed in <header> next to the existing button) ---
    const header = document.querySelector('header');

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'chartToggleBtn';
    toggleBtn.title = 'Switch to TradingView lightweight chart';
    toggleBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <span>Lite Chart</span>
    `;
    toggleBtn.onclick = toggleChartMode;
    header.querySelector('.search-container').appendChild(toggleBtn);

    // --- Indicator toolbar (hidden until lightweight mode is active) ---
    const chartSection = document.getElementById('chart-section');

    const toolbar = document.createElement('div');
    toolbar.id = 'indicatorToolbar';
    toolbar.innerHTML = `
        <span class="toolbar-label">Indicators</span>
        <button class="ind-btn active" data-ind="ma">MA</button>
        <button class="ind-btn active" data-ind="volume">Volume</button>
        <button class="ind-btn" data-ind="rsi">RSI</button>
        <button class="ind-btn" data-ind="macd">MACD</button>
    `;
    chartSection.insertBefore(toolbar, chartSection.firstChild);

    // Indicator toggle logic
    toolbar.querySelectorAll('.ind-btn').forEach(btn => {
        btn.onclick = () => {
            btn.classList.toggle('active');
            if (lastPrices.length) renderLightweightChart(lastPrices);
        };
    });

    // Lightweight chart container (hidden by default)
    const lwContainer = document.createElement('div');
    lwContainer.id = 'lwChartContainer';
    chartSection.appendChild(lwContainer);

    // RSI + MACD sub-chart containers
    const subCharts = document.createElement('div');
    subCharts.id = 'subCharts';
    subCharts.innerHTML = `
        <div id="rsiContainer" class="sub-chart"></div>
        <div id="macdContainer" class="sub-chart"></div>
    `;
    chartSection.appendChild(subCharts);

    injectStyles();
}

window.fetchData = async function () {
    const coinId = document.getElementById('coinSearch').value.toLowerCase().trim();
    const predictionText = document.getElementById('predictionResult');

    try {
        const searchRes = await fetch("https://api.coingecko.com/api/v3/coins/list", {
            headers: { "x-cg-demo-api-key": API_KEY }
        });
        const searchData = await searchRes.json();
        const coin = searchData.find(c => c.id === coinId || c.symbol === coinId);
        if (!coin) throw new Error("Coin not found. Please use a valid ID (e.g., 'bitcoin').");

        const url = `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=30`;
        const response = await fetch(url, { headers: { "x-cg-demo-api-key": API_KEY } });

        if (!response.ok) {
            if (response.status === 401) throw new Error("Invalid API Key.");
            if (response.status === 404) throw new Error("Coin not found.");
            if (response.status === 429) throw new Error("Rate limit exceeded. Please wait.");
            throw new Error("System error. Please try again later.");
        }

        const data = await response.json();
        lastPrices = data.prices;

        if (currentMode === 'chartjs') {
            renderChartJS(lastPrices, coin.id);
        } else {
            renderLightweightChart(lastPrices);
        }

        performPrediction(lastPrices);

        // Update indicator section title
        const h2 = document.querySelector('#prediction-section h2');
        if (h2) h2.textContent = `What price will ${coin.id.toUpperCase()} hit next?`;

    } catch (error) {
        alert("Error: " + error.message);
        predictionText.innerText = "Operation failed. " + error.message;
    }
};

function renderChartJS(priceData, coinId) {
    const canvas = document.getElementById('priceChart');
    canvas.style.display = 'block';
    document.getElementById('lwChartContainer').style.display = 'none';
    document.getElementById('subCharts').style.display = 'none';
    document.getElementById('indicatorToolbar').style.display = 'none';

    const context = canvas.getContext('2d');
    const labels = priceData.map(p => new Date(p[0]).toLocaleDateString());
    const dataPoints = priceData.map(p => p[1]);

    if (myChartJS) myChartJS.destroy();

    myChartJS = new Chart(context, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `${coinId.toUpperCase()} Price (USD)`,
                data: dataPoints,
                borderColor: 'hsl(45, 80%, 50%)',
                fill: false,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                zoom: {
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
                    pan: { enabled: true, mode: 'x' }
                }
            }
        }
    });
}

function renderLightweightChart(priceData) {
    const canvas = document.getElementById('priceChart');
    canvas.style.display = 'none';
    const lwContainer = document.getElementById('lwChartContainer');
    lwContainer.style.display = 'block';
    document.getElementById('indicatorToolbar').style.display = 'flex';

    // Which indicators are active?
    const active = {};
    document.querySelectorAll('.ind-btn').forEach(b => {
        active[b.dataset.ind] = b.classList.contains('active');
    });

    // Show/hide sub-chart container
    const showRSI = active['rsi'];
    const showMACD = active['macd'];
    const subCharts = document.getElementById('subCharts');
    subCharts.style.display = (showRSI || showMACD) ? 'flex' : 'none';
    document.getElementById('rsiContainer').style.display = showRSI ? 'block' : 'none';
    document.getElementById('macdContainer').style.display = showMACD ? 'block' : 'none';

    // Destroy old instances
    destroyLW();

    lwChart = createChart(lwContainer, chartOptions(lwContainer));

    const areaSeries = lwChart.addAreaSeries({
        lineColor: '#F7931A',
        topColor: 'rgba(247,147,26,0.35)',
        bottomColor: 'rgba(247,147,26,0.02)',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        priceLineVisible: true,
    });

    const lineData = priceData.map(p => ({ time: Math.floor(p[0] / 1000), value: p[1] }));
    areaSeries.setData(dedupeByTime(lineData));

    if (active['ma']) {
        const prices = priceData.map(p => p[1]);
        const times = priceData.map(p => Math.floor(p[0] / 1000));

        [20, 50].forEach((period, i) => {
            const maData = calcMA(prices, times, period);
            const maSeries = lwChart.addLineSeries({
                color: i === 0 ? '#3B82F6' : '#A855F7',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                title: `MA${period}`,
                priceLineVisible: false,
                lastValueVisible: true,
            });
            maSeries.setData(dedupeByTime(maData));
        });
    }

    if (active['volume']) {
        const volSeries = lwChart.addHistogramSeries({
            color: 'rgba(247,147,26,0.3)',
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        lwChart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        // Simulate volume as % change * scale (CoinGecko free tier doesn't give volume per-tick)
        const volData = priceData.map((p, i) => {
            const prev = i > 0 ? priceData[i - 1][1] : p[1];
            const change = Math.abs(p[1] - prev);
            return { time: Math.floor(p[0] / 1000), value: change * 1000, color: p[1] >= prev ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)' };
        });
        volSeries.setData(dedupeByTime(volData));
    }

    lwChart.timeScale().fitContent();
    lwSeries.main = areaSeries;

    if (showRSI) {
        const rsiContainer = document.getElementById('rsiContainer');
        const rsiChart = createChart(rsiContainer, subChartOptions(rsiContainer, 'RSI (14)'));
        const rsiLine = rsiChart.addLineSeries({ color: '#F59E0B', lineWidth: 1, title: 'RSI' });

        const prices = priceData.map(p => p[1]);
        const times = priceData.map(p => Math.floor(p[0] / 1000));
        const rsiData = calcRSI(prices, times, 14);
        rsiLine.setData(dedupeByTime(rsiData));

        // Overbought / Oversold reference lines
        [70, 30].forEach(level => {
            const refLine = rsiChart.addLineSeries({
                color: level === 70 ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)',
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                priceLineVisible: false,
                lastValueVisible: false,
            });
            refLine.setData(dedupeByTime(times.map(t => ({ time: t, value: level }))));
        });

        rsiChart.timeScale().fitContent();
        lwSeries.rsiChart = rsiChart;
    }

    if (showMACD) {
        const macdContainer = document.getElementById('macdContainer');
        const macdChart = createChart(macdContainer, subChartOptions(macdContainer, 'MACD (12,26,9)'));

        const prices = priceData.map(p => p[1]);
        const times = priceData.map(p => Math.floor(p[0] / 1000));
        const { macdLine, signalLine, histogram } = calcMACD(prices, times);

        const macdSeries = macdChart.addLineSeries({ color: '#3B82F6', lineWidth: 1, title: 'MACD' });
        const signalSeries = macdChart.addLineSeries({ color: '#F43F5E', lineWidth: 1, title: 'Signal' });
        const histSeries = macdChart.addHistogramSeries({ title: 'Hist', priceLineVisible: false });

        macdSeries.setData(dedupeByTime(macdLine));
        signalSeries.setData(dedupeByTime(signalLine));
        histSeries.setData(dedupeByTime(histogram));

        macdChart.timeScale().fitContent();
        lwSeries.macdChart = macdChart;
    }
}

function destroyLW() {
    if (lwSeries.rsiChart) { lwSeries.rsiChart.remove(); }
    if (lwSeries.macdChart) { lwSeries.macdChart.remove(); }
    if (lwChart) { lwChart.remove(); }
    lwChart = null;
    lwSeries = {};
}

function toggleChartMode() {
    const btn = document.getElementById('chartToggleBtn');
    if (currentMode === 'chartjs') {
        currentMode = 'lightweight';
        btn.classList.add('active');
        btn.title = 'Switch back to Chart.js';
        if (lastPrices.length) renderLightweightChart(lastPrices);
        else {
            document.getElementById('priceChart').style.display = 'none';
            document.getElementById('lwChartContainer').style.display = 'block';
            document.getElementById('indicatorToolbar').style.display = 'flex';
        }
    } else {
        currentMode = 'chartjs';
        btn.classList.remove('active');
        btn.title = 'Switch to TradingView lightweight chart';
        destroyLW();
        if (lastPrices.length) renderChartJS(lastPrices, document.getElementById('coinSearch').value.trim());
        else {
            document.getElementById('priceChart').style.display = 'block';
            document.getElementById('lwChartContainer').style.display = 'none';
            document.getElementById('subCharts').style.display = 'none';
            document.getElementById('indicatorToolbar').style.display = 'none';
        }
    }
}

function chartOptions(container) {
    return {
        width: container.clientWidth,
        height: 380,
        layout: { background: { color: '#0f1117' }, textColor: '#9CA3AF' },
        grid: { vertLines: { color: '#1F2937' }, horzLines: { color: '#1F2937' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#374151' },
        timeScale: { borderColor: '#374151', timeVisible: true, secondsVisible: false },
        handleScroll: true,
        handleScale: true,
    };
}

function subChartOptions(container, title) {
    return {
        ...chartOptions(container),
        height: 140,
        watermark: { text: title, color: 'rgba(255,255,255,0.06)', fontSize: 14, horzAlign: 'left', vertAlign: 'top' },
    };
}

// ─── Technical Indicator Math ──────────────────────────────────────────────────

function dedupeByTime(arr) {
    const seen = new Set();
    return arr.filter(d => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
    }).sort((a, b) => a.time - b.time);
}

function calcMA(prices, times, period) {
    const result = [];
    for (let i = period - 1; i < prices.length; i++) {
        const avg = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        result.push({ time: times[i], value: avg });
    }
    return result;
}

function calcEMA(prices, period) {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
        ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calcRSI(prices, times, period = 14) {
    const result = [];
    for (let i = period; i < prices.length; i++) {
        let gains = 0, losses = 0;
        for (let j = i - period + 1; j <= i; j++) {
            const diff = prices[j] - prices[j - 1];
            if (diff >= 0) gains += diff; else losses -= diff;
        }
        const rs = losses === 0 ? 100 : gains / losses;
        result.push({ time: times[i], value: 100 - 100 / (1 + rs) });
    }
    return result;
}

function calcMACD(prices, times, fast = 12, slow = 26, signal = 9) {
    const emaFast = calcEMA(prices, fast);
    const emaSlow = calcEMA(prices, slow);
    const macdValues = emaFast.map((v, i) => v - emaSlow[i]);
    const signalValues = calcEMA(macdValues.slice(slow - 1), signal);

    const offset = slow - 1;
    const macdLine = macdValues.slice(offset).map((v, i) => ({ time: times[i + offset], value: v }));
    const signalLine = signalValues.map((v, i) => ({ time: times[i + offset + (signal - 1)], value: v }));
    const histogram = signalLine.map((s, i) => {
        const m = macdLine[i + (signal - 1)];
        return m ? { time: s.time, value: m.value - s.value, color: m.value >= s.value ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)' } : null;
    }).filter(Boolean);

    return { macdLine, signalLine, histogram };
}

function performPrediction(prices) {
    const n = prices.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    prices.forEach((p, index) => {
        sumX += index; sumY += p[1]; sumXY += index * p[1]; sumXX += index * index;
    });
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const nextPrice = slope * n + intercept;
    document.getElementById('predictionResult').innerText = `Predicted next price point: $${nextPrice.toFixed(2)}`;
}

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Toggle button */
        #chartToggleBtn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 14px;
            background: transparent;
            border: 1.5px solid rgba(247,147,26,0.45);
            border-radius: 8px;
            color: #F7931A;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-left: 8px;
        }
        #chartToggleBtn:hover {
            background: rgba(247,147,26,0.12);
            border-color: #F7931A;
        }
        #chartToggleBtn.active {
            background: rgba(247,147,26,0.18);
            border-color: #F7931A;
            color: #FFA940;
            box-shadow: 0 0 12px rgba(247,147,26,0.25);
        }
        #chartToggleBtn svg { flex-shrink: 0; }

        /* Indicator toolbar */
        #indicatorToolbar {
            display: none;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: rgba(15,17,23,0.8);
            border-bottom: 1px solid #1F2937;
            flex-wrap: wrap;
        }
        .toolbar-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #6B7280;
            margin-right: 4px;
        }
        .ind-btn {
            padding: 4px 12px;
            border-radius: 6px;
            border: 1.5px solid #374151;
            background: transparent;
            color: #9CA3AF;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .ind-btn:hover { border-color: #6B7280; color: #E5E7EB; }
        .ind-btn.active {
            background: rgba(247,147,26,0.15);
            border-color: #F7931A;
            color: #F7931A;
        }

        /* Lightweight chart containers */
        #lwChartContainer {
            display: none;
            width: 100%;
            border-radius: 0 0 8px 8px;
            overflow: hidden;
        }
        #subCharts {
            display: none;
            flex-direction: column;
            gap: 0;
            width: 100%;
        }
        .sub-chart {
            width: 100%;
            border-top: 1px solid #1F2937;
        }
    `;
    document.head.appendChild(style);
}