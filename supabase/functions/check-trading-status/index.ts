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

    // Get or create today's stats
    const today = new Date().toISOString().split('T')[0];
    let { data: stats, error: statsError } = await supabase
      .from('bot_daily_stats')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (statsError) {
      console.error('Error fetching stats:', statsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stats' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no stats exist for today, create them
    if (!stats) {
      // Get account balance from Binance
      const { data: apiKeys } = await supabase
        .from('binance_api_keys')
        .select('api_key')
        .eq('user_id', user.id)
        .maybeSingle();

      let initialBalance = 10000; // Default balance if can't fetch

      if (apiKeys) {
        try {
          const accountResponse = await supabase.functions.invoke('binance-account');
          if (accountResponse.data?.totalWalletBalance) {
            initialBalance = parseFloat(accountResponse.data.totalWalletBalance);
          }
        } catch (e) {
          console.error('Failed to fetch balance:', e);
        }
      }

      const { data: newStats, error: insertError } = await supabase
        .from('bot_daily_stats')
        .insert({
          user_id: user.id,
          date: today,
          starting_balance: initialBalance,
          current_balance: initialBalance,
          profit_loss_percent: 0,
          trades_count: 0,
          is_active: true,
          can_trade: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating stats:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to create stats' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      stats = newStats;
    }

    // Get user's trading limits from config
    const { data: config } = await supabase
      .from('auto_trading_config')
      .select('take_profit, stop_loss')
      .eq('user_id', user.id)
      .maybeSingle();

    const takeProfit = config?.take_profit || 10; // Default 10%
    const stopLoss = config?.stop_loss || -5; // Default -5%

    let canTrade = stats.can_trade && stats.is_active;
    let stopReason = stats.stop_reason;

    if (stats.profit_loss_percent >= takeProfit) {
      canTrade = false;
      stopReason = `Take profit atingido: ${stats.profit_loss_percent.toFixed(2)}%`;
      
      // Update database
      await supabase
        .from('bot_daily_stats')
        .update({ 
          can_trade: false, 
          stop_reason: stopReason 
        })
        .eq('id', stats.id);
    } else if (stats.profit_loss_percent <= stopLoss) {
      canTrade = false;
      stopReason = `Stop loss atingido: ${stats.profit_loss_percent.toFixed(2)}%`;
      
      // Update database
      await supabase
        .from('bot_daily_stats')
        .update({ 
          can_trade: false, 
          stop_reason: stopReason 
        })
        .eq('id', stats.id);
    }

    return new Response(
      JSON.stringify({
        can_trade: canTrade,
        stats: {
          ...stats,
          can_trade: canTrade,
          stop_reason: stopReason,
        },
        limits: {
          take_profit: takeProfit,
          stop_loss: stopLoss,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-trading-status:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
