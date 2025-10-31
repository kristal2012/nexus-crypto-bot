/**
 * Trade Validation Service - Valida se um trade deve ser executado
 * Princípios: SRP, Fail Fast
 * 
 * Responsabilidade: Validar condições antes de executar trade
 */

import { supabase } from "@/integrations/supabase/client";
import { checkCircuitBreaker, type TradeMetrics } from "./circuitBreakerService";

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  severity: 'none' | 'warning' | 'critical';
}

/**
 * Valida se pode executar um novo trade baseado em performance histórica
 */
export const validateTradeExecution = async (): Promise<ValidationResult> => {
  try {
    // Buscar métricas dos últimos 7 dias
    const { data: trades, error } = await supabase
      .from('trades')
      .select('profit_loss')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error('Erro ao buscar trades:', error);
      return {
        isValid: true,
        severity: 'none',
      };
    }

    if (!trades || trades.length === 0) {
      return {
        isValid: true,
        severity: 'none',
      };
    }

    // Calcular métricas
    const metrics: TradeMetrics = {
      totalTrades: trades.length,
      winningTrades: trades.filter(t => t.profit_loss && t.profit_loss > 0).length,
      losingTrades: trades.filter(t => t.profit_loss && t.profit_loss < 0).length,
      totalProfitLoss: trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0),
      avgProfitLoss: trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0) / trades.length,
    };

    // Verificar circuit breaker
    const circuitStatus = checkCircuitBreaker(metrics);

    if (circuitStatus.isOpen) {
      return {
        isValid: false,
        reason: circuitStatus.reason,
        severity: circuitStatus.severity,
      };
    }

    if (circuitStatus.severity === 'warning') {
      return {
        isValid: true,
        reason: circuitStatus.reason,
        severity: 'warning',
      };
    }

    return {
      isValid: true,
      severity: 'none',
    };
  } catch (error) {
    console.error('Erro na validação:', error);
    return {
      isValid: true,
      severity: 'none',
    };
  }
};

/**
 * Busca status atual do circuit breaker
 */
export const getCircuitBreakerStatus = async () => {
  const validation = await validateTradeExecution();
  return validation;
};
