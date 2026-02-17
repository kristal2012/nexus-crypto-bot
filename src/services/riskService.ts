/**
 * Risk Settings - SSOT para parâmetros de risco
 * Estratégia: Cryptum 7.1 Futures (Scalping/Mean Reversion)
 * 
 * MATEMÁTICA DA ESTRATÉGIA:
 * - Entrada: Reversão à Média (Bollinger Bands + RSI)
 * - Take Profit: 1.5% (Alvo Scalping)
 * - Stop Loss: 1.0% (Proteção Rápida)
 * - Break-even: 0.30%
 */
export const RISK_SETTINGS = {
  // Mean Reversion Strategy - Parâmetros Otimizados (Futures Scalping)
  STOP_LOSS_PERCENT: 1.0, // 1% - proteção rápida
  TAKE_PROFIT_PERCENT: 1.5, // 1.5% - alvo scalping

  // Session/position management
  MAX_HOLD_MINUTES: 10, // 10 min - tempo médio de scalp

  // Capital Management (percent values)
  CAPITAL_PER_ROUND_PERCENT: 20, // 20% por operação
  MAX_ALLOCATION_PER_PAIR_PERCENT: 10,
  SAFETY_RESERVE_PERCENT: 10,
  MAX_POSITIONS: 5,

  // Secondary Filters (Legacy from Volatile Bot - Mantidos para compatibilidade)
  MOMENTUM_BUY_THRESHOLD: 0.01, // 0.01% - Sensibilidade de movimento (Secundário)
  MIN_VOLUME_RATIO: 1.02, // Volume acima da média
  PRICE_VELOCITY_THRESHOLD: 0.01,

  // Cooldown & Protection
  PAIR_COOLDOWN_SECONDS: 60, // 60s - Scalping dinâmico
  PROFIT_PROTECT_THRESHOLD: 1.0, // Proteger lucro a partir de 1%

  // Reinvestment
  AUTO_REINVEST: true,

  // ===== NOVOS FILTROS INTELIGENTES (Quality Over Quantity) =====

  // Filtro de Liquidez
  MIN_QUOTE_VOLUME_24H_USDT: 2_000_000, // 2M - aceita mid-caps voláteis

  // Filtro de Volatilidade Intraday
  MIN_VOLATILITY_PERCENT: 0.005, // 0.005% - extremamente sensível para detectar qualquer movimento
  VOLATILITY_WINDOW_TICKS: 20,

  // Circuit Breakers
  LOSS_STREAK_LIMIT: 4,
  DAILY_MAX_DRAWDOWN_PERCENT: 5.0,
  CIRCUIT_BREAKER_PAUSE_MINUTES: 30,

  // Cooldown Dinâmico
  LOSS_COOLDOWN_BASE_MINUTES: 3, // 3 min após loss
  LOSS_COOLDOWN_MULTIPLIER: 1.0,
};

export function computeDailyProfitPercent(initialCapital: number, todaysProfit: number): number {
  if (!initialCapital || initialCapital <= 0) return 0;
  return (todaysProfit / initialCapital) * 100;
}
