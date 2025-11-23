import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { encryptSecret } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('🔐 [encrypt-api-secret] Auth error:', {
        error: userError,
        hasAuthHeader: !!req.headers.get('Authorization'),
        authHeaderPreview: req.headers.get('Authorization')?.substring(0, 30) + '...',
        userAgent: req.headers.get('User-Agent'),
        origin: req.headers.get('Origin')
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          details: 'Sua sessão expirou ou é inválida. Faça login novamente.',
          requiresReauth: true
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ [encrypt-api-secret] User authenticated: ${user.id}`);
    console.log(`📝 [encrypt-api-secret] Processing request for user: ${user.id}`);

    const { api_key, api_secret } = await req.json();

    // 🔧 FASE 4: Validação robusta de entrada
    if (!api_key || !api_secret) {
      console.error('❌ [encrypt-api-secret] Missing api_key or api_secret');
      return new Response(
        JSON.stringify({ 
          error: 'Missing api_key or api_secret',
          details: 'Ambas as chaves (API Key e API Secret) são obrigatórias.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar formato das chaves
    if (api_key.trim().length < 10 || api_secret.trim().length < 10) {
      console.error('❌ [encrypt-api-secret] Invalid key format - keys too short');
      return new Response(
        JSON.stringify({ 
          error: 'Invalid key format',
          details: 'As chaves da API parecem muito curtas. Verifique se você copiou corretamente da Binance.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔐 [encrypt-api-secret] Starting encryption process...');

    // Encrypt the API secret with new PBKDF2 method
  console.log('🔒 [encrypt-api-secret] Encrypting API secret...');
  // 🔧 CRITICAL: Trim secret to remove whitespace before encryption
  const { encrypted, salt } = await encryptSecret(api_secret.trim());
    console.log('✅ [encrypt-api-secret] API secret encrypted successfully');

    // Store encrypted secret in database with salt
    console.log('💾 [encrypt-api-secret] Saving to database...');
    const { error: upsertError } = await supabase
      .from('binance_api_keys')
      .upsert({
        user_id: user.id,
        api_key: api_key.trim(),
        api_secret_encrypted: encrypted,
        encryption_salt: salt,
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('❌ [encrypt-api-secret] Error saving encrypted keys:', upsertError);
      return new Response(
        JSON.stringify({ 
          error: 'Unable to save API keys',
          details: upsertError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ [encrypt-api-secret] API keys saved successfully for user: ${user.id}`);
    return new Response(
      JSON.stringify({ success: true, message: 'API keys saved successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in encrypt-api-secret function:', error);
    return new Response(
      JSON.stringify({ error: 'Service error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
