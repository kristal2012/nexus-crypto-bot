/**
 * Risk Settings - SSOT para parâmetros de risco
 * Estratégia: Momentum Trading (5-15 min por operação)
 */
export const RISK_SETTINGS = {
  // Mean Reversion Strategy - Parâmetros Otimizados (Turbo Scalping)
  STOP_LOSS_PERCENT: 2.0, // Aumentado para 2% para evitar ruído (saída técnica)
  TAKE_PROFIT_PERCENT: 5.0, // Aumentado para 5% (objetivo de lucro REAL)

  // Session/position management
  MAX_HOLD_MINUTES: 30, // Tempo aumentado para permitir desenvolvimento do trend

  // Capital Management (percent values)
  CAPITAL_PER_ROUND_PERCENT: 25,
  MAX_ALLOCATION_PER_PAIR_PERCENT: 15, // Aumentado para 15% (trades mais pesados)
  SAFETY_RESERVE_PERCENT: 5,
  MAX_POSITIONS: 5, // Reduzido para 5 (foco em qualidade/mão pesada)

  // High Performance Trading
  LEVERAGE: 5, // 5x Alavancagem (Padrão sugerido para conta real)
  TRADE_QUANTITY_USDT: 50, // 50 USDT por operação (base)

  // Momentum Parameters (percent units) - Entrada "Gatilho Rápido"
  MOMENTUM_BUY_THRESHOLD: 0.15, // Reduzido de 0.3 para 0.15 (qualquer movimento de reversão ativa)
  MIN_VOLUME_RATIO: 1.05, // Volume apenas 5% acima da média já serve
  PRICE_VELOCITY_THRESHOLD: 0.1, // Velocidade mínima reduzida

  // Cooldown & Protection
  PAIR_COOLDOWN_SECONDS: 30, // Reduzido para 30s (reentrada rápida)
  PROFIT_PROTECT_THRESHOLD: 0.8, // Proteger lucro a partir de 0.8%

  // Reinvestment
  AUTO_REINVEST: true,

  // ===== NOVOS FILTROS INTELIGENTES (Quality Over Quantity) =====

  // Filtro de Liquidez
  MIN_QUOTE_VOLUME_24H_USDT: 2_000_000, // Reduzido para 2M (aceita mid-caps voláteis)

  // Filtro de Volatilidade Intraday
  MIN_VOLATILITY_PERCENT: 0.15, // Reduzido para 0.15% (aceita mercados menos caóticos)
  VOLATILITY_WINDOW_TICKS: 20, // Janela mais curta (20 ticks)

  // Circuit Breakers
  LOSS_STREAK_LIMIT: 4, // Relaxado para 4 perdas
  DAILY_MAX_DRAWDOWN_PERCENT: 5.0, // Relaxado para 5%
  CIRCUIT_BREAKER_PAUSE_MINUTES: 30, // Pausa menor (30 min)

  // Cooldown Dinâmico
  LOSS_COOLDOWN_BASE_MINUTES: 5, // Apenas 5 min após loss
  LOSS_COOLDOWN_MULTIPLIER: 1.0,
};

export function computeDailyProfitPercent(initialCapital: number, todaysProfit: number): number {
  if (!initialCapital || initialCapital <= 0) return 0;
  return (todaysProfit / initialCapital) * 100;
}
