import { localDb } from "./localDbService";
import { Trade } from "./botService";

export interface AccountStats {
  initialCapital: number;
  successRate: number;
  totalTrades: number;
  activePositions: number;
  totalProfit: number;
  profitHistory: { date: string; profit: number }[];
  dailyProfit: number;
  dailyProfitPercent: number;
  currentBalance: number;
  winRate24h: number;
  monthlyProfit: number;
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
      const trades = localDb.getTrades(2000);
      const allTrades = trades || [];

      // Capital base (saldo inicial)
      let baseCapital = testBalance;
      if (!testMode) {
        const realBalance = await this.getRealBalance();
        baseCapital = realBalance || 0;
      }

      // Calcular capital alocado em posições abertas
      const openPositions = allTrades.filter((t: any) =>
        t.side === 'BUY' && (t.profit_loss === null || typeof t.profit_loss === 'undefined')
      );
      const allocatedCapital = openPositions.reduce((sum: number, t: any) => {
        return sum + (Number(t.price) * Number(t.quantity));
      }, 0);

      // Calcular lucro/perda total realizado
      const executedTrades = allTrades.filter((t: any) =>
        t.status === 'EXECUTED' && t.profit_loss !== null
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
      const dailyProfitPercent = initialCapital > 0
        ? (dailyProfit / initialCapital) * 100
        : 0;

      // Saldo atual (capital inicial + lucro total acumulado)
      // Em modo teste, o lucro total vem das trades simuladas anteriores
      const currentBalance = initialCapital + totalProfit;

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
        dailyProfit,
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
        profitHistory,
        dailyProfit,
        dailyProfitPercent,
        currentBalance,
        winRate24h,
        monthlyProfit,
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
      profitHistory: [],
      dailyProfit: 0,
      dailyProfitPercent: 0,
      currentBalance: testMode ? testBalance : 0,
      winRate24h: 0,
      monthlyProfit: 0,
    };
  }
};
