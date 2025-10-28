/**
 * Trailing Stop Service - Protege lucros enquanto permite crescimento
 * Princípio: SRP - Responsabilidade única de calcular trailing stops
 */

interface TrailingStopConfig {
  activationPercent: number;  // Ativa trailing após este % de lucro
  trailingPercent: number;    // Distância do trailing stop do pico
}

interface TrailingStopResult {
  shouldClose: boolean;
  reason: string;
  currentPrice: number;
  highestPrice: number;
  trailingStopPrice: number;
}

/**
 * Calcula trailing stop loss baseado no maior preço atingido
 */
export function calculateTrailingStop(
  entryPrice: number,
  currentPrice: number,
  highestPrice: number | null,
  config: TrailingStopConfig
): TrailingStopResult {
  // Atualiza o maior preço alcançado
  const newHighestPrice = Math.max(highestPrice || entryPrice, currentPrice);
  
  // Calcula lucro atual em relação ao preço de entrada
  const currentProfitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  
  // Verifica se o trailing stop deve ser ativado
  if (currentProfitPercent < config.activationPercent) {
    return {
      shouldClose: false,
      reason: '',
      currentPrice,
      highestPrice: newHighestPrice,
      trailingStopPrice: entryPrice
    };
  }
  
  // Calcula o preço do trailing stop baseado no pico
  const trailingStopPrice = newHighestPrice * (1 - config.trailingPercent / 100);
  
  // Verifica se o preço atual caiu abaixo do trailing stop
  const shouldClose = currentPrice <= trailingStopPrice;
  
  return {
    shouldClose,
    reason: shouldClose ? 'TRAILING_STOP' : '',
    currentPrice,
    highestPrice: newHighestPrice,
    trailingStopPrice
  };
}

/**
 * Configurações padrão de trailing stop por estratégia
 */
export const TRAILING_STOP_CONFIGS: Record<string, TrailingStopConfig> = {
  conservative: {
    activationPercent: 2.0,  // Ativa após 2% de lucro
    trailingPercent: 1.0     // Para se cair 1% do pico
  },
  moderate: {
    activationPercent: 2.5,  // Ativa após 2.5% de lucro
    trailingPercent: 1.2     // Para se cair 1.2% do pico
  },
  aggressive: {
    activationPercent: 3.0,  // Ativa após 3% de lucro
    trailingPercent: 1.5     // Para se cair 1.5% do pico
  }
};

/**
 * Move stop loss para breakeven quando lucro atinge threshold
 */
export function shouldMoveToBreakeven(
  entryPrice: number,
  currentPrice: number,
  breakEvenThreshold: number = 2.0
): boolean {
  const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  return profitPercent >= breakEvenThreshold;
}
