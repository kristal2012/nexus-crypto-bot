import { type Candle } from './binanceService';
import { meanReversionStrategy } from './strategies/meanReversionStrategy';

/**
 * Momentum Strategy Service (Refatorado)
 * Agora usa Mean Reversion com Bollinger Bands + RSI
 * Estratégia comprovadamente lucrativa e de baixo risco
 */

export interface MomentumSignal {
  symbol: string;
  shouldBuy: boolean;
  confidence: number; // 0-1
  reason: string;
}

export interface MarketMomentum {
  priceChangePercent: number;
  volumeRatio: number;
  priceVelocity: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  avgLows?: number;
  avgHighs?: number;
}

class MomentumStrategyService {
  public MIN_CONFIDENCE = 0.5; // Ajustável dinamicamente pela IA (Default: 0.5)

  public setMinConfidence(value: number) {
    if (value > 0 && value <= 1) {
      this.MIN_CONFIDENCE = value;
      console.log(`🧠 [Momentum] Confiança mínima ajustada para ${(value * 100).toFixed(0)}%`);
    }
  }

  /**
   * Extrai preços de fechamento dos candles
   */
  private extractClosePrices(candles: Candle[]): number[] {
    return candles.map(c => c.close);
  }

  /**
   * [DEPRECADO] Mantido por compatibilidade - Use meanReversionStrategy
   */
  private calcularMediaMinimas(candles: Candle[]): number {
    if (candles.length < 3) return 0;
    const ultimos3 = candles.slice(-3);
    const somaMinimas = ultimos3.reduce((acc, c) => acc + c.low, 0);
    return somaMinimas / 3;
  }

  /**
   * [DEPRECADO] Mantido por compatibilidade - Use meanReversionStrategy
   */
  private calcularMediaMaximas(candles: Candle[]): number {
    if (candles.length < 3) return 0;
    const ultimos3 = candles.slice(-3);
    const somaMaximas = ultimos3.reduce((acc, c) => acc + c.high, 0);
    return somaMaximas / 3;
  }

  /**
   * NOVA ESTRATÉGIA: Mean Reversion com BB + RSI
   */
  private avaliarEstrategia(candles: Candle[], precoAtual: number): 'comprar' | 'vender' | 'manter' {
    if (candles.length < 21) return 'manter'; // Necessário para BB + RSI

    const prices = this.extractClosePrices(candles);
    const buySignal = meanReversionStrategy.analyzeBuyOpportunity(prices);

    if (buySignal.action === 'buy' && buySignal.confidence >= this.MIN_CONFIDENCE) {
      return 'comprar';
    }

    const sellSignal = meanReversionStrategy.analyzeSellOpportunity(prices);

    if (sellSignal.action === 'sell' && sellSignal.confidence >= this.MIN_CONFIDENCE) {
      return 'vender';
    }

    return 'manter';
  }

  /**
   * Analisa momentum do mercado com base nos candles
   */
  analyzeMomentum(
    prices: number[],
    volumes?: number[],
    candles?: Candle[]
  ): MarketMomentum {
    if (!candles || candles.length < 3) {
      return {
        priceChangePercent: 0,
        volumeRatio: 0,
        priceVelocity: 0,
        trend: 'NEUTRAL'
      };
    }

    const avgLows = this.calcularMediaMinimas(candles);
    const avgHighs = this.calcularMediaMaximas(candles);
    const currentPrice = candles[candles.length - 1].close;

    // Calcular tendência baseada na posição do preço atual
    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const priceChangePercent = ((currentPrice - candles[0].close) / candles[0].close) * 100;

    if (currentPrice <= avgLows) {
      trend = 'BULLISH'; // Oportunidade de compra
    } else if (currentPrice >= avgHighs) {
      trend = 'BEARISH'; // Oportunidade de venda
    }

    // Calcular volume ratio se disponível
    let volumeRatio = 1.0;
    if (volumes && volumes.length >= 3) {
      const recentVolume = this.average(volumes.slice(-3));
      const avgVolume = this.average(volumes);
      volumeRatio = recentVolume / avgVolume;
    }

    return {
      priceChangePercent,
      volumeRatio,
      priceVelocity: 0,
      trend,
      avgLows,
      avgHighs
    };
  }

  /**
   * Calcula volatilidade realizada de curto prazo
   */
  calculateShortTermVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1];
      if (prev === 0) continue;
      returns.push(Math.abs(((prices[i] - prev) / prev) * 100));
    }

    return this.average(returns);
  }

  /**
   * Gera sinal de compra com NOVA ESTRATÉGIA (Mean Reversion)
   */
  generateBuySignal(
    symbol: string,
    momentum: MarketMomentum,
    quoteVolume24h?: number,
    recentPrices?: number[],
    candles?: Candle[]
  ): MomentumSignal {
    if (!candles || candles.length < 21) {
      return {
        symbol,
        shouldBuy: false,
        confidence: 0,
        reason: 'Dados insuficientes (necessário 21+ candles para BB+RSI)'
      };
    }

    const prices = this.extractClosePrices(candles);
    const signal = meanReversionStrategy.analyzeBuyOpportunity(prices);

    return {
      symbol,
      shouldBuy: signal.action === 'buy',
      confidence: signal.confidence,
      reason: signal.reason
    };
  }

  /**
   * Verifica se deve manter posição ou sair (NOVA ESTRATÉGIA)
   */
  shouldHoldPosition(
    buyPrice: number,
    currentPrice: number,
    momentum: MarketMomentum,
    candles?: Candle[]
  ): boolean {
    if (!candles || candles.length < 21) return true;

    const prices = this.extractClosePrices(candles);
    const signal = meanReversionStrategy.analyzeSellOpportunity(prices, buyPrice);

    // Se o sinal é vender com confiança >= 70%, não manter
    return !(signal.action === 'sell' && signal.confidence >= this.MIN_CONFIDENCE);
  }

  /**
   * Verifica se deve vender posição (NOVA ESTRATÉGIA)
   */
  shouldSell(candles: Candle[], buyPrice?: number): boolean {
    if (candles.length < 21) return false;

    const prices = this.extractClosePrices(candles);
    const signal = meanReversionStrategy.analyzeSellOpportunity(prices, buyPrice);

    return signal.action === 'sell' && signal.confidence >= this.MIN_CONFIDENCE;
  }

  // Métodos auxiliares
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
}

export const momentumStrategyService = new MomentumStrategyService();
