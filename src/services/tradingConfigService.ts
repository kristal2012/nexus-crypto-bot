/**
 * Trading Configuration Service
 * 
 * SSOT (Single Source of Truth) para todas as configurações de trading.
 * Princípio SRP: Responsabilidade única de gerenciar configurações.
 */

import { supabase } from "@/integrations/supabase/client";

export interface TradingConfig {
  isActive: boolean;
  takeProfit: number;
  stopLoss: number;
  quantityUsdt: number;
  leverage: number;
  minConfidence: number;
  lastAnalysisAt: string | null;
  strategy_adjusted_at?: string | null;
}

/**
 * SSOT: Busca a configuração de trading do banco de dados
 * Esta é a ÚNICA fonte de verdade para configurações
 */
export const getTradingConfig = async (userId: string): Promise<TradingConfig | null> => {
  try {
    const { data, error } = await supabase
      .from('auto_trading_config')
      .select('is_active, take_profit, stop_loss, quantity_usdt, leverage, min_confidence, last_analysis_at, strategy_adjusted_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching trading config:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      isActive: data.is_active,
      takeProfit: Number(data.take_profit),
      stopLoss: Number(data.stop_loss),
      quantityUsdt: Number(data.quantity_usdt),
      leverage: Number(data.leverage),
      minConfidence: Number(data.min_confidence),
      lastAnalysisAt: data.last_analysis_at,
      strategy_adjusted_at: data.strategy_adjusted_at,
    };
  } catch (error) {
    console.error('Exception in getTradingConfig:', error);
    return null;
  }
};

/**
 * Atualiza a configuração de trading
 */
export const updateTradingConfig = async (
  userId: string,
  updates: Partial<Omit<TradingConfig, 'lastAnalysisAt'>>
): Promise<boolean> => {
  try {
    const updateData: any = {};
    
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.takeProfit !== undefined) updateData.take_profit = updates.takeProfit;
    if (updates.stopLoss !== undefined) updateData.stop_loss = updates.stopLoss;
    if (updates.quantityUsdt !== undefined) updateData.quantity_usdt = updates.quantityUsdt;
    if (updates.leverage !== undefined) updateData.leverage = updates.leverage;
    if (updates.minConfidence !== undefined) updateData.min_confidence = updates.minConfidence;
    if (updates.strategy_adjusted_at !== undefined) updateData.strategy_adjusted_at = updates.strategy_adjusted_at;
    
    const { error } = await supabase
      .from('auto_trading_config')
      .update(updateData)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating trading config:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Exception in updateTradingConfig:', error);
    return false;
  }
};

/**
 * Calcula o valor absoluto de Stop Loss baseado no valor investido
 */
export const calculateStopLossAmount = (
  investedAmount: number,
  stopLossPercent: number
): number => {
  return (investedAmount * stopLossPercent) / 100;
};

/**
 * Calcula o valor absoluto de Take Profit baseado no saldo inicial
 */
export const calculateTakeProfitAmount = (
  startingBalance: number,
  takeProfitPercent: number
): number => {
  return (startingBalance * takeProfitPercent) / 100;
};

/**
 * Valida se uma configuração é válida
 */
export const validateConfig = (config: TradingConfig): { valid: boolean; reason?: string } => {
  if (config.stopLoss <= 0 || config.stopLoss > 10) {
    return { valid: false, reason: 'Stop Loss deve estar entre 0% e 10%' };
  }

  if (config.takeProfit <= 0 || config.takeProfit > 20) {
    return { valid: false, reason: 'Take Profit deve estar entre 0% e 20%' };
  }

  if (config.stopLoss >= config.takeProfit) {
    return { valid: false, reason: 'Stop Loss deve ser menor que Take Profit' };
  }

  if (config.minConfidence < 50 || config.minConfidence > 100) {
    return { valid: false, reason: 'Confiança mínima deve estar entre 50% e 100%' };
  }

  return { valid: true };
};
