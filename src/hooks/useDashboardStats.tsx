/**
 * Dashboard Stats Hook
 * 
 * Hook customizado que centraliza todas as estatísticas do dashboard
 * SRP: Responsável APENAS por gerenciar estado das estatísticas
 * SSOT: Usa dashboardStatsService como fonte única de verdade
 */

import { useState, useEffect } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import * as statsService from "@/services/dashboardStatsService";

export const useDashboardStats = () => {
  const { user } = useAuthContext();
  
  // Estados para cada estatística
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [dailyProfit, setDailyProfit] = useState<number>(0);
  const [dailyProfitPercent, setDailyProfitPercent] = useState<number>(0);
  const [monthlyProfit, setMonthlyProfit] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<number>(0);
  const [winRate, setWinRate] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Função para buscar todas as estatísticas
  const fetchAllStats = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Busca todas as estatísticas em paralelo para máxima eficiência
      const [
        initialBal,
        currentBal,
        dailyProf,
        dailyProfPercent,
        monthlyProf,
        positions,
        winRateValue,
      ] = await Promise.all([
        statsService.getInitialBalance(user.id),
        statsService.getCurrentBalance(user.id),
        statsService.getDailyProfit(user.id),
        statsService.getDailyProfitPercent(user.id),
        statsService.getMonthlyProfit(user.id),
        statsService.getActivePositionsCount(user.id),
        statsService.getWinRate(user.id),
      ]);

      setInitialBalance(initialBal);
      setCurrentBalance(currentBal);
      setDailyProfit(dailyProf);
      setDailyProfitPercent(dailyProfPercent);
      setMonthlyProfit(monthlyProf);
      setActivePositions(positions);
      setWinRate(winRateValue);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Carrega estatísticas na montagem e configura atualizações periódicas
  useEffect(() => {
    if (!user?.id) return;

    // Busca inicial
    fetchAllStats();

    // Configurar intervalos de atualização
    // Stats de posição/win rate atualizam menos frequentemente
    const statsInterval = setInterval(fetchAllStats, 30000); // 30s

    return () => {
      clearInterval(statsInterval);
    };
  }, [user?.id]);

  return {
    initialBalance,
    currentBalance,
    dailyProfit,
    dailyProfitPercent,
    monthlyProfit,
    activePositions,
    winRate,
    loading,
    refetch: fetchAllStats,
  };
};
