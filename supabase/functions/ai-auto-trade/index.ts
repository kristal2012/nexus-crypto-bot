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
      throw new Error('Unauthorized');
    }

    // Get user's auto trading configuration
    const { data: config } = await supabase
      .from('auto_trading_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!config || !config.is_active) {
      return new Response(JSON.stringify({ 
        message: 'Auto trading is not active' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting: enforce 15-minute cooldown between analyses for technical indicators to update
    const now = new Date();
    if (config.last_analysis_at) {
      const lastAnalysis = new Date(config.last_analysis_at);
      const timeSinceLastAnalysis = (now.getTime() - lastAnalysis.getTime()) / 1000; // seconds
      const cooldownPeriod = 900; // 15 minutes in seconds (ideal for 1h timeframe indicators)
      
      if (timeSinceLastAnalysis < cooldownPeriod) {
        const remainingTime = Math.ceil(cooldownPeriod - timeSinceLastAnalysis);
        console.log(`Rate limit: ${remainingTime}s remaining until next analysis allowed`);
        return new Response(JSON.stringify({ 
          success: false,
          rate_limited: true,
          message: `Please wait ${remainingTime} seconds before running another analysis`,
          remaining_seconds: remainingTime
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Update last analysis timestamp
    await supabase
      .from('auto_trading_config')
      .update({ last_analysis_at: now.toISOString() })
      .eq('user_id', user.id);

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

    // Get current balance to calculate 10% per trade
    const { data: accountInfo } = await supabase.functions.invoke('binance-account');
    const availableBalance = accountInfo?.totalWalletBalance || config.quantity_usdt;
    
    // Each trade uses 10% of available balance
    const tradeAmount = availableBalance * 0.10;

    // Buscar saldo inicial do dia para calcular TP/SL
    const { data: dailyStats } = await supabase
      .from('bot_daily_stats')
      .select('starting_balance')
      .eq('user_id', user.id)
      .eq('date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    const startingBalance = dailyStats?.starting_balance || availableBalance;
    
    // Calcular valores absolutos de TP e SL baseados no saldo inicial do dia
    const takeProfitAmount = (startingBalance * config.take_profit) / 100;
    const stopLossAmount = (startingBalance * config.stop_loss) / 100;

    console.log(`Saldo disponível: ${availableBalance} USDT`);
    console.log(`Valor por trade (10%): ${tradeAmount} USDT`);
    console.log(`Saldo inicial do dia: ${startingBalance} USDT`);
    console.log(`Take Profit: ${config.take_profit}% = ${takeProfitAmount} USDT`);
    console.log(`Stop Loss: ${config.stop_loss}% = ${stopLossAmount} USDT`);

    const executedTrades = [];

    for (const analysis of tradesToExecute) {
      try {
        // Check trading status
        const statusCheck = await supabase.functions.invoke('check-trading-status');
        if (statusCheck.error || !statusCheck.data?.can_trade) {
          console.log('Trading paused due to daily limits');
          break;
        }

        // Calculate quantity: 10% of balance divided by DCA layers
        const quantityPerLayer = tradeAmount / analysis.recommendedDcaLayers;
        
        // Execute the trade using 10% of available balance
        const { data: tradeResult } = await supabase.functions.invoke('auto-trade', {
          body: {
            symbol: analysis.symbol,
            side: 'BUY',
            quantity: quantityPerLayer.toString(),
            takeProfitAmount,
            stopLossAmount
          }
        });

        if (tradeResult?.success) {
          executedTrades.push({
            symbol: analysis.symbol,
            confidence: analysis.confidence,
            dcaLayers: analysis.recommendedDcaLayers,
            predictedPrice: analysis.predictedPrice,
            takeProfitAmount,
            stopLossAmount
          });
        }
      } catch (error) {
        console.error(`Error executing trade for ${analysis.symbol}:`, error);
      }
    }

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
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
  
  // Normalize prices
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const normalized = prices.map(p => (p - min) / (max - min));

  // Simple trend analysis
  const recentPrices = prices.slice(-10);
  const olderPrices = prices.slice(-20, -10);
  const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
  
  const trendStrength = ((recentAvg - olderAvg) / olderAvg) * 100;
  
  // Calculate momentum indicators
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  
  // Predict next price movement
  const lastSequence = normalized.slice(-5);
  const trend = lastSequence[lastSequence.length - 1] > lastSequence[0];
  const momentum = (lastSequence[lastSequence.length - 1] - lastSequence[0]) / lastSequence[0];
  
  // Denormalize prediction
  const predictedNormalized = lastSequence[lastSequence.length - 1] + (momentum * 0.5);
  const predictedPrice = predictedNormalized * (max - min) + min;
  
  // Calculate confidence based on multiple factors
  let confidence = 50;
  
  // Strong trend increases confidence
  if (Math.abs(trendStrength) > 2) confidence += 15;
  if (Math.abs(trendStrength) > 5) confidence += 10;
  
  // RSI in optimal range increases confidence
  if (trend && rsi < 70 && rsi > 50) confidence += 10;
  if (!trend && rsi > 30 && rsi < 50) confidence += 10;
  
  // MACD confirmation increases confidence
  if (macd.signal === 'buy' && trend) confidence += 15;
  
  // Low volatility increases confidence
  if (volatility < 0.02) confidence += 10;
  
  // Cap confidence at 99
  confidence = Math.min(99, confidence);
  
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
    trend: trendStrength > 1 ? 'up' : trendStrength < -1 ? 'down' : 'neutral',
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