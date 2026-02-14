import { localDb } from "./localDbService";
import { RISK_SETTINGS } from "./riskService";
export interface OperationStats {
  lastOperationTime: string | null;
  totalOperationsToday: number;
  lastOperationProfit: number | null;
  lastOperationSide: string | null;
  lastOperationSymbol: string | null;
  // Novos campos para circuit breakers
  lossStreak: number;
  dailyPnL: number;
  circuitBreakerActive: boolean;
  circuitBreakerUntil: number | null;
}

/**
 * Service responsável por buscar estatísticas das operações de trading
 * Seguindo SRP: apenas busca e processa dados de operações
 */
export const operationsStatsService = {
  /**
   * Busca estatísticas das operações do dia atual
   * Calcula loss streak e PnL baseado em round trips realizados (BUY→SELL)
   */
  async getTodayOperationsStats(userId: string): Promise<OperationStats> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Buscar todas as trades locais
      const allTrades = localDb.getTrades(1000).filter((t: any) => {
        return new Date(t.created_at).getTime() >= today.getTime();
      });

      // Última operação executada
      const executedTrades = allTrades.filter((t: any) => t.status === 'EXECUTED');
      const lastOperation = executedTrades[executedTrades.length - 1];

      // Parear BUY→SELL para calcular round trips realizados
      const roundTrips = this.calculateRoundTrips(allTrades);

      // Calcular loss streak baseado em round trips
      let lossStreak = 0;
      for (let i = roundTrips.length - 1; i >= 0; i--) {
        if (roundTrips[i].pnl < 0) {
          lossStreak++;
        } else if (roundTrips[i].pnl > 0) {
          break; // Para quando encontrar um lucro
        }
      }

      // Calcular PnL diário (soma de todos os round trips)
      const dailyPnL = roundTrips.reduce((sum, rt) => sum + rt.pnl, 0);

      console.log(`📊 Stats calculadas: ${roundTrips.length} round trips, lossStreak=${lossStreak}, dailyPnL=${dailyPnL.toFixed(4)}`);

      return {
        lastOperationTime: lastOperation?.executed_at || lastOperation?.created_at || null,
        totalOperationsToday: roundTrips.length,
        lastOperationProfit: lastOperation?.profit_loss || null,
        lastOperationSide: lastOperation?.side || null,
        lastOperationSymbol: lastOperation?.symbol || null,
        lossStreak,
        dailyPnL,
        circuitBreakerActive: false,
        circuitBreakerUntil: null,
      };
    } catch (error) {
      console.error('Exception in getTodayOperationsStats:', error);
      return this.getEmptyStats();
    }
  },

  /**
   * Calcula round trips (BUY→SELL pareados) a partir das trades
   */
  calculateRoundTrips(trades: any[]): Array<{ symbol: string; pnl: number; executedAt: string }> {
    const roundTrips: Array<{ symbol: string; pnl: number; executedAt: string }> = [];
    const executedTrades = trades.filter((t: any) => t.status === 'EXECUTED');

    // Agrupar por símbolo
    const tradesBySymbol = new Map<string, any[]>();
    executedTrades.forEach((trade: any) => {
      if (!tradesBySymbol.has(trade.symbol)) {
        tradesBySymbol.set(trade.symbol, []);
      }
      tradesBySymbol.get(trade.symbol)!.push(trade);
    });

    // Para cada símbolo, parear BUY→SELL
    tradesBySymbol.forEach((symbolTrades, symbol) => {
      const buys: any[] = [];
      const sells: any[] = [];

      symbolTrades.forEach((trade: any) => {
        if (trade.side === 'BUY') {
          buys.push(trade);
        } else if (trade.side === 'SELL') {
          sells.push(trade);
        }
      });

      // Parear cada SELL com seu BUY correspondente
      sells.forEach((sell: any) => {
        // Usar profit_loss se disponível
        if (sell.profit_loss !== null && sell.profit_loss !== undefined) {
          roundTrips.push({
            symbol,
            pnl: Number(sell.profit_loss),
            executedAt: sell.executed_at || sell.created_at,
          });
        } else {
          // Calcular PnL manualmente se não disponível
          const correspondingBuy = buys.find((buy: any) => {
            return buy.executed_at < sell.executed_at;
          });

          if (correspondingBuy) {
            const buyPrice = Number(correspondingBuy.price);
            const sellPrice = Number(sell.price);
            const quantity = Number(sell.quantity);
            const pnl = (sellPrice - buyPrice) * quantity;

            roundTrips.push({
              symbol,
              pnl,
              executedAt: sell.executed_at || sell.created_at,
            });
          }
        }
      });
    });

    // Ordenar por tempo de execução
    return roundTrips.sort((a, b) =>
      new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
    );
  },

  /**
   * Retorna stats vazias para casos de erro
   */
  getEmptyStats(): OperationStats {
    return {
      lastOperationTime: null,
      totalOperationsToday: 0,
      lastOperationProfit: null,
      lastOperationSide: null,
      lastOperationSymbol: null,
      lossStreak: 0,
      dailyPnL: 0,
      circuitBreakerActive: false,
      circuitBreakerUntil: null,
    };
  },

  /**
   * Verifica se circuit breaker deve ser ativado
   */
  shouldActivateCircuitBreaker(stats: OperationStats, initialCapital: number): {
    shouldPause: boolean;
    reason: string;
    pauseUntil: number;
  } {
    const now = Date.now();

    // Verificar se já está em pausa
    if (stats.circuitBreakerActive && stats.circuitBreakerUntil) {
      if (now < stats.circuitBreakerUntil) {
        const minutesLeft = Math.ceil((stats.circuitBreakerUntil - now) / 60000);
        return {
          shouldPause: true,
          reason: `Circuit breaker ativo (${minutesLeft} min restantes)`,
          pauseUntil: stats.circuitBreakerUntil
        };
      }
    }

    // Log candidato para ativação
    const drawdownPercent = (stats.dailyPnL / initialCapital) * 100;
    console.log(`🔍 CB candidate: lossStreak=${stats.lossStreak}, dailyPnL=${drawdownPercent.toFixed(2)}%, totalOps=${stats.totalOperationsToday}`);

    // Verificar loss streak
    if (stats.lossStreak >= RISK_SETTINGS.LOSS_STREAK_LIMIT) {
      const pauseUntil = now + (RISK_SETTINGS.CIRCUIT_BREAKER_PAUSE_MINUTES * 60000);
      console.log(`⚠️ CB ATIVADO: ${stats.lossStreak} perdas consecutivas (limite: ${RISK_SETTINGS.LOSS_STREAK_LIMIT})`);
      return {
        shouldPause: true,
        reason: `${stats.lossStreak} perdas consecutivas detectadas`,
        pauseUntil
      };
    }

    // Verificar drawdown diário
    if (drawdownPercent <= -RISK_SETTINGS.DAILY_MAX_DRAWDOWN_PERCENT) {
      const pauseUntil = now + (RISK_SETTINGS.CIRCUIT_BREAKER_PAUSE_MINUTES * 60000);
      console.log(`⚠️ CB ATIVADO: Drawdown diário de ${drawdownPercent.toFixed(2)}% (limite: -${RISK_SETTINGS.DAILY_MAX_DRAWDOWN_PERCENT}%)`);
      return {
        shouldPause: true,
        reason: `Drawdown diário de ${drawdownPercent.toFixed(2)}% atingido`,
        pauseUntil
      };
    }

    return {
      shouldPause: false,
      reason: '',
      pauseUntil: 0
    };
  }
};