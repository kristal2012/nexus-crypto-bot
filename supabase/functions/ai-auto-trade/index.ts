import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      p_cooldown_minutes: 15
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

    // Fetch exchange info to get minimum notional values
    const exchangeInfo = await fetchExchangeInfo();
    console.log(`Fetched exchange info for ${Object.keys(exchangeInfo).length} pairs`);

    // Fetch price data for all symbols
    const priceDataPromises = symbols.map(symbol => fetchPriceData(symbol));
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

    // Sort by confidence (highest first) - execute all opportunities ≥70%
    const tradesToExecute = analyses.sort((a, b) => b.confidence - a.confidence);

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

    // Get current balance to calculate 10% per analysis
    const { data: accountInfo } = await supabase.functions.invoke('binance-account');
    const availableBalance = accountInfo?.totalWalletBalance || config.quantity_usdt;
    
    // Hard limit to prevent catastrophic losses even if calculations are wrong
    const MAX_POSITION_USD = 10000;
    // 10% of available balance to distribute across all opportunities in this analysis
    const totalAnalysisAmount = Math.min(availableBalance * 0.10, MAX_POSITION_USD);

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
    
    // Stop Loss adaptativo será calculado por trade usando ATR
    const atrMultiplier = config.stop_loss || 1.5; // stop_loss agora armazena multiplicador ATR

    console.log(`Saldo disponível: ${availableBalance} USDT`);
    console.log(`Valor total desta análise (10%): ${totalAnalysisAmount} USDT`);
    console.log(`Saldo inicial do dia: ${startingBalance} USDT`);
    console.log(`Take Profit: ${config.take_profit}% = ${takeProfitAmount} USDT`);
    console.log(`Stop Loss: Adaptativo (ATR × ${atrMultiplier})`);

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
        
        // Calculate adaptive stop loss using ATR
        const priceResult = priceDataResults.find(
          (r): r is PromiseFulfilledResult<PriceData> => r.status === 'fulfilled' && r.value.symbol === analysis.symbol
        );
        const atr = calculateATR(priceResult?.value.prices || []);
        const adaptiveStopLoss = atr * atrMultiplier;
        
        console.log(`${analysis.symbol} - ATR: ${atr.toFixed(4)}, Adaptive SL: ${adaptiveStopLoss.toFixed(4)} USDT`);
        
        // Execute the trade
        const { data: tradeResult } = await supabase.functions.invoke('auto-trade', {
          body: {
            symbol: analysis.symbol,
            side: 'BUY',
            quantity: quantityPerLayer.toString(),
            takeProfitAmount,
            stopLossAmount: adaptiveStopLoss
          }
        });

        if (tradeResult?.success) {
          remainingAmount -= amountForThisTrade;
          const priceResult = priceDataResults.find(
            (r): r is PromiseFulfilledResult<PriceData> => r.status === 'fulfilled' && r.value.symbol === analysis.symbol
          );
          const atr = calculateATR(priceResult?.value.prices || []);
          const adaptiveStopLoss = atr * atrMultiplier;
          
          executedTrades.push({
            symbol: analysis.symbol,
            confidence: analysis.confidence,
            dcaLayers: dcaLayers,
            predictedPrice: analysis.predictedPrice,
            amountUsed: amountForThisTrade,
            takeProfitAmount,
            stopLossAmount: adaptiveStopLoss,
            atr: atr
          });
          console.log(`Executed trade for ${analysis.symbol}: ${amountForThisTrade.toFixed(2)} USDT (${dcaLayers} layers × ${quantityPerLayer.toFixed(2)} USDT), Adaptive SL: ${adaptiveStopLoss.toFixed(4)} USDT`);
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

  } catch (error) {
    console.error('Error in ai-auto-trade:', error);
    return new Response(JSON.stringify({ 
      error: 'Analysis failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function fetchExchangeInfo(): Promise<Record<string, number>> {
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    if (!response.ok) {
      throw new Error('Failed to fetch exchange info');
    }

    const data = await response.json();
    const notionalValues: Record<string, number> = {};

    // Extract MIN_NOTIONAL for each symbol
    for (const symbol of data.symbols) {
      const minNotionalFilter = symbol.filters?.find(
        (f: any) => f.filterType === 'MIN_NOTIONAL'
      );
      
      if (minNotionalFilter) {
        notionalValues[symbol.symbol] = parseFloat(minNotionalFilter.notional);
      }
    }

    return notionalValues;
  } catch (error) {
    console.error('Error fetching exchange info:', error);
    return {}; // Return empty object on error
  }
}

async function fetchPriceData(symbol: string): Promise<PriceData> {
  try {
    // Fetch 24h kline data (1h intervals)
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=24`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data for ${symbol}`);
    }

    const klines = await response.json();
    const prices = klines.map((k: any) => parseFloat(k[4])); // Close prices
    const currentPrice = prices[prices.length - 1];
    
    // Calculate volatility (standard deviation)
    const mean = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum: number, price: number) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance) / mean;

    return {
      symbol,
      prices,
      currentPrice,
      volatility
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Error fetching ${symbol}: ${errorMessage}`);
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