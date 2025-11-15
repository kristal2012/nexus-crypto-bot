/**
 * Binance Service - Centraliza toda lógica de integração com Binance API
 * Princípios: SRP, DRY, SSOT
 * 
 * NOVO: Sistema de cache e throttling para evitar rate limits (429)
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

// CACHE: Evita chamadas desnecessárias à API da Binance
interface CacheEntry {
  data: BinanceApiKeyStatus;
  timestamp: number;
}

let validationCache: CacheEntry | null = null;
const CACHE_DURATION = 30000; // 30 segundos

// THROTTLE: Previne múltiplas chamadas simultâneas
let validationPromise: Promise<BinanceApiKeyStatus> | null = null;

/**
 * Valida se as API keys estão configuradas e têm as permissões corretas
 * COM CACHE E THROTTLING para evitar rate limits
 */
export const validateBinanceApiKeys = async (): Promise<BinanceApiKeyStatus> => {
  // Verifica cache
  if (validationCache && (Date.now() - validationCache.timestamp) < CACHE_DURATION) {
    console.log('✅ Using cached Binance validation result');
    return validationCache.data;
  }

  // Throttle: Se já há uma validação em andamento, retorna a mesma promise
  if (validationPromise) {
    console.log('⏳ Reusing in-flight Binance validation request');
    return validationPromise;
  }

  // Nova validação
  validationPromise = performValidation();
  
  try {
    const result = await validationPromise;
    
    // Armazena no cache apenas se for sucesso
    if (result.isConfigured && result.hasPermissions) {
      validationCache = {
        data: result,
        timestamp: Date.now()
      };
    }
    
    return result;
  } finally {
    validationPromise = null;
  }
};

/**
 * Limpa o cache (útil após reconfigurar API keys)
 */
export const clearBinanceValidationCache = () => {
  validationCache = null;
  console.log('🗑️ Binance validation cache cleared');
};

/**
 * Função interna que faz a validação real
 */
async function performValidation(): Promise<BinanceApiKeyStatus> {
  try {
    console.log('🔍 Validating Binance API keys...');
    
    const { data, error } = await supabase.functions.invoke('binance-account');

    if (error) {
      console.error('Binance API validation error:', error);
      
      // Se a resposta tem dados, é um erro estruturado da edge function
      if (data?.error) {
        const errorMessage = data.error;
        const errorCode = data.errorCode;
        const requiresReconfiguration = data.requiresReconfiguration;

        // Erro de rate limit (429) - não armazena no cache
        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          return {
            isConfigured: true,
            hasPermissions: false,
            canTradeFutures: false,
            error: '⏸️ Muitas requisições à Binance. Aguarde 1 minuto e recarregue a página.'
          };
        }

        // Erro de descriptografia - credenciais corrompidas
        if (errorCode === 'DECRYPTION_FAILED' || requiresReconfiguration) {
          return {
            isConfigured: true,
            hasPermissions: false,
            canTradeFutures: false,
            error: '🔐 ' + errorMessage + '\n\n📝 Vá em "Configurações de API Binance" e reconfigure suas credenciais.'
          };
        }

        // Credenciais não configuradas
        if (errorCode === 'MISSING_CREDENTIALS') {
          return {
            isConfigured: false,
            hasPermissions: false,
            canTradeFutures: false,
            error: errorMessage
          };
        }

        // Outros erros da Binance
        return {
          isConfigured: true,
          hasPermissions: false,
          canTradeFutures: false,
          error: errorMessage
        };
      }
      
      // Erro genérico
      const errorMessage = error.message || '';
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
}

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
