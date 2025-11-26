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

    console.log('🔍 Monitorando posições DEMO para TP/SL/Trailing...');

    // Buscar todas as posições DEMO abertas
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_demo', true);

    if (posError) {
      console.error('Erro ao buscar posições:', posError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch positions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!positions || positions.length === 0) {
      console.log('Nenhuma posição DEMO aberta para monitorar');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No positions to monitor',
          monitored: 0,
          closed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Monitorando ${positions.length} posições DEMO`);

    let closedCount = 0;
    const closedPositions = [];

    for (const position of positions) {
      const { symbol, entry_price, quantity, highest_price, tp_price, sl_price, trailing_activation, created_at } = position;

      // Buscar preço atual da Binance
      const priceResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
      const priceData = await priceResponse.json();
      const currentPrice = parseFloat(priceData.price);

      console.log(`  📍 ${symbol}: Entry ${entry_price} | Atual ${currentPrice} | TP ${tp_price} | SL ${sl_price}`);

      let shouldClose = false;
      let closeReason = '';
      let profitLoss = 0;

      // 1. Verificar Stop Loss (-0.50%)
      if (sl_price && currentPrice <= sl_price) {
        shouldClose = true;
        closeReason = 'Stop Loss atingido';
        profitLoss = (currentPrice - entry_price) * quantity;
        console.log(`  🛑 ${symbol}: SL ATINGIDO ${currentPrice} <= ${sl_price}`);
      }

      // 2. Verificar Take Profit fixo (+0.20%)
      else if (tp_price && currentPrice >= tp_price) {
        shouldClose = true;
        closeReason = 'Take Profit atingido';
        profitLoss = (currentPrice - entry_price) * quantity;
        console.log(`  ✅ ${symbol}: TP ATINGIDO ${currentPrice} >= ${tp_price}`);
      }

      // 3. Verificar Trailing Stop (ativa em +0.10%, callback 0.15%)
      else if (trailing_activation && currentPrice >= trailing_activation) {
        // Trailing ativado - atualizar highest_price se necessário
        const newHighest = Math.max(highest_price || currentPrice, currentPrice);
        
        if (newHighest !== highest_price) {
          await supabase
            .from('positions')
            .update({ highest_price: newHighest })
            .eq('id', position.id);
          console.log(`  📈 ${symbol}: Novo pico ${newHighest}`);
        }

        // ✅ Callback de 0.15% abaixo do pico (mais agressivo)
        const trailingStopPrice = newHighest * 0.9985;
        if (currentPrice <= trailingStopPrice) {
          shouldClose = true;
          closeReason = 'Trailing Stop acionado';
          profitLoss = (currentPrice - entry_price) * quantity;
          console.log(`  🔻 ${symbol}: TRAILING ACIONADO ${currentPrice} <= ${trailingStopPrice}`);
        }
      }

      // 4. ✅ TIMEOUT: Fechar após 10 minutos se P&L > -0.10%
      if (!shouldClose) {
        const positionAgeMinutes = (Date.now() - new Date(created_at).getTime()) / (1000 * 60);
        if (positionAgeMinutes >= 10) {
          const pnlPercent = ((currentPrice - entry_price) / entry_price) * 100;
          if (pnlPercent > -0.10) {
            shouldClose = true;
            closeReason = 'Timeout (10 min)';
            profitLoss = (currentPrice - entry_price) * quantity;
            console.log(`  ⏱️ ${symbol}: TIMEOUT ${positionAgeMinutes.toFixed(1)} min | P&L ${pnlPercent.toFixed(2)}%`);
          }
        }
      }

      // Se deve fechar, executar venda simulada
      if (shouldClose) {
        const commission = currentPrice * quantity * 0.0004; // 0.04% de comissão
        const netProfitLoss = profitLoss - commission;

        // Registrar trade de fechamento
        await supabase
          .from('trades')
          .insert({
            user_id: user.id,
            symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity,
            price: currentPrice,
            order_id: `DEMO_CLOSE_${Date.now()}`,
            status: 'FILLED',
            executed_at: new Date().toISOString(),
            commission,
            profit_loss: netProfitLoss,
            is_demo: true
          });

        // Deletar posição
        await supabase
          .from('positions')
          .delete()
          .eq('id', position.id);

        // Atualizar bot_daily_stats
        const today = new Date().toISOString().split('T')[0];
        const { data: stats } = await supabase
          .from('bot_daily_stats')
          .select('current_balance, starting_balance, trades_count')
          .eq('user_id', user.id)
          .eq('date', today)
          .eq('is_active', true)
          .single();

        if (stats) {
          const newBalance = stats.current_balance + netProfitLoss;
          const newProfitPercent = ((newBalance - stats.starting_balance) / stats.starting_balance) * 100;

          await supabase
            .from('bot_daily_stats')
            .update({
              current_balance: newBalance,
              trades_count: stats.trades_count + 1,
              profit_loss_percent: newProfitPercent,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('date', today)
            .eq('is_active', true);

          console.log(`  💰 ${symbol}: P&L ${netProfitLoss.toFixed(2)} USDT | Novo saldo: ${newBalance.toFixed(2)} USDT`);
        }

        closedCount++;
        closedPositions.push({
          symbol,
          reason: closeReason,
          profit_loss: netProfitLoss,
          exit_price: currentPrice
        });
      }
    }

    console.log(`✅ Monitoramento concluído: ${closedCount} posições fechadas`);

    return new Response(
      JSON.stringify({
        success: true,
        monitored: positions.length,
        closed: closedCount,
        closed_positions: closedPositions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in monitor-demo-positions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});