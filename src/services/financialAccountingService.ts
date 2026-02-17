/**
 * Financial Accounting Service - VERSÃO 2.0
 * 
 * SSOT ABSOLUTO para contabilidade financeira
 * 
 * ARQUITETURA:
 * ============
 * 1. bot_daily_stats.current_balance = ÚNICA fonte de verdade para saldo total
 * 2. Posições abertas = Capital ALOCADO (não gasto, apenas reservado)
 * 3. Saldo Livre = current_balance - capital alocado
 * 
 * REGRAS CRÍTICAS:
 * ================
 * - Ao ABRIR posição (BUY): capital é ALOCADO, deduz apenas comissão
 * - Ao FECHAR posição (SELL): capital é LIBERADO + P&L realizado
 * - current_balance SEMPRE reflete: capital livre + capital alocado + PnL não realizado
 * 
 * ELIMINADO:
 * ==========
 * - Nunca mais usar demo_balance para cálculos (apenas histórico)
 * - Eliminada confusão entre "gasto" e "alocado"
 */

import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// INTERFACES
// ============================================================================

export interface FinancialSnapshot {
  // SSOT: Valor total atual (inclui tudo)
  totalBalance: number;              // = freeBalance + allocatedCapital + unrealizedPnL
  
  // Componentes do saldo
  freeBalance: number;               // Capital disponível para novas trades
  allocatedCapital: number;          // Capital em posições abertas
  unrealizedPnL: number;             // Lucro/prejuízo não realizado
  
  // Saldo inicial (referência fixa do dia)
  initialBalance: number;            // Saldo no início do dia
  
  // Lucros
  dailyProfit: number;               // totalBalance - initialBalance
  monthlyProfit: number;             // totalBalance - saldo início do mês
  
  // Metadados
  activePositionsCount: number;
  dailyTradesCount: number;
  isDemo: boolean;
}

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  entry_price: number;
  current_price: number | null;
  side: string;
}

// ============================================================================
// FUNÇÃO PRINCIPAL - SSOT
// ============================================================================

/**
 * Obtém snapshot financeiro completo
 * Esta é a ÚNICA função que deve ser usada para ler dados financeiros
 */
export const getFinancialSnapshot = async (userId: string): Promise<FinancialSnapshot> => {
  console.log('📊 [FINANCIAL V2] Calculando snapshot...');
  
  // 1. Modo de trading
  const { data: settings } = await supabase
    .from('trading_settings')
    .select('trading_mode')
    .eq('user_id', userId)
    .single();
  
  const isDemo = settings?.trading_mode === 'DEMO';
  
  // 2. Buscar estatísticas diárias - SSOT
  const today = new Date().toISOString().split('T')[0];
  const { data: dailyStats } = await supabase
    .from('bot_daily_stats')
    .select('starting_balance, current_balance, trades_count')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('is_active', true)
    .maybeSingle();
  
  if (!dailyStats) {
    throw new Error('Daily stats not found - cannot calculate financial snapshot');
  }
  
  // SSOT: current_balance é a verdade absoluta
  const currentBalance = dailyStats.current_balance;
  const initialBalance = dailyStats.starting_balance;
  
  // 3. Calcular capital alocado e PnL não realizado
  const { allocatedCapital, unrealizedPnL, positionsCount } = 
    await calculatePositionsValue(userId, isDemo);
  
  // 4. Calcular saldo livre
  // Saldo livre = Total - Capital alocado
  const freeBalance = currentBalance - allocatedCapital;
  
  // 5. Saldo total (recalculado para incluir PnL não realizado atualizado)
  const totalBalance = freeBalance + allocatedCapital + unrealizedPnL;
  
  // 6. Lucros
  const dailyProfit = totalBalance - initialBalance;
  const monthlyProfit = await calculateMonthlyProfit(userId, totalBalance);
  
  const snapshot: FinancialSnapshot = {
    totalBalance,
    freeBalance,
    allocatedCapital,
    unrealizedPnL,
    initialBalance,
    dailyProfit,
    monthlyProfit,
    activePositionsCount: positionsCount,
    dailyTradesCount: dailyStats.trades_count,
    isDemo
  };
  
  console.log('✅ [FINANCIAL V2] Snapshot:', {
    total: snapshot.totalBalance.toFixed(2),
    livre: snapshot.freeBalance.toFixed(2),
    alocado: snapshot.allocatedCapital.toFixed(2),
    pnl_nao_realizado: snapshot.unrealizedPnL.toFixed(2),
    lucro_dia: snapshot.dailyProfit.toFixed(2),
    posicoes: snapshot.activePositionsCount
  });
  
  return snapshot;
};

// ============================================================================
// CÁLCULOS
// ============================================================================

/**
 * Calcula capital alocado e PnL não realizado
 */
async function calculatePositionsValue(
  userId: string, 
  isDemo: boolean
): Promise<{ allocatedCapital: number; unrealizedPnL: number; positionsCount: number }> {
  
  const { data: positions } = await supabase
    .from('positions')
    .select('id, symbol, quantity, entry_price, current_price, side')
    .eq('user_id', userId)
    .eq('is_demo', isDemo);
  
  if (!positions || positions.length === 0) {
    return { allocatedCapital: 0, unrealizedPnL: 0, positionsCount: 0 };
  }
  
  // Buscar preços atuais da Binance
  const positionsWithPrices = await enrichPositionsWithCurrentPrices(positions);
  
  let allocatedCapital = 0;
  let unrealizedPnL = 0;
  
  for (const pos of positionsWithPrices) {
    // Capital alocado = preço de entrada × quantidade
    const positionCost = pos.entry_price * pos.quantity;
    allocatedCapital += positionCost;
    
    // PnL não realizado = (preço atual - preço entrada) × quantidade
    if (pos.current_price) {
      const pnl = (pos.current_price - pos.entry_price) * pos.quantity;
      unrealizedPnL += pnl;
      
      console.log(`  📍 ${pos.symbol}: ${pos.quantity.toFixed(4)} @ ${pos.entry_price.toFixed(4)} → ${pos.current_price.toFixed(4)} = ${pnl.toFixed(2)} USDT`);
    }
  }
  
  console.log(`💼 Capital alocado: ${allocatedCapital.toFixed(2)} USDT`);
  console.log(`📈 PnL não realizado: ${unrealizedPnL.toFixed(2)} USDT`);
  
  return { 
    allocatedCapital, 
    unrealizedPnL, 
    positionsCount: positions.length 
  };
}

/**
 * Busca preços atuais da Binance
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
      current_price: priceMap.get(pos.symbol) || pos.entry_price
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar preços:', error);
    return positions;
  }
}

/**
 * Calcula lucro mensal
 */
async function calculateMonthlyProfit(
  userId: string,
  currentTotalBalance: number
): Promise<number> {
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);
  const monthStart = firstDayOfMonth.toISOString().split('T')[0];
  
  const { data: firstDayStats } = await supabase
    .from('bot_daily_stats')
    .select('starting_balance')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();
  
  const monthlyStartBalance = firstDayStats?.starting_balance || 10000;
  const monthlyProfit = currentTotalBalance - monthlyStartBalance;
  
  console.log(`📅 Lucro mensal: ${currentTotalBalance.toFixed(2)} - ${monthlyStartBalance.toFixed(2)} = ${monthlyProfit.toFixed(2)}`);
  
  return monthlyProfit;
}

// ============================================================================
// GESTÃO DE POSIÇÕES E SALDOS
// ============================================================================

/**
 * Atualiza current_balance após trade
 * Chamado pelo edge function após cada operação
 */
export const updateBalanceAfterTrade = async (
  userId: string,
  tradeValue: number,
  commission: number,
  side: 'BUY' | 'SELL',
  profitLoss: number | null
): Promise<void> => {
  const today = new Date().toISOString().split('T')[0];
  
  // Buscar saldo atual
  const { data: stats } = await supabase
    .from('bot_daily_stats')
    .select('current_balance, starting_balance')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('is_active', true)
    .single();
  
  if (!stats) {
    console.error('❌ Daily stats não encontrado');
    return;
  }
  
  let newBalance = stats.current_balance;
  
  if (side === 'BUY') {
    // AO COMPRAR: Deduz apenas comissão (capital vai para "alocado")
    newBalance -= commission;
    console.log(`💳 BUY: Deduzindo comissão ${commission.toFixed(2)} USDT`);
  } else {
    // AO VENDER: Libera capital + adiciona P&L - comissão
    newBalance += (profitLoss || 0) - commission;
    console.log(`💰 SELL: P&L ${(profitLoss || 0).toFixed(2)} - comissão ${commission.toFixed(2)} USDT`);
  }
  
  // Atualizar current_balance
  const { error } = await supabase
    .from('bot_daily_stats')
    .update({
      current_balance: newBalance,
      profit_loss_percent: ((newBalance - stats.starting_balance) / stats.starting_balance) * 100,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('date', today)
    .eq('is_active', true);
  
  if (error) {
    console.error('❌ Erro ao atualizar saldo:', error);
  } else {
    console.log(`✅ Saldo atualizado: ${stats.current_balance.toFixed(2)} → ${newBalance.toFixed(2)} USDT`);
  }
};

/**
 * Sincroniza demo_balance (apenas para compatibilidade histórica)
 */
export const syncDemoBalance = async (userId: string): Promise<void> => {
  const snapshot = await getFinancialSnapshot(userId);
  
  // Atualiza demo_balance para refletir o saldo livre
  await supabase
    .from('trading_settings')
    .update({ demo_balance: snapshot.freeBalance })
    .eq('user_id', userId);
  
  console.log(`🔄 Demo balance sincronizado: ${snapshot.freeBalance.toFixed(2)} USDT`);
};
