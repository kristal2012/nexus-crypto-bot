import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const createOrderSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{1,20}$/, 'Invalid symbol format').max(20),
  side: z.enum(['BUY', 'SELL']),
  type: z.string().min(1).max(50),
  quantity: z.number().positive().max(1000000).or(z.string().regex(/^\d+(\.\d{1,8})?$/)),
  price: z.number().positive().optional().or(z.string().regex(/^\d+(\.\d+)?$/).optional()),
  stopPrice: z.number().positive().optional().or(z.string().regex(/^\d+(\.\d+)?$/).optional())
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
    const validation = createOrderSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { symbol, side, type, quantity, price, stopPrice } = validation.data;
    
    // Convert to string for consistency
    const quantityStr = typeof quantity === 'number' ? quantity.toString() : quantity;
    const priceStr = price ? (typeof price === 'number' ? price.toString() : price) : undefined;
    const stopPriceStr = stopPrice ? (typeof stopPrice === 'number' ? stopPrice.toString() : stopPrice) : undefined;

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
    let queryString = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantityStr}&timestamp=${timestamp}`;
    
    if (type === 'LIMIT' && priceStr) {
      queryString += `&price=${priceStr}&timeInForce=GTC`;
    }
    
    if ((type === 'STOP_MARKET' || type === 'TAKE_PROFIT_MARKET') && stopPriceStr) {
      queryString += `&stopPrice=${stopPriceStr}`;
    }

    const signature = await signRequest(queryString, apiSecret);
    const binanceUrl = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;

    console.log('Creating order:', { symbol, side, type, quantity: quantityStr, price: priceStr, stopPrice: stopPriceStr });

    const response = await fetch(binanceUrl, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Binance API error:', data);
      
      // Sanitize error response - don't expose internal API details
      let userMessage = 'Failed to create order';
      if (data?.code === -2010) {
        userMessage = 'Insufficient balance';
      } else if (data?.code === -1121) {
        userMessage = 'Invalid symbol';
      } else if (data?.code === -1111) {
        userMessage = 'Invalid quantity';
      }
      
      return new Response(
        JSON.stringify({ error: userMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store trade in database
    const { error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        symbol,
        side: side as 'BUY' | 'SELL',
        type: type as any,
        quantity: parseFloat(quantityStr),
        price: priceStr ? parseFloat(priceStr) : parseFloat(data.avgPrice || '0'),
        status: data.status === 'FILLED' ? 'FILLED' : 'PENDING',
        order_id: data.orderId?.toString(),
        executed_at: data.status === 'FILLED' ? new Date().toISOString() : null,
      });

    if (tradeError) {
      console.error('Error storing trade:', tradeError);
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in binance-create-order function:', error);
    return new Response(
      JSON.stringify({ error: 'Service error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
