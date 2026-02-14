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

const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL');
const SUPABASE_PUBLISHABLE_KEY = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
const SUPABASE_SERVICE_ROLE_KEY = getEnvVar('VITE_SUPABASE_SERVICE_ROLE_KEY');

// Use Service Role Key if available (admin mode), otherwise use Publishable Key
const FINAL_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY;

// Safe initialization to avoid app crash if env vars are missing
const safeSupabaseUrl = SUPABASE_URL || "https://placeholder.supabase.co";
const safeSupabaseKey = FINAL_KEY || "placeholder";

export const supabase = createClient<Database>(safeSupabaseUrl, safeSupabaseKey);
