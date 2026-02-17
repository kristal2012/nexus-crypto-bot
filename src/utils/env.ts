/**
 * Env Utility
 * Provides safe, static access to environment variables for both Vite and Node.js.
 */

// We must use explicit property access for Vite to perform static replacement during build.
// DO NOT use dynamic index access like import.meta.env[key].

export const getViteEnv = (key: 'VITE_TRADING_MODE' | 'VITE_INITIAL_BALANCE' | 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'VITE_BINANCE_PROXY_URL'): string => {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        if (key === 'VITE_TRADING_MODE') return import.meta.env.VITE_TRADING_MODE || '';
        if (key === 'VITE_INITIAL_BALANCE') return import.meta.env.VITE_INITIAL_BALANCE || '';
        if (key === 'VITE_SUPABASE_URL') return import.meta.env.VITE_SUPABASE_URL || '';
        if (key === 'VITE_SUPABASE_ANON_KEY') return import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        if (key === 'VITE_BINANCE_PROXY_URL') return import.meta.env.VITE_BINANCE_PROXY_URL || '';
    }

    if (typeof process !== 'undefined' && process.env) {
        return process.env[key] || '';
    }

    return '';
};

// Safe Default: Se a variável não for 'real', assumimos que é simulação (segurança para o usuário)
export const IS_SIMULATION = getViteEnv('VITE_TRADING_MODE') !== 'real';
export const INITIAL_BALANCE = parseFloat(getViteEnv('VITE_INITIAL_BALANCE') || '1000');
