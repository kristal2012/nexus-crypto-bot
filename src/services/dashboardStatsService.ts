/**
 * Dashboard Stats Service
 * 
 * SSOT (Single Source of Truth) para todas as estatísticas do dashboard
 * SRP: Responsável APENAS por buscar e calcular estatísticas de trading
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Busca o saldo inicial do dia atual (SSOT: bot_daily_stats)
 * IMPORTANTE: Este é o saldo que estava na conta ANTES das operações do dia
 */
export const getInitialBalance = async (userId: string) => {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('bot_daily_stats')
    .select('starting_balance')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (error) throw error;
  
  // Se há registro do dia, retorna o starting_balance
  if (data?.starting_balance) {
    return data.starting_balance;
  }
  
  // FALLBACK: Se não há registro do dia (ainda não houve trades hoje),
  // busca o demo_balance ou initial_capital como referência inicial
  const { data: settings } = await supabase
    .from('trading_settings')
    .select('trading_mode, demo_balance, initial_capital')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (!settings) return 0;
  
  const isDemo = settings.trading_mode === 'DEMO';
  const fallbackBalance = isDemo 
    ? (typeof settings.demo_balance === 'string' ? parseFloat(settings.demo_balance) : settings.demo_balance)
    : (typeof settings.initial_capital === 'string' ? parseFloat(settings.initial_capital) : settings.initial_capital);
  
  return fallbackBalance;
};

/**
 * Busca o saldo atual após todas as operações do dia (SSOT: bot_daily_stats)
 * IMPORTANTE: Este é o resultado do que tem na conta APÓS cada operação consolidada
 */
export const getCurrentBalance = async (userId: string) => {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('bot_daily_stats')
    .select('current_balance')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (error) throw error;
  
  // Se há registro do dia, retorna o current_balance
  if (data?.current_balance) {
    return data.current_balance;
  }
  
  // FALLBACK: Se não há registro do dia (ainda não houve trades hoje),
  // busca o demo_balance ou initial_capital como referência inicial
  const { data: settings } = await supabase
    .from('trading_settings')
    .select('trading_mode, demo_balance, initial_capital')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (!settings) return 0;
  
  const isDemo = settings.trading_mode === 'DEMO';
  const fallbackBalance = isDemo 
    ? (typeof settings.demo_balance === 'string' ? parseFloat(settings.demo_balance) : settings.demo_balance)
    : (typeof settings.initial_capital === 'string' ? parseFloat(settings.initial_capital) : settings.initial_capital);
  
  return fallbackBalance;
};

/**
 * Calcula o lucro do dia atual (SSOT: soma de profit_loss dos trades FILLED)
 * IMPORTANTE: Este é o resultado do lucro de cada operação trade consolidada no dia
 */
export const getDailyProfit = async (userId: string) => {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('trades')
    .select('profit_loss')
    .eq('user_id', userId)
    .gte('executed_at', today)
    .eq('status', 'FILLED');

  if (error) throw error;
  if (!data || data.length === 0) return 0;

  const total = data.reduce((sum, trade) => {
    const pl = typeof trade.profit_loss === 'string' 
      ? parseFloat(trade.profit_loss) 
      : trade.profit_loss || 0;
    return sum + pl;
  }, 0);

  return total;
};

/**
 * Calcula o lucro mensal
 * Em DEMO: usa demo_balance - initial_capital (SSOT)
 * Em REAL: usa bot_daily_stats
 */
export const getMonthlyProfit = async (userId: string) => {
  // Verifica o modo de trading
  const { data: settings } = await supabase
    .from('trading_settings')
    .select('trading_mode, demo_balance, initial_capital')
    .eq('user_id', userId)
    .maybeSingle();

  if (!settings) return 0;

  // Em modo DEMO, calcula baseado no saldo demo atual vs capital inicial
  if (settings.trading_mode === 'DEMO') {
    const demoBalance = typeof settings.demo_balance === 'string' 
      ? parseFloat(settings.demo_balance) 
      : settings.demo_balance;
    const initialCapital = typeof settings.initial_capital === 'string'
      ? parseFloat(settings.initial_capital)
      : settings.initial_capital;
    
    console.log(`💰 [LUCRO MENSAL DEMO] demo_balance: ${demoBalance}, initial_capital: ${initialCapital}`);
    return demoBalance - initialCapital;
  }

  // Em modo REAL, usa bot_daily_stats
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("bot_daily_stats")
    .select("current_balance, starting_balance, date, updated_at")
    .eq("user_id", userId)
    .gte("date", startOfMonth.toISOString().split('T')[0])
    .order("date", { ascending: true })
    .order("updated_at", { ascending: false });
  
  if (!data || data.length === 0) return 0;

  // Agrupa por data e pega o registro mais recente de cada dia
  const groupedByDate = data.reduce((acc: any, record: any) => {
    const date = record.date;
    if (!acc[date] || new Date(record.updated_at) > new Date(acc[date].updated_at)) {
      acc[date] = record;
    }
    return acc;
  }, {});

  const latestRecords = Object.values(groupedByDate) as any[];
  const sortedRecords = latestRecords.sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const firstBalance = sortedRecords[0].starting_balance;
  const lastBalance = sortedRecords[sortedRecords.length - 1].current_balance;
  
  return lastBalance - firstBalance;
};

/**
 * Conta as posições ativas
 */
export const getActivePositionsCount = async (userId: string) => {
  const { data, error } = await supabase
    .from("positions")
    .select("*", { count: 'exact' })
    .eq("user_id", userId);
  
  if (error) throw error;
  return data?.length || 0;
};

/**
 * Calcula a taxa de acerto (win rate)
 */
export const getWinRate = async (userId: string) => {
  const { data, error } = await supabase
    .from("trades")
    .select("profit_loss")
    .eq("user_id", userId)
    .eq("status", "FILLED");
  
  if (error) throw error;
  if (!data || data.length === 0) return 0;

  const wins = data.filter((t: any) => t.profit_loss && t.profit_loss > 0).length;
  return (wins / data.length) * 100;
};

/**
 * Busca o percentual de lucro/perda do dia
 */
export const getDailyProfitPercent = async (userId: string) => {
  const { data } = await supabase
    .from("bot_daily_stats")
    .select("profit_loss_percent")
    .eq("user_id", userId)
    .eq("date", new Date().toISOString().split('T')[0])
    .maybeSingle();
  
  return data?.profit_loss_percent || 0;
};
