import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAndGetCredentials, testBinanceConnection } from '../_shared/binanceCredentialsService.ts';

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
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[binance-account] Validating credentials for user: ${user.id}`);

    // Validate and get credentials using centralized service
    const { result, credentials } = await validateAndGetCredentials(supabase, user.id);

    if (!result.isValid || !credentials) {
      console.error('[binance-account] Credential validation failed:', result.errorCode);
      
      // Return specific error messages based on error code
      let statusCode = 400;
      let errorMessage = result.error || 'Erro ao validar credenciais';

      if (result.errorCode === 'MISSING_CREDENTIALS') {
        errorMessage = 'API keys não configuradas. Configure suas chaves da Binance primeiro.';
      } else if (result.errorCode === 'DECRYPTION_FAILED') {
        statusCode = 500;
        errorMessage = '🔐 Erro ao descriptografar suas credenciais. Por favor, reconfigure suas API keys da Binance.';
      } else if (result.errorCode === 'INVALID_FORMAT') {
        statusCode = 500;
        errorMessage = 'Formato de credenciais inválido. Por favor, reconfigure suas API keys da Binance.';
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          errorCode: result.errorCode,
          requiresReconfiguration: ['DECRYPTION_FAILED', 'INVALID_FORMAT'].includes(result.errorCode || '')
        }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[binance-account] Credentials validated, testing Binance connection...');

    // Test connection to Binance
    const connectionTest = await testBinanceConnection(credentials.apiKey, credentials.apiSecret);

    if (!connectionTest.success) {
      console.error('[binance-account] Binance connection test failed:', connectionTest.error);
      return new Response(
        JSON.stringify({ 
          error: connectionTest.error || 'Erro ao conectar com Binance',
          requiresReconfiguration: false
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[binance-account] Connection test successful, fetching account data...');

    // Get account information from Binance
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    // Generate signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(credentials.apiSecret);
    const messageData = encoder.encode(queryString);
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, messageData);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Get account information from Binance
    const binanceUrl = `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`;
    
    const response = await fetch(binanceUrl, {
      headers: {
        'X-MBX-APIKEY': credentials.apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[binance-account] Binance API error:', {
        status: response.status,
        code: data?.code,
        msg: data?.msg
      });
      
      // Sanitize error for client with specific messages
      let userMessage = 'Erro ao buscar informações da conta';
      let requiresReconfiguration = false;

      if (data?.code === -2015) {
        userMessage = '⚠️ API Key inválida ou sem permissões para Futures. Verifique se:\n1. A API key está correta\n2. "Enable Futures" está marcado\n3. A API key não foi deletada na Binance';
        requiresReconfiguration = true;
      } else if (data?.code === -1021) {
        userMessage = 'Timeout na sincronização de horário. Tente novamente.';
      } else if (data?.code === -2014) {
        userMessage = 'Falha na autenticação da API key. Verifique se a chave não foi modificada na Binance.';
        requiresReconfiguration = true;
      } else if (data?.code === -1022) {
        userMessage = 'Assinatura inválida. Reconfigure suas credenciais.';
        requiresReconfiguration = true;
      } else if (data?.msg) {
        userMessage = `Erro Binance: ${data.msg}`;
      }
      
      return new Response(
        JSON.stringify({ 
          error: userMessage,
          binanceCode: data?.code,
          requiresReconfiguration
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[binance-account] Successfully fetched account data');

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[binance-account] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        requiresReconfiguration: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
