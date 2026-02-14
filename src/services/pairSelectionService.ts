import { localDb } from "./localDbService";

export interface VolatilityData {
  symbol: string;
  priceChangePercent: number;
  volume: number;
  lastPrice: number;
}

import { binanceService } from "./binanceService";

export const pairSelectionService = {
  /**
   * Busca pares de negociação populares na Binance
   */
  async getTopVolatilePairs(limit = 10): Promise<VolatilityData[]> {
    try {
      const data = await binanceService.fetchWithRetry('/api/v3/ticker/24hr');

      // Filtrar apenas pares USDT com volume significativo (reduzido para 5M)
      const usdtPairs = data
        .filter((ticker: any) =>
          ticker.symbol.endsWith('USDT') &&
          parseFloat(ticker.quoteVolume) > 5000000 // Volume mínimo de 5M USDT
        )
        .map((ticker: any) => ({
          symbol: ticker.symbol,
          priceChangePercent: Math.abs(parseFloat(ticker.priceChangePercent)),
          volume: parseFloat(ticker.quoteVolume),
          lastPrice: parseFloat(ticker.lastPrice)
        }))
        .sort((a: VolatilityData, b: VolatilityData) =>
          b.priceChangePercent - a.priceChangePercent
        )
        .slice(0, limit);

      return usdtPairs;
    } catch (error) {
      console.error('Erro ao buscar pares voláteis:', error);
      // Fallback para pares populares
      return [
        { symbol: 'BTCUSDT', priceChangePercent: 0, volume: 0, lastPrice: 0 }
      ];
    }
  },

  /**
   * Seleciona o melhor par baseado em volatilidade e estratégia
   */
  async selectOptimalPair(): Promise<string> {
    try {
      const volatilePairs = await this.getTopVolatilePairs(10);

      if (volatilePairs.length === 0) {
        return 'BTCUSDT'; // Fallback seguro
      }

      // Selecionar par com boa volatilidade (entre 1% e 20% de mudança em 24h) - Range mais amplo
      const optimalPair = volatilePairs.find(
        pair => pair.priceChangePercent >= 1 && pair.priceChangePercent <= 20
      );

      return optimalPair ? optimalPair.symbol : volatilePairs[0].symbol;
    } catch (error) {
      console.error('Erro ao selecionar par ótimo:', error);
      return 'BTCUSDT';
    }
  },

  /**
   * Seleciona múltiplos pares ótimos para Momentum Trading
   * Prioriza pares em alta com volume forte
   */
  async selectMultipleOptimalPairs(count: number = 5): Promise<string[]> {
    try {
      const volatilePairs = await this.getTopVolatilePairs(count * 3); // Buscar mais opções

      if (volatilePairs.length === 0) {
        return ['BTCUSDT']; // Fallback seguro
      }

      // Momentum Trading: Priorizar pares em ALTA (momentum positivo)
      const momentumPairs = volatilePairs
        .filter(pair =>
          pair.priceChangePercent >= 0.5 && // Em alta
          pair.priceChangePercent <= 15 && // Não extremo
          pair.volume > 10000000 // Volume significativo
        )
        .slice(0, count)
        .map(pair => pair.symbol);

      // Se não encontrar pares suficientes, usar os mais voláteis em alta
      if (momentumPairs.length < count) {
        const additionalPairs = volatilePairs
          .filter(pair => pair.priceChangePercent > 0) // Apenas em alta
          .slice(0, count)
          .map(pair => pair.symbol)
          .filter(symbol => !momentumPairs.includes(symbol));

        return [...momentumPairs, ...additionalPairs].slice(0, count);
      }

      console.log('🚀 Pares selecionados com momentum:', momentumPairs);
      return momentumPairs;
    } catch (error) {
      console.error('Erro ao selecionar pares com momentum:', error);
      return ['BTCUSDT'];
    }
  },

  /**
   * Atualiza o par de negociação do bot baseado na volatilidade
   */
  async updateBotTradingPair(_userId: string): Promise<string> {
    try {
      const optimalPair = await this.selectOptimalPair();

      const currentConfig = localDb.getConfig();
      localDb.saveConfig({
        ...currentConfig,
        trading_pair: optimalPair
      });

      return optimalPair;
    } catch (error) {
      console.error('Erro ao atualizar par de negociação do bot:', error);
      return 'BTCUSDT';
    }
  }
};
