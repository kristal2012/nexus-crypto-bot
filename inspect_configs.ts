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

async function inspectConfigs() {
    console.log(`📡 URL: ${supabaseUrl}`);
    console.log('🔍 Inspecionando bot_configurations no Supabase Remoto...');

    const { data, error } = await supabase
        .from('bot_configurations')
        .select('id, user_id, is_powered_on, is_running, test_mode, updated_at');

    if (error) {
        console.error('❌ Erro ao buscar configurações:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log('ℹ️ Nenhuma configuração encontrada na tabela.');
        return;
    }

    console.log(`\n✅ Encontradas ${data.length} configurações:`);
    console.table(data);
}

inspectConfigs();
