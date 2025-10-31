/**
 * Strategy Adjustment Suggestions Component
 * Princípios: SRP - Apenas exibe sugestões de ajuste
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lightbulb, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSuggestedStrategyAdjustments, type TradeMetrics } from "@/services/circuitBreakerService";
import { useTradingConfig } from "@/hooks/useTradingConfig";
import { useToast } from "@/hooks/use-toast";

export const StrategyAdjustmentSuggestions = () => {
  const [suggestions, setSuggestions] = useState<{ suggestions: string[]; adjustments: any } | null>(null);
  const [metrics, setMetrics] = useState<TradeMetrics | null>(null);
  const { config, updateConfig, loading: configLoading } = useTradingConfig();
  const { toast } = useToast();
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Buscar trades dos últimos 7 dias
        const { data: trades } = await supabase
          .from('trades')
          .select('profit_loss')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        if (!trades || trades.length < 10 || !config) return;

        const tradeMetrics: TradeMetrics = {
          totalTrades: trades.length,
          winningTrades: trades.filter(t => t.profit_loss && t.profit_loss > 0).length,
          losingTrades: trades.filter(t => t.profit_loss && t.profit_loss < 0).length,
          totalProfitLoss: trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0),
          avgProfitLoss: trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0) / trades.length,
        };

        setMetrics(tradeMetrics);

        const result = getSuggestedStrategyAdjustments(tradeMetrics, {
          stopLoss: Number(config.stopLoss),
          takeProfit: Number(config.takeProfit),
          leverage: config.leverage,
          minConfidence: Number(config.minConfidence),
        });

        if (result.suggestions.length > 0) {
          setSuggestions(result);
        }
      } catch (error) {
        console.error('Erro ao carregar sugestões:', error);
      }
    };

    loadData();
  }, [config]);

  const applyAdjustments = async () => {
    if (!suggestions?.adjustments || configLoading) return;

    setApplying(true);
    try {
      const success = await updateConfig(suggestions.adjustments);
      
      if (success) {
        toast({
          title: "✅ Ajustes aplicados",
          description: "Estratégia atualizada com os parâmetros sugeridos.",
        });
        setSuggestions(null);
      }
    } catch (error) {
      toast({
        title: "Erro ao aplicar ajustes",
        description: "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  if (!suggestions || !metrics) return null;

  const winRate = ((metrics.winningTrades / metrics.totalTrades) * 100).toFixed(1);

  return (
    <Card className="border-orange-200 dark:border-orange-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-orange-600" />
          <CardTitle className="text-orange-800 dark:text-orange-200">
            Ajustes Recomendados
          </CardTitle>
        </div>
        <CardDescription>
          Performance atual: {winRate}% win rate com {metrics.totalTrades} trades
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              {suggestions.suggestions.map((suggestion, idx) => (
                <div key={idx} className="text-sm">
                  • {suggestion}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>

        <Button 
          onClick={applyAdjustments} 
          disabled={applying}
          className="w-full"
        >
          {applying ? "Aplicando..." : "Aplicar Ajustes Automaticamente"}
        </Button>
      </CardContent>
    </Card>
  );
};
