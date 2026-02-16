import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SETUP KEYS - Script para configuração local e segura de API Keys
 * Salva as credenciais apenas no diretório data/ do servidor VPS.
 */

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

async function setup() {
    console.log('\n----------------------------------------------------');
    console.log('   🔐 CONFIGURAÇÃO DE CHAVES BINANCE (LOCAL)       ');
    console.log('----------------------------------------------------');
    console.log('As chaves serão salvas APENAS neste servidor VPS.');
    console.log('Local: ' + CONFIG_FILE + '\n');

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Carregar config atual se existir
    let currentConfig: any = {};
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            currentConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        } catch (e) {
            currentConfig = {};
        }
    }

    const askQuestion = (query: string): Promise<string> => {
        return new Promise((resolve) => rl.question(query, resolve));
    };

    try {
        const apiKey = await askQuestion('🔑 Digite sua Binance API KEY: ');
        const apiSecret = await askQuestion('🔒 Digite sua Binance API SECRET: ');

        if (!apiKey || !apiSecret) {
            console.log('\n❌ Erro: API Key e Secret são obrigatórios.');
            process.exit(1);
        }

        const newConfig = {
            ...currentConfig,
            api_key_encrypted: apiKey,
            api_secret_encrypted: apiSecret,
            test_mode: false, // Ao configurar chaves, assume-se que quer se preparar para Real
            updated_at: new Date().toISOString()
        };

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));

        console.log('\n----------------------------------------------------');
        console.log('✅ SUCESSO! Chaves configuradas localmente.');
        console.log('O robô agora está pronto para operar em modo REAL.');
        console.log('Dica: Verifique se VITE_TRADING_MODE=real no seu .env');
        console.log('----------------------------------------------------\n');

    } catch (error) {
        console.error('\n❌ Erro durante o setup:', error);
    } finally {
        rl.close();
    }
}

setup();
