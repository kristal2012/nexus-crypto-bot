/**
 * Adaptive Strategy Service - Sistema de ajuste automático de estratégias
 * Princípios: SSOT, SRP, Fail Fast
 * 
 * Detecta perdas consecutivas e ajusta parâmetros automaticamente
 * antes do circuit breaker ser ativado
 */

import { supabase } from "@/integrations/supabase/client";
import { TRADING_STRATEGIES, type TradingStrategy } from "./tradingStrategyService";

export interface ConsecutiveLossAnalysis {
  consecutiveLosses: number;
  shouldAdjust: boolean;
  recommendedStrategy: 'conservative' | 'moderate' | 'aggressive';
  reason: string;
}

/**
 * Analisa perdas consecutivas e determina se é necessário ajuste
 */
export const analyzeConsecutiveLosses = async (
  userId: string,
  currentStrategy: string
): Promise<ConsecutiveLossAnalysis> => {
  // Buscar últimas 10 trades fechados
  const { data: recentTrades } = await supabase
    .from('trades')
    .select('profit_loss, created_at')
    .eq('user_id', userId)
    .not('profit_loss', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!recentTrades || recentTrades.length < 5) {
    return {
      consecutiveLosses: 0,
      shouldAdjust: false,
      recommendedStrategy: currentStrategy as any,
      reason: 'Dados insuficientes para análise (mínimo 5 trades)'
    };
  }

  // Contar perdas consecutivas
  let consecutiveLosses = 0;
  for (const trade of recentTrades) {
    if (trade.profit_loss < 0) {
      consecutiveLosses++;
    } else {
      break; // Para ao encontrar uma vitória
    }
  }

  console.log(`📊 Análise Adaptativa: ${consecutiveLosses} perdas consecutivas`);

  // Regras de ajuste adaptativo
  if (consecutiveLosses >= 5) {
    // 5+ perdas consecutivas = Modo conservador
    return {
      consecutiveLosses,
      shouldAdjust: currentStrategy !== 'conservative',
      recommendedStrategy: 'conservative',
      reason: '5+ perdas consecutivas detectadas - ativando modo conservador'
    };
  } else if (consecutiveLosses >= 3) {
    // 3-4 perdas consecutivas = Reduzir agressividade
    if (currentStrategy === 'aggressive') {
      return {
        consecutiveLosses,
        shouldAdjust: true,
        recommendedStrategy: 'moderate',
        reason: '3+ perdas consecutivas - mudando de agressivo para moderado'
      };
    }
  }

  return {
    consecutiveLosses,
    shouldAdjust: false,
    recommendedStrategy: currentStrategy as any,
    reason: 'Performance dentro dos limites aceitáveis'
  };
};

/**
 * Aplica ajuste adaptativo de estratégia
 */
export const applyAdaptiveAdjustment = async (
  userId: string,
  analysis: ConsecutiveLossAnalysis
): Promise<boolean> => {
  if (!analysis.shouldAdjust) {
    return false;
  }

  const strategy = TRADING_STRATEGIES[analysis.recommendedStrategy];
  
  console.log(`🔄 Ajuste Adaptativo Automático:
    Estratégia anterior: (detectada pelas perdas)
    Nova estratégia: ${analysis.recommendedStrategy}
    Razão: ${analysis.reason}
    Parâmetros:
      - Leverage: ${strategy.leverage}x
      - Stop Loss: ${strategy.stopLoss}%
      - Take Profit: ${strategy.takeProfit}%
      - Confiança Mínima: ${strategy.minConfidence}%
  `);

  const { error } = await supabase
    .from('auto_trading_config')
    .update({
      leverage: strategy.leverage,
      stop_loss: strategy.stopLoss,
      take_profit: strategy.takeProfit,
      min_confidence: strategy.minConfidence,
      strategy_adjusted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  if (error) {
    console.error('❌ Erro ao aplicar ajuste adaptativo:', error);
    return false;
  }

  console.log('✅ Ajuste adaptativo aplicado com sucesso');
  return true;
};

/**
 * Obtém o nome da estratégia atual baseado nos parâmetros
 * Aceita tanto camelCase (frontend) quanto snake_case (backend)
 */
export const getCurrentStrategyName = (config: {
  leverage: number;
  stopLoss?: number;
  stop_loss?: number;
  takeProfit?: number;
  take_profit?: number;
  minConfidence?: number;
  min_confidence?: number;
}): string => {
  const stopLoss = config.stopLoss || config.stop_loss || 0;
  const takeProfit = config.takeProfit || config.take_profit || 0;
  const minConfidence = config.minConfidence || config.min_confidence || 0;

  // Compara com estratégias conhecidas
  for (const [name, strategy] of Object.entries(TRADING_STRATEGIES)) {
    if (
      Math.abs(strategy.leverage - config.leverage) <= 1 &&
      Math.abs(strategy.stopLoss - stopLoss) <= 0.5 &&
      Math.abs(strategy.takeProfit - takeProfit) <= 0.5 &&
      Math.abs(strategy.minConfidence - minConfidence) <= 5
    ) {
      return strategy.name;
    }
  }
  
  return 'Personalizada';
};

/**
 * Verifica se houve mudança de estratégia desde a última rodada
 */
export const hasStrategyChangedSinceLastRound = async (
  userId: string
): Promise<{ changed: boolean; previousStrategy?: string; currentStrategy?: string; changeDate?: string }> => {
  const { data: config } = await supabase
    .from('auto_trading_config')
    .select('leverage, stop_loss, take_profit, min_confidence, strategy_adjusted_at')
    .eq('user_id', userId)
    .single();

  if (!config || !config.strategy_adjusted_at) {
    return { changed: false };
  }

  const currentStrategy = getCurrentStrategyName({
    leverage: config.leverage,
    stop_loss: config.stop_loss,
    take_profit: config.take_profit,
    min_confidence: config.min_confidence
  });

  // Verifica se houve ajuste nas últimas 24h
  const adjustedAt = new Date(config.strategy_adjusted_at);
  const now = new Date();
  const hoursSinceAdjustment = (now.getTime() - adjustedAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceAdjustment < 24) {
    return {
      changed: true,
      currentStrategy,
      changeDate: config.strategy_adjusted_at
    };
  }

  return { changed: false, currentStrategy };
};
