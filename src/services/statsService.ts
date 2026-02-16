import { localDb } from "./localDbService";
import { Trade } from "./botService";
import { binanceService } from "./binanceService";

export interface AccountStats {
  initialCapital: number;
  successRate: number;
  totalTrades: number;
  activePositions: number;
  totalProfit: number;
  unrealizedPnL: number;
  profitHistory: { date: string; profit: number }[];
  dailyProfit: number;
  dailyProfitPercent: number;
  currentBalance: number;
  winRate24h: number;
  monthlyProfit: number;
  activeTrades: (Trade & { currentPrice?: number; unrealizedPnL?: number; unrealizedPnLPercent?: number })[];
}

export const statsService = {
  /**
   * Busca o saldo real da conta Binance
   */
  async getRealBalance(): Promise<number | null> {
    try {
      // Em modo local, o saldo real é lido das configurações ou da Binance API se necessário
      const config = localDb.getConfig();
      return config.test_balance || 0;
    } catch (error) {
      console.error('Exception in getRealBalance:', error);
      return null;
    }
  },

  /**
   * Calcula as estatísticas reais da conta baseado nas trades
   */
  async getAccountStats(_userId: string, testMode: boolean, testBalance: number): Promise<AccountStats> {
    try {
      // Buscar todas as trades locais
      let trades = localDb.getTrades(2000);
      
      // [FIX] Ignorar trades com mais de 1 hora para fresh start
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      trades = (trades || []).filter((t: any) => {
        const tradeTime = new Date(t.created_at).getTime();
        return tradeTime > oneHourAgo;
      });
      
      const allTrades = trades || [];

      // Capital base (saldo inicial)
      let baseCapital = testBalance;
      if (!testMode) {
        const realBalance = await this.getRealBalance();
        baseCapital = realBalance || 0;
      }

      // Calcular capital alocado em posições abertas
      // Posição aberta = Operação de COMPRA que ainda não foi fechada (sem profit_loss realizado)
      // Também considera posições que foram compradas mas ainda não vendidas
      const openBuyTrades = allTrades.filter((t: any) => {
        const isBuy = t.side === 'BUY';
        const isNotFailed = t.status !== 'FAILED';
        return isBuy && isNotFailed;
      });

      // Encontrar posições que ainda não foram vendidas (pares BUY sem corresponding SELL)
      const soldSymbolIds = new Set<string>();
      allTrades.forEach((t: any) => {
        if (t.side === 'SELL' && t.status === 'EXECUTED') {
          soldSymbolIds.add(`${t.symbol}-${t.id}`);
        }
      });

      // Filtrar apenas posições que ainda não foram vendidas
      const openPositions = openBuyTrades.filter((t: any) => {
        return !soldSymbolIds.has(`${t.symbol}-${t.id}`);
      });

      console.log(`🔍 [Stats] Trades carregados: ${allTrades.length} | Posições abertas detectadas: ${openPositions.length}`);
      if (openPositions.length > 0) {
        console.log('📋 [Stats] IDs das posições abertas:', openPositions.map(p => p.id));
      }

      // Calcular P&L em tempo real para posições abertas
      const openPositionsWithPnL = await Promise.all(
        openPositions.map(async (t: any) => {
          const buyPrice = Number(t.price) || 0;
          const quantity = Number(t.quantity) || 0;
          
          // Buscar preço atual do mercado
          let currentPrice = buyPrice;
          let unrealizedPnL = 0;
          let unrealizedPnLPercent = 0;
          
          try {
            const priceData = await binanceService.getPrice(t.symbol);
            if (priceData && priceData.price) {
              currentPrice = priceData.price;
              unrealizedPnL = (currentPrice - buyPrice) * quantity;
              unrealizedPnLPercent = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;
            }
          } catch (e) {
            console.warn(`⚠️ Erro ao buscar preço atual para ${t.symbol}:`, e);
          }

          return {
            ...t,
            currentPrice,
            unrealizedPnL,
            unrealizedPnLPercent,
            allocatedAmount: buyPrice * quantity
          };
        })
      );

      const allocatedCapital = openPositionsWithPnL.reduce((sum: number, t: any) => {
        return sum + (t.allocatedAmount || 0);
      }, 0);

      // Calcular P&L não realizado total
      const totalUnrealizedPnL = openPositionsWithPnL.reduce((sum: number, t: any) => {
        return sum + (t.unrealizedPnL || 0);
      }, 0);

      // Calcular lucro/perda total realizado
      const executedTrades = allTrades.filter((t: any) =>
        (t.status === 'EXECUTED' || (t.side === 'SELL' && t.status !== 'FAILED')) &&
        t.profit_loss !== null &&
        typeof t.profit_loss !== 'undefined'
      );
      const totalProfit = executedTrades.reduce((sum: number, t: any) =>
        sum + (t.profit_loss || 0), 0
      );

      // Capital inicial
      const initialCapital = baseCapital;

      // Total de trades
      const totalTrades = allTrades.length;

      // Taxa de sucesso geral
      const profitableTrades = executedTrades.filter((t: any) =>
        (t.profit_loss || 0) > 0
      );
      const successRate = executedTrades.length > 0
        ? (profitableTrades.length / executedTrades.length) * 100
        : 0;

      // Posições ativas
      const activePositions = openPositions.length;

      // Calcular lucro diário
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTrades = executedTrades.filter((t: any) => {
        const tradeDate = new Date(t.executed_at || t.created_at);
        tradeDate.setHours(0, 0, 0, 0);
        return tradeDate.getTime() === today.getTime();
      });
      const dailyProfit = todayTrades.reduce((sum: number, t: any) =>
        sum + (t.profit_loss || 0), 0
      );

      // Saldo atual (capital inicial + lucro total realizado + P&L não realizado das posições abertas)
      // Em modo teste, o lucro total vem das trades simuladas anteriores
      const currentBalance = initialCapital + totalProfit + totalUnrealizedPnL;

      // Lucro diário incluindo P&L não realizado
      const dailyProfitWithUnrealized = dailyProfit + totalUnrealizedPnL;
      const dailyProfitPercent = initialCapital > 0
        ? (dailyProfitWithUnrealized / initialCapital) * 100
        : 0;

      // Win Rate últimas 24h
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const last24hTrades = executedTrades.filter((t: any) => {
        const tradeDate = new Date(t.executed_at || t.created_at);
        return tradeDate >= twentyFourHoursAgo;
      });
      const last24hWins = last24hTrades.filter((t: any) => (t.profit_loss || 0) > 0);
      const winRate24h = last24hTrades.length > 0
        ? (last24hWins.length / last24hTrades.length) * 100
        : 0;

      // Lucro mensal
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      const monthlyTrades = executedTrades.filter((t: any) => {
        const tradeDate = new Date(t.executed_at || t.created_at);
        return tradeDate >= thisMonth;
      });
      const monthlyProfit = monthlyTrades.reduce((sum: number, t: any) =>
        sum + (t.profit_loss || 0), 0
      );

      // Histórico de lucro (agregado por dia)
      const profitByDate = executedTrades.reduce((acc: any, t: any) => {
        const date = new Date(t.created_at).toLocaleDateString('pt-BR');
        if (!acc[date]) acc[date] = 0;
        acc[date] += t.profit_loss || 0;
        return acc;
      }, {});

      const profitHistory = Object.entries(profitByDate).map(([date, profit]) => ({
        date,
        profit: profit as number
      }));

      console.log('📊 Stats calculadas:', {
        baseCapital,
        totalProfit,
        totalUnrealizedPnL,
        dailyProfit,
        dailyProfitWithUnrealized,
        dailyProfitPercent,
        currentBalance,
        winRate24h,
        monthlyProfit,
        allocatedCapital,
        initialCapital,
        totalTrades,
        activePositions,
        successRate
      });

      return {
        initialCapital,
        successRate,
        totalTrades,
        activePositions,
        totalProfit,
        unrealizedPnL: totalUnrealizedPnL,
        profitHistory,
        dailyProfit: dailyProfitWithUnrealized,
        dailyProfitPercent,
        currentBalance,
        winRate24h,
        monthlyProfit,
        activeTrades: Array.isArray(openPositionsWithPnL) ? openPositionsWithPnL.filter(t => t && t.id) : []
      };
    } catch (error) {
      console.error('Exception in getAccountStats:', error);
      return this.getEmptyStats(testMode, testBalance);
    }
  },

  /**
   * Retorna estatísticas vazias
   */
  getEmptyStats(testMode: boolean, testBalance: number): AccountStats {
    return {
      initialCapital: testMode ? testBalance : 0,
      successRate: 0,
      totalTrades: 0,
      activePositions: 0,
      totalProfit: 0,
      unrealizedPnL: 0,
      profitHistory: [],
      dailyProfit: 0,
      dailyProfitPercent: 0,
      currentBalance: testMode ? testBalance : 0,
      winRate24h: 0,
      monthlyProfit: 0,
      activeTrades: []
    };
  }
};
