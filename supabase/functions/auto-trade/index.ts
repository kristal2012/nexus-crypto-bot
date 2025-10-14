import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

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

    // Check if bot can trade
    const statusResponse = await supabase.functions.invoke('check-trading-status');
    
    if (!statusResponse.data?.can_trade) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Trading paused', 
          reason: statusResponse.data?.stats?.stop_reason || 'Limits reached'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { symbol, side, quantity } = await req.json();

    if (!symbol || !side || !quantity) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: symbol, side, quantity' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute the trade
    const tradeResponse = await supabase.functions.invoke('binance-create-order', {
      body: {
        symbol,
        side,
        type: 'MARKET',
        quantity,
      }
    });

    if (tradeResponse.error) {
      console.error('Trade execution error:', tradeResponse.error);
      return new Response(
        JSON.stringify({ error: 'Failed to execute trade', details: tradeResponse.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update daily stats
    const stats = statusResponse.data.stats;
    const today = new Date().toISOString().split('T')[0];
    
    // Get current account balance
    const accountResponse = await supabase.functions.invoke('binance-account');
    const currentBalance = accountResponse.data?.totalWalletBalance 
      ? parseFloat(accountResponse.data.totalWalletBalance) 
      : stats.current_balance;

    const profitLossPercent = ((currentBalance - stats.starting_balance) / stats.starting_balance) * 100;

    await supabase
      .from('bot_daily_stats')
      .update({
        current_balance: currentBalance,
        profit_loss_percent: profitLossPercent,
        trades_count: stats.trades_count + 1,
      })
      .eq('user_id', user.id)
      .eq('date', today);

    console.log('Trade executed successfully:', {
      symbol,
      side,
      quantity,
      new_balance: currentBalance,
      profit_loss: profitLossPercent.toFixed(2) + '%',
    });

    return new Response(
      JSON.stringify({
        success: true,
        trade: tradeResponse.data,
        stats: {
          current_balance: currentBalance,
          profit_loss_percent: profitLossPercent,
          trades_count: stats.trades_count + 1,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in auto-trade:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
