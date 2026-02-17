
// Script standalone para checar mercado (sem dependencias do projeto)

async function fetchCandles(symbol: string) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=50`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        return data.map((c: any) => parseFloat(c[4])); // Close prices
    } catch (e) {
        console.error(`Erro ao buscar ${symbol}:`, e);
        return [];
    }
}

function calculateRSI(prices: number[], period: number = 14) {
    if (prices.length < period + 1) return { value: 0 };

    let gains = 0;
    let losses = 0;

    // Primeiro RSI
    for (let i = 1; i <= period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // RSI Suavizado (Wilder)
    for (let i = period + 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }

    if (avgLoss === 0) return { value: 100 };
    const rs = avgGain / avgLoss;
    return { value: 100 - (100 / (1 + rs)) };
}

function calculateBB(prices: number[], period: number = 20, stdDev: number = 2.0) {
    if (prices.length < period) return null;

    const slice = prices.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
        middle: mean,
        upper: mean + (std * stdDev),
        lower: mean - (std * stdDev)
    };
}

async function main() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

    console.log('=== RELATÓRIO DE MERCADO (FUTURES) ===');
    console.log(new Date().toISOString());
    console.log('--------------------------------------');

    for (const symbol of symbols) {
        const prices = await fetchCandles(symbol);
        if (prices.length < 25) continue;

        const currentPrice = prices[prices.length - 1];
        const rsi = calculateRSI(prices);
        const bb = calculateBB(prices);

        if (!bb) continue;

        const isRSIOversold = rsi.value < 45;
        const isPriceLow = currentPrice < bb.lower * 1.015;

        const rsiTarget = 45;
        const priceTarget = bb.lower * 1.015;

        const rsiDist = rsi.value - rsiTarget;
        const priceDistPercent = ((currentPrice - priceTarget) / priceTarget) * 100;

        let status = 'AGUARDANDO';
        if (isRSIOversold && isPriceLow) status = '✅ SINAL DE COMPRA';
        else if (isRSIOversold) status = '⚠️ RSI OK, Preço Alto';
        else if (isPriceLow) status = '⚠️ Preço OK, RSI Alto';

        console.log(`\n${symbol}:`);
        console.log(`  Preço: $${currentPrice.toFixed(2)}`);
        console.log(`  RSI:   ${rsi.value.toFixed(1)} (Meta < 45) [Dist: ${rsiDist > 0 ? '+' : ''}${rsiDist.toFixed(1)}]`);
        console.log(`  BB Low: $${bb.lower.toFixed(2)} (Meta < $${priceTarget.toFixed(2)}) [Dist: ${priceDistPercent > 0 ? '+' : ''}${priceDistPercent.toFixed(2)}%]`);
        console.log(`  STATUS: ${status}`);
    }
}

main();
