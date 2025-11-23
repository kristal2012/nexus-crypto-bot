/**
 * Demo Account Service
 * 
 * SRP: Gerencia exclusivamente operações da conta demo
 * SSOT: Centraliza toda lógica de reset e configuração demo
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Reseta completamente a conta demo para um novo saldo inicial
 * Limpa posições, trades e reseta o initial_capital para zerar lucro mensal
 */
export const resetDemoAccount = async (
  userId: string,
  newBalance: number = 10000
): Promise<void> => {
  console.log(`🔄 [RESET DEMO] Iniciando reset para userId: ${userId}, novo saldo: $${newBalance}`);
  
  // Atualiza demo_balance e initial_capital simultaneamente
  const { error: settingsError } = await supabase
    .from("trading_settings")
    .update({
      demo_balance: newBalance,
      initial_capital: newBalance, // Zera o lucro mensal
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (settingsError) {
    console.error("❌ [RESET DEMO] Erro ao atualizar trading_settings:", settingsError);
    throw settingsError;
  }
  console.log("✅ [RESET DEMO] trading_settings atualizado");

  // Limpa posições demo abertas
  const { error: positionsError } = await supabase
    .from("positions")
    .delete()
    .eq("user_id", userId)
    .eq("is_demo", true);

  if (positionsError) {
    console.error("❌ [RESET DEMO] Erro ao limpar posições demo:", positionsError);
  } else {
    console.log("✅ [RESET DEMO] Posições demo limpas");
  }

  // Limpa histórico de trades demo
  const { error: tradesError } = await supabase
    .from("trades")
    .delete()
    .eq("user_id", userId)
    .eq("is_demo", true);

  if (tradesError) {
    console.error("❌ [RESET DEMO] Erro ao limpar trades demo:", tradesError);
  } else {
    console.log("✅ [RESET DEMO] Trades demo limpos");
  }

  // Atualiza ou recria estatísticas do dia atual com o novo saldo
  const today = new Date().toISOString().split('T')[0];
  console.log(`📊 [RESET DEMO] Atualizando bot_daily_stats para hoje (${today})`);
  
  // Primeiro, tenta atualizar o registro de hoje se existir
  const { error: updateError } = await supabase
    .from("bot_daily_stats")
    .update({
      starting_balance: newBalance,
      current_balance: newBalance,
      profit_loss_percent: 0,
      trades_count: 0,
      can_trade: true,
      stop_reason: null,
    })
    .eq("user_id", userId)
    .eq("date", today);

  if (updateError) {
    console.error("❌ [RESET DEMO] Erro ao atualizar estatísticas do dia:", updateError);
  } else {
    console.log("✅ [RESET DEMO] bot_daily_stats do dia atual atualizado");
  }

  // Deleta estatísticas de dias anteriores
  const { error: deleteError } = await supabase
    .from("bot_daily_stats")
    .delete()
    .eq("user_id", userId)
    .neq("date", today);

  if (deleteError) {
    console.error("❌ [RESET DEMO] Erro ao limpar estatísticas antigas:", deleteError);
  } else {
    console.log("✅ [RESET DEMO] Estatísticas antigas limpas");
  }
  
  console.log("🎉 [RESET DEMO] Reset concluído com sucesso!");
};

/**
 * Atualiza apenas o saldo demo sem resetar histórico
 */
export const updateDemoBalance = async (
  userId: string,
  newBalance: number
): Promise<void> => {
  const { error } = await supabase
    .from("trading_settings")
    .update({
      demo_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw error;
};
