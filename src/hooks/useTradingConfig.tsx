/**
 * Trading Config Hook
 * 
 * SRP: Hook customizado para acessar configurações de trading (SSOT)
 * Encapsula a lógica de busca e atualização de configurações
 */

import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { getTradingConfig, updateTradingConfig, type TradingConfig } from "@/services/tradingConfigService";

export const useTradingConfig = () => {
  const [config, setConfig] = useState<TradingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchConfig = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getTradingConfig(user.id);
      setConfig(data);
    } catch (error) {
      console.error('Error fetching trading config:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [user?.id]);

  const updateConfig = async (updates: Partial<Omit<TradingConfig, 'lastAnalysisAt'>>) => {
    if (!user?.id) return false;

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

    const success = await updateTradingConfig(user.id, finalUpdates);
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
