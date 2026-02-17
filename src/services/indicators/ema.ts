/**
 * EMA (Exponential Moving Average) Indicator Service
 * Separação de responsabilidade: Calcula apenas EMA
 */

class EMAService {
    /**
     * Calcula EMA
     * @param prices Array de preços de fechamento
     * @param period Período da EMA (ex: 20, 50, 200)
     */
    calculate(prices: number[], period: number): number | null {
        if (prices.length < period) return null;

        const k = 2 / (period + 1);

        // Inicia a primeira EMA com uma SMA simples (opcional, ou apenas o primeiro preço)
        let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

        // Calcula recursivamente para o resto dos preços
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] * k) + (ema * (1 - k));
        }

        return ema;
    }

    /**
     * Retorna um array com o histórico de EMA
     */
    calculateHistory(prices: number[], period: number): number[] {
        if (prices.length < period) return [];

        const k = 2 / (period + 1);
        const results: number[] = [];

        let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
        results.push(ema);

        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] * k) + (ema * (1 - k));
            results.push(ema);
        }

        return results;
    }
}

export const emaService = new EMAService();
