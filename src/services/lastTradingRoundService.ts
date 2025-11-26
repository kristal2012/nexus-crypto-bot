/**
 * Last Trading Round Service
 * 
 * SRP: Apenas gerencia análise da última rodada de trades
 * SSOT: Centraliza lógica de busca e análise de rodadas de trades
 */

import { supabase } from "@/integrations/supabase/client";

export interface TradeDetail {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  profit_loss: number | null;
  executed_at: string;
  created_at: string;
  is_open_position?: boolean;
  entry_price?: number;
  current_price?: number;
  unrealized_pnl?: number;
  tp_order_id?: string | null;
  sl_order_id?: string | null;
  highest_price?: number | null;
}

export interface TradingRoundMetrics {
  timestamp: string;
  trades: TradeDetail[];
  totalTrades: number;
  totalPnL: number;
  winningTrades: number;
  losingTrades: number;
  avgPnL: number;
  largestWin: number;
  largestLoss: number;
}

export interface TradingRoundRecommendations {
  shouldAdjust: boolean;
  recommendations: string[];
  suggestedChanges: {
    takeProfit?: number;
    stopLoss?: number;
    minConfidence?: number;
  };
}

/**
 * Busca a última rodada de trades E posições abertas
 * Mostra trades finalizados recentes OU posições abertas atuais
 */
export const getLastTradingRound = async (): Promise<TradingRoundMetrics | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Buscar posições abertas (mais relevante para análise atual)
    const { data: openPositions, error: posError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Se há posições abertas, mostrar elas
    if (openPositions && openPositions.length > 0) {
      const positionTrades: TradeDetail[] = openPositions.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        side: pos.side === 'LONG' ? 'BUY' : 'SELL',
        quantity: pos.quantity,
        price: pos.entry_price,
        profit_loss: pos.unrealized_pnl || 0,
        executed_at: pos.created_at,
        created_at: pos.created_at,
        is_open_position: true,
        entry_price: pos.entry_price,
        current_price: pos.current_price,
        unrealized_pnl: pos.unrealized_pnl || 0,
        tp_order_id: pos.tp_order_id,
        sl_order_id: pos.sl_order_id,
        highest_price: pos.highest_price
      }));

      const totalPnL = positionTrades.reduce((sum, t) => sum + (t.unrealized_pnl || 0), 0);
      const winningTrades = positionTrades.filter(t => (t.unrealized_pnl || 0) > 0).length;
      const losingTrades = positionTrades.filter(t => (t.unrealized_pnl || 0) < 0).length;
      const avgPnL = totalPnL / positionTrades.length;

      const profits = positionTrades
        .map(t => t.unrealized_pnl || 0)
        .filter(p => p > 0);
      const losses = positionTrades
        .map(t => t.unrealized_pnl || 0)
        .filter(p => p < 0);

      const largestWin = profits.length > 0 ? Math.max(...profits) : 0;
      const largestLoss = losses.length > 0 ? Math.abs(Math.min(...losses)) : 0;

      return {
        timestamp: openPositions[0].created_at,
        trades: positionTrades,
        totalTrades: positionTrades.length,
        totalPnL,
        winningTrades,
        losingTrades,
        avgPnL,
        largestWin,
        largestLoss,
      };
    }

    // Se não há posições abertas, buscar última rodada de trades finalizados
    const { data: allTrades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'FILLED')
      .not('profit_loss', 'is', null) // Apenas trades com P&L (vendas)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !allTrades || allTrades.length === 0) {
      return null;
    }

    // Pegar o timestamp do trade mais recente
    const latestTradeTime = new Date(allTrades[0].created_at);
    
    // Agrupar trades que foram criados em até 2 minutos do mais recente
    const ROUND_WINDOW_MS = 2 * 60 * 1000; // 2 minutos
    const roundTrades = allTrades.filter(trade => {
      const tradeTime = new Date(trade.created_at);
      const diff = latestTradeTime.getTime() - tradeTime.getTime();
      return diff >= 0 && diff <= ROUND_WINDOW_MS;
    });

    if (roundTrades.length === 0) return null;

    // Calcular métricas
    const totalPnL = roundTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
    const winningTrades = roundTrades.filter(t => (t.profit_loss || 0) > 0).length;
    const losingTrades = roundTrades.filter(t => (t.profit_loss || 0) < 0).length;
    const avgPnL = totalPnL / roundTrades.length;
    
    const profits = roundTrades
      .map(t => t.profit_loss || 0)
      .filter(p => p > 0);
    const losses = roundTrades
      .map(t => t.profit_loss || 0)
      .filter(p => p < 0);

    const largestWin = profits.length > 0 ? Math.max(...profits) : 0;
    const largestLoss = losses.length > 0 ? Math.abs(Math.min(...losses)) : 0;

    return {
      timestamp: allTrades[0].created_at,
      trades: roundTrades as TradeDetail[],
      totalTrades: roundTrades.length,
      totalPnL,
      winningTrades,
      losingTrades,
      avgPnL,
      largestWin,
      largestLoss,
    };
  } catch (error) {
    console.error('Error fetching last trading round:', error);
    return null;
  }
};

/**
 * Gera recomendações baseadas na performance da última rodada
 */
export const getRoundRecommendations = (metrics: TradingRoundMetrics): TradingRoundRecommendations => {
  const recommendations: string[] = [];
  const suggestedChanges: TradingRoundRecommendations['suggestedChanges'] = {};
  
  const winRate = metrics.totalTrades > 0 
    ? (metrics.winningTrades / metrics.totalTrades) * 100 
    : 0;
  
  // Análise de Win Rate
  if (winRate < 40) {
    recommendations.push("Win rate muito baixo nesta rodada. Considere aumentar o filtro de confiança mínima.");
    suggestedChanges.minConfidence = 85;
  }
  
  // Análise de P&L
  if (metrics.totalPnL < 0) {
    recommendations.push("Rodada resultou em perda. Revise sua estratégia de Stop Loss e Take Profit.");
    
    // Se a maior perda foi muito maior que o maior ganho
    if (metrics.largestLoss > metrics.largestWin * 2) {
      recommendations.push("Stop Loss muito distante. Reduza para proteger seu capital.");
      suggestedChanges.stopLoss = 2.0;
    }
    
    // Se take profit está muito conservador
    if (metrics.largestWin < 20) {
      recommendations.push("Take Profit pode estar muito conservador. Considere aumentar.");
      suggestedChanges.takeProfit = 5.0;
    }
  }
  
  // Análise de risco/retorno
  if (metrics.largestLoss > 0 && metrics.largestWin > 0) {
    const riskRewardRatio = metrics.largestWin / metrics.largestLoss;
    if (riskRewardRatio < 1.5) {
      recommendations.push("Relação risco/retorno desfavorável. Ajuste TP para ser maior que SL.");
      suggestedChanges.takeProfit = 5.0;
      suggestedChanges.stopLoss = 2.0;
    }
  }
  
  // Resultados positivos
  if (metrics.totalPnL > 0 && winRate >= 60) {
    recommendations.push("Excelente performance nesta rodada! Estratégia funcionando bem.");
  }
  
  return {
    shouldAdjust: recommendations.length > 0 && Object.keys(suggestedChanges).length > 0,
    recommendations,
    suggestedChanges,
  };
};
