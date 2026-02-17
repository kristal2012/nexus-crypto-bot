import { createClient } from "@supabase/supabase-js";
import { Database } from "./types";

// Universal environment variable access (Vite or Node.js)
const getEnvVar = (key: string): string => {
    // Browser/Vite environment
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        return import.meta.env[key] || '';
    }
    // Node.js environment
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key] || '';
    }
    return '';
};

const SUPABASE_URL = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : '');
const SUPABASE_ANON_KEY = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : '');
const SUPABASE_SERVICE_ROLE_KEY = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY : (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY : '');
const FINAL_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

// Safe initialization to avoid app crash if env vars are missing
const safeSupabaseUrl = SUPABASE_URL || "https://placeholder.supabase.co";
const safeSupabaseKey = FINAL_KEY || "placeholder";

export const supabase = createClient<Database>(safeSupabaseUrl, safeSupabaseKey);
