import { createClient } from "@supabase/supabase-js";
import { Database } from "./types";

// Node.js environment check
const isNode = typeof process !== 'undefined' && process.env && !((process as any).browser);

// Force load env for Node.js
if (isNode) {
    try {
        require('dotenv').config();
    } catch (e) {
        // Dotenv might be missing in some builds, but expected in local execution
    }
}

const getEnvVar = (key: string): string => {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        return import.meta.env[key] || '';
    }
    return process.env[key] || '';
};

const SUPABASE_URL = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : '');
const SUPABASE_ANON_KEY = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : '');
const SUPABASE_SERVICE_ROLE_KEY = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY : (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY : '');
const FINAL_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

// Safe initialization to avoid app crash if env vars are missing
const safeSupabaseUrl = SUPABASE_URL || "https://placeholder.supabase.co";
const safeSupabaseKey = FINAL_KEY || "placeholder";

export const supabase = createClient<Database>(safeSupabaseUrl, safeSupabaseKey);
