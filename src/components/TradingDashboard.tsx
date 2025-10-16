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
import { BotStatus } from "./BotStatus";
import { TradingConfig } from "./TradingConfig";
import { PositionCard } from "./PositionCard";
import { MarketPrice } from "./MarketPrice";
import { BinanceApiSettings } from "./BinanceApiSettings";
import { AIPrediction } from "./AIPrediction";
import { AutoTradingControl } from "./AutoTradingControl";
import { TradingModeToggle } from "./TradingModeToggle";

export const TradingDashboard = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [botActive, setBotActive] = useState(false);
  const [selectedPair, setSelectedPair] = useState("BTCUSDT");
  const [username, setUsername] = useState<string>("");
  const [btcPrices, setBtcPrices] = useState<number[]>([]);
  const [dailyStats, setDailyStats] = useState<{
    starting_balance: number;
    current_balance: number;
    profit_loss_percent: number;
  } | null>(null);
  const [monthlyProfit, setMonthlyProfit] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<number>(0);
  const [winRate, setWinRate] = useState<number>(0);

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
          .select("current_balance, starting_balance")
          .eq("user_id", user.id)
          .gte("date", startOfMonth.toISOString().split('T')[0]);
        
        if (data && data.length > 0) {
          const firstDay = data[data.length - 1];
          const lastDay = data[0];
          const monthProfit = lastDay.current_balance - firstDay.starting_balance;
          setMonthlyProfit(monthProfit);
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

    const interval = setInterval(() => {
      fetchDailyStats();
      fetchMonthlyProfit();
      fetchActivePositions();
      fetchWinRate();
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

  const mockPositions: Array<{
    symbol: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    leverage: number;
    pnl: number;
    pnlPercent: number;
  }> = [
    {
      symbol: "BTCUSDT",
      side: "LONG",
      entryPrice: 43250.50,
      currentPrice: 43890.20,
      quantity: 0.05,
      leverage: 10,
      pnl: 319.85,
      pnlPercent: 1.48,
    },
    {
      symbol: "ETHUSDT",
      side: "SHORT",
      entryPrice: 2280.75,
      currentPrice: 2265.30,
      quantity: 0.5,
      leverage: 15,
      pnl: 115.68,
      pnlPercent: 0.68,
    },
  ];

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
        {/* Left Column - Positions */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">Posições Abertas</h2>
              <Badge variant="outline" className="border-primary text-primary">
                {mockPositions.length} ativas
              </Badge>
            </div>
            <div className="space-y-4">
              {mockPositions.map((position, idx) => (
                <PositionCard key={idx} position={position} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground mb-4">Preços em Tempo Real</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MarketPrice symbol="BTCUSDT" />
              <MarketPrice symbol="ETHUSDT" />
              <MarketPrice symbol="BNBUSDT" />
              <MarketPrice symbol="SOLUSDT" />
            </div>
          </div>
        </div>

        {/* Right Column - Config & Status */}
        <div className="space-y-6">
          <BotStatus active={botActive} />
          <TradingModeToggle />
          <AutoTradingControl />
          <AIPrediction
            symbol="BTCUSDT" 
            currentPrice={43890.20} 
            historicalPrices={btcPrices.length > 0 ? btcPrices : [43000, 43100, 43250, 43300, 43400, 43500, 43600, 43700, 43800, 43890, 43950, 43890]} 
          />
          <BinanceApiSettings />
          <TradingConfig />
        </div>
      </div>
    </div>
  );
};
