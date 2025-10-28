/**
 * Budget Distribution Service
 * 
 * Princípios: SRP, SSOT, KISS
 * Responsabilidade: Calcular distribuição inteligente de orçamento entre oportunidades de trading
 */

export interface TradingOpportunity {
  symbol: string;
  minNotional: number;
  confidence: number;
  recommendedDcaLayers: number;
  predictedPrice: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface BudgetDistribution {
  amountPerPair: number;
  tradesToExecute: TradingOpportunity[];
  totalBudgetUsed: number;
  skippedPairs: Array<{ symbol: string; reason: string }>;
}

/**
 * Constantes de configuração centralizadas (SSOT)
 */
export const BUDGET_CONFIG = {
  MAX_BUDGET_PERCENT: 0.15, // Usar até 15% do saldo disponível
  MIN_BUDGET: 150,          // Mínimo 150 USDT por análise
  MAX_BUDGET: 300,          // Máximo 300 USDT por análise
  BASE_AMOUNT_PER_PAIR: 25, // Base de 25 USDT por par
  MIN_AMOUNT_PER_PAIR: 20,  // Mínimo 20 USDT por par
  MIN_LAYERS: 3,            // Mínimo 3 layers por trade
} as const;

/**
 * Calcula o orçamento total disponível para esta análise
 */
export function calculateAvailableBudget(balance: number): number {
  const budgetFromPercent = balance * BUDGET_CONFIG.MAX_BUDGET_PERCENT;
  return Math.max(
    BUDGET_CONFIG.MIN_BUDGET,
    Math.min(BUDGET_CONFIG.MAX_BUDGET, budgetFromPercent)
  );
}

/**
 * Distribui orçamento de forma inteligente entre oportunidades
 * Algoritmo adaptativo que considera minNotionals reais
 */
export function distributeBudget(
  opportunities: TradingOpportunity[],
  availableBudget: number
): BudgetDistribution {
  const result: BudgetDistribution = {
    amountPerPair: 0,
    tradesToExecute: [],
    totalBudgetUsed: 0,
    skippedPairs: [],
  };

  if (opportunities.length === 0) {
    return result;
  }

  // Ordenar por confiança (maior primeiro)
  const sorted = [...opportunities].sort((a, b) => b.confidence - a.confidence);

  // PASSO 1: Identificar o minNotional máximo entre as oportunidades
  const maxMinNotional = Math.max(...sorted.map(o => o.minNotional));
  console.log(`📊 Max minNotional encontrado: ${maxMinNotional} USDT`);

  // PASSO 2: Calcular valor inicial por par (não menor que o maior minNotional)
  let amountPerPair = Math.max(BUDGET_CONFIG.BASE_AMOUNT_PER_PAIR, maxMinNotional);
  
  // PASSO 3: Ver quantos pares conseguimos executar com esse valor
  let maxPairsWithBudget = Math.floor(availableBudget / amountPerPair);
  
  if (maxPairsWithBudget === 0) {
    // Orçamento insuficiente para executar mesmo 1 trade
    console.log(`❌ Orçamento ${availableBudget} USDT insuficiente para executar trades (mínimo necessário: ${amountPerPair} USDT)`);
    result.skippedPairs = sorted.map(o => ({
      symbol: o.symbol,
      reason: `Orçamento insuficiente (necessário: ${amountPerPair} USDT, disponível: ${availableBudget} USDT)`
    }));
    return result;
  }

  console.log(`💰 Orçamento: ${availableBudget} USDT | Valor por par: ${amountPerPair} USDT | Max pares: ${maxPairsWithBudget}`);

  // PASSO 4: Filtrar pares executáveis
  const executablePairs: TradingOpportunity[] = [];
  
  for (const opportunity of sorted) {
    if (opportunity.minNotional <= amountPerPair) {
      executablePairs.push(opportunity);
    } else {
      console.log(`⚠️ ${opportunity.symbol} requer ${opportunity.minNotional} USDT (disponível: ${amountPerPair} USDT) - ignorado`);
      result.skippedPairs.push({
        symbol: opportunity.symbol,
        reason: `MinNotional ${opportunity.minNotional} USDT > valor disponível ${amountPerPair} USDT`
      });
    }
  }

  if (executablePairs.length === 0) {
    console.log('❌ Nenhum par executável encontrado após filtro de minNotional');
    return result;
  }

  // PASSO 5: Determinar quantos pares executar
  const pairsToExecute = Math.min(executablePairs.length, maxPairsWithBudget);
  
  // PASSO 6: Redistribuir orçamento se temos pares sobrando
  if (pairsToExecute < executablePairs.length) {
    // Temos mais pares do que orçamento permite - usar todo orçamento
    amountPerPair = availableBudget / pairsToExecute;
    console.log(`📊 Redistribuindo: ${amountPerPair.toFixed(2)} USDT × ${pairsToExecute} pares`);
  }

  // PASSO 7: Selecionar pares finais
  result.tradesToExecute = executablePairs.slice(0, pairsToExecute);
  result.amountPerPair = amountPerPair;
  result.totalBudgetUsed = amountPerPair * pairsToExecute;

  // Adicionar pares não executados aos skipped
  for (let i = pairsToExecute; i < executablePairs.length; i++) {
    result.skippedPairs.push({
      symbol: executablePairs[i].symbol,
      reason: 'Orçamento esgotado - prioridade menor'
    });
  }

  console.log(`✅ Distribuição final: ${result.tradesToExecute.length} pares × ${amountPerPair.toFixed(2)} USDT = ${result.totalBudgetUsed.toFixed(2)} USDT`);
  
  if (result.skippedPairs.length > 0) {
    console.log(`⚠️ ${result.skippedPairs.length} pares não serão executados`);
  }

  return result;
}

/**
 * Valida se uma distribuição de orçamento é viável
 */
export function validateDistribution(distribution: BudgetDistribution): {
  isValid: boolean;
  reason?: string;
} {
  if (distribution.tradesToExecute.length === 0) {
    return {
      isValid: false,
      reason: 'Nenhuma oportunidade de trading pode ser executada com o orçamento disponível'
    };
  }

  if (distribution.amountPerPair < BUDGET_CONFIG.MIN_AMOUNT_PER_PAIR) {
    return {
      isValid: false,
      reason: `Valor por par (${distribution.amountPerPair.toFixed(2)} USDT) abaixo do mínimo (${BUDGET_CONFIG.MIN_AMOUNT_PER_PAIR} USDT)`
    };
  }

  return { isValid: true };
}
