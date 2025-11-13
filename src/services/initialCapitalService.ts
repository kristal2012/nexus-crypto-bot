/**
 * Initial Capital Service
 * 
 * SRP: Responsável APENAS por gerenciar o capital inicial da conta
 * O capital inicial representa o saldo de partida e só deve ser alterado
 * quando houver novos aportes ou quando o usuário resetar o saldo demo
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Obtém o capital inicial do usuário
 */
export const getInitialCapital = async (): Promise<number> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("trading_settings")
    .select("initial_capital")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("❌ Erro ao buscar capital inicial:", error);
    throw error;
  }

  return data?.initial_capital || 10000;
};

/**
 * Atualiza o capital inicial
 * Deve ser chamado apenas quando:
 * 1. Usuário faz novo aporte na conta real
 * 2. Usuário altera o saldo demo (que representa o capital inicial em modo demo)
 */
export const updateInitialCapital = async (newCapital: number): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from("trading_settings")
    .update({ initial_capital: newCapital })
    .eq("user_id", user.id);

  if (error) {
    console.error("❌ Erro ao atualizar capital inicial:", error);
    throw error;
  }

  console.log(`✅ Capital inicial atualizado: ${newCapital} USDT`);
};

export const initialCapitalService = {
  getInitialCapital,
  updateInitialCapital,
};
