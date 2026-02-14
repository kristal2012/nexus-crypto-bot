export interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  high: number;
  low: number;
}

export interface Candle {
  high: number;
  low: number;
  close: number;
  open: number;
  timestamp: number;
}

const BINANCE_BASE_URLS = [
  'https://api.binance.me',
  'https://api1.binance.me',
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com'
];

// Vercel Proxy Bridge (Bypass Geoblock)
const VERCEL_PROXY = 'https://nexus-crypto-bot.vercel.app/api/binance-proxy';

const isBrowser = typeof window !== 'undefined';
const API_BASE_URL = isBrowser ? '' : 'https://api.binance.com';

// Serviço para interação com a Binance API
export const binanceService = {
  async fetchWithRetry(path: string): Promise<any> {
    const fullPath = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

    // Try mirrors first
    for (const baseUrl of BINANCE_BASE_URLS) {
      if (!isBrowser && baseUrl === 'https://api.binance.com') {
        // Na VPS (Node), tentamos o mirror direto se não for bloqueado
      }
      try {
        const response = await fetch(`${baseUrl}${path}`);
        if (response.ok) return await response.json();
        console.warn(`⚠️ Binance mirror ${baseUrl} returned ${response.status}`);

        // If 451, don't even try other direct mirrors, go straight to proxy
        if (response.status === 451) {
          console.log('🛡️ Regional block detected (451). Switching to Vercel Proxy...');
          break;
        }
      } catch (error) {
        console.warn(`❌ Binance mirror ${baseUrl} unreachable: ${error}`);
      }
    }

    // Proxy Fallback (Safe Bridge)
    try {
      // The proxy expects ?path=/api/v3/...&param1=val1
      const [apiPath, query] = path.split('?');
      const proxyUrl = `${VERCEL_PROXY}?path=${apiPath}${query ? '&' + query : ''}`;

      console.log(`📡 Fetching through Proxy: ${proxyUrl}`);
      const response = await fetch(proxyUrl);
      if (response.ok) return await response.json();
      console.error(`❌ Vercel Proxy failed: ${response.status}`);
    } catch (error) {
      console.error(`❌ Vercel Proxy unreachable: ${error}`);
    }

    throw new Error('All Binance API mirrors and Vercel Proxy failed');
  },

  async getPrice(symbol: string): Promise<PriceData | null> {
    try {
      const data = await this.fetchWithRetry(`/api/v3/ticker/price?symbol=${symbol}`);
      return {
        symbol: data.symbol,
        price: parseFloat(data.price),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Exception in getPrice:', error);
      return null;
    }
  },

  async getMarketData(symbol: string): Promise<MarketData | null> {
    try {
      // Usar API pública da Binance para dados de 24h
      const data = await this.fetchWithRetry(`/api/v3/ticker/24hr?symbol=${symbol}`);

      return {
        symbol: data.symbol,
        price: parseFloat(data.lastPrice),
        priceChange: parseFloat(data.priceChange),
        priceChangePercent: parseFloat(data.priceChangePercent),
        volume: parseFloat(data.volume),
        high: parseFloat(data.highPrice),
        low: parseFloat(data.lowPrice)
      };
    } catch (error) {
      console.error('Exception in getMarketData:', error);
      return null;
    }
  },

  async getCandles(symbol: string, interval: string = '1m', limit: number = 20): Promise<Candle[]> {
    try {
      const data = await this.fetchWithRetry(
        `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );

      return data.map((candle: any) => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4])
      }));
    } catch (error) {
      console.error('Exception in getCandles:', error);
      return [];
    }
  },

  async subscribeToPrice(symbol: string, callback: (price: number) => void): Promise<WebSocket | null> {
    try {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`);

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        callback(parseFloat(data.p));
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      return ws;
    } catch (error) {
      console.error('Exception in subscribeToPrice:', error);
      return null;
    }
  },

  calculateProfitLoss(buyPrice: number, sellPrice: number, quantity: number): number {
    return (sellPrice - buyPrice) * quantity;
  },

  shouldTakeProfit(currentPrice: number, buyPrice: number, takeProfitPercent: number): boolean {
    const profitPercent = ((currentPrice - buyPrice) / buyPrice) * 100;
    return profitPercent >= takeProfitPercent;
  },

  shouldStopLoss(currentPrice: number, buyPrice: number, stopLossPercent: number): boolean {
    const lossPercent = ((buyPrice - currentPrice) / buyPrice) * 100;
    return lossPercent >= stopLossPercent;
  }
};
