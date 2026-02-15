import fetch from 'node-fetch';
import { localDb } from './src/services/localDbService';

const VERCEL_PROXY = "https://nexus-crypto-bot.vercel.app/api/binance-proxy";

async function testProxy() {
    console.log('🧪 Testando Vercel Proxy...');

    const paths = [
        '/fapi/v1/ticker/price?symbol=BTCUSDT',
        '/api/v3/ticker/price?symbol=BTCUSDT'
    ];

    const config = localDb.getConfig();
    const headers: any = {};
    if (config.api_key_encrypted) {
        headers['X-MBX-APIKEY'] = config.api_key_encrypted;
        console.log('🔑 Usando API Key encontrada no localDb');
    } else {
        console.log('❓ Nenhuma API Key no localDb');
    }

    for (const path of paths) {
        console.log(`\n-------------------\n📡 Testando: ${path}`);

        try {
            const [apiPath, query] = path.split('?');
            const url = new URL(VERCEL_PROXY);
            url.searchParams.append('path', apiPath);
            if (query) {
                const params = new URLSearchParams(query);
                params.forEach((v, k) => url.searchParams.append(k, v));
            }

            console.log(`🔗 URL de Destino: ${url.toString()}`);

            const res = await fetch(url.toString(), { headers });
            const text = await res.text();
            console.log(`📊 Status: ${res.status}`);
            try {
                const data = JSON.parse(text);
                console.log('📦 Resposta:', JSON.stringify(data).substring(0, 100) + '...');
            } catch (e) {
                console.log('📦 Resposta (Text):', text.substring(0, 500) + '...');
            }
        } catch (e: any) {
            console.error(`❌ Erro: ${e.message}`);
        }
    }
}

testProxy();
