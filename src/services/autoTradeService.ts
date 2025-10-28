/**
 * Auto Trade Service
 * 
 * Centralizes all auto-trading logic following SRP principle.
 * Handles edge function invocation, error parsing, and response normalization.
 */

import { supabase } from "@/integrations/supabase/client";

export interface AutoTradeResponse {
  success: boolean;
  executed_trades?: any[];
  rate_limited?: boolean;
  remaining_seconds?: number;
  error?: string;
  message?: string;
}

export interface AutoTradeError {
  isRateLimit: boolean;
  remainingSeconds?: number;
  message: string;
  displayMessage: string;
}

/**
 * Executes AI auto-trade analysis.
 * Returns normalized response or throws AutoTradeError with parsed error details.
 */
export const executeAutoTradeAnalysis = async (): Promise<AutoTradeResponse> => {
  try {
    const { data, error } = await supabase.functions.invoke('ai-auto-trade');

    // Case 1: Network/Infrastructure error (no response from function)
    if (error) {
      throw parseSupabaseError(error);
    }

    // Case 2: Function returned error in response body
    if (data && !data.success) {
      throw {
        isRateLimit: data.rate_limited || false,
        remainingSeconds: data.remaining_seconds,
        message: data.error || data.message || 'Unknown error',
        displayMessage: data.message || data.error || 'Erro na execução da análise',
      } as AutoTradeError;
    }

    // Case 3: Success
    return data as AutoTradeResponse;
  } catch (error) {
    // Re-throw if already an AutoTradeError
    if (isAutoTradeError(error)) {
      throw error;
    }

    // Parse and throw as AutoTradeError
    throw {
      isRateLimit: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      displayMessage: 'Erro inesperado ao executar análise',
    } as AutoTradeError;
  }
};

/**
 * Parses Supabase function errors into AutoTradeError format.
 */
const parseSupabaseError = (error: any): AutoTradeError => {
  const errorMessage = error.message || error.toString();

  // Check for rate limit in error message
  if (errorMessage.includes('Rate limit') || errorMessage.includes('429')) {
    const match = errorMessage.match(/(\d+)\s+seconds?\s+remaining/i);
    return {
      isRateLimit: true,
      remainingSeconds: match ? parseInt(match[1]) : undefined,
      message: errorMessage,
      displayMessage: match 
        ? `Aguarde ${match[1]} segundos antes da próxima análise`
        : 'Aguarde antes da próxima análise (rate limit)',
    };
  }

  // Check for configuration errors
  if (errorMessage.includes('credenciais') || errorMessage.includes('API')) {
    return {
      isRateLimit: false,
      message: errorMessage,
      displayMessage: 'Configure suas credenciais da Binance nas configurações',
    };
  }

  // Check for trading paused
  if (errorMessage.includes('paused') || errorMessage.includes('pausado')) {
    return {
      isRateLimit: false,
      message: errorMessage,
      displayMessage: 'Trading pausado por segurança',
    };
  }

  // Generic error
  return {
    isRateLimit: false,
    message: errorMessage,
    displayMessage: 'Erro ao executar análise automática',
  };
};

/**
 * Type guard for AutoTradeError.
 */
const isAutoTradeError = (error: any): error is AutoTradeError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isRateLimit' in error &&
    'message' in error &&
    'displayMessage' in error
  );
};
