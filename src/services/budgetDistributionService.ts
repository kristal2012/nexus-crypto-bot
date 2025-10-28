/**
 * Budget Distribution Service - Lógica de distribuição de orçamento entre pares
 * Princípios: SSOT, DRY, KISS
 */

export interface BudgetDistribution {
  amountPerPair: number;
  totalBudget: number;
  pairsToExecute: number;
  budgetUsagePercent: number;
}

/**
 * Calcula a distribuição ideal do orçamento entre pares elegíveis
 * 
 * @param eligiblePairs - Número de pares que atendem ao critério de confiança
 * @param availableBalance - Saldo total disponível
 * @param maxDailyBudget - Orçamento máximo para uso diário (padrão: 100 USDT)
 * @param baseAmountPerPair - Valor base desejado por par (padrão: 10 USDT)
 * @param minAmountPerPair - Valor mínimo por par (padrão: 10 USDT)
 * @returns Distribuição calculada
 */
export const calculateBudgetDistribution = (
  eligiblePairs: number,
  availableBalance: number,
  maxDailyBudget: number = 100,
  baseAmountPerPair: number = 10,
  minAmountPerPair: number = 10
): BudgetDistribution => {
  // Garante que não exceda o saldo disponível
  const effectiveBudget = Math.min(availableBalance, maxDailyBudget);
  
  if (eligiblePairs === 0) {
    return {
      amountPerPair: 0,
      totalBudget: 0,
      pairsToExecute: 0,
      budgetUsagePercent: 0
    };
  }

  // Se conseguimos dar o valor base para cada par sem estourar o orçamento
  if (eligiblePairs * baseAmountPerPair <= effectiveBudget) {
    return {
      amountPerPair: baseAmountPerPair,
      totalBudget: eligiblePairs * baseAmountPerPair,
      pairsToExecute: eligiblePairs,
      budgetUsagePercent: (eligiblePairs * baseAmountPerPair / effectiveBudget) * 100
    };
  }

  // Se temos muitos pares, distribui o orçamento entre o máximo possível
  const maxPairs = Math.floor(effectiveBudget / minAmountPerPair);
  const amountPerPair = effectiveBudget / maxPairs;

  return {
    amountPerPair,
    totalBudget: effectiveBudget,
    pairsToExecute: Math.min(maxPairs, eligiblePairs),
    budgetUsagePercent: 100
  };
};

/**
 * Valida se a distribuição proposta é segura
 */
export const validateBudgetDistribution = (
  distribution: BudgetDistribution,
  availableBalance: number
): { valid: boolean; reason?: string } => {
  if (distribution.totalBudget > availableBalance) {
    return {
      valid: false,
      reason: `Orçamento total (${distribution.totalBudget} USDT) excede saldo disponível (${availableBalance} USDT)`
    };
  }

  if (distribution.amountPerPair < 5) {
    return {
      valid: false,
      reason: `Valor por par (${distribution.amountPerPair} USDT) abaixo do mínimo viável (5 USDT)`
    };
  }

  return { valid: true };
};

/**
 * Calcula métricas de eficiência da distribuição
 */
export const calculateDistributionMetrics = (
  distribution: BudgetDistribution,
  baseAmountPerPair: number = 10
): {
  efficiency: number;
  diversification: number;
  riskLevel: 'low' | 'medium' | 'high';
} => {
  // Eficiência: quão próximo estamos do valor base ideal por par
  const efficiency = Math.min(100, (distribution.amountPerPair / baseAmountPerPair) * 100);

  // Diversificação: quantos pares conseguimos cobrir
  const diversification = Math.min(100, (distribution.pairsToExecute / 10) * 100);

  // Nível de risco baseado no uso do orçamento
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (distribution.budgetUsagePercent > 80) {
    riskLevel = 'high';
  } else if (distribution.budgetUsagePercent > 50) {
    riskLevel = 'medium';
  }

  return {
    efficiency,
    diversification,
    riskLevel
  };
};
