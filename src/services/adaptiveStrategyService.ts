/**
 * Adaptive Strategy Service
 * Ajusta parâmetros de trading dinamicamente baseado em loss streak
 * para proteger capital ANTES do circuit breaker ser acionado
 */

import { RISK_SETTINGS } from './riskService';

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
  minConfidence?: number; // Novo campo

  // Cooldowns and protection
  pairCooldownSeconds: number;
  profitProtectThreshold: number;

  // Volatility filters
  minVolatilityPercent: number;

  // Metadata
  mode: 'normal' | 'cautious' | 'defensive';
  reason: string;
}

class AdaptiveStrategyService {
  /**
   * Retorna parâmetros ajustados baseado no loss streak atual
   * Estratégia: Progressivamente mais conservador conforme perdas aumentam
   * 
   * @param lossStreak - Número de perdas consecutivas
   * @returns Parâmetros de risco ajustados
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
        stopLossPercent: RISK_SETTINGS.STOP_LOSS_PERCENT * 0.8, // 2.0% (mais apertado)
        takeProfitPercent: RISK_SETTINGS.TAKE_PROFIT_PERCENT * 1.2, // 6.0% (buscar ganhos maiores)
        maxAllocationPerPairPercent: RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT * 0.8, // 4% (menos capital por par)
        safetyReservePercent: RISK_SETTINGS.SAFETY_RESERVE_PERCENT * 1.5, // 7.5% (mais reserva)
        momentumBuyThreshold: RISK_SETTINGS.MOMENTUM_BUY_THRESHOLD * 1.5, // 0.45% (mais seletivo)
        minVolumeRatio: RISK_SETTINGS.MIN_VOLUME_RATIO * 1.3, // 1.5x volume (mais liquidez)
        minQuoteVolume24hUsdt: RISK_SETTINGS.MIN_QUOTE_VOLUME_24H_USDT * 1.5, // 7.5M (pares maiores)
        priceVelocityThreshold: RISK_SETTINGS.PRICE_VELOCITY_THRESHOLD * 1.3, // Velocidade maior
        pairCooldownSeconds: RISK_SETTINGS.PAIR_COOLDOWN_SECONDS * 1.5, // 67s (mais espera)
        profitProtectThreshold: RISK_SETTINGS.PROFIT_PROTECT_THRESHOLD * 0.8, // 1.2% (proteger antes)
        minVolatilityPercent: RISK_SETTINGS.MIN_VOLATILITY_PERCENT * 1.3, // 0.33% (evitar chop)
        mode: 'cautious',
        reason: '2 perdas consecutivas - modo cauteloso ativado',
      };
    }

    // Modo Defensivo (3+ perdas): Máxima proteção ANTES do Circuit Breaker
    return {
      stopLossPercent: RISK_SETTINGS.STOP_LOSS_PERCENT * 0.6, // 1.5% (muito apertado)
      takeProfitPercent: RISK_SETTINGS.TAKE_PROFIT_PERCENT * 1.4, // 7.0% (só entrar em oportunidades excelentes)
      maxAllocationPerPairPercent: RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT * 0.6, // 3% (exposição mínima)
      safetyReservePercent: RISK_SETTINGS.SAFETY_RESERVE_PERCENT * 2, // 10% (reserva máxima)
      momentumBuyThreshold: RISK_SETTINGS.MOMENTUM_BUY_THRESHOLD * 2, // 0.6% (extremamente seletivo)
      minVolumeRatio: RISK_SETTINGS.MIN_VOLUME_RATIO * 1.5, // 1.7x volume (liquidez premium)
      minQuoteVolume24hUsdt: RISK_SETTINGS.MIN_QUOTE_VOLUME_24H_USDT * 2, // 10M (apenas pares grandes)
      priceVelocityThreshold: RISK_SETTINGS.PRICE_VELOCITY_THRESHOLD * 1.5, // Velocidade alta
      pairCooldownSeconds: RISK_SETTINGS.PAIR_COOLDOWN_SECONDS * 2, // 90s (cooldown dobrado)
      profitProtectThreshold: RISK_SETTINGS.PROFIT_PROTECT_THRESHOLD * 0.7, // 1.05% (proteger cedo)
      minVolatilityPercent: RISK_SETTINGS.MIN_VOLATILITY_PERCENT * 1.5, // 0.375% (só mercados ativos)
      mode: 'defensive',
      reason: `${lossStreak} perdas consecutivas - modo DEFENSIVO ativado (proteção máxima)`,
    };
  }

  /**
   * Verifica se houve mudança de modo desde o último check
   */
  hasStrategyChanged(previousStreak: number, currentStreak: number): boolean {
    const prevMode = this.getAdaptiveParams(previousStreak).mode;
    const currMode = this.getAdaptiveParams(currentStreak).mode;
    return prevMode !== currMode;
  }

  /**
   * Retorna descrição amigável dos ajustes aplicados
   */
  getAdjustmentSummary(params: AdaptiveRiskParams): string {
    const adjustments: string[] = [];

    if (params.mode === 'cautious') {
      adjustments.push('🟡 Stop Loss: -20%');
      adjustments.push('🟡 Alocação: -20%');
      adjustments.push('🟡 Seletividade: +50%');
      adjustments.push('🟡 Volume mínimo: +50%');
    } else if (params.mode === 'defensive') {
      adjustments.push('🔴 Stop Loss: -40%');
      adjustments.push('🔴 Alocação: -40%');
      adjustments.push('🔴 Seletividade: +100%');
      adjustments.push('🔴 Volume mínimo: +100%');
      adjustments.push('🔴 Cooldown: +100%');
    }

    return adjustments.join(' | ');
  }
}

export const adaptiveStrategyService = new AdaptiveStrategyService();

/**
 * Helper: Retorna o nome da estratégia atual baseado no loss streak
 */
export const getCurrentStrategyName = (lossStreak: number = 0): string => {
  const params = adaptiveStrategyService.getAdaptiveParams(lossStreak);
  switch (params.mode) {
    case 'normal': return 'Normal';
    case 'cautious': return 'Cautelosa';
    case 'defensive': return 'Defensiva';
    default: return 'Normal';
  }
};

/**
 * Helper: Verifica se a estratégia mudou desde o último round
 */
export const hasStrategyChangedSinceLastRound = (previousStreak: number = 0, currentStreak: number = 0): boolean => {
  return adaptiveStrategyService.hasStrategyChanged(previousStreak, currentStreak);
};
