/**
 * Balance Service
 * 
 * SSOT (Single Source of Truth) para gerenciamento de saldo
 * Segue SRP: responsável APENAS por determinar e retornar o saldo correto
 * baseado no modo de trading (DEMO ou REAL)
 */

import { supabase } from "@/integrations/supabase/client";
import { getTradingModeState, shouldExecuteInDemoMode } from "./tradingModeService";

export interface BalanceInfo {
  balance: number;
  isDemo: boolean;
  mode: "DEMO" | "REAL";
}

/**
 * Obtém o saldo atual do usuário respeitando o modo de trading
 * 
 * CRÍTICO: Em modo DEMO, NUNCA consulta a API da Binance
 * CRÍTICO: Em modo REAL, sempre consulta a API da Binance
 */
export const getCurrentBalance = async (): Promise<BalanceInfo> => {
  const modeState = await getTradingModeState();

  // MODO DEMO: Usar apenas o saldo virtual da tabela trading_settings
  if (shouldExecuteInDemoMode(modeState)) {
    const demoBalance = modeState?.demoBalance || 1000;
    console.log(`💰 [DEMO MODE] Using virtual balance: ${demoBalance} USDT`);

    return {
      balance: demoBalance,
      isDemo: true,
      mode: "DEMO"
    };
  }

  // MODO REAL: Consultar saldo real da Binance via edge function
  console.log("💰 [REAL MODE] Fetching actual Binance balance...");

  const { data, error } = await supabase.functions.invoke('binance-account');

  if (error) {
    console.error("❌ Error fetching Binance balance:", error);
    throw new Error(`Falha ao buscar saldo da Binance: ${error.message}`);
  }

  if (!data?.success || !data?.account?.totalWalletBalance) {
    throw new Error("Saldo da Binance não disponível");
  }

  const realBalance = parseFloat(data.account.totalWalletBalance);
  console.log(`💰 [REAL MODE] Binance balance: ${realBalance} USDT`);

  return {
    balance: realBalance,
    isDemo: false,
    mode: "REAL"
  };
};

/**
 * Atualiza o saldo demo após uma operação
 * Lança erro se chamado em modo REAL
 */
export const updateDemoBalance = async (newBalance: number): Promise<void> => {
  const modeState = await getTradingModeState();

  if (!shouldExecuteInDemoMode(modeState)) {
    throw new Error("ERRO CRÍTICO: Tentativa de atualizar saldo DEMO em modo REAL");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await (supabase as any)
    .from("trading_settings")
    .update({ demo_balance: newBalance })
    .eq("user_id", user.id);

  if (error) {
    console.error("❌ Error updating demo balance:", error);
    throw error;
  }

  console.log(`✅ Demo balance updated: ${newBalance} USDT`);
};

export const balanceService = {
  getCurrentBalance,
  updateDemoBalance,
};
