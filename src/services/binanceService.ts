/**
 * Binance Service - Centraliza toda lógica de integração com Binance API
 * Princípios: SRP, DRY, SSOT
 */

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

/**
 * Valida se as API keys estão configuradas e têm as permissões corretas
 */
export const validateBinanceApiKeys = async (): Promise<BinanceApiKeyStatus> => {
  try {
    // Tenta buscar informações da conta
    const { data, error } = await supabase.functions.invoke('binance-account');

    if (error) {
      console.error('Binance API validation error:', error);
      
      // Analisa o tipo de erro
      const errorMessage = error.message || '';
      
      if (errorMessage.includes('not configured')) {
        return {
          isConfigured: false,
          hasPermissions: false,
          canTradeFutures: false,
          error: 'API keys não configuradas. Configure suas chaves da Binance primeiro.'
        };
      }
      
      if (errorMessage.includes('Invalid API key') || errorMessage.includes('-2015')) {
        return {
          isConfigured: true,
          hasPermissions: false,
          canTradeFutures: false,
          error: '⚠️ API Key sem permissões para Futures. Vá em Binance > API Management > Editar > Habilitar "Enable Futures"'
        };
      }

      if (errorMessage.includes('timeout') || errorMessage.includes('-1021')) {
        return {
          isConfigured: true,
          hasPermissions: false,
          canTradeFutures: false,
          error: 'Timeout na conexão. Verifique sua conexão e tente novamente.'
        };
      }

      return {
        isConfigured: true,
        hasPermissions: false,
        canTradeFutures: false,
        error: `Erro ao validar API key: ${errorMessage}`
      };
    }

    // Sucesso - API key válida e com permissões
    const balance = parseFloat(data.totalWalletBalance || '0');
    
    return {
      isConfigured: true,
      hasPermissions: true,
      canTradeFutures: true,
      balance
    };
  } catch (error) {
    console.error('Unexpected error validating Binance API:', error);
    return {
      isConfigured: false,
      hasPermissions: false,
      canTradeFutures: false,
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

    if (error) {
      console.error('Error fetching Binance account:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Unexpected error fetching Binance account:', error);
    return null;
  }
};

/**
 * Busca preço atual de um símbolo (API pública)
 */
export const getCurrentPrice = async (symbol: string): Promise<number | null> => {
  try {
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
    );
    
    if (!response.ok) {
      console.error(`Error fetching price for ${symbol}`);
      return null;
    }

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
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Formata percentual
 */
export const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};
