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
    const { data: configData, error: lockError } = await supabase.rpc('acquire_analysis_lock', {
      p_user_id: user.id,
      p_cooldown_minutes: 2  // Reduced to 2 minutes for more frequent analysis attempts
    });

    if (lockError) {
      console.error('Lock acquisition error:', lockError);
      
      // Check if it's a rate limit error
      if (lockError.message?.includes('Rate limit')) {
        const match = lockError.message.match(/(\d+) seconds remaining/);
        const remainingSeconds = match ? parseInt(match[1]) : 900;
        
        return new Response(JSON.stringify({ 
          success: false,
          rate_limited: true,
          message: `Please wait before running another analysis`,
          remaining_seconds: remainingSeconds
        }), {
          status: 429,
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

    const config = configData?.[0];
    if (!config) {
      return new Response(JSON.stringify({ 
        error: 'Configuration not found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Major crypto pairs to analyze (excluding BTC and ETH)
    const symbols = [
      'BNBUSDT', 'SOLUSDT', 'ADAUSDT',
      'DOGEUSDT', 'XRPUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT',
      'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT'
    ];

    console.log(`Analyzing ${symbols.length} crypto pairs...`);

    // Get user's Binance API credentials - REQUIRED for analysis
    // Public API is blocked by geographic restrictions (error 451)
    const { data: apiSettings, error: apiError } = await supabase
      .from('binance_api_keys')
      .select('api_key, api_secret_encrypted, encryption_salt')
      .eq('user_id', user.id)
      .maybeSingle();
    
    console.log('API Settings query result:', { 
      hasData: !!apiSettings, 
      hasApiKey: !!apiSettings?.api_key,
      hasSecret: !!apiSettings?.api_secret_encrypted,
      hasSalt: !!apiSettings?.encryption_salt,
      userId: user.id,
      queryError: apiError
    });

    if (apiError) {
      console.error('Error querying API keys:', apiError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Erro ao buscar credenciais',
        message: `Erro ao buscar suas credenciais da Binance: ${apiError.message}`
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const hasApiCredentials = apiSettings?.api_key && apiSettings?.api_secret_encrypted;
    
    if (!hasApiCredentials) {
      console.log('Binance API credentials not configured - missing keys');
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Credenciais da Binance não configuradas',
        message: 'Configure sua API Key e Secret da Binance nas configurações para habilitar análises automáticas. Acesse as configurações e adicione suas chaves.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Decrypt API secret
    let decryptedSecret: string;
    try {
      console.log('Starting decryption process...');
      if (apiSettings.encryption_salt) {
        console.log('Using PBKDF2 decryption with salt');
        decryptedSecret = await decryptSecret(apiSettings.api_secret_encrypted, apiSettings.encryption_salt);
        console.log('API secret decrypted successfully with salt');
      } else {
        console.log('Using legacy decryption (no salt)');
        // Fallback to legacy decryption for old keys
        decryptedSecret = await decryptSecretLegacy(apiSettings.api_secret_encrypted);
        console.log('API secret decrypted successfully with legacy method');
      }
    } catch (error) {
      console.error('Failed to decrypt API secret:', error);
      console.error('Decryption error details:', {
        errorMessage: error instanceof Error ? error.message : String(error),
        hasEncryptedSecret: !!apiSettings?.api_secret_encrypted,
        hasSalt: !!apiSettings?.encryption_salt,
        encryptedLength: apiSettings?.api_secret_encrypted?.length,
        saltLength: apiSettings?.encryption_salt?.length
      });
      
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Erro ao descriptografar credenciais',
        message: 'Não foi possível descriptografar suas credenciais da Binance. Isso pode acontecer se as chaves foram corrompidas. Por favor, reconfigure suas chaves nas configurações.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Using authenticated Binance API');

    // Fetch exchange info to get minimum notional values
    const exchangeInfo = await fetchExchangeInfo(apiSettings.api_key, decryptedSecret);
    console.log(`Fetched exchange info for ${Object.keys(exchangeInfo).length} pairs`);

    // Fetch price data for all symbols
    const priceDataPromises = symbols.map(symbol => 
      fetchPriceData(symbol, apiSettings.api_key, decryptedSecret)
    );
    const priceDataResults = await Promise.allSettled(priceDataPromises);
    
    const validPriceData: PriceData[] = priceDataResults
      .filter((result): result is PromiseFulfilledResult<PriceData> => 
        result.status === 'fulfilled' && result.value.prices.length >= 20
      )
      .map(result => result.value);

    console.log(`Valid price data for ${validPriceData.length} pairs`);

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

    // Check trading mode and confirmation for real mode
    const { data: settings } = await supabase
      .from('trading_settings')
      .select('trading_mode, demo_balance, real_mode_confirmed_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const isDemo = settings?.trading_mode === 'DEMO';

    // For real mode, check if user has confirmed within last 5 minutes
    if (!isDemo) {
      const confirmedAt = settings?.real_mode_confirmed_at ? new Date(settings.real_mode_confirmed_at) : null;
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      if (!confirmedAt || confirmedAt < fiveMinutesAgo) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Real mode requires confirmation',
          message: 'Please confirm real mode trading in settings before running AI analysis'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Get current balance to calculate per analysis
    const { data: accountInfo } = await supabase.functions.invoke('binance-account');
    const availableBalance = accountInfo?.totalWalletBalance || config.quantity_usdt;
    
    // Hard limit to prevent catastrophic losses even if calculations are wrong
    const MAX_POSITION_USD = 10000;
    // Use 30% of available balance to distribute across opportunities (increased from 10% to ensure min notional is met)
    const totalAnalysisAmount = Math.min(availableBalance * 0.30, MAX_POSITION_USD);
    
    // Calculate minimum amount needed per opportunity (assume min notional of 5 USDT)
    const MIN_NOTIONAL = 5;
    const maxOpportunitiesWithBudget = Math.floor(totalAnalysisAmount / MIN_NOTIONAL);
    
    console.log(`Total analysis budget: ${totalAnalysisAmount} USDT, can execute up to ${maxOpportunitiesWithBudget} opportunities`);

    // Sort by confidence (highest first) - execute only opportunities that fit within budget
    const sortedAnalyses = analyses.sort((a, b) => b.confidence - a.confidence);
    
    // Limit to max opportunities we can afford with current budget
    const tradesToExecute = sortedAnalyses.slice(0, maxOpportunitiesWithBudget);
    
    if (sortedAnalyses.length > maxOpportunitiesWithBudget) {
      console.log(`Limiting to ${maxOpportunitiesWithBudget} opportunities (budget constraint). ${sortedAnalyses.length - maxOpportunitiesWithBudget} opportunities skipped.`);
    }

    // Buscar saldo inicial do dia para calcular TP
    const { data: dailyStats } = await supabase
      .from('bot_daily_stats')
      .select('starting_balance')
      .eq('user_id', user.id)
      .eq('date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    const startingBalance = dailyStats?.starting_balance || availableBalance;
    
    // Calcular valor absoluto de TP baseado no saldo inicial do dia
    const takeProfitAmount = (startingBalance * config.take_profit) / 100;
    
    // Stop Loss será aplicado como porcentagem do valor investido por trade
    const stopLossPercent = config.stop_loss || 1.5;

    console.log(`Saldo disponível: ${availableBalance} USDT`);
    console.log(`Valor total desta análise (30%): ${totalAnalysisAmount} USDT`);
    console.log(`Saldo inicial do dia: ${startingBalance} USDT`);
    console.log(`Take Profit: ${config.take_profit}% = ${takeProfitAmount} USDT`);
    console.log(`Stop Loss: ${stopLossPercent}% por trade`);
    console.log(`Executando até ${tradesToExecute.length} oportunidades`);

    const executedTrades = [];
    let remainingAmount = totalAnalysisAmount;

    // Distribute 10% of balance across all opportunities that fit
    for (const analysis of tradesToExecute) {
      try {
        // Check trading status
        const statusCheck = await supabase.functions.invoke('check-trading-status');
        if (statusCheck.error || !statusCheck.data?.can_trade) {
          console.log('Trading paused due to daily limits');
          break;
        }

        // Calculate quantity per layer based on remaining amount divided by number of remaining opportunities
        const remainingOpportunities: number = tradesToExecute.length - executedTrades.length;
        let amountForThisTrade: number = remainingAmount / remainingOpportunities;
        let dcaLayers = analysis.recommendedDcaLayers;
        let quantityPerLayer: number = amountForThisTrade / dcaLayers;
        
        // Ensure each layer meets minimum notional
        const minRequiredAmount = analysis.minNotional * dcaLayers;
        
        if (amountForThisTrade < minRequiredAmount) {
          // Not enough for recommended layers, reduce layers to fit budget
          dcaLayers = Math.floor(amountForThisTrade / analysis.minNotional);
          
          if (dcaLayers < 1) {
            console.log(`Skipping ${analysis.symbol}: insufficient amount (${amountForThisTrade.toFixed(2)} USDT) for min notional ${analysis.minNotional} USDT`);
            continue;
          }
          
          // Recalculate with adjusted layers
          quantityPerLayer = analysis.minNotional;
          amountForThisTrade = quantityPerLayer * dcaLayers;
          console.log(`Adjusted ${analysis.symbol}: ${dcaLayers} layers × ${quantityPerLayer.toFixed(2)} USDT = ${amountForThisTrade.toFixed(2)} USDT`);
        }

        // Check if we have enough remaining amount
        if (amountForThisTrade > remainingAmount) {
          console.log(`Skipping ${analysis.symbol}: insufficient remaining amount`);
          break;
        }
        
        // Calculate adaptive stop loss as percentage of position value
        // Use config.stop_loss as percentage (e.g., 1.5 = 1.5%)
        const stopLossPercent = config.stop_loss || 1.5;
        const stopLossAmount = (amountForThisTrade * stopLossPercent) / 100;
        
        console.log(`${analysis.symbol} - Stop Loss: ${stopLossPercent}% of ${amountForThisTrade.toFixed(2)} USDT = ${stopLossAmount.toFixed(4)} USDT`);
        
        // Execute the trade
        const { data: tradeResult } = await supabase.functions.invoke('auto-trade', {
          body: {
            symbol: analysis.symbol,
            side: 'BUY',
            quoteOrderQty: quantityPerLayer.toString(), // Use quoteOrderQty to specify value in USDT
            takeProfitAmount,
            stopLossAmount: stopLossAmount
          }
        });

        if (tradeResult?.success) {
          remainingAmount -= amountForThisTrade;
          const stopLossPercent = config.stop_loss || 1.5;
          const stopLossAmount = (amountForThisTrade * stopLossPercent) / 100;
          
          executedTrades.push({
            symbol: analysis.symbol,
            confidence: analysis.confidence,
            dcaLayers: dcaLayers,
            predictedPrice: analysis.predictedPrice,
            amountUsed: amountForThisTrade,
            takeProfitAmount,
            stopLossAmount: stopLossAmount,
            stopLossPercent: stopLossPercent
          });
          console.log(`Executed trade for ${analysis.symbol}: ${amountForThisTrade.toFixed(2)} USDT (${dcaLayers} layers × ${quantityPerLayer.toFixed(2)} USDT), SL: ${stopLossPercent}% (${stopLossAmount.toFixed(4)} USDT)`);
        }
      } catch (error) {
        console.error(`Error executing trade for ${analysis.symbol}:`, error);
      }
    }

    console.log(`Used ${totalAnalysisAmount - remainingAmount} USDT of ${totalAnalysisAmount} USDT available`);

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
        rate_limited: true,
        message: `Aguarde ${remainingSeconds} segundos antes da próxima análise`,
        remaining_seconds: remainingSeconds
      }), {
        status: 200, // Return 200 so frontend can handle rate limit gracefully
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Handle other errors
    return new Response(JSON.stringify({ 
      error: error.message || 'Erro desconhecido durante análise automática',
      details: error.code || 'UNKNOWN_ERROR'
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

async function analyzeWithAI(priceData: PriceData, config: any, minNotional: number): Promise<AIAnalysis> {
  const { symbol, prices, currentPrice, volatility } = priceData;
  
  // Calculate momentum indicators
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  
  // Enhanced trend analysis with multiple timeframes
  const recentPrices = prices.slice(-6);  // Last 6 hours
  const midPrices = prices.slice(-12, -6);  // Middle 6 hours
  const olderPrices = prices.slice(-18, -12);  // Older 6 hours
  
  const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const midAvg = midPrices.reduce((a, b) => a + b, 0) / midPrices.length;
  const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
  
  // Calculate trend strength
  const shortTermTrend = ((recentAvg - midAvg) / midAvg) * 100;
  const mediumTermTrend = ((midAvg - olderAvg) / olderAvg) * 100;
  const overallTrend = ((recentAvg - olderAvg) / olderAvg) * 100;
  
  // Determine trend direction with stricter criteria
  let trendDirection: 'up' | 'down' | 'neutral' = 'neutral';
  
  // For uptrend: both short and medium term must be positive, or overall trend strong positive
  if ((shortTermTrend > 0.3 && mediumTermTrend > 0.2) || overallTrend > 1.0) {
    trendDirection = 'up';
  } 
  // For downtrend: both short and medium term must be negative, or overall trend strong negative
  else if ((shortTermTrend < -0.3 && mediumTermTrend < -0.2) || overallTrend < -1.0) {
    trendDirection = 'down';
  }
  
  // Price prediction using linear regression on recent data
  const recentData = prices.slice(-10);
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < recentData.length; i++) {
    sumX += i;
    sumY += recentData[i];
    sumXY += i * recentData[i];
    sumX2 += i * i;
  }
  const n = recentData.length;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const predictedPrice = slope * n + intercept;
  
  // Calculate confidence based on multiple technical factors
  let confidence = 40;  // Start lower for more realistic scoring
  
  // Trend alignment increases confidence significantly
  if (trendDirection === 'up') {
    if (shortTermTrend > 0.5 && mediumTermTrend > 0.3) confidence += 20;  // Strong uptrend
    else if (shortTermTrend > 0.2 && mediumTermTrend > 0.1) confidence += 15;  // Moderate uptrend
    else confidence += 10;  // Weak uptrend
  }
  
  // RSI analysis
  if (trendDirection === 'up' && rsi > 40 && rsi < 65) {
    confidence += 15;  // RSI in bullish zone but not overbought
  } else if (trendDirection === 'up' && rsi >= 65 && rsi < 75) {
    confidence += 8;  // RSI high but not extreme
  } else if (rsi > 75) {
    confidence -= 5;  // Overbought - reduce confidence
  }
  
  // MACD confirmation
  if (macd.signal === 'buy' && trendDirection === 'up') {
    confidence += 15;  // Strong bullish signal
  } else if (macd.signal === 'buy') {
    confidence += 8;  // Bullish signal but no trend confirmation
  }
  
  // Volatility analysis
  if (volatility < 0.015) {
    confidence += 10;  // Low volatility = more predictable
  } else if (volatility < 0.025) {
    confidence += 5;  // Moderate volatility
  } else {
    confidence -= 5;  // High volatility = less predictable
  }
  
  // Price momentum confirmation
  const priceChange24h = ((currentPrice - prices[0]) / prices[0]) * 100;
  if (trendDirection === 'up' && priceChange24h > 1) {
    confidence += 10;  // Strong positive momentum
  } else if (trendDirection === 'up' && priceChange24h > 0.5) {
    confidence += 5;  // Moderate positive momentum
  }
  
  // Cap confidence at 95 (never 100% certain in trading)
  confidence = Math.min(95, Math.max(30, confidence));
  
  // Calculate recommended DCA layers based on volatility and position size
  let recommendedDcaLayers = 3; // Default
  
  if (volatility > 0.05) {
    recommendedDcaLayers = 5; // High volatility = more layers
  } else if (volatility > 0.03) {
    recommendedDcaLayers = 4;
  } else if (volatility < 0.01) {
    recommendedDcaLayers = 2; // Low volatility = fewer layers
  }
  
  // Adjust based on leverage
  if (config.leverage >= 20) {
    recommendedDcaLayers = Math.min(recommendedDcaLayers + 1, 6);
  }

  // Calculate optimal quantity based on minNotional
  // Use 1.5x the minimum to ensure order is accepted
  // But also respect a reasonable maximum (e.g., 200 USDT per pair)
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