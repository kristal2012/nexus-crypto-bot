import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY não encontrados no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifySchema() {
    console.log('🔍 Iniciando verificação de tabelas no Supabase Remoto...');

    const tables = [
        'auto_trading_config',
        'bot_configurations',
        'trades',
        'bot_logs',
        'binance_api_keys'
    ];

    let allOk = true;

    for (const table of tables) {
        try {
            const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });

            if (error) {
                if (error.code === '42P01') {
                    console.error(`❌ Tabela [${table}] NÃO EXISTE.`);
                    allOk = false;
                } else {
                    console.error(`⚠️ Erro ao verificar taba [${table}]: ${error.message} (${error.code})`);
                }
            } else {
                console.log(`✅ Tabela [${table}] detectada.`);
            }
        } catch (err) {
            console.error(`💥 Erro inesperado na tabela [${table}]`);
        }
    }

    if (allOk) {
        console.log('\n🚀 TUDO PRONTO! O Supabase atual possui todas as tabelas necessárias.');
    } else {
        console.log('\n⚠️ ALGUMAS TABELAS ESTÃO FALTANDO. O sistema pode não funcionar corretamente.');
    }
}

verifySchema();
