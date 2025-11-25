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
  
  // PASSO 1 - Verificar estado atual do auto-trading
  const { data: configBefore, error: configCheckError } = await supabase
    .from("auto_trading_config")
    .select("is_active")
    .eq("user_id", userId)
    .single();

  if (configCheckError) {
    console.error("❌ [RESET DEMO] Erro ao verificar config:", configCheckError);
  }
  
  const wasActive = configBefore?.is_active || false;
  console.log(`📊 [RESET DEMO] Bot estava ${wasActive ? 'ATIVO' : 'INATIVO'} antes do reset`);
  
  // PASSO 2 - CRÍTICO: Pausar o auto-trading temporariamente
  console.log("⏸️ [RESET DEMO] Pausando auto-trading temporariamente...");
  const { error: pauseError } = await supabase
    .from("auto_trading_config")
    .update({ is_active: false })
    .eq("user_id", userId);

  if (pauseError) {
    console.error("❌ [RESET DEMO] Erro ao pausar auto-trading:", pauseError);
  } else {
    console.log("✅ [RESET DEMO] Auto-trading pausado");
  }
  
  // PASSO 3: Atualiza demo_balance e initial_capital simultaneamente
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

  // Verifica quantas posições demo existem antes de limpar
  const { data: existingPositions, error: checkError } = await supabase
    .from("positions")
    .select("id, symbol, quantity")
    .eq("user_id", userId)
    .eq("is_demo", true);

  if (checkError) {
    console.error("❌ [RESET DEMO] Erro ao verificar posições demo:", checkError);
  } else {
    console.log(`📍 [RESET DEMO] Encontradas ${existingPositions?.length || 0} posições demo para limpar`);
  }

  // Limpa TODAS as posições demo abertas do usuário
  const { error: positionsError } = await supabase
    .from("positions")
    .delete()
    .eq("user_id", userId)
    .eq("is_demo", true);

  if (positionsError) {
    console.error("❌ [RESET DEMO] Erro ao limpar posições demo:", positionsError);
    throw positionsError; // Lança erro para interromper o reset se falhar
  } else {
    console.log("✅ [RESET DEMO] Todas as posições demo foram removidas");
    
    // Verifica se realmente foram deletadas
    const { data: remainingPositions } = await supabase
      .from("positions")
      .select("id")
      .eq("user_id", userId)
      .eq("is_demo", true);
    
    if (remainingPositions && remainingPositions.length > 0) {
      console.error(`⚠️ [RESET DEMO] ATENÇÃO: Ainda existem ${remainingPositions.length} posições demo após o delete!`);
    } else {
      console.log("✅ [RESET DEMO] Verificação confirmada: nenhuma posição demo restante");
    }
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
  
  // PASSO FINAL - Reativar o bot se estava ativo antes
  if (wasActive) {
    console.log("🔄 [RESET DEMO] Reativando auto-trading...");
    const { error: reactivateError } = await supabase
      .from("auto_trading_config")
      .update({ is_active: true })
      .eq("user_id", userId);
    
    if (reactivateError) {
      console.error("❌ [RESET DEMO] Erro ao reativar auto-trading:", reactivateError);
      throw new Error("Falha ao reativar o bot após reset. Por favor, reative manualmente.");
    } else {
      console.log("✅ [RESET DEMO] Auto-trading reativado com sucesso");
    }
  } else {
    console.log("ℹ️ [RESET DEMO] Bot permanece inativo (estava inativo antes do reset)");
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
