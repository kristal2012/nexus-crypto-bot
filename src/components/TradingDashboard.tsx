import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Target,
  BarChart3,
  Settings,
  Play,
  Pause,
  LogOut,
  User
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BotStatus } from "./BotStatus";
import { TradingConfig } from "./TradingConfig";
import { PositionCard } from "./PositionCard";
import { MarketPrice } from "./MarketPrice";

export const TradingDashboard = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [botActive, setBotActive] = useState(false);
  const [selectedPair, setSelectedPair] = useState("BTCUSDT");
  const [username, setUsername] = useState<string>("");

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow mx-auto mb-4 animate-pulse">
            <Zap className="w-8 h-8 text-primary-foreground" />
          </div>
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
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Zap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">SnappBot Pro</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Lucro Total</span>
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <p className="text-2xl font-bold text-foreground">$435.53</p>
            <p className="text-xs text-success mt-1">+12.4% hoje</p>
          </Card>

          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Posições Ativas</span>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">2</p>
            <p className="text-xs text-muted-foreground mt-1">3 pares ativos</p>
          </Card>

          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Win Rate</span>
              <Target className="w-4 h-4 text-warning" />
            </div>
            <p className="text-2xl font-bold text-foreground">68.5%</p>
            <p className="text-xs text-muted-foreground mt-1">Últimas 24h</p>
          </Card>

          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Volume</span>
              <BarChart3 className="w-4 h-4 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">$12.8K</p>
            <p className="text-xs text-muted-foreground mt-1">Volume do dia</p>
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
          <TradingConfig />
        </div>
      </div>
    </div>
  );
};
