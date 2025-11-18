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
  Pause
} from "lucide-react";
import cryptumLogo from "@/assets/cryptum-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { BinanceApiSettings } from "./BinanceApiSettings";
import { BinanceConnectionStatus } from "./BinanceConnectionStatus";
import { TradingModeToggle } from "./TradingModeToggle";
import { TradingModeSafetyIndicator } from "./TradingModeSafetyIndicator";
import { CircuitBreakerReset } from "./CircuitBreakerReset";
import { getCircuitBreakerStatus } from "@/services/tradeValidationService";
import { LastTradingRound } from "./LastTradingRound";
import { useAuthContext } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export const TradingDashboard = () => {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [botActive, setBotActive] = useState(false);
  const [selectedPair, setSelectedPair] = useState("BNBUSDT");
  const [bnbPrices, setBnbPrices] = useState<number[]>([]);
  const [dailyStats, setDailyStats] = useState<{
    starting_balance: number;
    current_balance: number;
    profit_loss_percent: number;
  } | null>(null);
  const [initialCapital, setInitialCapital] = useState<number>(0);
  const [dailyProfit, setDailyProfit] = useState<number>(0);
  const [monthlyProfit, setMonthlyProfit] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<number>(0);
  const [winRate, setWinRate] = useState<number>(0);
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState<any>(null);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  // Busca o capital inicial do usuário (SSOT: initial_capital é imutável)
  useEffect(() => {
    if (!user?.id) return;
    
    const fetchInitialCapital = async () => {
      try {
        const { data, error } = await supabase
          .from('trading_settings')
          .select('initial_capital, demo_balance')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching initial capital:', error);
          return;
        }

        if (data) {
          // initial_capital é o valor inicial da conta (imutável)
          // demo_balance é o saldo atual (mutável após trades)
          const capital = typeof data.initial_capital === 'string' 
            ? parseFloat(data.initial_capital) 
            : data.initial_capital;
          setInitialCapital(capital);
        }
      } catch (error) {
        console.error('Error in fetchInitialCapital:', error);
      }
    };

    fetchInitialCapital();
  }, [user?.id]);

  // Busca o lucro do dia atual
  useEffect(() => {
    if (!user?.id) return;

    const fetchDailyProfit = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
          .from('trades')
          .select('profit_loss')
          .eq('user_id', user.id)
          .gte('executed_at', today)
          .eq('status', 'FILLED');

        if (error) {
          console.error('Error fetching daily profit:', error);
          return;
        }

        if (data) {
          const totalProfit = data.reduce((sum, trade) => {
            const pl = typeof trade.profit_loss === 'string' 
              ? parseFloat(trade.profit_loss) 
              : trade.profit_loss || 0;
            return sum + pl;
          }, 0);
          setDailyProfit(totalProfit);
        }
      } catch (error) {
        console.error('Error in fetchDailyProfit:', error);
      }
    };

    fetchDailyProfit();

    // Atualiza a cada 30 segundos
    const interval = setInterval(fetchDailyProfit, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    
    const fetchDailyStats = async () => {
      const { data } = await supabase
        .from("bot_daily_stats")
        .select("starting_balance, current_balance, profit_loss_percent")
        .eq("user_id", user.id)
        .eq("date", new Date().toISOString().split('T')[0])
        .single();
      
      if (data) {
        setDailyStats(data);
      }
    };

    const fetchMonthlyProfit = async () => {
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
        const groupedByDate = data.reduce((acc: any, record: any) => {
          const date = record.date;
          if (!acc[date] || new Date(record.updated_at) > new Date(acc[date].updated_at)) {
            acc[date] = record;
          }
          return acc;
        }, {});

        const latestRecords = Object.values(groupedByDate);
        
        // Sort by date ascending
        const sortedRecords = (latestRecords as any[]).sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Get first and last records
        const firstBalance = sortedRecords[0].starting_balance;
        const lastBalance = sortedRecords[sortedRecords.length - 1].current_balance;
        const monthlyProfit = lastBalance - firstBalance;
        
        setMonthlyProfit(monthlyProfit);
      }
    };

    const fetchPositions = async () => {
      try {
        const { data, error } = await supabase
          .from("positions")
          .select("*", { count: 'exact' })
          .eq("user_id", user.id);
        
        if (!error && data) {
          setActivePositions(data.length);
        } else {
          setActivePositions(0);
        }
      } catch (error) {
        console.error("Error fetching positions:", error);
        setActivePositions(0);
      }
    };

    const fetchWinRate = async () => {
      try {
        const { data, error } = await supabase
          .from("trades")
          .select("profit_loss")
          .eq("user_id", user.id)
          .eq("status", "FILLED");
        
        if (!error && data && data.length > 0) {
          const wins = data.filter((t: any) => t.profit_loss && t.profit_loss > 0).length;
          const winRate = (wins / data.length) * 100;
          setWinRate(winRate);
        } else {
          setWinRate(0);
        }
      } catch (error) {
        console.error("Error fetching win rate:", error);
        setWinRate(0);
      }
    };

    const checkCircuitBreaker = async () => {
      const status = await getCircuitBreakerStatus();
      setCircuitBreakerStatus(status);
    };

    // Initial fetches
    fetchDailyStats();
    fetchMonthlyProfit();
    fetchPositions();
    fetchWinRate();
    checkCircuitBreaker();

    // Set up intervals
    const statsInterval = setInterval(fetchDailyStats, 5000); // 5s
    const monthlyInterval = setInterval(fetchMonthlyProfit, 60000); // 1min
    const positionsInterval = setInterval(fetchPositions, 10000); // 10s
    const winRateInterval = setInterval(fetchWinRate, 30000); // 30s
    const cbInterval = setInterval(checkCircuitBreaker, 10000); // 10s

    return () => {
      clearInterval(statsInterval);
      clearInterval(monthlyInterval);
      clearInterval(positionsInterval);
      clearInterval(winRateInterval);
      clearInterval(cbInterval);
    };
  }, [user?.id]);

  useEffect(() => {
    // Simulate real-time price updates
    const priceInterval = setInterval(() => {
      const newPrice = 300 + Math.random() * 50;
      setBnbPrices(prev => [...prev.slice(-19), newPrice]);
    }, 2000);

    return () => clearInterval(priceInterval);
  }, []);

  const profitLossPercent = dailyStats?.profit_loss_percent || 0;
  const isPositive = profitLossPercent >= 0;

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Inicial</p>
              <p className="text-2xl font-bold">${initialCapital.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Capital inicial da conta</p>
            </div>
            <Target className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Atual</p>
              <p className="text-2xl font-bold">
                ${(dailyStats?.current_balance || initialCapital).toFixed(2)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {isPositive ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className={`text-xs font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{profitLossPercent.toFixed(2)}%
                </span>
              </div>
            </div>
            <Activity className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Lucro do Dia</p>
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
              <p className="text-sm text-muted-foreground">Lucro Mensal</p>
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
