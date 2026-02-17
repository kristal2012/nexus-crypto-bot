/**
 * Risk Settings - SSOT para parâmetros de risco
 * Estratégia: Momentum Trading com filtro sensível + TP seguro
 * 
 * MATEMÁTICA DA ESTRATÉGIA:
 * - Filtro de detecção: 0.03% (ouvir melhor o mercado)
 * - Take Profit: 1.5% (cobre taxas de 0.2% e tem lucro líquido de ~1.3%)
 * - Stop Loss: 1.0% (proteção rápida)
 * - Break-even técnico: 0.30% (nunca buscar menos que isso)
 */
export const RISK_SETTINGS = {
  // Mean Reversion Strategy - Parâmetros Otimizados (Turbo Scalping)
  STOP_LOSS_PERCENT: 1.0, // 1% - proteção rápida
  TAKE_PROFIT_PERCENT: 1.5, // 1.5% - cobre taxas Binance (0.2%) + lucro

  // Session/position management
  MAX_HOLD_MINUTES: 10, // 10 min - tempo médio de operação

  // Capital Management (percent values)
  CAPITAL_PER_ROUND_PERCENT: 20, // 20% por rodada - mais agressivo
  MAX_ALLOCATION_PER_PAIR_PERCENT: 10, // 10% por par - até 2 posições
  SAFETY_RESERVE_PERCENT: 10, // Reserva para segurança
  MAX_POSITIONS: 5, // 5 posições = 1 por par monitorado

  // Momentum Parameters - FILTRO SENSÍVEL PARA DETECTAR MAIS OPORTUNIDADES
  MOMENTUM_BUY_THRESHOLD: 0.01, // 0.01% - detecta micro-movimentos mínimos
  MIN_VOLUME_RATIO: 1.02, // Volume apenas 2% acima da média
  PRICE_VELOCITY_THRESHOLD: 0.01, // 0.01% - velocidade mínima extremamente sensível

  // Cooldown & Protection
  PAIR_COOLDOWN_SECONDS: 60, // 60s - mais ativo (antes: 300s)
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
