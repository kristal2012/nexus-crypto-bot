/**
 * Adaptive Strategy Service
 * Ajusta parâmetros de trading dinamicamente baseado em loss streak
 * para proteger capital ANTES do circuit breaker ser acionado
 */

import { RISK_SETTINGS } from './riskService';
import { supabase } from "@/integrations/supabase/client";
import { TRADING_STRATEGIES } from "./tradingStrategyService";

export interface AdaptiveRiskParams {
  // Risk management
  stopLossPercent: number;
  takeProfitPercent: number;
  maxAllocationPerPairPercent: number;
  safetyReservePercent: number;

  // Entry criteria (more selective = higher values)
  momentumBuyThreshold: number;
  minVolumeRatio: number;
  minQuoteVolume24hUsdt: number;
  priceVelocityThreshold: number;
  minConfidence?: number;

  // Cooldowns and protection
  pairCooldownSeconds: number;
  profitProtectThreshold: number;

  // Volatility filters
  minVolatilityPercent: number;

  // Metadata
  mode: 'normal' | 'cautious' | 'defensive';
  reason: string;
}

export interface ConsecutiveLossAnalysis {
  consecutiveLosses: number;
  shouldAdjust: boolean;
  recommendedStrategy: 'conservative' | 'moderate' | 'aggressive';
  reason: string;
}

class AdaptiveStrategyService {
  /**
   * Retorna parâmetros ajustados baseado no loss streak atual
   * Estratégia: Progressivamente mais conservador conforme perdas aumentam
   */
  getAdaptiveParams(lossStreak: number): AdaptiveRiskParams {
    // Modo Normal (0-1 perdas): Parâmetros padrão
    if (lossStreak <= 1) {
      return {
        stopLossPercent: RISK_SETTINGS.STOP_LOSS_PERCENT,
        takeProfitPercent: RISK_SETTINGS.TAKE_PROFIT_PERCENT,
        maxAllocationPerPairPercent: RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT,
        safetyReservePercent: RISK_SETTINGS.SAFETY_RESERVE_PERCENT,
        momentumBuyThreshold: RISK_SETTINGS.MOMENTUM_BUY_THRESHOLD,
        minVolumeRatio: RISK_SETTINGS.MIN_VOLUME_RATIO,
        minQuoteVolume24hUsdt: RISK_SETTINGS.MIN_QUOTE_VOLUME_24H_USDT,
        priceVelocityThreshold: RISK_SETTINGS.PRICE_VELOCITY_THRESHOLD,
        pairCooldownSeconds: RISK_SETTINGS.PAIR_COOLDOWN_SECONDS,
        profitProtectThreshold: RISK_SETTINGS.PROFIT_PROTECT_THRESHOLD,
        minVolatilityPercent: RISK_SETTINGS.MIN_VOLATILITY_PERCENT,
        mode: 'normal',
        reason: 'Operação normal - sem perdas recentes',
      };
    }

    // Modo Cauteloso (2 perdas): Critérios mais rigorosos
    if (lossStreak === 2) {
      return {
        stopLossPercent: RISK_SETTINGS.STOP_LOSS_PERCENT * 0.8,
        takeProfitPercent: RISK_SETTINGS.TAKE_PROFIT_PERCENT * 1.2,
        maxAllocationPerPairPercent: RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT * 0.8,
        safetyReservePercent: RISK_SETTINGS.SAFETY_RESERVE_PERCENT * 1.5,
        momentumBuyThreshold: RISK_SETTINGS.MOMENTUM_BUY_THRESHOLD * 1.5,
        minVolumeRatio: RISK_SETTINGS.MIN_VOLUME_RATIO * 1.3,
        minQuoteVolume24hUsdt: RISK_SETTINGS.MIN_QUOTE_VOLUME_24H_USDT * 1.5,
        priceVelocityThreshold: RISK_SETTINGS.PRICE_VELOCITY_THRESHOLD * 1.3,
        pairCooldownSeconds: RISK_SETTINGS.PAIR_COOLDOWN_SECONDS * 1.5,
        profitProtectThreshold: RISK_SETTINGS.PROFIT_PROTECT_THRESHOLD * 0.8,
        minVolatilityPercent: RISK_SETTINGS.MIN_VOLATILITY_PERCENT * 1.3,
        mode: 'cautious',
        reason: '2 perdas consecutivas - modo cauteloso ativado',
      };
    }

    // Modo Defensivo (3+ perdas): Máxima proteção ANTES do Circuit Breaker
    return {
      stopLossPercent: RISK_SETTINGS.STOP_LOSS_PERCENT * 0.6,
      takeProfitPercent: RISK_SETTINGS.TAKE_PROFIT_PERCENT * 1.4,
      maxAllocationPerPairPercent: RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT * 0.6,
      safetyReservePercent: RISK_SETTINGS.SAFETY_RESERVE_PERCENT * 2,
      momentumBuyThreshold: RISK_SETTINGS.MOMENTUM_BUY_THRESHOLD * 2,
      minVolumeRatio: RISK_SETTINGS.MIN_VOLUME_RATIO * 1.5,
      minQuoteVolume24hUsdt: RISK_SETTINGS.MIN_QUOTE_VOLUME_24H_USDT * 2,
      priceVelocityThreshold: RISK_SETTINGS.PRICE_VELOCITY_THRESHOLD * 1.5,
      pairCooldownSeconds: RISK_SETTINGS.PAIR_COOLDOWN_SECONDS * 2,
      profitProtectThreshold: RISK_SETTINGS.PROFIT_PROTECT_THRESHOLD * 0.7,
      minVolatilityPercent: RISK_SETTINGS.MIN_VOLATILITY_PERCENT * 1.5,
      mode: 'defensive',
      reason: `${lossStreak} perdas consecutivas - modo DEFENSIVO ativado`,
    };
  }

  hasStrategyChanged(previousStreak: number, currentStreak: number): boolean {
    const prevParams = this.getAdaptiveParams(previousStreak);
    const currParams = this.getAdaptiveParams(currentStreak);
    return prevParams.mode !== currParams.mode;
  }

  getAdjustmentSummary(params: AdaptiveRiskParams): string {
    const adjustments: string[] = [];
    if (params.mode === 'cautious') {
      adjustments.push('🟡 Stop Loss: -20%');
      adjustments.push('🟡 Alocação: -20%');
    } else if (params.mode === 'defensive') {
      adjustments.push('🔴 Stop Loss: -40%');
      adjustments.push('🔴 Alocação: -40%');
    }
    return adjustments.join(' | ');
  }
}

export const adaptiveStrategyService = new AdaptiveStrategyService();

/**
 * [WEB-ONLY] Obtém o nome da estratégia atual baseado nos parâmetros
 */
export const getCurrentStrategyName = (config: any): string => {
  if (!config) return 'Desconhecida';

  const leverage = config.leverage || 0;
  const stopLoss = config.stopLoss || config.stop_loss || 0;
  const takeProfit = config.takeProfit || config.take_profit || 0;

  for (const [name, strategy] of Object.entries(TRADING_STRATEGIES)) {
    if (
      Math.abs(strategy.leverage - leverage) <= 1 &&
      Math.abs(strategy.stopLoss - stopLoss) <= 0.5 &&
      Math.abs(strategy.takeProfit - takeProfit) <= 0.5
    ) {
      return strategy.name;
    }
  }
  return 'Personalizada';
};

/**
 * [WEB-ONLY] Verifica se houve mudança de estratégia desde a última rodada
 */
export const hasStrategyChangedSinceLastRound = async (userId: string) => {
  try {
    // Cast to any to bypass missing table in current types.ts
    const { data: config, error } = await (supabase
      .from('auto_trading_config' as any)
      .select('leverage, stop_loss, take_profit, min_confidence, strategy_adjusted_at')
      .eq('user_id', userId)
      .maybeSingle() as any);

    if (error || !config || !config.strategy_adjusted_at) {
      return { changed: false };
    }

    const currentStrategyName = getCurrentStrategyName(config);
    const adjustedAt = new Date(config.strategy_adjusted_at);
    const now = Date.now();
    const hoursSince = (now - adjustedAt.getTime()) / (1000 * 60 * 60);

    return {
      changed: hoursSince < 24,
      currentStrategy: currentStrategyName,
      changeDate: config.strategy_adjusted_at
    };
  } catch (e) {
    console.error('Error checking strategy change:', e);
    return { changed: false };
  }
};
