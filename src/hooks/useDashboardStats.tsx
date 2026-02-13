/**
 * Dashboard Stats Hook
 * 
 * Hook customizado que centraliza todas as estatísticas do dashboard
 * SRP: Responsável APENAS por gerenciar estado das estatísticas
 * SSOT: Usa dashboardStatsService como fonte única de verdade
 */

import { useState, useEffect } from "react";
import { FIXED_USER_ID } from "@/config/userConfig";
import * as statsService from "@/services/dashboardStatsService";

export const useDashboardStats = () => {
  
  // Estados para cada estatística
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [dailyProfit, setDailyProfit] = useState<number>(0);
  const [dailyProfitPercent, setDailyProfitPercent] = useState<number>(0);
  const [monthlyProfit, setMonthlyProfit] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<number>(0);
  const [winRate, setWinRate] = useState<number>(0);
  const [allocatedCapital, setAllocatedCapital] = useState<number>(0);
  const [freeBalance, setFreeBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Função para buscar todas as estatísticas
  const fetchAllStats = async () => {
    
    
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
        allocatedCap,
        freeBal,
      ] = await Promise.all([
        statsService.getInitialBalance(FIXED_USER_ID),
        statsService.getCurrentBalance(FIXED_USER_ID),
        statsService.getDailyProfit(FIXED_USER_ID),
        statsService.getDailyProfitPercent(FIXED_USER_ID),
        statsService.getMonthlyProfit(FIXED_USER_ID),
        statsService.getActivePositionsCount(FIXED_USER_ID),
        statsService.getWinRate(FIXED_USER_ID),
        statsService.getAllocatedCapital(FIXED_USER_ID),
        statsService.getFreeBalance(FIXED_USER_ID),
      ]);

      // Debug: Log dos valores recebidos para rastreamento
      console.log('[Dashboard Stats] Valores atualizados:', {
        initialBalance: initialBal,
        currentBalance: currentBal,
        dailyProfit: dailyProf,
        dailyProfitPercent: dailyProfPercent,
        monthlyProfit: monthlyProf,
        activePositions: positions,
        winRate: winRateValue,
        allocatedCapital: allocatedCap,
        freeBalance: freeBal
      });

      setInitialBalance(initialBal);
      setCurrentBalance(currentBal);
      setDailyProfit(dailyProf);
      setDailyProfitPercent(dailyProfPercent);
      setMonthlyProfit(monthlyProf);
      setActivePositions(positions);
      setWinRate(winRateValue);
      setAllocatedCapital(allocatedCap);
      setFreeBalance(freeBal);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Carrega estatísticas na montagem e configura atualizações periódicas
  useEffect(() => {

    // Busca inicial
    fetchAllStats();

    // Atualização mais frequente para dados mais frescos
    const statsInterval = setInterval(fetchAllStats, 10000); // 10s (reduzido de 30s)

    // Forçar re-fetch quando a janela voltar ao foco
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[Dashboard Stats] Tab ganhou foco, atualizando dados...');
        fetchAllStats();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(statsInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    initialBalance,
    currentBalance,
    dailyProfit,
    dailyProfitPercent,
    monthlyProfit,
    activePositions,
    winRate,
    allocatedCapital,
    freeBalance,
    loading,
    refetch: fetchAllStats,
  };
};
