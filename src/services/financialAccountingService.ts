/**
 * Financial Accounting Service
 * 
 * SSOT para toda a contabilidade financeira do bot
 * SRP: Responsável APENAS por cálculos precisos de saldos e lucros
 * 
 * DEFINIÇÕES CRÍTICAS:
 * - Saldo Inicial: Valor no INÍCIO do dia (fixo, não muda durante o dia)
 * - Saldo Disponível: Capital LIVRE na carteira (não alocado)
 * - Capital Alocado: Soma do valor de TODAS posições abertas
 * - Saldo Total Atual: Saldo Disponível + Capital Alocado + PnL Não Realizado
 * - Lucro do Dia: Saldo Total Atual - Saldo Inicial do Dia
 * - Lucro Mensal: Saldo Total Atual - Capital Inicial do Mês
 */

import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// INTERFACES
// ============================================================================

export interface FinancialSnapshot {
  // Saldos base
  initialBalance: number;           // Saldo no início do dia (fixo)
  freeBalance: number;               // Capital disponível (não alocado)
  allocatedCapital: number;          // Capital em posições abertas
  
  // Valor total
  totalBalance: number;              // freeBalance + allocatedCapital + unrealizedPnL
  
  // Lucros e perdas
  realizedPnL: number;               // P&L de trades fechadas
  unrealizedPnL: number;             // P&L de posições abertas
  dailyProfit: number;               // Lucro/prejuízo do dia
  monthlyProfit: number;             // Lucro/prejuízo do mês
  
  // Metadados
  activePositionsCount: number;
  dailyTradesCount: number;
  isDemo: boolean;
}

interface Position {
  symbol: string;
  quantity: number;
  entry_price: number;
  current_price: number | null;
}

// ============================================================================
// FUNÇÕES PRINCIPAIS
// ============================================================================

/**
 * Obtém o snapshot financeiro completo do usuário
 * Esta é a função principal que deve ser usada por toda a aplicação
 */
export const getFinancialSnapshot = async (userId: string): Promise<FinancialSnapshot> => {
  console.log('📊 [FINANCIAL] Calculando snapshot financeiro completo...');
  
  // 1. Determinar modo de trading
  const { data: settings } = await supabase
    .from('trading_settings')
    .select('trading_mode, demo_balance, initial_capital')
    .eq('user_id', userId)
    .single();
  
  const isDemo = settings?.trading_mode === 'DEMO';
  
  // 2. Buscar estatísticas diárias (saldo inicial do dia)
  const today = new Date().toISOString().split('T')[0];
  const { data: dailyStats } = await supabase
    .from('bot_daily_stats')
    .select('starting_balance, current_balance, trades_count')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('is_active', true)
    .maybeSingle();
  
  // Saldo inicial do dia (fixo)
  const initialBalance = dailyStats?.starting_balance || settings?.demo_balance || settings?.initial_capital || 10000;
  
  // 3. Calcular capital alocado e PnL não realizado
  const { allocatedCapital, unrealizedPnL, positionsCount } = await calculatePositionsValue(userId, isDemo);
  
  // 4. Calcular PnL realizado (trades fechadas do dia)
  const realizedPnL = await calculateRealizedPnL(userId, isDemo);
  
  // 5. Calcular saldo disponível (livre)
  // Saldo disponível = Saldo inicial + PnL realizado - Capital alocado
  const freeBalance = initialBalance + realizedPnL - allocatedCapital;
  
  // 6. Calcular saldo total atual
  // Total = Saldo disponível + Capital alocado + PnL não realizado
  const totalBalance = freeBalance + allocatedCapital + unrealizedPnL;
  
  // 7. Calcular lucro do dia
  const dailyProfit = totalBalance - initialBalance;
  
  // 8. Calcular lucro mensal
  const monthlyProfit = await calculateMonthlyProfit(userId, totalBalance, isDemo, settings);
  
  // 9. Contagem de trades do dia
  const dailyTradesCount = dailyStats?.trades_count || 0;
  
  const snapshot: FinancialSnapshot = {
    initialBalance,
    freeBalance,
    allocatedCapital,
    totalBalance,
    realizedPnL,
    unrealizedPnL,
    dailyProfit,
    monthlyProfit,
    activePositionsCount: positionsCount,
    dailyTradesCount,
    isDemo
  };
  
  console.log('✅ [FINANCIAL] Snapshot calculado:', {
    initialBalance: snapshot.initialBalance.toFixed(2),
    freeBalance: snapshot.freeBalance.toFixed(2),
    allocatedCapital: snapshot.allocatedCapital.toFixed(2),
    totalBalance: snapshot.totalBalance.toFixed(2),
    dailyProfit: snapshot.dailyProfit.toFixed(2),
    monthlyProfit: snapshot.monthlyProfit.toFixed(2),
    activePositions: snapshot.activePositionsCount
  });
  
  return snapshot;
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Calcula o valor total alocado em posições e o PnL não realizado
 */
async function calculatePositionsValue(
  userId: string, 
  isDemo: boolean
): Promise<{ allocatedCapital: number; unrealizedPnL: number; positionsCount: number }> {
  const { data: positions } = await supabase
    .from('positions')
    .select('symbol, quantity, entry_price, current_price')
    .eq('user_id', userId)
    .eq('is_demo', isDemo);
  
  if (!positions || positions.length === 0) {
    return { allocatedCapital: 0, unrealizedPnL: 0, positionsCount: 0 };
  }
  
  let allocatedCapital = 0;
  let unrealizedPnL = 0;
  
  // Buscar preços atuais para todas as posições
  const positionsWithPrices = await enrichPositionsWithCurrentPrices(positions);
  
  for (const pos of positionsWithPrices) {
    const positionValue = pos.entry_price * pos.quantity;
    allocatedCapital += positionValue;
    
    if (pos.current_price) {
      const currentValue = pos.current_price * pos.quantity;
      unrealizedPnL += (currentValue - positionValue);
    }
  }
  
  console.log(`💼 [POSITIONS] Capital alocado: ${allocatedCapital.toFixed(2)} USDT em ${positions.length} posições`);
  console.log(`📈 [POSITIONS] PnL não realizado: ${unrealizedPnL.toFixed(2)} USDT`);
  
  return { 
    allocatedCapital: Math.abs(allocatedCapital), 
    unrealizedPnL, 
    positionsCount: positions.length 
  };
}

/**
 * Busca preços atuais da Binance para as posições
 */
async function enrichPositionsWithCurrentPrices(positions: Position[]): Promise<Position[]> {
  const symbols = [...new Set(positions.map(p => p.symbol))];
  
  try {
    const pricesPromises = symbols.map(async (symbol) => {
      const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      return { symbol, price: parseFloat(data.price) };
    });
    
    const prices = await Promise.all(pricesPromises);
    const priceMap = new Map(prices.map(p => [p.symbol, p.price]));
    
    return positions.map(pos => ({
      ...pos,
      current_price: priceMap.get(pos.symbol) || pos.current_price || pos.entry_price
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar preços atuais:', error);
    return positions.map(pos => ({
      ...pos,
      current_price: pos.current_price || pos.entry_price
    }));
  }
}

/**
 * Calcula o PnL realizado (trades fechadas) do dia
 */
async function calculateRealizedPnL(userId: string, isDemo: boolean): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: trades } = await supabase
    .from('trades')
    .select('profit_loss')
    .eq('user_id', userId)
    .eq('is_demo', isDemo)
    .eq('status', 'FILLED')
    .gte('executed_at', `${today}T00:00:00`)
    .not('profit_loss', 'is', null);
  
  const realizedPnL = trades?.reduce((sum, trade) => sum + (trade.profit_loss || 0), 0) || 0;
  
  console.log(`💰 [PNL REALIZADO] ${realizedPnL.toFixed(2)} USDT (${trades?.length || 0} trades fechadas)`);
  
  return realizedPnL;
}

/**
 * Calcula o lucro mensal
 */
async function calculateMonthlyProfit(
  userId: string,
  currentTotalBalance: number,
  isDemo: boolean,
  settings: any
): Promise<number> {
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);
  const monthStart = firstDayOfMonth.toISOString().split('T')[0];
  
  // Buscar o saldo inicial do primeiro dia do mês
  const { data: firstDayStats } = await supabase
    .from('bot_daily_stats')
    .select('starting_balance')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();
  
  let monthlyStartBalance: number;
  
  if (firstDayStats?.starting_balance) {
    monthlyStartBalance = firstDayStats.starting_balance;
  } else {
    // Se não há registro do início do mês, usar capital inicial
    monthlyStartBalance = settings?.initial_capital || 10000;
  }
  
  const monthlyProfit = currentTotalBalance - monthlyStartBalance;
  
  console.log(`📅 [LUCRO MENSAL] Início: ${monthlyStartBalance.toFixed(2)}, Atual: ${currentTotalBalance.toFixed(2)}, Lucro: ${monthlyProfit.toFixed(2)}`);
  
  return monthlyProfit;
}

// ============================================================================
// FUNÇÕES DE ATUALIZAÇÃO
// ============================================================================

/**
 * Atualiza o saldo nas estatísticas diárias
 * Deve ser chamado após cada trade
 */
export const updateDailyBalance = async (userId: string): Promise<void> => {
  const snapshot = await getFinancialSnapshot(userId);
  const today = new Date().toISOString().split('T')[0];
  
  const { error } = await supabase
    .from('bot_daily_stats')
    .update({
      current_balance: snapshot.totalBalance,
      profit_loss_percent: (snapshot.dailyProfit / snapshot.initialBalance) * 100,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('date', today)
    .eq('is_active', true);
  
  if (error) {
    console.error('❌ Erro ao atualizar daily stats:', error);
  } else {
    console.log('✅ Daily stats atualizado com saldo total:', snapshot.totalBalance.toFixed(2));
  }
};

/**
 * Atualiza o saldo demo nas configurações
 * Deve ser usado apenas para refletir o free balance após trades
 */
export const syncDemoBalanceToSettings = async (userId: string, freeBalance: number): Promise<void> => {
  const { error } = await supabase
    .from('trading_settings')
    .update({ demo_balance: freeBalance })
    .eq('user_id', userId);
  
  if (error) {
    console.error('❌ Erro ao sincronizar demo balance:', error);
  }
};
