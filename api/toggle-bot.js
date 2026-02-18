
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with Service Role Key (Bypass RLS)
// Note: In Vercel, env vars are available in process.env
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { action, userId } = req.body; // action: 'start' | 'stop'

        if (!action) {
            return res.status(400).json({ error: 'Missing action' });
        }

        console.log(`[AdminAPI] ${action} bot request received.`);

        // 1. Encontrar a configuração do usuário
        // Se userId não for passado, tenta pegar o primeiro (modo single user)
        let query = supabase.from('bot_configurations').select('id, user_id');

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data: configs, error: fetchError } = await query.limit(1);

        if (fetchError || !configs || configs.length === 0) {
            return res.status(404).json({ error: 'Config not found' });
        }

        const configId = configs[0].id;

        // 2. Atualizar o status
        const updates = {
            is_running: action === 'start',
            is_powered_on: action === 'start',
            updated_at: new Date().toISOString()
        };

        const { error: updateError } = await supabase
            .from('bot_configurations')
            .update(updates)
            .eq('id', configId);

        if (updateError) {
            throw updateError;
        }

        return res.status(200).json({
            success: true,
            message: `Bot ${action === 'start' ? 'started' : 'stopped'} successfully`,
            configId
        });

    } catch (error) {
        console.error('[AdminAPI Error]', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
}
