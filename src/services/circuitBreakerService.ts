/**
 * Circuit Breaker Service - SSOT para proteção contra perdas
 * Princípios: SRP, KISS, Fail Fast
 * 
 * Responsabilidade: Monitorar performance e parar trading quando necessário
 */

export interface CircuitBreakerStatus {
  isOpen: boolean;
  reason?: string;
  canTrade: boolean;
  severity: 'none' | 'warning' | 'critical';
  metrics: {
    winRate: number;
    consecutiveLosses: number;
    dailyLossPercent: number;
    totalTrades: number;
  };
}

export interface TradeMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalProfitLoss: number;
  avgProfitLoss: number;
}

// Thresholds de segurança (KISS - valores simples e claros)
const THRESHOLDS = {
  MIN_WIN_RATE: 30, // 30% mínimo de win rate
  MAX_CONSECUTIVE_LOSSES: 5, // máximo 5 perdas consecutivas
  MAX_DAILY_LOSS_PERCENT: 5, // máximo 5% de perda no dia
  MIN_TRADES_FOR_ANALYSIS: 10, // mínimo de trades para análise
  CRITICAL_WIN_RATE: 20, // abaixo de 20% = crítico
  CRITICAL_LOSS_PERCENT: 10, // acima de 10% perda = crítico
};

/**
 * Analisa métricas de trading e determina se deve parar (Fail Fast)
 */
export const checkCircuitBreaker = (metrics: TradeMetrics): CircuitBreakerStatus => {
  const { totalTrades, winningTrades, losingTrades, totalProfitLoss } = metrics;

  // Se não tem trades suficientes, permite mas com warning
  if (totalTrades < THRESHOLDS.MIN_TRADES_FOR_ANALYSIS) {
    return {
      isOpen: false,
      canTrade: true,
      severity: 'none',
      metrics: {
        winRate: 0,
        consecutiveLosses: 0,
        dailyLossPercent: 0,
        totalTrades,
      },
    };
  }

  const winRate = (winningTrades / totalTrades) * 100;
  const dailyLossPercent = Math.abs(totalProfitLoss / 10000) * 100; // assumindo 10k de capital inicial

  // CRITICAL: Win rate abaixo do mínimo aceitável
  if (winRate < THRESHOLDS.CRITICAL_WIN_RATE) {
    return {
      isOpen: true,
      reason: `Win rate crítico: ${winRate.toFixed(1)}% (mínimo: ${THRESHOLDS.CRITICAL_WIN_RATE}%). Sistema pausado por segurança.`,
      canTrade: false,
      severity: 'critical',
      metrics: {
        winRate,
        consecutiveLosses: losingTrades,
        dailyLossPercent,
        totalTrades,
      },
    };
  }

  // CRITICAL: Perda diária acima do limite
  if (dailyLossPercent > THRESHOLDS.CRITICAL_LOSS_PERCENT) {
    return {
      isOpen: true,
      reason: `Perda diária crítica: ${dailyLossPercent.toFixed(1)}% (máximo: ${THRESHOLDS.CRITICAL_LOSS_PERCENT}%). Trading pausado.`,
      canTrade: false,
      severity: 'critical',
      metrics: {
        winRate,
        consecutiveLosses: losingTrades,
        dailyLossPercent,
        totalTrades,
      },
    };
  }

  // WARNING: Win rate baixo mas não crítico
  if (winRate < THRESHOLDS.MIN_WIN_RATE) {
    return {
      isOpen: false,
      reason: `Win rate baixo: ${winRate.toFixed(1)}% (recomendado: >${THRESHOLDS.MIN_WIN_RATE}%). Revisar estratégia.`,
      canTrade: true,
      severity: 'warning',
      metrics: {
        winRate,
        consecutiveLosses: losingTrades,
        dailyLossPercent,
        totalTrades,
      },
    };
  }

  // WARNING: Perda diária elevada
  if (dailyLossPercent > THRESHOLDS.MAX_DAILY_LOSS_PERCENT) {
    return {
      isOpen: false,
      reason: `Perda diária elevada: ${dailyLossPercent.toFixed(1)}% (limite: ${THRESHOLDS.MAX_DAILY_LOSS_PERCENT}%). Cuidado.`,
      canTrade: true,
      severity: 'warning',
      metrics: {
        winRate,
        consecutiveLosses: losingTrades,
        dailyLossPercent,
        totalTrades,
      },
    };
  }

  // Tudo OK
  return {
    isOpen: false,
    canTrade: true,
    severity: 'none',
    metrics: {
      winRate,
      consecutiveLosses: losingTrades,
      dailyLossPercent,
      totalTrades,
    },
  };
};

/**
 * Calcula sugestões de ajustes na estratégia baseado em performance
 */
export const getSuggestedStrategyAdjustments = (
  metrics: TradeMetrics,
  currentConfig: { stopLoss: number; takeProfit: number; leverage: number; minConfidence: number }
) => {
  const winRate = (metrics.winningTrades / metrics.totalTrades) * 100;
  const suggestions: string[] = [];
  const adjustments: any = {};

  // Se win rate muito baixo, ajustes agressivos
  if (winRate < 30) {
    // Aumentar stop loss para dar mais margem
    if (currentConfig.stopLoss < 3) {
      adjustments.stopLoss = 3.0;
      suggestions.push('Aumentar Stop Loss para 3% (dar mais margem para trades)');
    }

    // Diminuir take profit para ser mais realista
    if (currentConfig.takeProfit > 2) {
      adjustments.takeProfit = 2.0;
      suggestions.push('Diminuir Take Profit para 2% (metas mais alcançáveis)');
    }

    // Reduzir leverage drasticamente
    if (currentConfig.leverage > 5) {
      adjustments.leverage = 5;
      suggestions.push('URGENTE: Reduzir Leverage para 5x (risco muito alto)');
    }

    // Aumentar confiança mínima
    if (currentConfig.minConfidence < 80) {
      adjustments.minConfidence = 80;
      suggestions.push('Aumentar confiança mínima para 80% (ser mais seletivo)');
    }
  }

  return { suggestions, adjustments };
};
