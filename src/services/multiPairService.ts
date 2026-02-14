import { pairSelectionService, type VolatilityData } from "./pairSelectionService";
import { type Candle } from "./binanceService";

export interface PairMonitor {
  symbol: string;
  lastPrices: number[];
  lastVolumes: number[]; // Histórico de volumes
  lastCandles: Candle[]; // Histórico de candles (OHLC)
  volatility: number;
  lastAnalysis: Date;
  isActive: boolean;
  priceChangePercent: number;
  volume: number;
}

class MultiPairService {
  private watchedPairs: Map<string, PairMonitor> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutos
  private readonly MAX_PAIRS = 10;
  private readonly MIN_PAIRS = 5;

  /**
   * Inicia o monitoramento de múltiplos pares
   */
  async start(initialSymbols?: string[]): Promise<void> {
    console.log("Starting multi-pair monitoring...", initialSymbols);
    
    // Se símbolos iniciais foram fornecidos, inicializar com eles
    if (initialSymbols && initialSymbols.length > 0) {
      await this.initializeWithSymbols(initialSymbols);
    } else {
      // Caso contrário, carregar pares baseado em volatilidade
      await this.updateWatchedPairs();
    }

    // Atualizar lista de pares periodicamente
    this.updateInterval = setInterval(async () => {
      await this.updateWatchedPairs();
    }, this.UPDATE_INTERVAL);
  }

  /**
   * Inicializa o monitoramento com símbolos específicos
   */
  private async initializeWithSymbols(symbols: string[]): Promise<void> {
    try {
      // Obter dados de volatilidade para os símbolos fornecidos
      const allVolatilePairs = await pairSelectionService.getTopVolatilePairs(50);
      
      for (const symbol of symbols) {
        const pairData = allVolatilePairs.find(p => p.symbol === symbol);
        
        if (pairData) {
          this.watchedPairs.set(symbol, {
            symbol: symbol,
            lastPrices: [],
            lastVolumes: [],
            lastCandles: [],
            volatility: pairData.priceChangePercent,
            lastAnalysis: new Date(),
            isActive: true,
            priceChangePercent: pairData.priceChangePercent,
            volume: pairData.volume,
          });
          console.log(`Initialized monitoring for: ${symbol}`);
        } else {
          // Se não encontrou dados, criar com valores padrão
          this.watchedPairs.set(symbol, {
            symbol: symbol,
            lastPrices: [],
            lastVolumes: [],
            lastCandles: [],
            volatility: 0,
            lastAnalysis: new Date(),
            isActive: true,
            priceChangePercent: 0,
            volume: 0,
          });
          console.log(`Initialized monitoring for: ${symbol} (default values)`);
        }
      }
      
      console.log(`Successfully initialized ${this.watchedPairs.size} pairs for monitoring`);
    } catch (error) {
      console.error("Error initializing with symbols:", error);
    }
  }

  /**
   * Para o monitoramento
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.watchedPairs.clear();
    console.log("Multi-pair monitoring stopped");
  }

  /**
   * Atualiza a lista de pares baseado em volatilidade
   */
  private async updateWatchedPairs(): Promise<void> {
    try {
      const volatilePairs = await pairSelectionService.getTopVolatilePairs(this.MAX_PAIRS);
      
      // Manter pares existentes e adicionar novos
      const currentSymbols = new Set(this.watchedPairs.keys());
      const newSymbols = new Set(volatilePairs.map(p => p.symbol));

      // Remover pares que não estão mais na lista
      for (const symbol of currentSymbols) {
        if (!newSymbols.has(symbol)) {
          this.watchedPairs.delete(symbol);
          console.log(`Removed pair from monitoring: ${symbol}`);
        }
      }

      // Adicionar ou atualizar pares
      for (const pair of volatilePairs) {
        const existing = this.watchedPairs.get(pair.symbol);
        
        if (existing) {
          // Atualizar dados existentes
          existing.volatility = pair.priceChangePercent;
          existing.volume = pair.volume;
          existing.lastAnalysis = new Date();
        } else {
          // Adicionar novo par
          this.watchedPairs.set(pair.symbol, {
            symbol: pair.symbol,
            lastPrices: [],
            lastVolumes: [],
            lastCandles: [],
            volatility: pair.priceChangePercent,
            lastAnalysis: new Date(),
            isActive: true,
            priceChangePercent: pair.priceChangePercent,
            volume: pair.volume,
          });
          console.log(`Added new pair to monitoring: ${pair.symbol}`);
        }
      }

      console.log(`Currently monitoring ${this.watchedPairs.size} pairs`);
    } catch (error) {
      console.error("Error updating watched pairs:", error);
    }
  }

  /**
   * Adiciona preço e volume ao histórico de um par
   */
  addPrice(symbol: string, price: number, volume?: number): void {
    const monitor = this.watchedPairs.get(symbol);
    if (!monitor) return;

    monitor.lastPrices.push(price);
    
    // Adicionar volume se disponível
    if (volume !== undefined) {
      monitor.lastVolumes.push(volume);
      monitor.volume = volume; // Atualizar volume atual
      
      // Manter apenas os últimos 20 volumes
      if (monitor.lastVolumes.length > 20) {
        monitor.lastVolumes.shift();
      }
    }
    
    // Manter apenas os últimos 20 preços
    if (monitor.lastPrices.length > 20) {
      monitor.lastPrices.shift();
    }

    // Recalcular volatilidade se temos dados suficientes
    if (monitor.lastPrices.length >= 10) {
      monitor.volatility = this.calculateVolatility(monitor.lastPrices);
      monitor.priceChangePercent = this.calculatePriceChangePercent(monitor.lastPrices);
    }
  }

  /**
   * Adiciona candle ao histórico de um par
   */
  addCandle(symbol: string, candle: Candle): void {
    const monitor = this.watchedPairs.get(symbol);
    if (!monitor) return;

    monitor.lastCandles.push(candle);
    
    // Manter apenas os últimos 60 candles (aumentado de 20 para compatibilidade com estratégias)
    const MAX_CANDLES = 60;
    if (monitor.lastCandles.length > MAX_CANDLES) {
      monitor.lastCandles.shift();
    }
  }

  /**
   * Retorna todos os pares monitorados
   */
  getWatchedPairs(): PairMonitor[] {
    return Array.from(this.watchedPairs.values());
  }

  /**
   * Retorna um par específico
   */
  getPair(symbol: string): PairMonitor | undefined {
    return this.watchedPairs.get(symbol);
  }

  /**
   * Retorna pares ordenados por volatilidade
   */
  getPairsByVolatility(): PairMonitor[] {
    return Array.from(this.watchedPairs.values())
      .sort((a, b) => b.volatility - a.volatility);
  }

  /**
   * Retorna pares com oportunidade de entrada
   */
  getPairsWithOpportunity(buyThreshold: number, minVolatility: number): PairMonitor[] {
    return Array.from(this.watchedPairs.values())
      .filter(pair => 
        pair.lastPrices.length >= 10 &&
        pair.volatility >= minVolatility &&
        pair.priceChangePercent <= buyThreshold
      )
      .sort((a, b) => a.priceChangePercent - b.priceChangePercent); // Menor mudança primeiro (maior queda)
  }

  /**
   * Calcula volatilidade de um array de preços
   */
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * 100;

    return volatility;
  }

  /**
   * Calcula mudança percentual de preço
   */
  private calculatePriceChangePercent(prices: number[]): number {
    if (prices.length < 2) return 0;
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    return ((lastPrice - firstPrice) / firstPrice) * 100;
  }

  /**
   * Verifica se está ativo
   */
  isActive(): boolean {
    return this.updateInterval !== null;
  }

  /**
   * Retorna número de pares monitorados
   */
  getWatchedPairsCount(): number {
    return this.watchedPairs.size;
  }
}

export const multiPairService = new MultiPairService();
