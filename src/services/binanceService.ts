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
  'https://fapi.binance.com', // Futures Principal
  'https://fapi.binance.me',  // Futures Proxy Me
  'https://api.binance.com',
  'https://api1.binance.com',
];

// Vercel Proxy Bridge (Bypass Geoblock)
const VERCEL_PROXY = process.env.VITE_BINANCE_PROXY_URL || 'https://nexus-crypto-bot.vercel.app/api/binance-proxy';

const isBrowser = typeof window !== 'undefined';
const API_BASE_URL = isBrowser ? '' : 'https://fapi.binance.com';

// Serviço para interação com a Binance API
export const binanceService = {
  async fetchWithRetry(path: string): Promise<any> {
    // 1. Prioridade: Proxy Vercel (Seguro para VPS e Browser)
    try {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const [apiPath, query] = cleanPath.split('?');
      const proxyUrl = new URL(VERCEL_PROXY);
      proxyUrl.searchParams.append('path', apiPath);

      if (query) {
        const queryParams = new URLSearchParams(query);
        queryParams.forEach((value, key) => {
          proxyUrl.searchParams.append(key, value);
        });
      }

      console.log(`📡 [BinanceService] Enviando via Proxy: ${proxyUrl.toString()}`);
      const response = await fetch(proxyUrl.toString());
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

// ============================
// Exports auxiliares para UI/Dashboard
// ============================

import { supabase } from "@/integrations/supabase/client";

export interface BinanceApiKeyStatus {
  isConfigured: boolean;
  hasPermissions: boolean;
  canTradeFutures: boolean;
  error?: string;
  balance?: number;
}

export interface BinanceAccountInfo {
  totalWalletBalance: string;
  availableBalance: string;
  totalUnrealizedProfit: string;
  positions: any[];
}

// Cache de validação para evitar chamadas repetidas
let validationCache: { result: BinanceApiKeyStatus; timestamp: number } | null = null;
const CACHE_TTL = 60000; // 1 minuto

/**
 * Limpa o cache de validação da API da Binance
 */
export const clearBinanceValidationCache = () => {
  validationCache = null;
  console.log('🛡️ Binance validation cache cleared');
};

/**
 * Valida se as API keys estão configuradas e têm as permissões corretas
 */
export const validateBinanceApiKeys = async (): Promise<BinanceApiKeyStatus> => {
  // Verificar cache
  if (validationCache && Date.now() - validationCache.timestamp < CACHE_TTL) {
    console.log('📋 Using cached Binance validation result');
    return validationCache.result;
  }

  try {
    const { data, error } = await supabase.functions.invoke('binance-account');

    if (error) {
      const errorMessage = error.message || '';

      if (errorMessage.includes('not configured')) {
        const result: BinanceApiKeyStatus = {
          isConfigured: false, hasPermissions: false, canTradeFutures: false,
          error: 'API keys não configuradas. Configure suas chaves da Binance primeiro.'
        };
        validationCache = { result, timestamp: Date.now() };
        return result;
      }

      if (errorMessage.includes('Invalid API key') || errorMessage.includes('-2015')) {
        const result: BinanceApiKeyStatus = {
          isConfigured: true, hasPermissions: false, canTradeFutures: false,
          error: '⚠️ API Key inválida ou sem permissões. Verifique e reconfigure suas credenciais.'
        };
        validationCache = { result, timestamp: Date.now() };
        return result;
      }

      if (errorMessage.includes('Too Man')) {
        const result: BinanceApiKeyStatus = {
          isConfigured: true, hasPermissions: false, canTradeFutures: false,
          error: 'Credenciais corrompidas. Remova e reconfigure suas credenciais.'
        };
        validationCache = { result, timestamp: Date.now() };
        return result;
      }

      const result: BinanceApiKeyStatus = {
        isConfigured: true, hasPermissions: false, canTradeFutures: false,
        error: `Erro ao validar API key: ${errorMessage}`
      };
      validationCache = { result, timestamp: Date.now() };
      return result;
    }

    const balance = parseFloat(data.totalWalletBalance || '0');
    const result: BinanceApiKeyStatus = {
      isConfigured: true, hasPermissions: true, canTradeFutures: true, balance
    };
    // Cache apenas se for sucesso
    validationCache = { result, timestamp: Date.now() };
    return result;
  } catch (error) {
    console.error('Unexpected error validating Binance API:', error);
    return {
      isConfigured: false, hasPermissions: false, canTradeFutures: false,
      error: 'Erro inesperado ao validar API keys'
    };
  }
};

/**
 * Busca informações da conta Binance Futures
 */
export const getBinanceAccountInfo = async (): Promise<BinanceAccountInfo | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('binance-account');
    if (error) { console.error('Error fetching Binance account:', error); return null; }
    return data;
  } catch (error) {
    console.error('Unexpected error fetching Binance account:', error);
    return null;
  }
};

/**
 * Busca preço atual de um símbolo (API pública Futures)
 */
export const getCurrentPrice = async (symbol: string): Promise<number | null> => {
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`);
    if (!response.ok) { console.error(`Error fetching price for ${symbol}`); return null; }
    const data = await response.json();
    return parseFloat(data.lastPrice);
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    return null;
  }
};

/**
 * Formata valores USDT
 */
export const formatUSDT = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Formata percentual
 */
export const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

