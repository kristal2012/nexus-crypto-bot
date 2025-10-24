import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function signRequest(queryString: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(queryString);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

    // Get user's Binance API keys
    const { data: apiKeys, error: keysError } = await supabase
      .from('binance_api_keys')
      .select('api_key, api_secret_encrypted, encryption_salt')
      .eq('user_id', user.id)
      .maybeSingle();

    if (keysError || !apiKeys) {
      console.error('Error fetching API keys:', keysError);
      return new Response(
        JSON.stringify({ error: 'Binance API keys not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt the API secret
    const { decryptSecret, decryptSecretLegacy } = await import('../_shared/encryption.ts');
    const apiSecret = apiKeys.encryption_salt 
      ? await decryptSecret(apiKeys.api_secret_encrypted, apiKeys.encryption_salt)
      : await decryptSecretLegacy(apiKeys.api_secret_encrypted);

    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await signRequest(queryString, apiSecret);

    // Get account information from Binance
    const binanceUrl = `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`;
    
    const response = await fetch(binanceUrl, {
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Binance API error:', data); // Keep server-side logging
      
      // Sanitize error for client - don't expose internal API details
      let userMessage = 'Unable to fetch account information';
      if (data?.code === -2015) {
        userMessage = 'Invalid API key configuration';
      } else if (data?.code === -1021) {
        userMessage = 'Request timeout - please try again';
      } else if (data?.code === -2014) {
        userMessage = 'API key authentication failed';
      }
      
      return new Response(
        JSON.stringify({ error: userMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in binance-account function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
