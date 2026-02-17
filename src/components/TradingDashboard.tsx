/**
 * Trading Dashboard Component
 * 
 * SRP: Responsável APENAS pela apresentação visual do dashboard
 * Delega toda lógica de negócio para serviços e hooks customizados
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Target,
  BarChart3,
  Settings,
  Play,
  Pause,
  Wallet,
  Lock
} from "lucide-react";
import cryptumLogo from "@/assets/cryptum-logo.png";
import { BinanceApiSettings } from "./BinanceApiSettings";
import { BinanceConnectionStatus } from "./BinanceConnectionStatus";
import { TradingModeToggle } from "./TradingModeToggle";
import { TradingModeSafetyIndicator } from "./TradingModeSafetyIndicator";
import { CircuitBreakerReset } from "./CircuitBreakerReset";
import { getCircuitBreakerStatus } from "@/services/tradeValidationService";
import { LastTradingRound } from "./LastTradingRound";
import { useDashboardStats } from "@/hooks/useDashboardStats";

export const TradingDashboard = () => {
  const [botActive, setBotActive] = useState(false);
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState<any>(null);
  
  // Hook customizado que centraliza TODAS as estatísticas (SSOT)
  const {
    initialBalance,
    currentBalance,
    dailyProfit,
    dailyProfitPercent,
    monthlyProfit,
    activePositions,
    winRate,
    allocatedCapital,
    freeBalance,
    loading: statsLoading,
  } = useDashboardStats();

  // Circuit breaker check
  useEffect(() => {

    const checkCircuitBreaker = async () => {
      const status = await getCircuitBreakerStatus();
      setCircuitBreakerStatus(status);
    };

    checkCircuitBreaker();
    const cbInterval = setInterval(checkCircuitBreaker, 10000); // 10s

    return () => clearInterval(cbInterval);
  }, []);

  const isPositive = dailyProfitPercent >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={cryptumLogo} alt="Cryptum" className="h-12 w-12" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">CRYPTUM 7.1</h1>
            <p className="text-sm text-muted-foreground">Sistema de Trading Automatizado</p>
          </div>
        </div>
        
        {/* Bot Control Button */}
        <Button
          size="lg"
          variant={botActive ? "destructive" : "default"}
          onClick={() => setBotActive(!botActive)}
          className="gap-2"
        >
          {botActive ? (
            <>
              <Pause className="h-5 w-5" />
              Pausar Bot
            </>
          ) : (
            <>
              <Play className="h-5 w-5" />
              Iniciar Bot
            </>
          )}
        </Button>
      </div>

      {/* Safety Indicators */}
      <TradingModeSafetyIndicator />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Inicial</p>
              <p className="text-2xl font-bold">${initialBalance.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Saldo de referência</p>
            </div>
            <Target className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Atual</p>
              <p className="text-2xl font-bold">
                ${currentBalance.toFixed(2)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {isPositive ? (
                  <TrendingUp className="h-4 w-4 text-success" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
                <span className={`text-xs font-semibold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                  {isPositive ? '+' : ''}{dailyProfitPercent.toFixed(2)}%
                </span>
              </div>
            </div>
            <Activity className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Resultados do Dia</p>
              <p className={`text-2xl font-bold ${dailyProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                {dailyProfit >= 0 ? '+' : ''}${dailyProfit.toFixed(2)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {dailyProfit >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-success" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
                <span className={`text-xs font-semibold ${dailyProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {dailyProfit >= 0 ? 'Lucro' : 'Perda'}
                </span>
              </div>
            </div>
            <BarChart3 className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Resultados do Mês</p>
              <p className="text-2xl font-bold">
                ${Math.abs(monthlyProfit).toFixed(2)}
              </p>
              <Badge variant={monthlyProfit >= 0 ? "default" : "destructive"} className="mt-2">
                {monthlyProfit >= 0 ? "Lucro" : "Prejuízo"}
              </Badge>
            </div>
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Posições Ativas</p>
              <p className="text-2xl font-bold">{activePositions}</p>
              <p className="text-xs text-muted-foreground mt-1">Operações em andamento</p>
            </div>
            <BarChart3 className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold">{winRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-1">Taxa de acerto</p>
            </div>
            <Target className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Capital Alocado</p>
              <p className="text-2xl font-bold text-warning">${allocatedCapital.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Em posições abertas</p>
            </div>
            <Lock className="h-8 w-8 text-warning" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Disponível</p>
              <p className="text-2xl font-bold text-success">${freeBalance.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Livre para trading</p>
            </div>
            <Wallet className="h-8 w-8 text-success" />
          </div>
        </Card>
      </div>

      {/* Trading Mode Toggle */}
      <TradingModeToggle />

      {/* Last Trading Round */}
      <LastTradingRound />

      {/* Binance Connection Status */}
      <BinanceConnectionStatus />

      {/* Circuit Breaker Reset */}
      {circuitBreakerStatus && !circuitBreakerStatus.isValid && (
        <CircuitBreakerReset />
      )}

      {/* Binance API Settings */}
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Configurações da API</h2>
          </div>
          <BinanceApiSettings />
        </div>
      </Card>
    </div>
  );
};
