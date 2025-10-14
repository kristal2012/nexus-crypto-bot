import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, TrendingUp, TrendingDown, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DailyStats {
  id: string;
  date: string;
  starting_balance: number;
  current_balance: number;
  profit_loss_percent: number;
  trades_count: number;
  can_trade: boolean;
  stop_reason: string | null;
}

export const AutoTradingControl = () => {
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-trading-status');
      
      if (error) throw error;
      
      setStats(data.stats);
    } catch (error) {
      console.error('Error fetching status:', error);
      toast({
        title: "Erro",
        description: "Falha ao buscar status do bot",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading || !stats) {
    return (
      <Card className="p-6 bg-gradient-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary animate-pulse" />
          <h3 className="text-lg font-bold text-foreground">Trading Automático</h3>
        </div>
        <p className="text-sm text-muted-foreground">Carregando status...</p>
      </Card>
    );
  }

  const profitLossColor = stats.profit_loss_percent >= 0 ? "text-success" : "text-destructive";
  const profitLossIcon = stats.profit_loss_percent >= 0 ? TrendingUp : TrendingDown;
  const ProfitLossIcon = profitLossIcon;

  // Calculate progress for take profit (0 to 10%)
  const takeProfitProgress = Math.min((stats.profit_loss_percent / 10) * 100, 100);
  // Calculate progress for stop loss (0 to -5%)
  const stopLossProgress = Math.min((Math.abs(stats.profit_loss_percent) / 5) * 100, 100);

  const progressValue = stats.profit_loss_percent >= 0 ? takeProfitProgress : stopLossProgress;
  const progressColor = stats.profit_loss_percent >= 0 ? "bg-success" : "bg-destructive";

  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`w-5 h-5 ${stats.can_trade ? 'text-success animate-pulse' : 'text-muted-foreground'}`} />
            <h3 className="text-lg font-bold text-foreground">Trading Automático 24/7</h3>
          </div>
          <Badge variant={stats.can_trade ? "default" : "secondary"}>
            {stats.can_trade ? "ATIVO" : "PAUSADO"}
          </Badge>
        </div>

        {/* Daily Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Balance Inicial</p>
            <p className="text-lg font-bold text-foreground">
              ${stats.starting_balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Balance Atual</p>
            <p className="text-lg font-bold text-foreground">
              ${stats.current_balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Profit/Loss */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ProfitLossIcon className={`w-4 h-4 ${profitLossColor}`} />
              <span className="text-sm text-muted-foreground">P&L Hoje</span>
            </div>
            <span className={`text-xl font-bold ${profitLossColor}`}>
              {stats.profit_loss_percent >= 0 ? '+' : ''}{stats.profit_loss_percent.toFixed(2)}%
            </span>
          </div>
          <Progress value={progressValue} className={`h-2 ${progressColor}`} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Stop Loss: -5%</span>
            <span>Take Profit: +10%</span>
          </div>
        </div>

        {/* Trades Count */}
        <div className="flex items-center justify-between py-2 border-t border-border">
          <span className="text-sm text-muted-foreground">Trades Hoje</span>
          <span className="text-sm font-bold text-foreground">{stats.trades_count}</span>
        </div>

        {/* Stop Reason */}
        {!stats.can_trade && stats.stop_reason && (
          <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
            <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Trading Pausado</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.stop_reason}</p>
            </div>
          </div>
        )}

        {/* Next Reset */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Reinício automático à meia-noite (00:00 UTC)</span>
        </div>
      </div>
    </Card>
  );
};
