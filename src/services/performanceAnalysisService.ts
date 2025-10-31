/**
 * Performance Analysis Service
 * 
 * SSOT - Single Source of Truth for performance metrics and strategy adjustments
 * SRP - Single Responsibility: Analyze trading performance and provide insights
 */

import { supabase } from "@/integrations/supabase/client";

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  totalPnL: number;
}

export interface TradeAnalysis {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  holdTime: number;
  confidence: number;
}

/**
 * Analyze recent trading performance
 */
export const analyzeRecentPerformance = async (
  days: number = 7
): Promise<PerformanceMetrics | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const { data: trades, error } = await supabase
      .from('trades')
      .select('profit_loss, executed_at')
      .eq('user_id', user.id)
      .eq('status', 'FILLED')
      .gte('executed_at', daysAgo.toISOString())
      .not('profit_loss', 'is', null);

    if (error || !trades) {
      console.error('Error fetching trades:', error);
      return null;
    }

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
        profitFactor: 0,
        totalPnL: 0
      };
    }

    const winningTrades = trades.filter(t => (t.profit_loss ?? 0) > 0);
    const losingTrades = trades.filter(t => (t.profit_loss ?? 0) < 0);

    const totalProfit = winningTrades.reduce((sum, t) => sum + (t.profit_loss ?? 0), 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.profit_loss ?? 0), 0));

    const avgProfit = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;

    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: (winningTrades.length / trades.length) * 100,
      avgProfit,
      avgLoss,
      profitFactor,
      totalPnL: totalProfit - totalLoss
    };
  } catch (error) {
    console.error('Error analyzing performance:', error);
    return null;
  }
};

/**
 * Get strategy recommendations based on performance
 */
export const getStrategyRecommendations = (
  metrics: PerformanceMetrics
): {
  shouldAdjust: boolean;
  recommendations: string[];
  suggestedChanges: {
    takeProfit?: number;
    stopLoss?: number;
    minConfidence?: number;
  };
} => {
  const recommendations: string[] = [];
  const suggestedChanges: any = {};

  // Analyze win rate
  if (metrics.winRate < 45) {
    recommendations.push('Win rate baixa. Considere aumentar o min_confidence para filtrar melhor as oportunidades.');
    suggestedChanges.minConfidence = 75;
  } else if (metrics.winRate > 65) {
    recommendations.push('Win rate alta! Sistema está performando bem.');
  }

  // Analyze profit factor
  if (metrics.profitFactor < 1.2) {
    recommendations.push('Profit factor baixo. Trades lucrativos não compensam as perdas.');
    recommendations.push('Sugestão: Reduzir stop loss ou aumentar take profit.');
    suggestedChanges.stopLoss = 1.2;
    suggestedChanges.takeProfit = 3.0;
  } else if (metrics.profitFactor > 2.0) {
    recommendations.push('Excelente profit factor! Estratégia está lucrativa.');
  }

  // Analyze average loss vs profit
  if (metrics.avgLoss > metrics.avgProfit * 0.8) {
    recommendations.push('Perdas médias muito próximas dos ganhos médios.');
    recommendations.push('Considere ajustar a relação risco/recompensa.');
    suggestedChanges.takeProfit = Math.max(2.5, (suggestedChanges.takeProfit || 2.5));
  }

  // Overall recommendation
  if (metrics.totalPnL < 0 && metrics.totalTrades >= 10) {
    recommendations.push('⚠️ Sistema em prejuízo. Recomendado revisar estratégia completamente.');
    suggestedChanges.minConfidence = 80;
    suggestedChanges.stopLoss = 1.0;
  }

  return {
    shouldAdjust: recommendations.length > 0,
    recommendations,
    suggestedChanges
  };
};

/**
 * Analyze confidence accuracy
 */
export const analyzeConfidenceAccuracy = async (): Promise<{
  avgConfidence: number;
  avgActualReturn: number;
  confidenceReliability: number;
} | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get recent analyses and their corresponding trades
    const { data: analyses } = await supabase
      .from('ai_analysis_results')
      .select('symbol, confidence, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!analyses || analyses.length === 0) return null;

    // Calculate average confidence
    const avgConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;

    // Get corresponding positions to see actual results
    const symbols = analyses.map(a => a.symbol);
    const { data: positions } = await supabase
      .from('positions')
      .select('symbol, unrealized_pnl, entry_price, current_price')
      .eq('user_id', user.id)
      .in('symbol', symbols);

    if (!positions || positions.length === 0) {
      return {
        avgConfidence,
        avgActualReturn: 0,
        confidenceReliability: 0
      };
    }

    const avgReturn = positions.reduce((sum, p) => {
      const pnlPercent = ((p.current_price - p.entry_price) / p.entry_price) * 100;
      return sum + pnlPercent;
    }, 0) / positions.length;

    // Reliability: how well does confidence predict actual returns
    // Higher confidence should correlate with higher returns
    const reliabilityScore = Math.min(100, Math.max(0, 50 + (avgReturn * 10)));

    return {
      avgConfidence,
      avgActualReturn: avgReturn,
      confidenceReliability: reliabilityScore
    };
  } catch (error) {
    console.error('Error analyzing confidence accuracy:', error);
    return null;
  }
};
