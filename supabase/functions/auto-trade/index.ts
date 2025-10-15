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

    // Get trading settings to check if in demo mode
    const { data: settingsData, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching trading settings:', settingsError);
    }

    // Create default settings if none exist
    let settings = settingsData;
    if (!settings) {
      const { data: newSettings, error: insertError } = await supabase
        .from('trading_settings')
        .insert({
          user_id: user.id,
          trading_mode: 'DEMO',
          demo_balance: 10000
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Error creating settings:', insertError);
      } else {
        settings = newSettings;
      }
    }

    const isDemo = settings?.trading_mode === 'DEMO';

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

    console.log('Executing trade:', { symbol, side, quantity, isDemo });

    let orderData;
    let executedPrice;
    let executedQty;

    if (isDemo) {
      // Simulate trade execution using live market price
      const marketPriceResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
      const marketPriceData = await marketPriceResponse.json();
      executedPrice = parseFloat(marketPriceData.price);
      executedQty = parseFloat(quantity);

      // Calculate new demo balance
      const currentDemoBalance = typeof settings!.demo_balance === 'string' 
        ? parseFloat(settings!.demo_balance) 
        : settings!.demo_balance;
      
      const tradeValue = executedPrice * executedQty;
      const commission = tradeValue * 0.0004; // 0.04% commission
      const newBalance = side === 'BUY' 
        ? currentDemoBalance - tradeValue - commission
        : currentDemoBalance + tradeValue - commission;

      // Update demo balance
      const { error: balanceError } = await supabase
        .from('trading_settings')
        .update({ demo_balance: newBalance.toString() })
        .eq('user_id', user.id);

      if (balanceError) {
        console.error('Error updating demo balance:', balanceError);
      }

      orderData = {
        orderId: `DEMO_${Date.now()}`,
        symbol,
        side,
        type: 'MARKET',
        executedQty: quantity,
        avgPrice: executedPrice.toString(),
        commission: commission.toString(),
        status: 'FILLED'
      };

      console.log('Demo trade executed:', orderData);
    } else {
      // Execute real trade
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

      orderData = tradeResponse.data;
      executedPrice = parseFloat(orderData.avgPrice);
      executedQty = parseFloat(orderData.executedQty);
      console.log('Real trade executed:', orderData);
    }

    // Store trade in database
    const { error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        symbol,
        side,
        type: 'MARKET',
        quantity: executedQty,
        price: executedPrice,
        order_id: orderData.orderId.toString(),
        status: 'FILLED',
        executed_at: new Date().toISOString(),
        commission: parseFloat(orderData.commission || '0'),
        is_demo: isDemo
      });

    if (tradeError) {
      console.error('Error storing trade:', tradeError);
    }

    // Update daily stats
    const stats = statusResponse.data.stats;
    const today = new Date().toISOString().split('T')[0];
    
    let currentBalance;
    if (isDemo) {
      const { data: updatedSettings } = await supabase
        .from('trading_settings')
        .select('demo_balance')
        .eq('user_id', user.id)
        .single();
      
      currentBalance = updatedSettings 
        ? (typeof updatedSettings.demo_balance === 'string' 
          ? parseFloat(updatedSettings.demo_balance) 
          : updatedSettings.demo_balance)
        : stats.current_balance;
    } else {
      // Get current account balance for real trades
      const accountResponse = await supabase.functions.invoke('binance-account');
      currentBalance = accountResponse.data?.totalWalletBalance 
        ? parseFloat(accountResponse.data.totalWalletBalance) 
        : stats.current_balance;
    }

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
      isDemo,
      new_balance: currentBalance,
      profit_loss: profitLossPercent.toFixed(2) + '%',
    });

    return new Response(
      JSON.stringify({
        success: true,
        trade: orderData,
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
