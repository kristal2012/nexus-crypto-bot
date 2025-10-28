import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { evaluatePosition, closePosition } from "../_shared/positionMonitorService.ts";

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
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all open positions
    const { data: positions, error: positionsError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id);

    if (positionsError || !positions || positions.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No open positions to monitor',
          closed_positions: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's config
    const { data: config } = await supabase
      .from('auto_trading_config')
      .select('take_profit, stop_loss')
      .eq('user_id', user.id)
      .single();

    if (!config) {
      return new Response(
        JSON.stringify({ error: 'Trading configuration not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get daily stats for global take profit
    const { data: dailyStats } = await supabase
      .from('bot_daily_stats')
      .select('starting_balance, current_balance')
      .eq('user_id', user.id)
      .eq('date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    const startingBalance = dailyStats?.starting_balance || 10000;
    const currentBalance = dailyStats?.current_balance || startingBalance;
    const takeProfitAmount = (startingBalance * config.take_profit) / 100;
    const currentProfitAmount = currentBalance - startingBalance;

    console.log(`📊 Monitoring ${positions.length} positions. Profit: ${currentProfitAmount.toFixed(2)}/${takeProfitAmount.toFixed(2)} USDT`);

    const closedPositions = [];
    const stopLossPercent = config.stop_loss || 1.5;
    const autoCloseProfitPercent = 1.5;

    // Check if global take profit reached
    if (currentProfitAmount >= takeProfitAmount) {
      console.log('🎯 Global take profit reached! Closing all positions...');
      
      // Close all positions in parallel
      const closePromises = positions.map(async (position) => {
        const evaluation = await evaluatePosition(position, stopLossPercent, autoCloseProfitPercent);
        if (evaluation.currentPrice) {
          return closePosition(supabase, position, evaluation.currentPrice, 'TAKE_PROFIT_GLOBAL');
        }
        return null;
      });

      const results = await Promise.all(closePromises);
      closedPositions.push(...results.filter(r => r !== null));
    } else {
      // Evaluate all positions in parallel
      const evaluations = await Promise.all(
        positions.map(position => evaluatePosition(position, stopLossPercent, autoCloseProfitPercent))
      );

      // Update positions with current prices
      await Promise.all(
        positions.map((position, index) => {
          const eval_result = evaluations[index];
          if (eval_result.currentPrice) {
            return supabase
              .from('positions')
              .update({
                current_price: eval_result.currentPrice,
                unrealized_pnl: eval_result.pnl
              })
              .eq('id', position.id);
          }
          return Promise.resolve();
        })
      );

      // Close positions that need to be closed
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const evaluation = evaluations[i];

        if (evaluation.shouldClose && evaluation.currentPrice) {
          const result = await closePosition(supabase, position, evaluation.currentPrice, evaluation.reason);
          if (result) {
            closedPositions.push(result);
          }
        } else if (evaluation.currentPrice) {
          console.log(`${position.symbol}: ${evaluation.pnl.toFixed(2)} USDT (${evaluation.pnlPercent.toFixed(2)}%)`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        monitored_positions: positions.length,
        closed_positions: closedPositions.length,
        closed_details: closedPositions,
        current_profit: currentProfitAmount,
        target_profit: takeProfitAmount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in monitor-positions:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Position monitoring failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
