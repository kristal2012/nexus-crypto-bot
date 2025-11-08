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

  // Verifica se há ajustes reais pendentes
  const hasRealAdjustments = (suggestedAdjustments: any): boolean => {
    if (!suggestedAdjustments) return false;
    const keys = Object.keys(suggestedAdjustments);
    // Ignora strategy_adjusted_at na contagem
    const adjustmentKeys = keys.filter(k => k !== 'strategy_adjusted_at');
    return adjustmentKeys.length > 0;
  };

  // Verifica se os ajustes já foram aplicados
  const areAdjustmentsApplied = (
    currentConfig: any,
    suggestedAdjustments: any
  ): boolean => {
    if (!hasRealAdjustments(suggestedAdjustments)) {
      return true; // Sem ajustes = considera aplicado
    }

    // Verifica cada ajuste sugerido
    for (const key in suggestedAdjustments) {
      if (key === 'strategy_adjusted_at') continue;
      
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
      if (!config) return;

      try {
        // SOLUÇÃO DEFINITIVA: Período de estabilização de 72h após qualquer ajuste
        if (config.strategy_adjusted_at) {
          const timeSinceAdjustment = Date.now() - new Date(config.strategy_adjusted_at).getTime();
          const stabilizationPeriod = 72 * 60 * 60 * 1000; // 72h

          if (timeSinceAdjustment < stabilizationPeriod) {
            const hoursRemaining = ((stabilizationPeriod - timeSinceAdjustment) / (60 * 60 * 1000)).toFixed(1);
            console.log(`⏳ Período de estabilização ativo: ${hoursRemaining}h restantes`);
            setSuggestions(null);
            setMetrics(null);
            return;
          }
        }

        // SOLUÇÃO DEFINITIVA: Buscar trades APÓS o último ajuste (ou últimos 7 dias se nunca ajustou)
        const analysisStartDate = config.strategy_adjusted_at 
          ? new Date(config.strategy_adjusted_at).toISOString()
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        console.log(`📊 Analisando trades desde: ${analysisStartDate} ${config.strategy_adjusted_at ? '(após ajuste)' : '(últimos 7 dias)'}`);

        const { data: trades, error } = await supabase
          .from('trades')
          .select('profit_loss, created_at')
          .gte('created_at', analysisStartDate)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // SOLUÇÃO DEFINITIVA: Mínimo de 10 trades para análise válida
        if (!trades || trades.length < 10) {
          console.log(`📉 Trades insuficientes para análise: ${trades?.length || 0}/10`);
          setSuggestions(null);
          setMetrics(null);
          return;
        }

        const totalTrades = trades.length;
        const winningTrades = trades.filter(t => Number(t.profit_loss) > 0).length;
        const losingTrades = trades.filter(t => Number(t.profit_loss) < 0).length;
        const totalProfitLoss = trades.reduce((sum, t) => sum + Number(t.profit_loss), 0);
        const winRate = (winningTrades / totalTrades) * 100;

        console.log(`📈 Métricas: ${totalTrades} trades | Win Rate: ${winRate.toFixed(1)}% | P&L: ${totalProfitLoss.toFixed(2)} USDT`);

        const calculatedMetrics: TradeMetrics = {
          totalTrades,
          winningTrades,
          losingTrades,
          totalProfitLoss,
          avgProfitLoss: totalProfitLoss / totalTrades,
        };

        setMetrics(calculatedMetrics);

        const result = getSuggestedStrategyAdjustments(calculatedMetrics, {
          stopLoss: Number(config.stopLoss),
          takeProfit: Number(config.takeProfit),
          leverage: Number(config.leverage),
          minConfidence: Number(config.minConfidence),
        });

        // SOLUÇÃO DEFINITIVA: Se não há ajustes reais, não mostrar nada
        if (!hasRealAdjustments(result.adjustments)) {
          console.log('✨ Configuração atual está ótima - sem ajustes necessários');
          setSuggestions(null);
          return;
        }

        console.log('💡 Ajustes sugeridos:', result.adjustments);

        // SOLUÇÃO DEFINITIVA: Verifica se os ajustes já foram aplicados
        const adjustmentsApplied = areAdjustmentsApplied(config, result.adjustments);
        console.log('✅ Ajustes já aplicados:', adjustmentsApplied);

        // Só mostra sugestões se há ajustes reais E eles não foram aplicados
        if (result.suggestions.length > 0 && !adjustmentsApplied) {
          console.log('🔔 Exibindo sugestões de ajuste');
          setSuggestions(result);
        } else {
          console.log('✨ Configuração já está otimizada');
          setSuggestions(null);
        }
      } catch (error) {
        console.error('Erro ao carregar sugestões de ajuste:', error);
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
