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
  LogOut,
  User
} from "lucide-react";
import cryptumLogo from "@/assets/cryptum-logo.png";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
// TradingConfig removido - ajustes agora são automáticos via adaptiveStrategyService
import { BinanceApiSettings } from "./BinanceApiSettings";
import { BinanceConnectionStatus } from "./BinanceConnectionStatus";

import { AIPrediction } from "./AIPrediction";
import { TradingModeToggle } from "./TradingModeToggle";
import { TradingModeSafetyIndicator } from "./TradingModeSafetyIndicator";
import { CircuitBreakerReset } from "./CircuitBreakerReset";
import { getCircuitBreakerStatus } from "@/services/tradeValidationService";
import { LastTradingRound } from "./LastTradingRound";

export const TradingDashboard = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [botActive, setBotActive] = useState(false);
  const [selectedPair, setSelectedPair] = useState("BNBUSDT");
  const [username, setUsername] = useState<string>("");
  const [bnbPrices, setBnbPrices] = useState<number[]>([]);
  const [dailyStats, setDailyStats] = useState<{
    starting_balance: number;
    current_balance: number;
    profit_loss_percent: number;
  } | null>(null);
  const [monthlyProfit, setMonthlyProfit] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<number>(0);
  const [winRate, setWinRate] = useState<number>(0);
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();
        
        if (data) {
          setUsername(data.username);
        }
      }
    };
    
    fetchProfile();
  }, [user]);

  useEffect(() => {
    const fetchDailyStats = async () => {
      if (user) {
        const { data } = await supabase
          .from("bot_daily_stats")
          .select("starting_balance, current_balance, profit_loss_percent")
          .eq("user_id", user.id)
          .eq("date", new Date().toISOString().split('T')[0])
          .single();
        
        if (data) {
          setDailyStats(data);
        }
      }
    };

    const fetchMonthlyProfit = async () => {
      if (user) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data } = await supabase
          .from("bot_daily_stats")
          .select("current_balance, starting_balance, date, updated_at")
          .eq("user_id", user.id)
          .gte("date", startOfMonth.toISOString().split('T')[0])
          .order("date", { ascending: true })
          .order("updated_at", { ascending: false });
        
        if (data && data.length > 0) {
          // Group by date and get the most recent record for each day
          const dailyRecords = new Map();
          data.forEach(record => {
            if (!dailyRecords.has(record.date)) {
              dailyRecords.set(record.date, record);
            }
          });
          
          const sortedDates = Array.from(dailyRecords.keys()).sort();
          const firstDayRecord = dailyRecords.get(sortedDates[0]);
          const lastDayRecord = dailyRecords.get(sortedDates[sortedDates.length - 1]);
          
          // Calculate monthly profit: current balance (today) - starting balance (first day of month)
          const firstDayBalance = firstDayRecord.starting_balance;
          const lastDayBalance = lastDayRecord.current_balance;
          setMonthlyProfit(lastDayBalance - firstDayBalance);
        } else {
          setMonthlyProfit(0);
        }
      }
    };

    const fetchActivePositions = async () => {
      if (user) {
        const { data } = await supabase
          .from("trades")
          .select("id", { count: 'exact' })
          .eq("user_id", user.id)
          .in("status", ["PENDING", "PARTIAL"]);
        
        if (data) {
          setActivePositions(data.length);
        }
      }
    };

    const fetchWinRate = async () => {
      if (user) {
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        const { data: allTrades } = await supabase
          .from("trades")
          .select("profit_loss")
          .eq("user_id", user.id)
          .eq("status", "FILLED")
          .gte("executed_at", twentyFourHoursAgo.toISOString());
        
        if (allTrades && allTrades.length > 0) {
          const winningTrades = allTrades.filter(trade => 
            trade.profit_loss !== null && trade.profit_loss > 0
          ).length;
          const rate = (winningTrades / allTrades.length) * 100;
          setWinRate(rate);
        }
      }
    };

    fetchDailyStats();
    fetchMonthlyProfit();
    fetchActivePositions();
    fetchWinRate();

    // Fetch circuit breaker status
    const fetchCircuitBreaker = async () => {
      const status = await getCircuitBreakerStatus();
      setCircuitBreakerStatus(status);
    };
    fetchCircuitBreaker();

    // Monitor positions for stop loss and take profit
    const monitorPositions = async () => {
      if (user) {
        try {
          await supabase.functions.invoke('monitor-positions');
        } catch (error) {
          console.error('Error monitoring positions:', error);
        }
      }
    };
    monitorPositions();

    const interval = setInterval(() => {
      fetchDailyStats();
      fetchMonthlyProfit();
      fetchActivePositions();
      fetchWinRate();
      fetchCircuitBreaker();
      monitorPositions(); // Monitor positions every 30 seconds
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <img 
            src={cryptumLogo} 
            alt="Cryptum Logo" 
            className="w-32 h-32 object-contain mx-auto mb-4 animate-pulse"
          />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img 
              src={cryptumLogo} 
              alt="Cryptum Logo" 
              className="w-24 h-24 object-contain"
            />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Cryptum 7.1</h1>
              <p className="text-muted-foreground text-sm">Trading Automatizado Inteligente</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{username || user.email}</span>
            </div>
            
            <Button
              onClick={() => setBotActive(!botActive)}
              variant={botActive ? "destructive" : "default"}
              size="lg"
              className="gap-2 shadow-glow"
            >
              {botActive ? (
                <>
                  <Pause className="w-5 h-5" />
                  Pausar Bot
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Iniciar Bot
                </>
              )}
            </Button>

            <Button
              onClick={signOut}
              variant="ghost"
              size="lg"
              className="gap-2"
            >
              <LogOut className="w-5 h-5" />
              Sair
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Saldo Inicial</span>
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              ${dailyStats?.starting_balance.toFixed(2) || "0.00"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Saldo do dia</p>
          </Card>

          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Lucro Total do Dia</span>
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              ${dailyStats ? (dailyStats.current_balance - dailyStats.starting_balance).toFixed(2) : "0.00"}
            </p>
            <p className="text-xs text-success mt-1">
              {dailyStats?.profit_loss_percent.toFixed(2)}% hoje
            </p>
          </Card>

          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Saldo Atual</span>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              ${dailyStats?.current_balance.toFixed(2) || "0.00"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Saldo atualizado</p>
          </Card>

          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Posições Ativas</span>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{activePositions}</p>
            <p className="text-xs text-muted-foreground mt-1">Trades abertos</p>
          </Card>

          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Taxa de Vitória</span>
              <Target className="w-4 h-4 text-warning" />
            </div>
            <p className="text-2xl font-bold text-foreground">{winRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Últimas 24h</p>
          </Card>

          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Lucro Acumulado no Mês</span>
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              ${monthlyProfit.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Lucro mensal</p>
          </Card>
        </div>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <LastTradingRound />
        </div>

        {/* Right Column - Config & Status */}
        <div className="space-y-6">
          <TradingModeSafetyIndicator />
          <CircuitBreakerReset currentStatus={circuitBreakerStatus} />
          <TradingModeToggle />
          <BinanceApiSettings />
          <BinanceConnectionStatus />
        </div>
      </div>
    </div>
  );
};
