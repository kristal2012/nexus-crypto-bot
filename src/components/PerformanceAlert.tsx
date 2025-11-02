/**
 * Performance Alert Component
 * 
 * SRP: Detecta performance crítica e sugere ajustes automáticos
 */

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, TrendingDown, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PerformanceMetrics {
  winRate: number;
  totalTrades: number;
  totalPnL: number;
  avgLoss: number;
  worstLoss: number;
}

export const PerformanceAlert = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 60000); // Atualizar a cada minuto
    return () => clearInterval(interval);
  }, []);

  const loadMetrics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: config } = await supabase
        .from('auto_trading_config')
        .select('strategy_adjusted_at')
        .eq('user_id', user.id)
        .single();

      const cutoffDate = config?.strategy_adjusted_at 
        ? new Date(config.strategy_adjusted_at).toISOString()
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: trades } = await supabase
        .from('trades')
        .select('profit_loss')
        .eq('user_id', user.id)
        .gte('executed_at', cutoffDate)
        .not('profit_loss', 'is', null);

      if (trades && trades.length > 0) {
        const winningTrades = trades.filter(t => t.profit_loss > 0).length;
        const totalPnL = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
        const losses = trades.filter(t => t.profit_loss < 0).map(t => t.profit_loss);
        const avgLoss = losses.length > 0 
          ? losses.reduce((sum, l) => sum + l, 0) / losses.length 
          : 0;
        const worstLoss = losses.length > 0 ? Math.min(...losses) : 0;

        setMetrics({
          winRate: (winningTrades / trades.length) * 100,
          totalTrades: trades.length,
          totalPnL,
          avgLoss,
          worstLoss,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    }
  };

  const applyOptimalSettings = async () => {
    setIsAdjusting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Configurações otimizadas baseadas na análise
      const optimalConfig = {
        take_profit: 5.0,  // Aumentar para 5% (melhor risco/retorno)
        stop_loss: 2.0,    // Reduzir para 2% (limitar perdas)
        min_confidence: 85, // Aumentar para 85% (filtrar sinais fracos)
        leverage: 3,       // Reduzir para 3x (menos risco)
        strategy_adjusted_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('auto_trading_config')
        .update(optimalConfig)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "✅ Configurações Otimizadas Aplicadas",
        description: "Take Profit: 5% | Stop Loss: 2% | Confiança: 85% | Alavancagem: 3x",
      });

      // Recarregar métricas após ajuste
      setTimeout(loadMetrics, 1000);
    } catch (error) {
      console.error('Erro ao aplicar configurações:', error);
      toast({
        title: "Erro ao Otimizar",
        description: "Não foi possível aplicar as configurações",
        variant: "destructive",
      });
    } finally {
      setIsAdjusting(false);
    }
  };

  // Mostrar alerta apenas se win rate < 30% e houver pelo menos 10 trades
  if (!metrics || metrics.winRate >= 30 || metrics.totalTrades < 10) {
    return null;
  }

  return (
    <Card className="border-destructive bg-destructive/5 p-6">
      <Alert variant="destructive" className="border-none bg-transparent p-0">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="text-lg font-bold mb-3">
          ⚠️ Performance Crítica Detectada
        </AlertTitle>
        <AlertDescription className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="p-3 bg-background rounded-lg">
              <div className="text-muted-foreground text-xs">Win Rate</div>
              <div className="text-lg font-bold text-destructive flex items-center gap-1">
                <TrendingDown className="w-4 h-4" />
                {metrics.winRate.toFixed(1)}%
              </div>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <div className="text-muted-foreground text-xs">Total Trades</div>
              <div className="text-lg font-bold">{metrics.totalTrades}</div>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <div className="text-muted-foreground text-xs">P&L Total</div>
              <div className="text-lg font-bold text-destructive">
                {metrics.totalPnL.toFixed(2)} USDT
              </div>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <div className="text-muted-foreground text-xs">Perda Média</div>
              <div className="text-lg font-bold text-destructive">
                {metrics.avgLoss.toFixed(2)} USDT
              </div>
            </div>
          </div>

          <div className="p-4 bg-background rounded-lg space-y-2">
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Ajustes Recomendados
            </h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>✅ <strong>Take Profit: 2% → 5%</strong> (melhor risco/retorno)</li>
              <li>✅ <strong>Stop Loss: 3% → 2%</strong> (limitar perdas)</li>
              <li>✅ <strong>Confiança Mínima: 80% → 85%</strong> (sinais mais fortes)</li>
              <li>✅ <strong>Alavancagem: 5x → 3x</strong> (reduzir risco)</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={applyOptimalSettings}
              disabled={isAdjusting}
              className="flex-1 bg-gradient-primary"
            >
              {isAdjusting ? "Aplicando..." : "Aplicar Ajustes Automáticos"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            💡 <strong>Por que essas mudanças?</strong> A relação atual de risco/retorno (3% stop / 2% target) 
            está causando mais perdas que ganhos. Com 5% target e 2% stop, você arrisca menos para ganhar mais.
          </p>
        </AlertDescription>
      </Alert>
    </Card>
  );
};
