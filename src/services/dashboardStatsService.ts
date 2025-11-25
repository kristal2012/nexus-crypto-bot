/**
 * Dashboard Stats Service - REFORMULADO
 * 
 * SSOT para estatísticas do dashboard
 * SRP: Responsável APENAS por fornecer dados para exibição no dashboard
 * 
 * IMPORTANTE: Este serviço agora delega TODOS os cálculos financeiros
 * para o financialAccountingService (SSOT de contabilidade)
 */

import { supabase } from "@/integrations/supabase/client";
import { getFinancialSnapshot } from "./financialAccountingService";

// ============================================================================
// FUNÇÕES DE ESTATÍSTICAS DO DASHBOARD
// ============================================================================

/**
 * Saldo inicial do dia (valor no INÍCIO do dia)
 */
export const getInitialBalance = async (userId: string): Promise<number> => {
  const snapshot = await getFinancialSnapshot(userId);
  return snapshot.initialBalance;
};

/**
 * Saldo atual total (incluindo posições abertas e PnL não realizado)
 */
export const getCurrentBalance = async (userId: string): Promise<number> => {
  const snapshot = await getFinancialSnapshot(userId);
  return snapshot.totalBalance;
};

/**
 * Lucro do dia (diferença entre saldo atual e saldo inicial do dia)
 */
export const getDailyProfit = async (userId: string): Promise<number> => {
  const snapshot = await getFinancialSnapshot(userId);
  return snapshot.dailyProfit;
};

/**
 * Lucro do dia em percentual
 */
export const getDailyProfitPercent = async (userId: string): Promise<number> => {
  const snapshot = await getFinancialSnapshot(userId);
  
  if (snapshot.initialBalance === 0) return 0;
  
  return (snapshot.dailyProfit / snapshot.initialBalance) * 100;
};

/**
 * Lucro mensal
 */
export const getMonthlyProfit = async (userId: string): Promise<number> => {
  const snapshot = await getFinancialSnapshot(userId);
  return snapshot.monthlyProfit;
};

/**
 * Número de posições ativas
 */
export const getActivePositionsCount = async (userId: string): Promise<number> => {
  const snapshot = await getFinancialSnapshot(userId);
  return snapshot.activePositionsCount;
};

/**
 * Win rate (taxa de acerto)
 */
export const getWinRate = async (userId: string): Promise<number> => {
  // Win rate é calculado separadamente pois não depende do snapshot financeiro
  const { data: settings } = await supabase
    .from('trading_settings')
    .select('trading_mode')
    .eq('user_id', userId)
    .single();
  
  const isDemo = settings?.trading_mode === 'DEMO';
  
  const { data: trades } = await supabase
    .from('trades')
    .select('profit_loss')
    .eq('user_id', userId)
    .eq('is_demo', isDemo)
    .eq('status', 'FILLED')
    .not('profit_loss', 'is', null);
  
  if (!trades || trades.length === 0) {
    return 0;
  }
  
  const winningTrades = trades.filter(t => (t.profit_loss || 0) > 0).length;
  return (winningTrades / trades.length) * 100;
};
