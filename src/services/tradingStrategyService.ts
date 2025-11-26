/**
 * Trading Strategy Service - Lógica centralizada de estratégia de trading
 * Princípios: SSOT, DRY
 */

export interface TradingStrategy {
  name: string;
  description: string;
  minBalance: number;
  quantityPerLayer: number;
  numLayers: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  minConfidence: number;
}

/**
 * Estratégias pré-definidas baseadas no saldo disponível
 */
export const TRADING_STRATEGIES: Record<string, TradingStrategy> = {
  conservative: {
    name: "Conservadora",
    description: "Baixo risco, entrada única com TP/SL/Trailing",
    minBalance: 1000,
    quantityPerLayer: 20,
    numLayers: 1,         // Entrada única (sem DCA)
    leverage: 3,
    stopLoss: 1.0,        // 1% SL fixo
    takeProfit: 0.30,     // 0.30% TP fixo
    minConfidence: 85,
  },
  moderate: {
    name: "Moderada",
    description: "Equilíbrio entre risco e retorno, entrada única com TP/SL/Trailing",
    minBalance: 5000,
    quantityPerLayer: 25,
    numLayers: 1,         // Entrada única (sem DCA)
    leverage: 5,
    stopLoss: 1.0,        // 1% SL fixo
    takeProfit: 0.30,     // 0.30% TP fixo
    minConfidence: 80,
  },
  aggressive: {
    name: "Agressiva",
    description: "Alto risco, entrada única com TP/SL/Trailing",
    minBalance: 10000,
    quantityPerLayer: 50,
    numLayers: 1,         // Entrada única (sem DCA)
    leverage: 10,
    stopLoss: 1.0,        // 1% SL fixo
    takeProfit: 0.30,     // 0.30% TP fixo
    minConfidence: 75,
  },
};

/**
 * Seleciona a melhor estratégia baseada no saldo disponível
 */
export const selectOptimalStrategy = (balance: number): TradingStrategy => {
  if (balance >= TRADING_STRATEGIES.aggressive.minBalance) {
    return TRADING_STRATEGIES.aggressive;
  } else if (balance >= TRADING_STRATEGIES.moderate.minBalance) {
    return TRADING_STRATEGIES.moderate;
  } else {
    return TRADING_STRATEGIES.conservative;
  }
};

/**
 * Calcula o tamanho da posição baseado no saldo e risco
 */
export const calculatePositionSize = (
  balance: number,
  riskPercent: number,
  leverage: number
): number => {
  // Usa percentual do saldo total considerando alavancagem
  const positionSize = (balance * riskPercent / 100) * leverage;
  return Math.floor(positionSize * 100) / 100; // Arredonda para 2 decimais
};

/**
 * Valida se a estratégia é adequada para o saldo disponível
 */
export const validateStrategy = (
  strategy: TradingStrategy,
  availableBalance: number
): { valid: boolean; reason?: string } => {
  const totalRequired = strategy.quantityPerLayer * strategy.numLayers;
  
  if (totalRequired > availableBalance * 0.5) {
    return {
      valid: false,
      reason: `Estratégia requer ${totalRequired} USDT mas você tem apenas ${availableBalance} USDT disponível. Use no máximo 50% do saldo.`
    };
  }
  
  if (availableBalance < strategy.minBalance) {
    return {
      valid: false,
      reason: `Saldo mínimo para esta estratégia: ${strategy.minBalance} USDT`
    };
  }
  
  return { valid: true };
};

/**
 * Calcula o lucro esperado de uma operação
 */
export const calculateExpectedProfit = (
  positionSize: number,
  leverage: number,
  takeProfitPercent: number
): number => {
  return (positionSize * leverage * takeProfitPercent) / 100;
};

/**
 * Calcula o risco máximo de uma operação
 */
export const calculateMaxRisk = (
  positionSize: number,
  leverage: number,
  stopLossPercent: number
): number => {
  return (positionSize * leverage * stopLossPercent) / 100;
};

/**
 * Retorna a relação risco/retorno
 */
export const calculateRiskRewardRatio = (
  stopLoss: number,
  takeProfit: number
): number => {
  return takeProfit / stopLoss;
};
