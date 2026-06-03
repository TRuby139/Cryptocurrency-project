// Put your CoinGecko Demo API key here
const API_KEY = "CG-nMDNnr5YwSHhNF3mvB8Hy5T5";

let priceChartInstance = null;
let cachedCoinList = null; 


// --- NEW: Global Variables to store data so the buttons can use them instantly ---
let globalCoinName = "";
let globalLineLabels = [];
let globalLineDataPoints = [];
let globalCandleData = [];

async function initializeCoinList() {
    try {
        const url = `https://api.coingecko.com/api/v3/coins/list?x_cg_demo_api_key=${API_KEY}`;
        const response = await fetch(url);
        
        if (response.ok) {
            cachedCoinList = await response.json();
            console.log("✅ Coin dictionary loaded successfully!");
        }
    } catch (error) {
        console.error("Error loading coin list:", error);
    }
}

initializeCoinList();

window.fetchData = async function() {
    const searchInput = document.getElementById('coinSearch').value.toLowerCase().trim();

    if (!searchInput) {
        alert("Please enter a valid Coin ID (e.g., bitcoin, ethereum).");
        return;
    }

    let coinId = searchInput;

    if (cachedCoinList) {
        const exactIdMatch = cachedCoinList.find(coin => coin.id.toLowerCase() === searchInput);
        if (exactIdMatch) {
            coinId = exactIdMatch.id;
        } else {
            const symbolMatches = cachedCoinList.filter(coin => coin.symbol.toLowerCase() === searchInput);
            if (symbolMatches.length > 0) {
                symbolMatches.sort((a, b) => a.id.length - b.id.length);
                coinId = symbolMatches[0].id;
            }
        }
    }

    try {
        // --- NEW: Fetch BOTH Line data and OHLC (Candlestick) data at the same time ---
        const lineUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=365&x_cg_demo_api_key=${API_KEY}`;
        const candleUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=365&x_cg_demo_api_key=${API_KEY}`;

        // Promise.all lets us fetch both APIs simultaneously to save time
        const [lineResponse, candleResponse] = await Promise.all([fetch(lineUrl), fetch(candleUrl)]);

        if (!lineResponse.ok || !candleResponse.ok) {
            throw new Error("Coin not found or API rate limit exceeded.");
        }

        const lineDataRaw = await lineResponse.json();
        const candleDataRaw = await candleResponse.json();
        
        // Save Line Chart Data Globally
        globalLineLabels = lineDataRaw.prices.map(item => new Date(item[0]).toLocaleDateString());
        globalLineDataPoints = lineDataRaw.prices.map(item => item[1]);
        
        // Save Candlestick Data Globally
        globalCandleData = candleDataRaw.map(item => ({
            x: item[0], // Timestamp
            o: item[1], // Open
            h: item[2], // High
            l: item[3], // Low
            c: item[4]  // Close
        }));

        globalCoinName = searchInput;

        // Render the Line Chart by default when they first search
        window.switchToLineChart();
        performPrediction(lineDataRaw.prices);

    } catch (error) {
        console.error("Error fetching data:", error);
        alert(`Error: ${error.message}\nPlease check the spelling of the Coin ID.`);
    }
};

function performPrediction(prices) {
    const n = prices.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    // 1. Calculate the sums needed for the regression formula
    prices.forEach((p, index) => {
        sumX += index; 
        sumY += p[1]; 
        sumXY += index * p[1]; 
        sumXX += index * index;
    });

    // 2. Calculate Slope (m) and Intercept (c)
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // 3. Predict the next price (y = mx + c)
    const nextPrice = slope * n + intercept;
    
    document.getElementById('predictionResult').innerText = `Predicted next price point: $${nextPrice.toFixed(2)}`;
}

// BUTTON SWITCHING LOGIC

window.switchToLineChart = function() {
    renderLineChart(globalCoinName, globalLineLabels, globalLineDataPoints);
    
    // Manage Buttons: Hide Line Button, Show Candle Button
    document.getElementById('btnLine').style.display = 'none';
    document.getElementById('btnCandle').style.display = 'inline-block';
}

window.switchToCandleChart = function() {
    renderCandleChart(globalCoinName, globalCandleData);
    
    // Manage Buttons: Hide Candle Button, Show Line Button
    document.getElementById('btnCandle').style.display = 'none';
    document.getElementById('btnLine').style.display = 'inline-block';
}

// CHART RENDERING FUNCTIONS

function renderLineChart(coinName, labels, dataPoints) {
    const ctx = document.getElementById('priceChart').getContext('2d');

    if (priceChartInstance) { priceChartInstance.destroy(); }

    priceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${coinName.toUpperCase()} Price (USD) - Line`, 
                data: dataPoints,
                borderColor: 'hsl(45, 80%, 50%)',
                backgroundColor: 'rgba(230, 165, 25, 0.2)',
                borderWidth: 4,
                fill: true,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } } },
            scales: {
                x: { display: true, title: { display: true, text: 'Date' } },
                y: { display: true, title: { display: true, text: 'Price (USD)' } }
            }
        }
    });
}

function renderCandleChart(coinName, ohlcData) {
    const ctx = document.getElementById('priceChart').getContext('2d');

    if (priceChartInstance) { priceChartInstance.destroy(); }

    // Bonus for your assignment: A quick 14-period Simple Moving Average calculation
    const smaData = [];
    for (let i = 0; i < ohlcData.length; i++) {
        if (i < 14) {
            smaData.push({ x: ohlcData[i].x, y: null });
        } else {
            let sum = 0;
            for (let j = 0; j < 14; j++) { sum += ohlcData[i - j].c; }
            smaData.push({ x: ohlcData[i].x, y: sum / 14 });
        }
    }

    priceChartInstance = new Chart(ctx, {
        type: 'candlestick',
        data: {
            datasets: [
                {
                    label: `${coinName.toUpperCase()} Price (USD) - Candlestick`, 
                    data: ohlcData
                },
                {
                    type: 'line', 
                    label: '14-Period Simple Moving Average (SMA)',
                    data: smaData,
                    borderColor: 'hsl(210, 100%, 50%)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2
                }
            ]
        },
options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        zoom: {
            zoom: {
                wheel: { enabled: true, speed: 0.05 },
                pinch: { enabled: true },
                mode: 'x'
            },
            pan: {
                enabled: true,
                mode: 'x'
            },
            limits: {
                x: { minRange: 7 * 24 * 60 * 60 * 1000 } // minimum 7-day range
            }
        }
    },
    scales: {
          x: {
            type: 'time',
              time: { 
                  unit: 'day',                         
                  tooltipFormat: 'MMM d, yyyy' 
                    },
                ticks: {
                      source: 'auto',
                      autoSkip: true,
                      maxTicksLimit: 10
                       },
                title: { display: true, text: 'Date' }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Price (USD)' }
                }
            }
        }
  });
}