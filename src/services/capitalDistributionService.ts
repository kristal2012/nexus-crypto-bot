import { binanceService } from "./binanceService";
import { RISK_SETTINGS } from './riskService';

export interface CapitalAllocation {
  symbol: string;
  allocatedAmount: number;
  allocatedPercent: number;
  quantity: number;
}

class CapitalDistributionService {
  // Usar SSOT (RISK_SETTINGS) para todos os percentuais
  private readonly CAPITAL_PER_ROUND = RISK_SETTINGS.CAPITAL_PER_ROUND_PERCENT / 100;
  private readonly MAX_ALLOCATION_PER_PAIR = RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT / 100;
  private readonly SAFETY_RESERVE = RISK_SETTINGS.SAFETY_RESERVE_PERCENT / 100;

  /**
   * Distribui capital entre múltiplos pares
   */
  async distributeCapital(
    userId: string,
    totalCapital: number,
    pairs: string[],
    testMode: boolean,
    quantityPerTrade?: number // Quantidade fixa em USDT definida pelo usuário
  ): Promise<Map<string, CapitalAllocation>> {
    const allocations = new Map<string, CapitalAllocation>();

    if (pairs.length === 0) {
      console.warn("No pairs to allocate capital");
      return allocations;
    }

    // Se o usuário definiu quantidade por trade, usar valor fixo
    if (quantityPerTrade && quantityPerTrade > 0) {
      console.log(`💰 Usando quantidade fixa: ${quantityPerTrade.toFixed(2)} USDT por trade`);
      
      for (const symbol of pairs) {
        try {
          const priceData = await binanceService.getPrice(symbol);

          if (!priceData) {
            console.error(`Error fetching price for ${symbol}`);
            continue;
          }

          const price = priceData.price;
          const quantity = quantityPerTrade / price;

          allocations.set(symbol, {
            symbol,
            allocatedAmount: quantityPerTrade,
            allocatedPercent: (quantityPerTrade / totalCapital) * 100,
            quantity: Number(quantity.toFixed(8)),
          });

          console.log(`${symbol}: ${quantityPerTrade.toFixed(2)} USDT (${quantity.toFixed(8)} units @ $${price.toFixed(2)})`);
        } catch (error) {
          console.error(`Error allocating capital for ${symbol}:`, error);
        }
      }

      return allocations;
    }

    // Caso contrário, usar cálculo automático (divisão do capital)
    const capitalPerRound = totalCapital * this.CAPITAL_PER_ROUND;

    // Capital disponível para trading (exclui reserva de segurança)
    const availableCapital = capitalPerRound * (1 - this.SAFETY_RESERVE);

    // Calcular alocação por par
    const allocationPerPair = Math.min(
      availableCapital / pairs.length,
      totalCapital * this.MAX_ALLOCATION_PER_PAIR
    );

    console.log(`💰 Momentum Trading: Usando ${capitalPerRound.toFixed(2)} USDT (${RISK_SETTINGS.CAPITAL_PER_ROUND_PERCENT}% do capital)`);
    console.log(`📊 Distribuindo ${availableCapital.toFixed(2)} USDT entre ${pairs.length} pares (reserva ${RISK_SETTINGS.SAFETY_RESERVE_PERCENT}%)`);
    console.log(`🎯 Alocação por par: ${allocationPerPair.toFixed(2)} USDT (máx ${RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT}% por par)`);

    // Criar alocações para cada par
    for (const symbol of pairs) {
      try {
        // Buscar preço atual do par diretamente
        const priceData = await binanceService.getPrice(symbol);

        if (!priceData) {
          console.error(`Error fetching price for ${symbol}`);
          continue;
        }

        const price = priceData.price;
        const quantity = allocationPerPair / price;

        allocations.set(symbol, {
          symbol,
          allocatedAmount: allocationPerPair,
          allocatedPercent: (allocationPerPair / totalCapital) * 100,
          quantity: Number(quantity.toFixed(8)), // 8 casas decimais para cripto
        });

        console.log(`${symbol}: ${allocationPerPair.toFixed(2)} USDT (${quantity.toFixed(8)} units @ $${price.toFixed(2)})`);
      } catch (error) {
        console.error(`Error allocating capital for ${symbol}:`, error);
      }
    }

    return allocations;
  }

  /**
   * Calcula quantidade de compra baseado no capital alocado
   */
  calculateQuantity(allocatedAmount: number, currentPrice: number): number {
    return Number((allocatedAmount / currentPrice).toFixed(8));
  }

  /**
   * Verifica se a alocação está dentro dos limites
   */
  isAllocationValid(allocatedAmount: number, totalCapital: number): boolean {
    const percent = allocatedAmount / totalCapital;
    return percent <= this.MAX_ALLOCATION_PER_PAIR && percent > 0;
  }

  /**
   * Retorna capital total alocado
   */
  getTotalAllocated(allocations: Map<string, CapitalAllocation>): number {
    let total = 0;
    for (const allocation of allocations.values()) {
      total += allocation.allocatedAmount;
    }
    return total;
  }

  /**
   * Retorna capital disponível
   */
  getAvailableCapital(totalCapital: number, allocations: Map<string, CapitalAllocation>): number {
    const allocated = this.getTotalAllocated(allocations);
    return totalCapital - allocated;
  }

  /**
   * Rebalanceia alocações quando pares mudam
   */
  async rebalance(
    userId: string,
    totalCapital: number,
    currentPairs: string[],
    existingAllocations: Map<string, CapitalAllocation>,
    testMode: boolean
  ): Promise<Map<string, CapitalAllocation>> {
    console.log("Rebalancing capital allocations...");

    // Liberar capital de pares removidos
    const currentSet = new Set(currentPairs);
    const freedCapital = Array.from(existingAllocations.entries())
      .filter(([symbol]) => !currentSet.has(symbol))
      .reduce((sum, [_, allocation]) => sum + allocation.allocatedAmount, 0);

    // Remover alocações de pares que não estão mais na lista
    for (const symbol of existingAllocations.keys()) {
      if (!currentSet.has(symbol)) {
        existingAllocations.delete(symbol);
      }
    }

    // Distribuir capital livre entre novos pares
    const newPairs = currentPairs.filter(symbol => !existingAllocations.has(symbol));

    if (newPairs.length > 0 && freedCapital > 0) {
      const allocationPerNewPair = freedCapital / newPairs.length;

      for (const symbol of newPairs) {
        try {
          const priceData = await binanceService.getPrice(symbol);

          if (priceData) {
            const quantity = allocationPerNewPair / priceData.price;
            existingAllocations.set(symbol, {
              symbol,
              allocatedAmount: allocationPerNewPair,
              allocatedPercent: (allocationPerNewPair / totalCapital) * 100,
              quantity: Number(quantity.toFixed(8)),
            });
          }
        } catch (error) {
          console.error(`Error allocating to new pair ${symbol}:`, error);
        }
      }
    }

    console.log(`Rebalanced: ${existingAllocations.size} pairs, ${freedCapital.toFixed(2)} USDT redistributed`);
    return existingAllocations;
  }
}

export const capitalDistributionService = new CapitalDistributionService();
