/**
 * Trading Config Hook
 * 
 * SRP: Hook customizado para acessar configurações de trading (SSOT)
 * Encapsula a lógica de busca e atualização de configurações
 */

import { useState, useEffect } from "react";
import { getTradingConfig, updateTradingConfig, type TradingConfig } from "@/services/tradingConfigService";
import { FIXED_USER_ID } from "@/config/userConfig";

export const useTradingConfig = () => {
  const [config, setConfig] = useState<TradingConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = async () => {
    
    setLoading(true);
    try {
      const data = await getTradingConfig(FIXED_USER_ID);
      setConfig(data);
    } catch (error) {
      console.error('Error fetching trading config:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const updateConfig = async (updates: Partial<Omit<TradingConfig, 'lastAnalysisAt'>>) => {

    // SOLUÇÃO DEFINITIVA: Sempre atualizar strategy_adjusted_at quando houver mudanças em configurações de estratégia
    const hasStrategyChanges = 
      updates.stopLoss !== undefined ||
      updates.takeProfit !== undefined ||
      updates.leverage !== undefined ||
      updates.minConfidence !== undefined;

    const finalUpdates = hasStrategyChanges && !updates.strategy_adjusted_at
      ? { ...updates, strategy_adjusted_at: new Date().toISOString() }
      : updates;

    console.log('💾 Salvando configuração:', finalUpdates);

    const success = await updateTradingConfig(FIXED_USER_ID, finalUpdates);
    if (success) {
      await fetchConfig();
      if (hasStrategyChanges) {
        console.log('✅ Configuração de estratégia atualizada - timestamp resetado');
      }
    }
    return success;
  };

  return {
    config,
    loading,
    updateConfig,
    refetch: fetchConfig,
  };
};
