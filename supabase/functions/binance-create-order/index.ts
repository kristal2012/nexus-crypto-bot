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

    const { symbol, side, type, quantity, price, stopPrice } = await req.json();

    if (!symbol || !side || !type || !quantity) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: symbol, side, type, quantity' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate quantity
    const quantityNum = parseFloat(quantity);
    if (isNaN(quantityNum)) {
      return new Response(
        JSON.stringify({ error: 'Invalid quantity: must be a valid number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (quantityNum <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid quantity: must be greater than 0' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (quantityNum > 1000000) {
      return new Response(
        JSON.stringify({ error: 'Invalid quantity: exceeds maximum allowed (1,000,000)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Check decimal places (max 8 for crypto)
    const decimalPlaces = (quantity.toString().split('.')[1] || '').length;
    if (decimalPlaces > 8) {
      return new Response(
        JSON.stringify({ error: 'Invalid quantity: maximum 8 decimal places allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate symbol format
    if (!/^[A-Z0-9]+$/.test(symbol)) {
      return new Response(
        JSON.stringify({ error: 'Invalid symbol format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate side
    if (side !== 'BUY' && side !== 'SELL') {
      return new Response(
        JSON.stringify({ error: 'Invalid side: must be BUY or SELL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate price if provided
    if (price !== undefined && price !== null) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid price: must be a positive number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate stopPrice if provided
    if (stopPrice !== undefined && stopPrice !== null) {
      const stopPriceNum = parseFloat(stopPrice);
      if (isNaN(stopPriceNum) || stopPriceNum <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid stopPrice: must be a positive number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get user's Binance API keys
    const { data: apiKeys, error: keysError } = await supabase
      .from('binance_api_keys')
      .select('api_key, api_secret_encrypted')
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
    const { decryptSecret } = await import('../_shared/encryption.ts');
    const apiSecret = await decryptSecret(apiKeys.api_secret_encrypted);

    const timestamp = Date.now();
    let queryString = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
    
    if (type === 'LIMIT' && price) {
      queryString += `&price=${price}&timeInForce=GTC`;
    }
    
    if ((type === 'STOP_MARKET' || type === 'TAKE_PROFIT_MARKET') && stopPrice) {
      queryString += `&stopPrice=${stopPrice}`;
    }

    const signature = await signRequest(queryString, apiSecret);
    const binanceUrl = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;

    console.log('Creating order:', { symbol, side, type, quantity, price, stopPrice });

    const response = await fetch(binanceUrl, {
      method: 'POST',
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

    // Store trade in database
    const { error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        symbol,
        side: side as 'BUY' | 'SELL',
        type: type as any,
        quantity: parseFloat(quantity),
        price: price ? parseFloat(price) : parseFloat(data.avgPrice || '0'),
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
