import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const cancelOrderSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{1,20}$/, 'Invalid symbol format').max(20),
  orderId: z.string().regex(/^[0-9]{1,20}$/, 'Invalid order ID format').max(20)
});

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

    // Validate input with zod
    const body = await req.json();
    const validation = cancelOrderSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { symbol, orderId } = validation.data;

    // Check if trading is enabled system-wide
    const { data: systemSettings } = await supabase
      .from('system_settings')
      .select('trading_enabled, emergency_message')
      .single();
    
    if (!systemSettings?.trading_enabled) {
      return new Response(
        JSON.stringify({ 
          error: 'Trading is currently paused', 
          message: systemSettings?.emergency_message 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = await signRequest(queryString, apiSecret);
    const binanceUrl = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;

    console.log('Cancelling order:', { symbol, orderId });

    const response = await fetch(binanceUrl, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Binance API error:', data);
      return new Response(
        JSON.stringify({ error: 'Binance API error', details: data }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update trade status in database
    const { error: updateError } = await supabase
      .from('trades')
      .update({ status: 'CANCELLED' })
      .eq('order_id', orderId.toString())
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating trade status:', updateError);
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in binance-cancel-order function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
