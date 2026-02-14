/**
 * RSI (Relative Strength Index) Indicator Service
 * Separação de responsabilidade: Calcula apenas RSI
 */

export interface RSIResult {
  value: number;
  isOverbought: boolean;
  isOversold: boolean;
}

class RSIService {
  private readonly OVERBOUGHT_THRESHOLD = 70;
  private readonly OVERSOLD_THRESHOLD = 30;

  /**
   * Calcula RSI
   * @param prices Array de preços de fechamento
   * @param period Período do RSI (padrão: 14)
   */
  calculate(prices: number[], period: number = 14): RSIResult | null {
    if (prices.length < period + 1) return null;

    // Calcula as mudanças de preço
    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    // Separa ganhos e perdas
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (const change of changes) {
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // Usa os últimos 'period' valores
    const recentGains = gains.slice(-period);
    const recentLosses = losses.slice(-period);

    // Calcula média de ganhos e perdas
    const avgGain = this.average(recentGains);
    const avgLoss = this.average(recentLosses);

    // Evita divisão por zero
    if (avgLoss === 0) {
      return {
        value: 100,
        isOverbought: true,
        isOversold: false
      };
    }

    // Calcula RS e RSI
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return {
      value: rsi,
      isOverbought: rsi > this.OVERBOUGHT_THRESHOLD,
      isOversold: rsi < this.OVERSOLD_THRESHOLD
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
}

export const rsiService = new RSIService();
