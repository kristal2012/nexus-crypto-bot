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

  // Verifica se os ajustes já foram aplicados
  const areAdjustmentsApplied = (
    currentConfig: any,
    suggestedAdjustments: any
  ): boolean => {
    if (!suggestedAdjustments || Object.keys(suggestedAdjustments).length === 0) {
      return true;
    }

    // Verifica cada ajuste sugerido
    for (const key in suggestedAdjustments) {
      const suggested = suggestedAdjustments[key];
      const current = Number(currentConfig[key]);
      
      // Tolerância de 0.1 para comparação de valores numéricos
      if (Math.abs(current - suggested) > 0.1) {
        return false;
      }
    }
    
    return true;
  };

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

        // Verifica se os ajustes já foram aplicados
        const adjustmentsApplied = areAdjustmentsApplied(config, result.adjustments);
        
        // Verifica se strategy_adjusted_at é recente (últimas 48h)
        const isRecentlyAdjusted = config.strategy_adjusted_at && 
          (Date.now() - new Date(config.strategy_adjusted_at).getTime()) < 48 * 60 * 60 * 1000;

        if (result.suggestions.length > 0 && !adjustmentsApplied && !isRecentlyAdjusted) {
          setSuggestions(result);
        } else {
          setSuggestions(null);
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
      // Adicionar timestamp de ajuste para resetar circuit breaker
      const adjustmentsWithTimestamp = {
        ...suggestions.adjustments,
        strategy_adjusted_at: new Date().toISOString(),
      };
      
      const success = await updateConfig(adjustmentsWithTimestamp);
      
      if (success) {
        toast({
          title: "✅ Ajustes aplicados e Circuit Breaker resetado",
          description: "Estratégia atualizada. Sistema liberado para trading.",
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

  // Se tem métricas mas não tem sugestões = configuração está OK
  if (metrics && !suggestions) {
    const winRate = ((metrics.winningTrades / metrics.totalTrades) * 100).toFixed(1);
    
    return (
      <Card className="border-green-200 dark:border-green-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-green-600" />
            <CardTitle className="text-green-800 dark:text-green-200">
              ✅ Configurações Ajustadas
            </CardTitle>
          </div>
          <CardDescription>
            Performance atual: {winRate}% win rate com {metrics.totalTrades} trades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="border-green-200 dark:border-green-800">
            <AlertDescription className="text-green-700 dark:text-green-300">
              As configurações estão otimizadas com base na performance recente. 
              O sistema continuará monitorando e sugerirá novos ajustes se necessário.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

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
