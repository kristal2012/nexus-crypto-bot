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

    // Check system settings
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

    // Get trading settings
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

    // Determine trading mode
    const tradingMode = settings?.trading_mode || 'DEMO';
    const isDemo = tradingMode === 'DEMO';

    if (isDemo) {
      console.log('✅ DEMO MODE ACTIVE');
    } else {
      console.log('🔴 REAL MODE');
      
      const confirmedAt = settings?.real_mode_confirmed_at ? new Date(settings.real_mode_confirmed_at) : null;
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      if (!confirmedAt || confirmedAt < fiveMinutesAgo) {
        console.warn('⚠️ REAL MODE BLOCKED: Confirmation expired or missing');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Real mode requires confirmation',
            message: 'Please confirm real mode trading in settings before executing trades.'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check trading status
    let statusResponse;
    let stats;
    
    try {
      statusResponse = await supabase.functions.invoke('check-trading-status');
      
      if (statusResponse.error) {
        console.error('Status check error:', statusResponse.error);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to check trading status'
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
          error: 'Trading status check failed'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { symbol, side, quantity, quoteOrderQty } = await req.json();

    // Validate inputs
    if (!symbol || !side || (!quantity && !quoteOrderQty)) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const valueToValidate = quoteOrderQty || quantity;
    const valueNum = parseFloat(valueToValidate);
    if (isNaN(valueNum) || valueNum <= 0 || valueNum > 1000000) {
      return new Response(
        JSON.stringify({ error: 'Invalid value' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!/^[A-Z]{2,10}USDT$/.test(symbol)) {
      return new Response(
        JSON.stringify({ error: 'Invalid symbol format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (side !== 'BUY' && side !== 'SELL') {
      return new Response(
        JSON.stringify({ error: 'Invalid side' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ====================================================================
    // TRADE EXECUTION
    // ====================================================================
    console.log(`📊 Executing ${isDemo ? 'DEMO' : 'REAL'} trade:`, { symbol, side, quantity, quoteOrderQty });

    let orderData;
    let executedPrice;
    let executedQty;

    if (isDemo) {
      // DEMO MODE: Simulate
      console.log('💡 DEMO MODE: Fetching market price...');
      const marketPriceResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
      const marketPriceData = await marketPriceResponse.json();
      executedPrice = parseFloat(marketPriceData.price);
      
      if (quoteOrderQty) {
        const usdtValue = parseFloat(quoteOrderQty);
        executedQty = usdtValue / executedPrice;
      } else {
        executedQty = parseFloat(quantity);
      }

      const tradeValue = executedPrice * executedQty;
      const commission = tradeValue * 0.0004; // 0.04%

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

      console.log('✅ DEMO trade simulated:', orderData);
    } else {
      // REAL MODE
      console.log('🔴 REAL MODE: Calling Binance API...');
      const orderBody: any = { symbol, side, type: 'MARKET' };
      
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
    }

    // ====================================================================
    // GESTÃO DE POSIÇÕES E SALDO
    // ====================================================================
    let profitLoss = null;
    const commission = parseFloat(orderData.commission || '0');
    const tradeValue = executedPrice * executedQty;
    
    if (side === 'BUY') {
      // ABERTURA DE POSIÇÃO
      const { data: existingPosition } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('symbol', symbol)
        .eq('is_demo', isDemo)
        .maybeSingle();

      if (existingPosition) {
        // Atualizar posição existente
        const totalQty = parseFloat(existingPosition.quantity) + executedQty;
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
          
        console.log(`📍 Posição atualizada: ${symbol} ${totalQty.toFixed(4)} @ ${avgEntryPrice.toFixed(4)}`);
      } else {
        // Nova posição
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
          
        console.log(`📍 Nova posição: ${symbol} ${executedQty.toFixed(4)} @ ${entryPriceWithCommission.toFixed(4)}`);
      }
    } else {
      // FECHAMENTO DE POSIÇÃO
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
        
        const soldQty = Math.min(executedQty, positionQty);
        profitLoss = (executedPrice - entryPrice) * soldQty - commission;
        
        console.log(`💰 P&L: ${profitLoss.toFixed(2)} USDT (${soldQty.toFixed(4)} @ ${entryPrice.toFixed(4)} → ${executedPrice.toFixed(4)})`);
        
        if (executedQty >= positionQty) {
          // Fechar posição completa
          await supabase
            .from('positions')
            .delete()
            .eq('id', existingPosition.id);
            
          console.log(`📍 Posição fechada: ${symbol}`);
        } else {
          // Reduzir posição
          await supabase
            .from('positions')
            .update({
              quantity: positionQty - executedQty,
              current_price: executedPrice,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingPosition.id);
            
          console.log(`📍 Posição reduzida: ${symbol} ${(positionQty - executedQty).toFixed(4)}`);
        }
      }
    }

    // Registrar trade
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
        commission,
        profit_loss: profitLoss,
        is_demo: isDemo
      });

    if (tradeError) {
      console.error('Error storing trade:', tradeError);
    }

    // ====================================================================
    // ATUALIZAR SALDO (SSOT)
    // ====================================================================
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Buscar saldo atual
    const { data: currentStats } = await supabase
      .from('bot_daily_stats')
      .select('current_balance, starting_balance, trades_count')
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('is_active', true)
      .single();
    
    if (currentStats) {
      let newBalance = currentStats.current_balance;
      
      if (side === 'BUY') {
        // AO COMPRAR: Deduz valor total do trade + comissão
        newBalance -= (tradeValue + commission);
        console.log(`💳 Deduzindo trade completo: ${tradeValue.toFixed(4)} USDT + comissão: ${commission.toFixed(4)} USDT`);
      } else {
        // AO VENDER: Adiciona P&L - comissão
        newBalance += (profitLoss || 0) - commission;
        console.log(`💰 Adicionando P&L: ${((profitLoss || 0) - commission).toFixed(4)} USDT`);
      }
      
      // Atualizar saldo
      await supabase
        .from('bot_daily_stats')
        .update({
          current_balance: newBalance,
          trades_count: currentStats.trades_count + 1,
          profit_loss_percent: ((newBalance - currentStats.starting_balance) / currentStats.starting_balance) * 100,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('date', today)
        .eq('is_active', true);
        
      console.log(`✅ Saldo atualizado: ${currentStats.current_balance.toFixed(2)} → ${newBalance.toFixed(2)} USDT`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        order: orderData,
        mode: isDemo ? 'DEMO' : 'REAL'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in auto-trade function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
