import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, decryptSecretLegacy } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PriceData {
  symbol: string;
  prices: number[];
  currentPrice: number;
  volatility: number;
}

interface AIAnalysis {
  symbol: string;
  predictedPrice: number;
  confidence: number;
  trend: 'up' | 'down' | 'neutral';
  recommendedDcaLayers: number;
  minNotional: number;
  calculatedQuantity: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ 
        error: 'Authentication required' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if trading is enabled system-wide
    const { data: systemSettings } = await supabase
      .from('system_settings')
      .select('trading_enabled, emergency_message')
      .single();
    
    if (!systemSettings?.trading_enabled) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Trading is currently paused', 
        message: systemSettings?.emergency_message 
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use atomic row-level locking to prevent race conditions
    // This ensures only one analysis runs at a time per user
    const { data: lockData, error: lockError } = await supabase.rpc('acquire_analysis_lock', {
      p_user_id: user.id,
      p_cooldown_minutes: 2  // Reduced to 2 minutes for more frequent analysis attempts
    });

    if (lockError) {
      console.error('Lock acquisition error:', lockError);
      
      // Check if it's a rate limit error
      // CRITICAL: Return 200 status (not 429) to prevent error reporting
      // The rate_limited flag tells the frontend to handle this gracefully
      if (lockError.message?.includes('Rate limit')) {
        const match = lockError.message.match(/(\d+) seconds remaining/);
        const remainingSeconds = match ? parseInt(match[1]) : 900;
        
        console.log(`⏳ Rate limit active: ${remainingSeconds}s remaining (returning 200 with rate_limited flag)`);
        
        return new Response(JSON.stringify({ 
          success: false,
          rate_limited: true,
          message: `Please wait before running another analysis`,
          remaining_seconds: remainingSeconds
        }), {
          status: 200, // Changed from 429 to prevent error reporting
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Generic error for other issues
      return new Response(JSON.stringify({ 
        error: 'Service temporarily unavailable'
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('🤖 AI Auto-Trade Function Started');

    // Buscar configuração primeiro (necessário para ajuste adaptativo)
    const { data: configData, error: configError } = await supabase
      .from('auto_trading_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (configError || !configData) {
      console.error('❌ Erro ao buscar configuração:', configError);
      return new Response(JSON.stringify({ 
        error: 'Configuration not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const config = configData;

    // ===== SISTEMA ADAPTATIVO: Detectar e ajustar perdas consecutivas =====
    console.log(`\n🔄 Verificando necessidade de ajuste adaptativo...`);
    
    // Importar serviço adaptativo
    const { analyzeConsecutiveLosses, applyAdaptiveAdjustment, getCurrentStrategyName } = 
      await import('../_shared/adaptiveStrategyService.ts');
    
    // Obter estratégia atual
    const currentStrategyName = getCurrentStrategyName({
      leverage: config.leverage,
      stop_loss: config.stop_loss,
      take_profit: config.take_profit,
      min_confidence: config.min_confidence
    });
    
    console.log(`📊 Estratégia Atual: ${currentStrategyName}`);
    
    // Analisar perdas consecutivas
    const lossAnalysis = await analyzeConsecutiveLosses(supabase, user.id, currentStrategyName);
    
    console.log(`📈 Análise de Perdas: 
      - Perdas consecutivas: ${lossAnalysis.consecutiveLosses}
      - Ajuste necessário: ${lossAnalysis.shouldAdjust}
      - Estratégia recomendada: ${lossAnalysis.recommendedStrategy}
      - Razão: ${lossAnalysis.reason}
    `);
    
    // Aplicar ajuste adaptativo se necessário
    if (lossAnalysis.shouldAdjust) {
      console.log(`🔧 Aplicando ajuste adaptativo automático...`);
      const adjusted = await applyAdaptiveAdjustment(supabase, user.id, lossAnalysis);
      
      if (adjusted) {
        console.log(`✅ Estratégia ajustada automaticamente de ${currentStrategyName} para ${lossAnalysis.recommendedStrategy}`);
        
        // Recarregar configuração atualizada
        const { data: updatedConfig } = await supabase
          .from('auto_trading_config')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        if (updatedConfig) {
          Object.assign(config, updatedConfig);
          console.log(`🔄 Configuração recarregada com novos parâmetros`);
        }
      }
    }

    // ===== CIRCUIT BREAKER VALIDATION =====
    // Verificar se estratégia foi ajustada recentemente
    const { data: autoConfig } = await supabase
      .from('auto_trading_config')
      .select('strategy_adjusted_at')
      .eq('user_id', user.id)
      .single();

    // Se estratégia foi ajustada, só considerar trades APÓS esse timestamp
    const startDate = autoConfig?.strategy_adjusted_at 
      ? new Date(autoConfig.strategy_adjusted_at).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`Circuit Breaker: Analisando trades desde ${startDate}${autoConfig?.strategy_adjusted_at ? ' (após ajuste de estratégia)' : ''}`);

    // Verificar performance histórica antes de executar análise
    // IMPORTANTE: Só considera trades FECHADOS (com profit_loss calculado)
    // Ignora posições abertas para não acionar circuit breaker prematuramente
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('profit_loss')
      .eq('user_id', user.id)
      .gte('created_at', startDate)
      .not('profit_loss', 'is', null); // ✅ Ignora posições abertas

    if (recentTrades && recentTrades.length >= 10) {
      const totalTrades = recentTrades.length;
      const winningTrades = recentTrades.filter((t: any) => t.profit_loss > 0).length;
      const losingTrades = recentTrades.filter((t: any) => t.profit_loss < 0).length;
      const winRate = (winningTrades / totalTrades) * 100;
      const totalProfitLoss = recentTrades.reduce((sum: number, t: any) => sum + (t.profit_loss || 0), 0);
      const lossPercent = Math.abs(totalProfitLoss / 10000) * 100;

      console.log(`📊 Circuit Breaker Check: 
  - Total trades fechados: ${totalTrades}
  - Wins: ${winningTrades}
  - Losses: ${losingTrades}
  - Win Rate: ${winRate.toFixed(1)}%
  - Loss %: ${lossPercent.toFixed(1)}%
  - (Posições abertas ignoradas)
`);

      // CRITICAL: Win rate abaixo de 20% = STOP TRADING
      if (winRate < 20) {
        console.error(`🛑 CIRCUIT BREAKER ACTIVATED: Win rate crítico (${winRate.toFixed(1)}%)`);
        return new Response(JSON.stringify({
          success: false,
          circuit_breaker: true,
          message: `Trading pausado por segurança: Win rate crítico de ${winRate.toFixed(1)}% (mínimo: 20%). Ajuste a estratégia antes de continuar.`,
          metrics: { winRate, totalTrades, lossPercent }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // CRITICAL: Perda acima de 10% = STOP TRADING
      if (lossPercent > 10) {
        console.error(`🛑 CIRCUIT BREAKER ACTIVATED: Perda crítica (${lossPercent.toFixed(1)}%)`);
        return new Response(JSON.stringify({
          success: false,
          circuit_breaker: true,
          message: `Trading pausado: Perda de ${lossPercent.toFixed(1)}% (máximo: 10%). Protegendo capital.`,
          metrics: { winRate, totalTrades, lossPercent }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // WARNING: Performance abaixo do ideal
      if (winRate < 40 || lossPercent > 5) {
        console.warn(`⚠️ Performance Warning: Win Rate=${winRate.toFixed(1)}%, Loss=${lossPercent.toFixed(1)}%`);
      }
    }

    // Major crypto pairs to analyze (excluding BTC and ETH)
    const symbols = [
      'BNBUSDT', 'SOLUSDT', 'ADAUSDT',
      'DOGEUSDT', 'XRPUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT',
      'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT'
    ];

    console.log(`Analyzing ${symbols.length} crypto pairs...`);

    // ====================================================================
    // VALIDATE CREDENTIALS: Using centralized service (SRP principle)
    // ====================================================================
    const { validateAndGetCredentials } = await import('../_shared/binanceCredentialsService.ts');
    
    const { result: credentialResult, credentials } = await validateAndGetCredentials(supabase, user.id);
    
    if (!credentialResult.isValid) {
      console.error('❌ Credential validation failed:', credentialResult);
      
      // Return user-friendly error based on error code
      const statusCode = credentialResult.errorCode === 'MISSING_CREDENTIALS' ? 400 : 500;
      
      return new Response(JSON.stringify({ 
        success: false,
        error: credentialResult.error,
        message: credentialResult.errorCode === 'DECRYPTION_FAILED'
          ? 'Não foi possível descriptografar suas credenciais. Por favor, reconfigure suas chaves da Binance nas configurações.'
          : credentialResult.errorCode === 'MISSING_CREDENTIALS'
          ? 'Configure sua API Key e Secret da Binance nas configurações para habilitar análises automáticas.'
          : credentialResult.error,
        errorCode: credentialResult.errorCode,
        details: credentialResult.details
      }), {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('✅ Credentials validated successfully');
    const apiKey = credentials!.apiKey;
    const decryptedSecret = credentials!.apiSecret;

    console.log('Using Binance Futures API ONLY');

    // Fetch exchange info from Binance FUTURES API
    let exchangeInfo: Record<string, number> = {};
    let validPriceData: PriceData[] = [];
    
    console.log('Fetching from Binance Futures API...');
    exchangeInfo = await fetchExchangeInfo(apiKey, decryptedSecret);
    console.log(`Fetched exchange info for ${Object.keys(exchangeInfo).length} pairs from Futures API`);
    
    // Fetch price data from Binance FUTURES API
    const priceDataPromises = symbols.map(symbol => 
      fetchPriceData(symbol, apiKey, decryptedSecret)
    );
    const priceDataResults = await Promise.allSettled(priceDataPromises);
    
    validPriceData = priceDataResults
      .filter((result): result is PromiseFulfilledResult<PriceData> => 
        result.status === 'fulfilled' && result.value.prices.length >= 20
      )
      .map(result => result.value);
    
    console.log(`Valid price data from Futures API: ${validPriceData.length} pairs`);
    console.log(`Total valid price data: ${validPriceData.length} pairs`);

    // Analyze each pair with AI
    const analyses: AIAnalysis[] = [];
    
    for (const priceData of validPriceData) {
      try {
        const minNotional = exchangeInfo[priceData.symbol] || 5; // Default 5 USDT if not found
        const analysis = await analyzeWithAI(priceData, config, minNotional);
        
        // Store analysis result
        await supabase.from('ai_analysis_results').insert({
          user_id: user.id,
          symbol: analysis.symbol,
          predicted_price: analysis.predictedPrice,
          confidence: analysis.confidence,
          trend: analysis.trend,
          recommended_dca_layers: analysis.recommendedDcaLayers,
          analysis_data: {
            current_price: priceData.currentPrice,
            volatility: priceData.volatility,
            price_change_percent: ((analysis.predictedPrice - priceData.currentPrice) / priceData.currentPrice) * 100,
            min_notional: minNotional,
            calculated_quantity: analysis.calculatedQuantity
          }
        });

        // Apply filters: Confidence >= min_confidence (70%) and upward trend
        if (analysis.confidence >= config.min_confidence && analysis.trend === 'up') {
          analyses.push(analysis);
        }
      } catch (error) {
        console.error(`Error analyzing ${priceData.symbol}:`, error);
      }
    }

    console.log(`Found ${analyses.length} high-confidence trading opportunities`);

    // ====================================================================
    // CRITICAL SAFETY CHECK: Validate trading mode before AI execution
    // ====================================================================
    const { data: settings } = await supabase
      .from('trading_settings')
      .select('trading_mode, demo_balance, real_mode_confirmed_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const tradingMode = settings?.trading_mode || 'DEMO';
    const isDemo = tradingMode === 'DEMO';

    if (isDemo) {
      console.log('✅ AI Auto-Trade: DEMO MODE ACTIVE - All trades will be simulated');
    } else {
      console.log('🔴 AI Auto-Trade: REAL MODE - Will execute REAL trades on Binance');
      
      // VALIDATION: For real mode, require recent confirmation (5 min window)
      const confirmedAt = settings?.real_mode_confirmed_at ? new Date(settings.real_mode_confirmed_at) : null;
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      if (!confirmedAt || confirmedAt < fiveMinutesAgo) {
        console.warn('⚠️ AI Auto-Trade BLOCKED: Real mode confirmation expired');
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Real mode requires confirmation',
          message: 'Please confirm real mode trading in settings before running AI analysis. Confirmation expires after 5 minutes for security.'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log('✅ Real mode confirmation valid - AI will execute REAL trades');
    }

    // Get current balance to calculate per analysis
    // CRÍTICO: NUNCA chamar Binance em modo DEMO
    let availableBalance: number;
    
    if (isDemo) {
      availableBalance = settings?.demo_balance || 10000;
      console.log(`💰 [DEMO MODE] Using virtual balance: ${availableBalance} USDT (no Binance API called)`);
    } else {
      console.log(`💰 [REAL MODE] Fetching actual balance from Binance...`);
      const { data: accountInfo, error: accountError } = await supabase.functions.invoke('binance-account');
      if (accountError) {
        console.error("❌ [REAL MODE] Error fetching Binance account:", accountError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch Binance balance',
          message: accountError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      availableBalance = accountInfo?.totalWalletBalance || 100;
      console.log(`💰 [REAL MODE] Real balance from Binance: ${availableBalance} USDT`);
    }
    
    // ====================================================================
    // BUDGET DISTRIBUTION: Using centralized service (SRP, SSOT principles)
    // ====================================================================
    const { 
      calculateAvailableBudget, 
      distributeBudget, 
      validateDistribution,
      BUDGET_CONFIG 
    } = await import('../_shared/budgetDistributionService.ts');

    const availableBudgetForAnalysis = calculateAvailableBudget(availableBalance);
    console.log(`💰 Saldo: ${availableBalance} USDT | Orçamento análise: ${availableBudgetForAnalysis} USDT`);
    console.log(`🔍 Oportunidades encontradas: ${analyses.length} (confiança ≥${config.min_confidence}%)`);

    // Preparar dados para distribuição
    const opportunities = analyses.map(a => ({
      symbol: a.symbol,
      minNotional: a.minNotional,
      confidence: a.confidence,
      recommendedDcaLayers: a.recommendedDcaLayers,
      predictedPrice: a.predictedPrice,
      trend: a.trend
    }));

    // Calcular distribuição inteligente de orçamento
    const distribution = distributeBudget(opportunities, availableBudgetForAnalysis);
    
    // Validar distribuição
    const validation = validateDistribution(distribution);
    if (!validation.isValid) {
      console.log(`❌ Distribuição inválida: ${validation.reason}`);
      
      // Retornar sucesso mas sem trades executados (não é um erro da função)
      return new Response(JSON.stringify({ 
        success: true,
        executed_trades: [],
        message: validation.reason,
        analysis_summary: {
          total_analyzed: validPriceData.length,
          high_confidence: analyses.length,
          executed: 0,
          skipped: distribution.skippedPairs
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { amountPerPair, tradesToExecute } = distribution;

    // ====================================================================
    // SSOT: Buscar configurações do usuário (ÚNICA fonte de verdade)
    // ====================================================================
    console.log('📋 Fetching user trading configuration (SSOT)...');
    
    const { data: dailyStats } = await supabase
      .from('bot_daily_stats')
      .select('starting_balance')
      .eq('user_id', user.id)
      .eq('date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    const startingBalance = dailyStats?.starting_balance || availableBalance;
    
    // SSOT: Usar config.take_profit e config.stop_loss como ÚNICA fonte de verdade
    const takeProfitPercent = config.take_profit;
    const stopLossPercent = config.stop_loss;
    
    // Calcular valor absoluto de TP baseado no saldo inicial do dia
    const takeProfitAmount = (startingBalance * takeProfitPercent) / 100;

    console.log(`💵 Saldo inicial dia: ${startingBalance} USDT`);
    console.log(`🎯 Take Profit: ${takeProfitPercent}% = ${takeProfitAmount} USDT (from auto_trading_config)`);
    console.log(`🛑 Stop Loss: ${stopLossPercent}% por trade (from auto_trading_config)`);
    console.log(`📊 Executando ${tradesToExecute.length} trades × ${amountPerPair.toFixed(2)} USDT (${BUDGET_CONFIG.MIN_LAYERS} layers mínimo)`);

    const executedTrades = [];

    // Distribute budget equally across all selected opportunities
    for (let i = 0; i < tradesToExecute.length; i++) {
      const analysis = tradesToExecute[i];
      
      try {
        console.log(`\n=== Processing opportunity ${i + 1}/${tradesToExecute.length}: ${analysis.symbol} (confidence: ${analysis.confidence}%) ===`);
        
        // Check trading status before each trade
        console.log(`Checking trading status for ${analysis.symbol}...`);
        const statusCheck = await supabase.functions.invoke('check-trading-status');
        
        if (statusCheck.error) {
          console.error(`Status check error for ${analysis.symbol}:`, statusCheck.error);
          console.log('Stopping trade execution due to status check error');
          break;
        }
        
        if (!statusCheck.data?.can_trade) {
          console.log(`Trading paused: ${JSON.stringify(statusCheck.data)}`);
          break;
        }
        
        console.log(`Trading status OK for ${analysis.symbol}`);

        // Usar o valor calculado por par
        const amountForThisTrade = amountPerPair;
        
        // Use recommended layers but ensure at least MIN_LAYERS
        let dcaLayers = Math.max(BUDGET_CONFIG.MIN_LAYERS, analysis.recommendedDcaLayers);
        let quantityPerLayer: number = amountForThisTrade / dcaLayers;
        
        // Ensure each layer meets minimum notional
        if (quantityPerLayer < analysis.minNotional) {
          // Adjust layers to meet minimum notional
          dcaLayers = Math.max(1, Math.floor(amountForThisTrade / analysis.minNotional));
          
          if (dcaLayers === 0 || amountForThisTrade < analysis.minNotional) {
            console.log(`⚠️ Skipping ${analysis.symbol}: amount ${amountForThisTrade.toFixed(2)} USDT below minimum notional ${analysis.minNotional} USDT`);
            continue;
          }
          
          quantityPerLayer = Math.max(analysis.minNotional, amountForThisTrade / dcaLayers);
        }
        
        console.log(`📊 ${analysis.symbol}: ${dcaLayers} layers × ${quantityPerLayer.toFixed(2)} USDT = ${(dcaLayers * quantityPerLayer).toFixed(2)} USDT (confidence: ${analysis.confidence}%)`);
        
        // SSOT: Usar stopLossPercent já definido acima (linha 340)
        const totalTradeAmount = dcaLayers * quantityPerLayer;
        const stopLossAmount = (totalTradeAmount * stopLossPercent) / 100;
        
        console.log(`🛡️ ${analysis.symbol} - Stop Loss: ${stopLossPercent}% of ${totalTradeAmount.toFixed(2)} USDT = ${stopLossAmount.toFixed(4)} USDT`);
        console.log(`💵 Enviando para auto-trade: ${totalTradeAmount.toFixed(2)} USDT (${dcaLayers} layers × ${quantityPerLayer.toFixed(2)} USDT)`);
        
        // Execute the trade
        console.log(`🔄 Invoking auto-trade for ${analysis.symbol}...`);
        const { data: tradeResult, error: tradeError } = await supabase.functions.invoke('auto-trade', {
          body: {
            symbol: analysis.symbol,
            side: 'BUY',
            quoteOrderQty: totalTradeAmount.toFixed(8), // Send full amount (all DCA layers consolidated)
            takeProfitAmount,
            stopLossAmount: stopLossAmount
          }
        });

        if (tradeError) {
          console.error(`❌ Trade invocation error for ${analysis.symbol}:`, tradeError);
          console.log('Continuing to next opportunity...');
          continue;
        }

        console.log(`📥 Trade result for ${analysis.symbol}:`, JSON.stringify(tradeResult));

        if (tradeResult?.success) {
          console.log(`✅ Trade executed successfully for ${analysis.symbol}`);
          
          executedTrades.push({
            symbol: analysis.symbol,
            confidence: analysis.confidence,
            dcaLayers: dcaLayers,
            predictedPrice: analysis.predictedPrice,
            amountUsed: totalTradeAmount,
            takeProfitAmount,
            stopLossAmount: stopLossAmount,
            stopLossPercent: stopLossPercent
          });
          console.log(`✅ Successfully executed trade for ${analysis.symbol}: ${totalTradeAmount.toFixed(2)} USDT (${dcaLayers} layers × ${quantityPerLayer.toFixed(2)} USDT), SL: ${stopLossPercent}% (${stopLossAmount.toFixed(4)} USDT)`);
        } else {
          console.error(`❌ Trade failed for ${analysis.symbol}: ${tradeResult?.message || 'Unknown reason'}`);
          console.log('Continuing to next opportunity...');
        }
      } catch (error) {
        console.error(`❌ Exception executing trade for ${analysis.symbol}:`, error);
        console.log('Continuing to next opportunity...');
      }
    }

    const totalUsed = executedTrades.reduce((sum, t) => sum + t.amountUsed, 0);
    console.log(`✅ Usados ${totalUsed.toFixed(2)} USDT de ${distribution.totalBudgetUsed.toFixed(2)} USDT alocados`);

    return new Response(JSON.stringify({
      success: true,
      analyzed: validPriceData.length,
      opportunities: analyses.length,
      executed: executedTrades.length,
      trades: executedTrades
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in ai-auto-trade:', error);
    
    // Handle rate limiting with proper response
    if (error.code === 'P0001' && error.message?.includes('Rate limit')) {
      const match = error.message.match(/(\d+) seconds remaining/);
      const remainingSeconds = match ? parseInt(match[1]) : 120;
      
      console.log(`Rate limited: ${remainingSeconds} seconds remaining`);
      
      return new Response(JSON.stringify({
        success: false,
        rate_limited: true,
        message: 'Please wait before running another analysis',
        remaining_seconds: remainingSeconds
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error',
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function fetchExchangeInfo(apiKey?: string, apiSecret?: string): Promise<Record<string, number>> {
  try {
    const endpoint = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
    console.log(`Fetching exchange info from Futures API (public endpoint): ${endpoint}`);
    
    // Public endpoint - no authentication required
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.error(`Futures API failed with status ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.symbols || !Array.isArray(data.symbols)) {
      console.error('Invalid data structure from Futures API');
      throw new Error('Invalid response structure');
    }
    
    console.log(`Successfully fetched exchange info from Futures API with ${data.symbols.length} symbols`);
    
    const minNotionals: Record<string, number> = {};
    
    // Filter for USDT perpetual futures
    const usdtSymbols = data.symbols.filter((s: any) => 
      s.symbol.endsWith('USDT') && 
      s.status === 'TRADING' &&
      s.contractType === 'PERPETUAL'
    );
    
    for (const symbol of usdtSymbols) {
      // Get min notional from filters
      const minNotionalFilter = symbol.filters?.find((f: any) => 
        f.filterType === 'MIN_NOTIONAL'
      );
      
      if (minNotionalFilter) {
        const minNotional = parseFloat(minNotionalFilter.notional || '5');
        minNotionals[symbol.symbol] = minNotional;
      } else {
        minNotionals[symbol.symbol] = 5; // Default for futures
      }
    }
    
    console.log(`Extracted min notionals for ${Object.keys(minNotionals).length} USDT perpetual futures`);
    return minNotionals;
    
  } catch (error) {
    console.error('Error fetching from Futures API:', error);
    // Return default values
    return {
      'BNBUSDT': 5,
      'SOLUSDT': 5,
      'ADAUSDT': 5,
      'DOGEUSDT': 5,
      'XRPUSDT': 5,
      'DOTUSDT': 5,
      'MATICUSDT': 5,
      'AVAXUSDT': 5,
      'LINKUSDT': 5,
      'UNIUSDT': 5,
      'LTCUSDT': 5,
      'ATOMUSDT': 5,
      'NEARUSDT': 5
    };
  }
}

async function fetchPriceData(symbol: string, apiKey?: string, apiSecret?: string): Promise<PriceData> {
  try {
    const baseUrl = 'https://fapi.binance.com/fapi/v1';
    
    // Public endpoint - no authentication required for klines
    const url = `${baseUrl}/klines?symbol=${symbol}&interval=1h&limit=24`;
    
    console.log(`Fetching price data for ${symbol} from Futures API (public endpoint)`);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const klines = await response.json();
    
    if (!Array.isArray(klines) || klines.length === 0) {
      throw new Error('Invalid klines data');
    }
    
    const prices = klines.map((k: any) => parseFloat(k[4])); // Close prices
    const currentPrice = prices[prices.length - 1];
    
    // Calculate volatility (standard deviation)
    const mean = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum: number, price: number) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance) / mean;

    console.log(`Successfully fetched price data for ${symbol} from Futures API`);
    
    return {
      symbol,
      prices,
      currentPrice,
      volatility
    };
  } catch (error) {
    console.error(`Error fetching ${symbol} from Futures API:`, error);
    throw new Error(`Failed to fetch price data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ANÁLISE AI OTIMIZADA - Maior precisão e lucratividade
async function analyzeWithAI(priceData: PriceData, config: any, minNotional: number): Promise<AIAnalysis> {
  const { symbol, prices, currentPrice, volatility } = priceData;
  
  // Calculate technical indicators
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  
  // Multi-timeframe trend analysis (more granular)
  const last3h = prices.slice(-3);
  const last6h = prices.slice(-6);
  const last12h = prices.slice(-12);
  const last24h = prices;
  
  const avg3h = last3h.reduce((a, b) => a + b, 0) / last3h.length;
  const avg6h = last6h.reduce((a, b) => a + b, 0) / last6h.length;
  const avg12h = last12h.reduce((a, b) => a + b, 0) / last12h.length;
  const avg24h = last24h.reduce((a, b) => a + b, 0) / last24h.length;
  
  // Calculate trend percentages
  const trend3h = ((avg3h - avg6h) / avg6h) * 100;
  const trend6h = ((avg6h - avg12h) / avg12h) * 100;
  const trend12h = ((avg12h - avg24h) / avg24h) * 100;
  const overallTrend = ((currentPrice - avg24h) / avg24h) * 100;
  
  // CRITÉRIOS OTIMIZADOS: Identificar tendências reais sem ser excessivamente rígido
  let trendDirection: 'up' | 'down' | 'neutral' = 'neutral';
  
  // Tendência de ALTA: Critérios mais realistas
  if (
    (trend3h > 0.15 && trend6h > 0.1) ||  // Tendência recente positiva consistente
    (trend3h > 0.2) ||  // Forte tendência de curto prazo
    (overallTrend > 0.5 && trend3h > 0)  // Tendência geral positiva com momentum recente
  ) {
    trendDirection = 'up';
  } 
  // Tendência de BAIXA
  else if (
    (trend3h < -0.15 && trend6h < -0.1) ||
    (trend3h < -0.2) ||
    (overallTrend < -0.5 && trend3h < 0)
  ) {
    trendDirection = 'down';
  }
  
  // PREVISÃO DE PREÇO MELHORADA: Média ponderada exponencial
  // Dar mais peso aos preços recentes
  const weights = last6h.map((_, i) => Math.pow(1.5, i)); // Peso exponencial crescente
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedAvg = last6h.reduce((sum, price, i) => sum + price * weights[i], 0) / totalWeight;
  
  // Ajustar previsão baseado em momentum
  const momentum = ((currentPrice - avg6h) / avg6h);
  const predictedPrice = weightedAvg * (1 + momentum * 0.5); // 50% do momentum aplicado
  
  // SISTEMA DE CONFIDENCE REALISTA
  let confidence = 55;  // Base realista
  
  // 1. TREND STRENGTH (máx +30 pontos)
  if (trendDirection === 'up') {
    if (trend3h > 0.5 && trend6h > 0.4 && trend12h > 0.3) {
      confidence += 30;  // Tendência muito forte e alinhada
    } else if (trend3h > 0.3 && trend6h > 0.2) {
      confidence += 20;  // Tendência forte
    } else if (trend3h > 0.15) {
      confidence += 12;  // Tendência moderada
    } else {
      confidence += 5;  // Tendência fraca mas presente
    }
  } else {
    confidence -= 15;  // Penalidade mais suave para não-alta
  }
  
  // 2. RSI OPTIMAL ZONES (máx +15 pontos)
  if (trendDirection === 'up') {
    if (rsi >= 50 && rsi <= 65) {
      confidence += 15;  // Zona ideal - momentum saudável
    } else if (rsi > 40 && rsi < 50) {
      confidence += 10;  // Boa zona de entrada
    } else if (rsi > 65 && rsi < 75) {
      confidence += 5;  // Aceitável mas pode corrigir
    } else if (rsi >= 75) {
      confidence -= 10;  // Sobrecompra - risco
    }
  }
  
  // 3. MACD CONFIRMATION (máx +15 pontos)
  if (trendDirection === 'up') {
    if (macd.signal === 'buy') {
      confidence += 15;  // Confirmação forte
    } else if (macd.signal === 'neutral') {
      confidence += 5;  // Neutro é OK
    } else {
      confidence -= 10;  // Sinal divergente
    }
  }
  
  // 4. VOLATILITY ASSESSMENT (máx +10 pontos)
  if (volatility < 0.015) {
    confidence += 10;  // Mercado estável - mais previsível
  } else if (volatility < 0.025) {
    confidence += 5;  // Volatilidade moderada
  } else if (volatility > 0.05) {
    confidence -= 8;  // Alta volatilidade - risco
  }
  
  // 5. PRICE MOMENTUM (máx +15 pontos)
  const priceChange24h = ((currentPrice - prices[0]) / prices[0]) * 100;
  if (trendDirection === 'up') {
    if (priceChange24h > 3.0) {
      confidence += 15;  // Momentum excepcional
    } else if (priceChange24h > 1.5) {
      confidence += 12;  // Momentum forte
    } else if (priceChange24h > 0.5) {
      confidence += 8;  // Momentum positivo
    } else if (priceChange24h > 0) {
      confidence += 3;  // Ligeiramente positivo
    }
  }
  
  // 6. CONSISTENCY CHECK (máx +10 pontos)
  // Verificar se todas as médias estão subindo (consistência)
  const allPositive = trend3h > 0 && trend6h > 0 && trend12h > 0;
  const mostPositive = [trend3h > 0, trend6h > 0, trend12h > 0].filter(x => x).length >= 2;
  
  if (trendDirection === 'up') {
    if (allPositive) {
      confidence += 10;  // Tendência consistente em todos timeframes
    } else if (mostPositive) {
      confidence += 5;  // Maioria positiva
    }
  }
  
  // 7. RECENT STRENGTH (máx +5 pontos)
  // Verificar se o preço atual está acima das médias
  if (currentPrice > avg3h && currentPrice > avg6h && currentPrice > avg12h) {
    confidence += 5;  // Força recente confirmada
  }
  
  // Cap confidence: 45-92 (mais realista)
  confidence = Math.min(92, Math.max(45, confidence));
  
  // Calculate recommended DCA layers based on volatility and confidence
  let recommendedDcaLayers = 3; // Default
  
  if (confidence >= 80) {
    recommendedDcaLayers = 4;  // Alta confiança = mais agressivo
  } else if (confidence >= 75) {
    recommendedDcaLayers = 4;
  } else if (confidence >= 70) {
    recommendedDcaLayers = 3;
  } else {
    recommendedDcaLayers = 2;  // Baixa confiança = mais conservador
  }
  
  // Adjust based on volatility
  if (volatility > 0.04) {
    recommendedDcaLayers = Math.min(recommendedDcaLayers + 1, 5); // Mais layers em alta volatilidade
  } else if (volatility < 0.01) {
    recommendedDcaLayers = Math.max(recommendedDcaLayers - 1, 2); // Menos layers em baixa volatilidade
  }
  
  // Adjust based on leverage
  if (config.leverage >= 20) {
    recommendedDcaLayers = Math.min(recommendedDcaLayers + 1, 6);
  }

  // Calculate optimal quantity based on minNotional
  const calculatedQuantity = Math.max(
    minNotional * 1.5,
    Math.min(minNotional * 3, 200)
  );

  return {
    symbol,
    predictedPrice,
    confidence,
    trend: trendDirection,
    recommendedDcaLayers,
    minNotional,
    calculatedQuantity
  };
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const gains = changes.slice(-period).filter(c => c > 0);
  const losses = changes.slice(-period).filter(c => c < 0).map(Math.abs);
  
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices: number[]): { signal: 'buy' | 'sell' | 'neutral' } {
  if (prices.length < 26) return { signal: 'neutral' };
  
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  
  // Simple signal: positive MACD = buy, negative = sell
  if (macdLine > 0 && Math.abs(macdLine) > prices[prices.length - 1] * 0.001) {
    return { signal: 'buy' };
  } else if (macdLine < 0 && Math.abs(macdLine) > prices[prices.length - 1] * 0.001) {
    return { signal: 'sell' };
  }
  
  return { signal: 'neutral' };
}

function calculateEMA(prices: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

function calculateATR(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) {
    // Fallback: use standard deviation if not enough data
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    return Math.sqrt(variance);
  }
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const high = Math.max(prices[i], prices[i - 1]);
    const low = Math.min(prices[i], prices[i - 1]);
    const trueRange = high - low;
    trueRanges.push(trueRange);
  }
  
  // Calculate ATR as average of true ranges over the period
  const recentTR = trueRanges.slice(-period);
  const atr = recentTR.reduce((a, b) => a + b, 0) / period;
  
  return atr;
}
