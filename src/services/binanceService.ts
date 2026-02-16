import { localDb } from "./localDbService";
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

// 🚀 Prioridade para Futures Mirrors e Regionais (Seguro para Geoblocks)
const BINANCE_BASE_URLS = [
  'https://fapi.binance.me',  // Futures Proxy Me (Prioridade para VPS)
  'https://fapi.binance.com', // Futures Principal
  'https://api.binance.me',   // Spot Proxy Me
  'https://api.binance.com',
  'https://api1.binance.com',
];

// Vercel Proxy Bridge (Bypass Geoblock)
const VERCEL_PROXY = process.env.VITE_BINANCE_PROXY_URL || 'https://nexus-crypto-bot.vercel.app/api/binance-proxy';

const isBrowser = typeof window !== 'undefined';
const API_BASE_URL = isBrowser ? '' : 'https://fapi.binance.com';

// Serviço para interação com a Binance API
export const binanceService = {
  async fetchWithRetry(path: string, method: string = 'GET'): Promise<any> {
    // 1. Prioridade: Proxy Vercel (Seguro para VPS e Browser)
    try {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const [apiPath, query] = cleanPath.split('?');
      const proxyUrl = new URL(VERCEL_PROXY);
      proxyUrl.searchParams.append('path', apiPath);
      if (method !== 'GET') proxyUrl.searchParams.append('method', method);

      if (query) {
        const queryParams = new URLSearchParams(query);
        queryParams.forEach((value, key) => {
          proxyUrl.searchParams.append(key, value);
        });
      }

      const config = localDb.getConfig();
      const apiKey = config.api_key_encrypted;

      console.log(`📡 [BinanceService] Enviando (${method}) via Proxy: ${proxyUrl.toString()}`);
      const response = await fetch(proxyUrl.toString(), {
        method,
        headers: {
          ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(apiKey ? { 'X-MBX-APIKEY': apiKey } : {})
        }
      });
      if (response.ok) return await response.json();

      console.warn(`⚠️ Vercel Proxy retornou status ${response.status}. Tentando mirrors diretos como fallback...`);
    } catch (error) {
      console.error(`❌ Vercel Proxy inacessível: ${error}. Tentando mirrors diretos...`);
    }

    // 2. Fallback: Mirrors diretos da Binance
    for (const baseUrl of BINANCE_BASE_URLS) {
      try {
        const fullUrl = `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
        console.log(`📡 [BinanceService] Tentando mirror direto: ${fullUrl}`);
        const response = await fetch(fullUrl);
        if (response.ok) return await response.json();
        console.warn(`⚠️ Binance mirror ${baseUrl} retornou ${response.status}`);

        if (response.status === 451) {
          console.error(`🚨 Mirror ${baseUrl} bloqueado regionalmente (451).`);
        }
      } catch (error) {
        console.warn(`❌ Binance mirror ${baseUrl} inacessível: ${error}`);
      }
    }

    throw new Error('Todos os mirrors da Binance e o Vercel Proxy falharam.');
  },

  async setLeverage(symbol: string, leverage: number): Promise<any> {
    try {
      const timestamp = Date.now();
      const query = `symbol=${symbol}&leverage=${leverage}&timestamp=${timestamp}`;
      // Nota: No futuro, adicionar lógica de assinatura se o proxy não lidar com isso
      return await this.fetchWithRetry(`/fapi/v1/leverage?${query}`, 'POST');
    } catch (error) {
      console.error('Exception in setLeverage:', error);
      return null;
    }
  },

  async getPrice(symbol: string): Promise<PriceData | null> {
    try {
      // Usando FAPI (Futures) para ticker de preço
      const data = await this.fetchWithRetry(`/fapi/v1/ticker/price?symbol=${symbol}`);
      return {
        symbol: data.symbol,
        price: parseFloat(data.price),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Exception in getPrice (Futures):', error);
      return null;
    }
  },

  async getMarketData(symbol: string): Promise<MarketData | null> {
    try {
      // Usar FAPI (Futures) para dados de 24h
      const data = await this.fetchWithRetry(`/fapi/v1/ticker/24hr?symbol=${symbol}`);

      return {
        symbol: data.symbol,
        price: parseFloat(data.lastPrice),
        priceChange: parseFloat(data.priceChange),
        priceChangePercent: parseFloat(data.priceChangePercent),
        volume: parseFloat(data.quoteVolume), // Em Futures, costuma-se usar quoteVolume para volume em USDT
        high: parseFloat(data.highPrice),
        low: parseFloat(data.lowPrice)
      };
    } catch (error) {
      console.error('Exception in getMarketData (Futures):', error);
      return null;
    }
  },

  async getCandles(symbol: string, interval: string = '1m', limit: number = 20): Promise<Candle[]> {
    try {
      // Usar FAPI (Futures) para klines
      const data = await this.fetchWithRetry(
        `/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );

      return data.map((candle: any) => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4])
      }));
    } catch (error) {
      console.error('Exception in getCandles (Futures):', error);
      return [];
    }
  },

  async subscribeToPrice(symbol: string, callback: (price: number) => void): Promise<WebSocket | null> {
    try {
      // Usar fstream para Futures
      const ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@aggTrade`);

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

export interface BinanceApiKeyStatus {
  isConfigured: boolean;
  hasPermissions: boolean;
  canTradeFutures: boolean;
  error?: string;
  balance?: number;
}

// CACHE & THROTTLE para Validação (Web)
let validationCache: { data: BinanceApiKeyStatus; timestamp: number } | null = null;
let validationPromise: Promise<BinanceApiKeyStatus> | null = null;
const CACHE_DURATION = 30000;

/**
 * Valida se as API keys estão configuradas e têm as permissões corretas
 * [WEB-ONLY] Chamada via Supabase Edge Function
 */
export const validateBinanceApiKeys = async (): Promise<BinanceApiKeyStatus> => {
  if (validationCache && (Date.now() - validationCache.timestamp) < CACHE_DURATION) {
    return validationCache.data;
  }

  if (validationPromise) return validationPromise;

  validationPromise = (async () => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('binance-account');

      if (error || data?.error) {
        return {
          isConfigured: !!data?.isConfigured,
          hasPermissions: false,
          canTradeFutures: false,
          error: data?.error || error?.message || 'Erro na validação'
        };
      }

      return {
        isConfigured: true,
        hasPermissions: true,
        canTradeFutures: true,
        balance: parseFloat(data.totalWalletBalance || '0')
      };
    } catch (e) {
      return {
        isConfigured: false,
        hasPermissions: false,
        canTradeFutures: false,
        error: 'Erro de conexão com o servidor'
      };
    } finally {
      validationPromise = null;
    }
  })();

  const result = await validationPromise;
  if (result.isConfigured && !result.error) {
    validationCache = { data: result, timestamp: Date.now() };
  }
  return result;
};

/**
 * Formata valores USDT
 */
export const formatUSDT = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * [WEB-ONLY] Limpa o cache de validação da API para forçar revalidação no frontend
 */
export const clearBinanceValidationCache = () => {
  validationCache = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('binance_validation_status');
    localStorage.removeItem('binance_api_validated');
  }
  console.log('🧹 [BinanceService] Cache de validação limpo.');
};
