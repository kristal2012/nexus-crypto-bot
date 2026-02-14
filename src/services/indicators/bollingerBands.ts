/**
 * Bollinger Bands Indicator Service
 * Separação de responsabilidade: Calcula apenas Bollinger Bands
 */

export interface BollingerBandsResult {
  upper: number;
  middle: number; // SMA
  lower: number;
  bandwidth: number; // Distância entre as bandas (volatilidade)
}

class BollingerBandsService {
  /**
   * Calcula Bollinger Bands
   * @param prices Array de preços
   * @param period Período da SMA (padrão: 20)
   * @param stdDevMultiplier Multiplicador do desvio padrão (padrão: 2)
   */
  calculate(
    prices: number[],
    period: number = 20,
    stdDevMultiplier: number = 2
  ): BollingerBandsResult | null {
    if (prices.length < period) return null;

    // Usa os últimos 'period' preços
    const relevantPrices = prices.slice(-period);

    // Calcula SMA (Simple Moving Average)
    const sma = this.calculateSMA(relevantPrices);

    // Calcula Standard Deviation
    const stdDev = this.calculateStdDev(relevantPrices, sma);

    // Calcula as bandas
    const upper = sma + stdDevMultiplier * stdDev;
    const lower = sma - stdDevMultiplier * stdDev;
    const bandwidth = (upper - lower) / sma; // Normalizado

    return {
      upper,
      middle: sma,
      lower,
      bandwidth
    };
  }

  private calculateSMA(values: number[]): number {
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  private calculateStdDev(values: number[], mean: number): number {
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = this.calculateSMA(squaredDiffs);
    return Math.sqrt(avgSquaredDiff);
  }
}

export const bollingerBandsService = new BollingerBandsService();
