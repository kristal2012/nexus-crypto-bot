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

    // Check if trading is enabled system-wide
    const { data: systemSettings } = await supabase
      .from('system_settings')
      .select('trading_enabled, emergency_message')
      .single();
    
    if (!systemSettings?.trading_enabled) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Trading is currently paused', 
          message: systemSettings?.emergency_message 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ====================================================================
    // CRITICAL SAFETY CHECK: Validate trading mode
    // ====================================================================
    const { data: settingsData, error: settingsError } = await supabase
      .from('trading_settings')
      .select('trading_mode, demo_balance, real_mode_confirmed_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      console.error('❌ Error fetching trading settings:', settingsError);
    }

    // Create default DEMO settings if none exist
    let settings = settingsData;
    if (!settings) {
      console.log('⚠️ No trading settings found - creating DEMO mode by default');
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
        console.error('❌ Error creating settings:', insertError);
        // FAIL-SAFE: If we can't create settings, reject the trade
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to initialize trading settings',
            message: 'Could not determine trading mode. Please try again.'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        settings = newSettings;
      }
    }

    // ====================================================================
    // DETERMINE TRADING MODE - CRITICAL SECURITY LOGIC
    // ====================================================================
    const tradingMode = settings?.trading_mode || 'DEMO';
    const isDemo = tradingMode === 'DEMO';

    if (isDemo) {
      console.log('✅ DEMO MODE ACTIVE - Trade will be SIMULATED (no real Binance execution)');
    } else {
      console.log('🔴 REAL MODE - Preparing to execute REAL trade on Binance');
      
      // VALIDATION: For real mode, require recent confirmation (5 min window)
      const confirmedAt = settings?.real_mode_confirmed_at ? new Date(settings.real_mode_confirmed_at) : null;
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      if (!confirmedAt || confirmedAt < fiveMinutesAgo) {
        console.warn('⚠️ REAL MODE BLOCKED: Confirmation expired or missing');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Real mode requires confirmation',
            message: 'Please confirm real mode trading in settings before executing trades. Confirmation expires after 5 minutes for security.'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('✅ Real mode confirmation valid - proceeding with REAL trade');
    }

    // Check if bot can trade (with error handling)
    let statusResponse;
    let stats;
    
    try {
      statusResponse = await supabase.functions.invoke('check-trading-status');
      
      if (statusResponse.error) {
        console.error('Status check error:', statusResponse.error);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to check trading status',
            message: 'Could not verify if trading is allowed at this moment'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
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
      
      stats = statusResponse.data.stats;
    } catch (error) {
      console.error('Exception checking trading status:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Trading status check failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { symbol, side, quantity, quoteOrderQty, takeProfitAmount, stopLossAmount } = await req.json();

    // Check if either quantity or quoteOrderQty is provided
    if (!symbol || !side || (!quantity && !quoteOrderQty)) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: symbol, side, and either quantity or quoteOrderQty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate quantity or quoteOrderQty
    const valueToValidate = quoteOrderQty || quantity;
    const valueNum = parseFloat(valueToValidate);
    if (isNaN(valueNum)) {
      console.error(`Validation failed: Invalid number format for ${quoteOrderQty ? 'quoteOrderQty' : 'quantity'}: ${valueToValidate}`);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid value: must be a valid number',
          field: quoteOrderQty ? 'quoteOrderQty' : 'quantity',
          value: valueToValidate
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (valueNum <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid value: must be greater than 0' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (valueNum > 1000000) {
      return new Response(
        JSON.stringify({ error: 'Invalid value: exceeds maximum allowed (1,000,000)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Check decimal places (max 8 for crypto)
    const decimalPlaces = (valueToValidate.toString().split('.')[1] || '').length;
    if (decimalPlaces > 8) {
      console.error(`Validation failed: Too many decimal places for ${quoteOrderQty ? 'quoteOrderQty' : 'quantity'}: ${valueToValidate} (${decimalPlaces} places)`);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid value: maximum 8 decimal places allowed',
          field: quoteOrderQty ? 'quoteOrderQty' : 'quantity',
          value: valueToValidate,
          decimal_places: decimalPlaces
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate symbol format - must be uppercase letters ending in USDT
    if (!/^[A-Z]{2,10}USDT$/.test(symbol) || symbol.length < 5 || symbol.length > 15) {
      return new Response(
        JSON.stringify({ error: 'Invalid symbol format. Symbol must be uppercase letters ending in USDT (e.g., BTCUSDT)' }),
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

    // ====================================================================
    // TRADE EXECUTION - DEMO vs REAL
    // ====================================================================
    console.log(`📊 Executing ${isDemo ? 'DEMO' : 'REAL'} trade:`, { 
      symbol, 
      side, 
      quantity, 
      quoteOrderQty, 
      mode: isDemo ? 'SIMULATED' : 'BINANCE_API' 
    });

    let orderData;
    let executedPrice;
    let executedQty;

    if (isDemo) {
      // ====================================================================
      // DEMO MODE: Simulate trade using live prices (NO BINANCE API CALL)
      // ====================================================================
      console.log('💡 DEMO MODE: Fetching live market price for simulation...');
      const marketPriceResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
      const marketPriceData = await marketPriceResponse.json();
      executedPrice = parseFloat(marketPriceData.price);
      
      // If quoteOrderQty is provided, calculate quantity from USDT value
      if (quoteOrderQty) {
        const usdtValue = parseFloat(quoteOrderQty);
        executedQty = usdtValue / executedPrice;
      } else {
        executedQty = parseFloat(quantity);
      }

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
        executedQty: executedQty.toString(),
        avgPrice: executedPrice.toString(),
        commission: commission.toString(),
        status: 'FILLED'
      };

      console.log('✅ DEMO trade simulated successfully:', orderData);
    } else {
      // ====================================================================
      // REAL MODE: Execute actual trade on Binance
      // CRITICAL: This calls the real Binance API with real money
      // ====================================================================
      console.log('🔴 REAL MODE: Calling Binance API to execute REAL trade...');
      const orderBody: any = {
        symbol,
        side,
        type: 'MARKET',
      };
      
      // Use quoteOrderQty if provided, otherwise use quantity
      if (quoteOrderQty) {
        orderBody.quoteOrderQty = quoteOrderQty;
      } else {
        orderBody.quantity = quantity;
      }
      
      const tradeResponse = await supabase.functions.invoke('binance-create-order', {
        body: orderBody
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

    // Store trade in database and manage positions
    let profitLoss = null;
    
    // Manage positions
    if (side === 'BUY') {
      // Opening or adding to a LONG position
      const { data: existingPosition } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('symbol', symbol)
        .eq('is_demo', isDemo)
        .maybeSingle();

      const commission = parseFloat(orderData.commission || '0');

      if (existingPosition) {
        // Update existing position (average entry price INCLUDING commissions)
        const totalQty = parseFloat(existingPosition.quantity) + executedQty;
        // Include commission in the cost basis
        const totalCost = (parseFloat(existingPosition.entry_price) * parseFloat(existingPosition.quantity)) + (executedPrice * executedQty) + commission;
        const avgEntryPrice = totalCost / totalQty;

        await supabase
          .from('positions')
          .update({
            quantity: totalQty,
            entry_price: avgEntryPrice,
            current_price: executedPrice,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPosition.id);
      } else {
        // Create new position with commission included in entry price
        const entryPriceWithCommission = (executedPrice * executedQty + commission) / executedQty;
        
        await supabase
          .from('positions')
          .insert({
            user_id: user.id,
            symbol,
            side: 'LONG',
            quantity: executedQty,
            entry_price: entryPriceWithCommission,
            current_price: executedPrice,
            is_demo: isDemo
          });
      }

      // Note: Stop loss monitoring is handled by monitor-positions function
    } else if (side === 'SELL') {
      // Closing or reducing a LONG position
      const { data: existingPosition } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('symbol', symbol)
        .eq('is_demo', isDemo)
        .maybeSingle();

      if (existingPosition) {
        const positionQty = parseFloat(existingPosition.quantity);
        const entryPrice = parseFloat(existingPosition.entry_price);
        const commission = parseFloat(orderData.commission || '0');
        
        // Calculate P&L for the sold quantity INCLUDING exit commission
        // Entry price already includes entry commission from when position was opened
        const soldQty = Math.min(executedQty, positionQty);
        profitLoss = (executedPrice - entryPrice) * soldQty - commission;
        
        console.log(`Position closed/reduced: Entry ${entryPrice.toFixed(4)}, Exit ${executedPrice.toFixed(4)}, Qty ${soldQty}, P&L ${profitLoss.toFixed(2)} USDT (including commissions)`);
        
        if (executedQty >= positionQty) {
          // Close entire position
          await supabase
            .from('positions')
            .delete()
            .eq('id', existingPosition.id);
        } else {
          // Reduce position
          await supabase
            .from('positions')
            .update({
              quantity: positionQty - executedQty,
              current_price: executedPrice,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingPosition.id);
        }
      }
    }

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
        profit_loss: profitLoss,
        is_demo: isDemo
      });

    if (tradeError) {
      console.error('Error storing trade:', tradeError);
    }

    // Update daily stats
    const today = new Date().toISOString().split('T')[0];
    
    let currentBalance;
    let usdtBalance;
    
    if (isDemo) {
      const { data: updatedSettings } = await supabase
        .from('trading_settings')
        .select('demo_balance')
        .eq('user_id', user.id)
        .single();
      
      usdtBalance = updatedSettings 
        ? (typeof updatedSettings.demo_balance === 'string' 
          ? parseFloat(updatedSettings.demo_balance) 
          : updatedSettings.demo_balance)
        : stats.current_balance;
      
      // Calculate total value including open positions
      const { data: positions } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_demo', isDemo);
      
      let positionsValue = 0;
      if (positions && positions.length > 0) {
        for (const pos of positions) {
          // Get current market price for each position
          try {
            const priceResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${pos.symbol}`);
            const priceData = await priceResponse.json();
            const currentPrice = parseFloat(priceData.price);
            const positionValue = currentPrice * parseFloat(pos.quantity);
            positionsValue += positionValue;
            
            // Update position current price and unrealized P&L
            const unrealizedPnl = (currentPrice - parseFloat(pos.entry_price)) * parseFloat(pos.quantity);
            await supabase
              .from('positions')
              .update({
                current_price: currentPrice,
                unrealized_pnl: unrealizedPnl
              })
              .eq('id', pos.id);
          } catch (error) {
            console.error(`Error fetching price for ${pos.symbol}:`, error);
          }
        }
      }
      
      currentBalance = usdtBalance + positionsValue;
    } else {
      // MODO REAL: Buscar saldo real da Binance
      console.log("💰 [REAL MODE] Fetching balance from Binance...");
      const accountResponse = await supabase.functions.invoke('binance-account');
      if (accountResponse.error) {
        console.error("❌ [REAL MODE] Error fetching Binance balance:", accountResponse.error);
        currentBalance = stats.current_balance; // Fallback to previous balance
      } else {
        currentBalance = accountResponse.data?.totalWalletBalance 
          ? parseFloat(accountResponse.data.totalWalletBalance) 
          : stats.current_balance;
        console.log(`💰 [REAL MODE] Binance balance: ${currentBalance} USDT`);
      }
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
      quantity: executedQty,
      quoteOrderQty,
      value_usdt: (executedPrice * executedQty).toFixed(2),
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
      JSON.stringify({ 
        success: false,
        error: 'Trade execution failed' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
