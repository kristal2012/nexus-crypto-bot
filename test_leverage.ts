import { tradeService } from './src/services/botService';
import * as dotenv from 'dotenv';
dotenv.config();

async function testLeverage() {
    console.log('🧪 Testando configuração de alavancagem via Proxy...');
    try {
        const symbol = 'BTCUSDT';
        const leverage = 5;
        console.log(`📡 Solicitando ${leverage}x para ${symbol}...`);

        const result = await tradeService.setLeverage(symbol, leverage);

        if (result.success) {
            console.log('✅ Sucesso!', JSON.stringify(result.data, null, 2));
        } else {
            console.error('❌ Falha:', result.error);
        }
    } catch (error) {
        console.error('💥 Erro catastrófico:', error);
    }
}

testLeverage();
