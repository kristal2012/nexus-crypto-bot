
import { binanceService } from './services/binanceService';
import { momentumStrategyService } from './services/momentumStrategyService';
import { bollingerBandsService } from './services/indicators/bollingerBands';
import { rsiService } from './services/indicators/rsi';

async function check() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    console.log('--- ANÁLISE DE MERCADO ATUAL (FUTURES) ---');

    for (const symbol of symbols) {
        try {
            const candles = await binanceService.getCandles(symbol, '1m', 50);
            if (candles.length < 21) {
                console.log(`${symbol}: Dados insuficientes.`);
                continue;
            }

            const prices = candles.map(c => c.close);
            const currentPrice = prices[prices.length - 1];

            const rsi = rsiService.calculate(prices, 14);
            const bb = bollingerBandsService.calculate(prices, 20, 2.0);

            if (!rsi || !bb) {
                console.log(`${symbol}: Erro calc indicadores.`);
                continue;
            }

            const targetRSI = 45;
            const targetPrice = bb.lower * 1.015;

            const rsiDiff = rsi.value - targetRSI;
            const priceDiff = ((currentPrice - targetPrice) / currentPrice) * 100;

            console.log(`\n${symbol}:`);
            console.log(`  Preço: $${currentPrice.toFixed(2)}`);
            console.log(`  RSI: ${rsi.value.toFixed(1)} (Meta: < ${targetRSI}) -> Distância: ${rsiDiff.toFixed(1)} pts`);
            console.log(`  BB Lower: $${bb.lower.toFixed(2)} (Meta: < $${targetPrice.toFixed(2)}) -> Distância: ${priceDiff.toFixed(2)}%`);

            if (rsi.value < targetRSI && currentPrice < targetPrice) {
                console.log(`  STATUS: ✅ ZONA DE COMPRA!`);
            } else {
                console.log(`  STATUS: ⏳ AGUARDANDO`);
            }
        } catch (e) {
            console.error(e);
        }
    }
}

check();
