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
  // Atualiza demo_balance e initial_capital simultaneamente
  const { error: settingsError } = await supabase
    .from("trading_settings")
    .update({
      demo_balance: newBalance,
      initial_capital: newBalance, // Zera o lucro mensal
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (settingsError) throw settingsError;

  // Limpa posições demo abertas
  const { error: positionsError } = await supabase
    .from("positions")
    .delete()
    .eq("user_id", userId)
    .eq("is_demo", true);

  if (positionsError) {
    console.error("Erro ao limpar posições demo:", positionsError);
  }

  // Limpa histórico de trades demo
  const { error: tradesError } = await supabase
    .from("trades")
    .delete()
    .eq("user_id", userId)
    .eq("is_demo", true);

  if (tradesError) {
    console.error("Erro ao limpar trades demo:", tradesError);
  }
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
