// Put your CoinGecko Demo API key here
const API_KEY = "CG-nMDNnr5YwSHhNF3mvB8Hy5T5";

// We store the chart instance globally so we can destroy it before drawing a new one.
// This prevents the "overlapping charts" glitch in Chart.js.
let priceChartInstance = null;
let cachedCoinList = null; // This will hold our dynamic dictionary

async function initializeCoinList() {
    try {
        const url = `https://api.coingecko.com/api/v3/coins/list?x_cg_demo_api_key=${API_KEY}`;
        const response = await fetch(url);
        
        if (response.ok) {
            cachedCoinList = await response.json();
            console.log("✅ Coin dictionary loaded successfully! Ready to translate symbols.");
        } else {
            console.warn("⚠️ Could not load coin dictionary. Symbol translation might fail.");
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

    let coinId = searchInput; // Default to what the user typed


    if (cachedCoinList) {
        // 1st priority: exact match on coin ID (e.g., user typed "bitcoin")
        const exactIdMatch = cachedCoinList.find(coin => coin.id.toLowerCase() === searchInput);

        if (exactIdMatch) {
            coinId = exactIdMatch.id;
        } else {
            // 2nd priority: match by symbol, but pick the one whose ID matches the symbol most closely
            // e.g., for "btc" → prefer id:"bitcoin" over id:"bitcoin-sv" or some obscure copy
            const symbolMatches = cachedCoinList.filter(coin => coin.symbol.toLowerCase() === searchInput);

            if (symbolMatches.length > 0) {
                // Among all symbol matches, prefer the coin whose name equals the symbol's "expected" full name
                // Fallback: just take the shortest ID (usually the original/most official coin)
                symbolMatches.sort((a, b) => a.id.length - b.id.length);
                coinId = symbolMatches[0].id;
            }
        }
    }
    // API key is passed as a query parameter for the free demo tier

    try {
        const apiUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=365&x_cg_demo_api_key=${API_KEY}`;
        // Fetch the data from CoinGecko
        const response = await fetch(apiUrl);

        //Error Handling: Check if the API request was successful
        if (!response.ok) {
            throw new Error("Coin not found or API rate limit exceeded.");
        }

        // Parse the JSON response
        const data = await response.json();
        
        //Extract and format the data for Chart.js
        // CoinGecko returns prices as an array of arrays: [[timestamp, price], ...]
        const pricesArray = data.prices;

        const chartLabels = pricesArray.map(item => {
            const date = new Date(item[0]);
            return date.toLocaleDateString();// Converts timestamp to a readable date
        });

        const chartDataPoints = pricesArray.map(item => item[1]);
        
        //Render the chart with the processed data
        renderChart(searchInput, chartLabels, chartDataPoints);

    } catch (error) {
      //Error Handling: Alert the user if something goes wrong
        console.error("Error fetching data:", error);
        alert(`Error: ${error.message}\nPlease check the spelling of the Coin ID.`);
    }
};

function renderChart(coinName, labels, dataPoints) {
  // 1. Get the canvas element
    const ctx = document.getElementById('priceChart').getContext('2d');

    // 2. Destroy the existing chart if it exists
    if (priceChartInstance) {
        priceChartInstance.destroy();
    }

    // 3. Create a new Chart instance
    priceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${coinName.toUpperCase()} Price (USD) - Last 365 Days`, 
                data: dataPoints,
                borderColor: 'hsl(45, 80%, 50%)',
                backgroundColor: 'rgba(230, 165, 25, 0.2)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                zoom: {
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                    }
                }
            },
            scales: {
                x: { display: true, title: { display: true, text: 'Date' } },
                y: { display: true, title: { display: true, text: 'Price (USD)' } }
            }
        }
    });
}