
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY não encontrados no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function initialize() {
    console.log('📡 Iniciando tentativa de inicialização do Supabase via SDK...');

    try {
        // 1. Verificar se as tabelas já existem
        console.log('🔍 Verificando tabelas existentes...');
        const { data: tables, error: tablesError } = await supabase.from('bot_configurations').select('id').limit(1);

        if (!tablesError) {
            console.log('✅ As tabelas parecem já existir. Pulando criação.');
            return;
        }

        console.log('ℹ️ Tabelas não detectadas. Tentando método alternativo via SQL RPC (se disponível)...');

        // Infelizmente, sem uma função RPC 'exec_sql' já existente, o SDK JS não pode criar tabelas.
        // Vamos tentar usar a API de Gerenciamento do Supabase se o usuário nos desse um Token, 
        // mas como só temos a service_role, estamos limitados.

        console.warn('⚠️ O SDK do Supabase não permite criação de tabelas diretamente sem acesso ao banco via PostgreSQL (porta 5432).');
        console.warn('⚠️ A service_role key permite ler/gravar dados, mas não alterar o SCHEMA (DDL) via REST API.');

        console.log('\n--- SOLUÇÃO ALTERNATIVA ---');
        console.log('Como você não consegue usar o SQL Editor, vou tentar um "Hack":');
        console.log('Vou tentar rodar um comando direto via cURL para a API do Supabase que às vezes aceita SQL se o usuário for o admin.');

        process.exit(1);
    } catch (err) {
        console.error('❌ Erro inesperado:', err);
        process.exit(1);
    }
}

initialize();
