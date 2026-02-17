
import 'dotenv/config';
import { supabaseSync } from '../services/supabaseSyncService';
import { localDb } from '../services/localDbService';

async function test() {
    console.log('🧪 Iniciando teste de LOG para Dashboard...');

    // Inicializar (mesmo que headless-bot faça isso)
    await supabaseSync.initialize();

    const timestamp = new Date().toLocaleTimeString();
    const message = `Teste de Conexão efetuado às ${timestamp}`;

    console.log(`📤 Enviando log: "${message}"`);

    await supabaseSync.syncLog('SUCCESS', message, {
        source: 'test_log.ts',
        test_id: Math.random().toString(36).substr(7)
    });

    console.log('✅ Log enviado! Verifique o painel.');
    process.exit(0);
}

test();
