/**
 * Auto Trade Service
 * 
 * Centralizes all auto-trading logic following SRP principle.
 * Handles edge function invocation, error parsing, and response normalization.
 */

import { supabase } from "@/integrations/supabase/client";
import { IS_SIMULATION_MODE } from "@/config/userConfig";

export interface AutoTradeResponse {
  // ... (rest of interfaces remain same)
  success: boolean;
  executed_trades?: any[];
  rate_limited?: boolean;
  circuit_breaker?: boolean;
  remaining_seconds?: number;
  metrics?: {
    winRate: number;
    totalTrades: number;
    lossPercent: number;
  };
  error?: string;
  message?: string;
}

export interface AutoTradeError {
  isRateLimit: boolean;
  isCircuitBreaker?: boolean;
  remainingSeconds?: number;
  metrics?: {
    winRate: number;
    totalTrades: number;
    lossPercent: number;
  };
  message: string;
  displayMessage: string;
}

/**
 * Executes AI auto-trade analysis.
 * Returns normalized response or throws AutoTradeError with parsed error details.
 */
export const executeAutoTradeAnalysis = async (): Promise<AutoTradeResponse> => {
  if (IS_SIMULATION_MODE) {
    console.log('🧪 [autoTradeService] Simulando análise IA...');
    // Pequeno delay para simular processamento
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Decidir aleatoriamente se haverá um trade (60% de chance)
    const shouldTrade = Math.random() > 0.4;
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'LINKUSDT'];
    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];

    if (shouldTrade) {
      console.log(`🎰 [autoTradeService] Simulação: Oportunidade encontrada em ${randomSymbol}`);
      return {
        success: true,
        message: `[SIMULAÇÃO] Executada operação de COMPRA em ${randomSymbol} com 89.5% de confiança.`,
        executed_trades: [{
          symbol: randomSymbol,
          side: 'BUY',
          quantity: 0.1,
          price: 50000,
          is_demo: true,
          executed_at: new Date().toISOString()
        }]
      };
    }

    return {
      success: true,
      message: "Análise simulada concluída. Nenhuma oportunidade de alto risco encontrada no momento.",
      executed_trades: []
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('ai-auto-trade');

    // CRITICAL: Circuit breaker detection
    if (data?.circuit_breaker === true || data?.success === false && data?.message?.includes('pausado')) {
      console.log('🛑 [autoTradeService] Circuit breaker activated - trading paused');
      return {
        success: false,
        circuit_breaker: true,
        metrics: data.metrics,
        message: data.message || 'Trading pausado por segurança',
      } as AutoTradeResponse;
    }

    // CRITICAL: Rate limit detection - check data FIRST (even if error exists)
    // The 429 status code causes Supabase SDK to set both error AND data
    if (data?.rate_limited === true || data?.success === false && data?.message?.includes('wait')) {
      console.log('⏳ [autoTradeService] Rate limit detected - treating as normal response');
      return {
        success: false,
        rate_limited: true,
        remaining_seconds: data.remaining_seconds || 120,
        message: data.message || 'Aguarde antes de executar outra análise',
      } as AutoTradeResponse;
    }

    // Additional rate limit detection in error object
    if (error) {
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      const errorMsg = error?.message || errorStr;

      // Check for 429 or rate limit indicators
      if (errorStr.includes('429') || errorMsg.includes('Rate limit') || errorMsg.includes('wait')) {
        console.log('⏳ [autoTradeService] Rate limit detected in error (fallback)');

        // Extract remaining seconds if available
        let remainingSeconds = data?.remaining_seconds || 120;
        const match = errorMsg.match(/(\d+)\s*second/i);
        if (match) {
          remainingSeconds = parseInt(match[1]);
        }

        return {
          success: false,
          rate_limited: true,
          remaining_seconds: remainingSeconds,
          message: data?.message || 'Aguarde antes de executar outra análise',
        } as AutoTradeResponse;
      }
    }

    // Non-rate-limit errors: throw as AutoTradeError
    if (data && !data.success) {
      console.error('❌ Function returned error:', data);
      throw {
        isRateLimit: false,
        remainingSeconds: data.remaining_seconds,
        message: data.error || data.message || 'Unknown error',
        displayMessage: data.message || data.error || 'Erro na execução da análise',
      } as AutoTradeError;
    }

    // Network/infrastructure errors
    if (error && !data) {
      console.error('❌ Network/Infrastructure error:', error);
      throw parseSupabaseError(error);
    }

    // Success case
    return data as AutoTradeResponse;
  } catch (error) {
    // Re-throw if already parsed as AutoTradeError
    if (isAutoTradeError(error)) {
      throw error;
    }

    // Unexpected errors
    console.error('❌ Unexpected error:', error);
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
