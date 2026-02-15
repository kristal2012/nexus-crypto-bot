import { localDb } from './src/services/localDbService';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function setupKeys() {
    console.log('----------------------------------------------------');
    console.log('   CONFIGURAÇÃO LOCAL DE CHAVES BINANCE (CRYPTUM)   ');
    console.log('----------------------------------------------------');
    console.log('ℹ️ Suas chaves serão salvas APENAS nesta máquina (data/config.json).');
    console.log('ℹ️ Elas NÃO serão enviadas para o Supabase nem Dashboard.');
    console.log('');

    rl.question('Digite sua API KEY da Binance: ', (apiKey) => {
        rl.question('Digite seu API SECRET da Binance: ', (apiSecret) => {
            const currentConfig = localDb.getConfig();
            const newConfig = {
                ...currentConfig,
                api_key_encrypted: apiKey.trim(),
                api_secret_encrypted: apiSecret.trim()
            };

            localDb.saveConfig(newConfig);
            console.log('\n✅ Chaves configuradas com sucesso localmente!');
            console.log('🚀 Agora você pode alternar para VITE_TRADING_MODE=real com segurança.');
            rl.close();
        });
    });
}

setupKeys();
