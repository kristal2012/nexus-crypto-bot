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
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all open positions for the user
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

    // Get user's stop loss and take profit settings
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

    const closedPositions = [];

    // Get today's starting balance for take profit calculation
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

    console.log(`Monitoring ${positions.length} positions. Current profit: ${currentProfitAmount.toFixed(2)} USDT, Target: ${takeProfitAmount.toFixed(2)} USDT`);

    // Check if global take profit reached
    if (currentProfitAmount >= takeProfitAmount) {
      console.log('Global take profit reached! Closing all positions...');
      
      for (const position of positions) {
        try {
          // Get current market price from Futures API
          const priceUrl = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${position.symbol}`;
          
          const priceResponse = await fetch(priceUrl, {
            signal: AbortSignal.timeout(5000)
          });
          
          if (!priceResponse.ok) {
            console.error(`Failed to get price for ${position.symbol}: ${priceResponse.status}`);
            continue;
          }
          
          const priceData = await priceResponse.json();
          const currentPrice = parseFloat(priceData.price);
          
          // Close the position by selling
          const { data: tradeResult, error: tradeError } = await supabase.functions.invoke('auto-trade', {
            body: {
              symbol: position.symbol,
              side: 'SELL',
              quantity: position.quantity.toString()
            }
          });

          if (!tradeError && tradeResult?.success) {
            closedPositions.push({
              symbol: position.symbol,
              reason: 'TAKE_PROFIT_GLOBAL',
              entry_price: position.entry_price,
              exit_price: currentPrice,
              quantity: position.quantity
            });
            console.log(`Closed ${position.symbol} due to global take profit`);
          }
        } catch (error) {
          console.error(`Error closing position ${position.symbol}:`, error);
        }
      }
    } else {
      // Check individual position stop losses and take profits
      for (const position of positions) {
        try {
          // Get current market price from Futures API
          const priceUrl = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${position.symbol}`;
          
          const priceResponse = await fetch(priceUrl, {
            signal: AbortSignal.timeout(5000)
          });
          
          if (!priceResponse.ok) {
            console.error(`Failed to get price for ${position.symbol}: ${priceResponse.status}`);
            continue;
          }
          
          const priceData = await priceResponse.json();
          const currentPrice = parseFloat(priceData.price);
          
          const entryPrice = parseFloat(position.entry_price);
          const quantity = parseFloat(position.quantity);
          const positionValue = entryPrice * quantity;
          const unrealizedPnL = (currentPrice - entryPrice) * quantity;
          const pnlPercent = (unrealizedPnL / positionValue) * 100;
          
          // Update unrealized P&L
          await supabase
            .from('positions')
            .update({
              current_price: currentPrice,
              unrealized_pnl: unrealizedPnL
            })
            .eq('id', position.id);

          // Calculate stop loss as percentage of position value
          const stopLossPercent = config.stop_loss || 1.5;
          const stopLossAmount = (positionValue * stopLossPercent) / 100;
          
          // AUTO CLOSE PROFIT: Close position if profit > 1.5%
          const autoCloseProfitPercent = 1.5;
          
          if (unrealizedPnL > 0 && pnlPercent >= autoCloseProfitPercent) {
            console.log(`Auto-closing profitable position ${position.symbol}: P&L ${unrealizedPnL.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`);
            
            // Close the position to realize profit
            const { data: tradeResult, error: tradeError } = await supabase.functions.invoke('auto-trade', {
              body: {
                symbol: position.symbol,
                side: 'SELL',
                quantity: position.quantity.toString()
              }
            });

            if (!tradeError && tradeResult?.success) {
              closedPositions.push({
                symbol: position.symbol,
                reason: 'AUTO_TAKE_PROFIT',
                entry_price: entryPrice,
                exit_price: currentPrice,
                quantity: quantity,
                pnl: unrealizedPnL
              });
              console.log(`Closed ${position.symbol} to realize ${pnlPercent.toFixed(2)}% profit`);
            }
          }
          // Check if stop loss triggered
          else if (unrealizedPnL < 0 && Math.abs(unrealizedPnL) >= stopLossAmount) {
            console.log(`Stop loss triggered for ${position.symbol}: P&L ${unrealizedPnL.toFixed(2)} USDT`);
            
            // Close the position
            const { data: tradeResult, error: tradeError } = await supabase.functions.invoke('auto-trade', {
              body: {
                symbol: position.symbol,
                side: 'SELL',
                quantity: position.quantity.toString()
              }
            });

            if (!tradeError && tradeResult?.success) {
              closedPositions.push({
                symbol: position.symbol,
                reason: 'STOP_LOSS',
                entry_price: entryPrice,
                exit_price: currentPrice,
                quantity: quantity,
                pnl: unrealizedPnL
              });
              console.log(`Closed ${position.symbol} due to stop loss`);
            }
          } else {
            console.log(`${position.symbol}: Entry ${entryPrice.toFixed(4)}, Current ${currentPrice.toFixed(4)}, P&L ${unrealizedPnL.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`);
          }
        } catch (error) {
          console.error(`Error monitoring position ${position.symbol}:`, error);
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
