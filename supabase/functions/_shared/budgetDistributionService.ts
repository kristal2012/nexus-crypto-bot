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
  MAX_BUDGET_PERCENT: 0.10,     // Usar 10% do saldo disponível (conforme solicitado)
  MIN_AMOUNT_PER_PAIR: 10,      // Mínimo 10 USDT por par (será adaptado ao minNotional)
  MAX_AMOUNT_PER_PAIR: 150,     // Máximo 150 USDT por par (reduz risco de concentração)
  MIN_LAYERS: 1,                // Entrada única (sem DCA)
} as const;

/**
 * Calcula o orçamento total disponível para esta análise
 * Usa 10% do saldo disponível, adaptando-se ao capital
 */
export function calculateAvailableBudget(balance: number): number {
  const budgetFromPercent = balance * BUDGET_CONFIG.MAX_BUDGET_PERCENT;
  console.log(`💰 Orçamento calculado: ${budgetFromPercent.toFixed(2)} USDT (10% de ${balance.toFixed(2)} USDT)`);
  return budgetFromPercent;
}

/**
 * Distribui orçamento de forma inteligente e flexível entre oportunidades
 * Algoritmo totalmente adaptativo que distribui 10% do capital entre pares elegíveis
 * 
 * ESTRATÉGIA:
 * 1. Usa 10% do saldo total disponível
 * 2. Distribui igualmente entre TODOS os pares elegíveis
 * 3. Adapta automaticamente o valor por par aos minNotionals
 * 4. Garante que cada par receba valor suficiente para executar
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
    console.log('❌ Nenhuma oportunidade encontrada para distribuir orçamento');
    return result;
  }

  if (availableBudget < BUDGET_CONFIG.MIN_AMOUNT_PER_PAIR) {
    console.log(`❌ Orçamento ${availableBudget.toFixed(2)} USDT insuficiente (mínimo: ${BUDGET_CONFIG.MIN_AMOUNT_PER_PAIR} USDT)`);
    result.skippedPairs = opportunities.map(o => ({
      symbol: o.symbol,
      reason: `Orçamento total insuficiente (${availableBudget.toFixed(2)} USDT)`
    }));
    return result;
  }

  // Ordenar por confiança (maior primeiro)
  const sorted = [...opportunities].sort((a, b) => b.confidence - a.confidence);
  console.log(`📊 Distribuindo ${availableBudget.toFixed(2)} USDT entre ${sorted.length} oportunidades`);

  // ESTRATÉGIA ADAPTATIVA:
  // Começar tentando distribuir igualmente entre todos os pares
  // e ajustar conforme necessário baseado nos minNotionals
  
  let pairsToInclude = sorted.length;
  let amountPerPair = availableBudget / pairsToInclude;
  let executablePairs: TradingOpportunity[] = [];
  
  // Iterar até encontrar uma distribuição viável
  while (pairsToInclude > 0) {
    // Calcular valor por par COM LIMITE MÁXIMO para evitar concentração
    const calculatedAmount = availableBudget / pairsToInclude;
    amountPerPair = Math.min(calculatedAmount, BUDGET_CONFIG.MAX_AMOUNT_PER_PAIR);
    executablePairs = [];
    
    console.log(`\n🔄 Tentativa: ${amountPerPair.toFixed(2)} USDT por par × ${pairsToInclude} pares`);
    if (calculatedAmount > BUDGET_CONFIG.MAX_AMOUNT_PER_PAIR) {
      console.log(`   ⚠️ Valor limitado de ${calculatedAmount.toFixed(2)} para ${BUDGET_CONFIG.MAX_AMOUNT_PER_PAIR} USDT (cap de segurança)`);
    }
    
    // Verificar quais pares são executáveis com esse valor
    for (let i = 0; i < pairsToInclude; i++) {
      const opp = sorted[i];
      const minRequired = opp.minNotional * BUDGET_CONFIG.MIN_LAYERS; // Entrada única
      
      if (amountPerPair >= minRequired) {
        executablePairs.push(opp);
        console.log(`  ✅ ${opp.symbol}: minNotional ${opp.minNotional} USDT (entrada única, OK)`);
      } else {
        console.log(`  ⚠️ ${opp.symbol}: precisa ${minRequired.toFixed(2)} USDT, disponível ${amountPerPair.toFixed(2)} USDT`);
        result.skippedPairs.push({
          symbol: opp.symbol,
          reason: `Requer ${minRequired.toFixed(2)} USDT (mínimo notional ${opp.minNotional}), disponível ${amountPerPair.toFixed(2)} USDT`
        });
      }
    }
    
    // Se conseguimos executar todos os pares desta iteração, sucesso!
    if (executablePairs.length === pairsToInclude) {
      console.log(`\n✅ Distribuição viável encontrada!`);
      break;
    }
    
    // Caso contrário, reduzir número de pares e tentar novamente
    // Isso aumenta o valor por par restante
    pairsToInclude = executablePairs.length;
    
    if (pairsToInclude === 0) {
      console.log(`\n❌ Nenhum par pode ser executado com orçamento ${availableBudget.toFixed(2)} USDT`);
      return result;
    }
  }

  // Usar todos os pares executáveis encontrados
  result.tradesToExecute = executablePairs;
  result.amountPerPair = amountPerPair;
  result.totalBudgetUsed = amountPerPair * executablePairs.length;

  console.log(`\n✅ DISTRIBUIÇÃO FINAL:`);
  console.log(`   💰 Orçamento total: ${availableBudget.toFixed(2)} USDT`);
  console.log(`   📊 Pares selecionados: ${result.tradesToExecute.length}`);
  console.log(`   💵 Valor por par: ${amountPerPair.toFixed(2)} USDT`);
  console.log(`   🎯 Total usado: ${result.totalBudgetUsed.toFixed(2)} USDT (${((result.totalBudgetUsed/availableBudget)*100).toFixed(1)}%)`);
  
  if (result.skippedPairs.length > 0) {
    console.log(`   ⚠️ Pares ignorados: ${result.skippedPairs.length}`);
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
      reason: 'Nenhuma oportunidade pode ser executada. Possíveis causas: orçamento insuficiente ou minNotionals muito altos para o capital disponível.'
    };
  }

  // Validação flexível: aceitar qualquer valor >= MIN_AMOUNT_PER_PAIR
  // pois o algoritmo já garante compatibilidade com minNotionals
  if (distribution.amountPerPair < BUDGET_CONFIG.MIN_AMOUNT_PER_PAIR) {
    return {
      isValid: false,
      reason: `Valor por par (${distribution.amountPerPair.toFixed(2)} USDT) abaixo do mínimo absoluto (${BUDGET_CONFIG.MIN_AMOUNT_PER_PAIR} USDT)`
    };
  }

  return { isValid: true };
}
