/**
 * Performance Monitor Component
 * 
 * SRP: Apenas exibe métricas de performance
 * Lógica de negócio está em performanceAnalysisService
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from "lucide-react";
import { 
  analyzeRecentPerformance, 
  getStrategyRecommendations,
  analyzeConfidenceAccuracy,
  type PerformanceMetrics 
} from "@/services/performanceAnalysisService";
import { useToast } from "@/hooks/use-toast";

export const PerformanceMonitor = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [confidenceAnalysis, setConfidenceAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [perfMetrics, confAnalysis] = await Promise.all([
        analyzeRecentPerformance(7),
        analyzeConfidenceAccuracy()
      ]);
      
      setMetrics(perfMetrics);
      setConfidenceAnalysis(confAnalysis);
    } catch (error) {
      console.error('Error loading performance data:', error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as métricas de performance.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Atualizar a cada minuto
    return () => clearInterval(interval);
  }, []);

  if (loading || !metrics) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Carregando métricas...</span>
        </div>
      </Card>
    );
  }

  const recommendations = getStrategyRecommendations(metrics);
  const isProfitable = metrics.totalPnL > 0;
  const isHealthy = metrics.winRate >= 50 && metrics.profitFactor >= 1.5;

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Performance dos Últimos 7 Dias</h3>
          <p className="text-sm text-muted-foreground">
            Análise automática de {metrics.totalTrades} trades
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Status Geral */}
      <div className="flex items-center gap-2">
        {isHealthy ? (
          <>
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-500">
              Sistema operando de forma saudável
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            <span className="text-sm font-medium text-yellow-500">
              Performance precisa de atenção
            </span>
          </>
        )}
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">
              {metrics.winRate.toFixed(1)}%
            </span>
            <Badge variant={metrics.winRate >= 50 ? "default" : "destructive"}>
              {metrics.winRate >= 50 ? "Bom" : "Baixo"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics.winningTrades}W / {metrics.losingTrades}L
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Profit Factor</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">
              {metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
            </span>
            <Badge variant={metrics.profitFactor >= 1.5 ? "default" : "secondary"}>
              {metrics.profitFactor >= 2 ? "Ótimo" : metrics.profitFactor >= 1.5 ? "Bom" : "Baixo"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Lucro / Perda
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">P&L Total</p>
          <div className="flex items-center gap-2">
            {isProfitable ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            <span className={`text-2xl font-bold ${isProfitable ? 'text-green-500' : 'text-red-500'}`}>
              {isProfitable ? '+' : ''}{metrics.totalPnL.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">USDT</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Avg Profit/Loss</p>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-green-500">
                +{metrics.avgProfit.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">USDT</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-red-500">
                -{metrics.avgLoss.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">USDT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Análise de Confidence */}
      {confidenceAnalysis && (
        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Precisão da IA</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Confidence Médio</p>
              <p className="font-semibold">{confidenceAnalysis.avgConfidence.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Retorno Real Médio</p>
              <p className={`font-semibold ${confidenceAnalysis.avgActualReturn > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {confidenceAnalysis.avgActualReturn > 0 ? '+' : ''}{confidenceAnalysis.avgActualReturn.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Confiabilidade</p>
              <p className="font-semibold">{confidenceAnalysis.confidenceReliability.toFixed(0)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Recomendações */}
      {recommendations.shouldAdjust && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">Recomendações de Ajuste</span>
          </div>
          <div className="space-y-2">
            {recommendations.recommendations.map((rec, index) => (
              <div key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-yellow-500 mt-0.5">•</span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
          {Object.keys(recommendations.suggestedChanges).length > 0 && (
            <div className="p-3 bg-primary/10 rounded-lg space-y-2">
              <p className="text-sm font-medium">Mudanças Sugeridas:</p>
              {recommendations.suggestedChanges.takeProfit && (
                <p className="text-sm">
                  • Take Profit: <span className="font-semibold">{recommendations.suggestedChanges.takeProfit}%</span>
                </p>
              )}
              {recommendations.suggestedChanges.stopLoss && (
                <p className="text-sm">
                  • Stop Loss: <span className="font-semibold">{recommendations.suggestedChanges.stopLoss}%</span>
                </p>
              )}
              {recommendations.suggestedChanges.minConfidence && (
                <p className="text-sm">
                  • Min Confidence: <span className="font-semibold">{recommendations.suggestedChanges.minConfidence}%</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mensagem quando não há trades */}
      {metrics.totalTrades === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nenhum trade executado nos últimos 7 dias</p>
          <p className="text-xs mt-1">Execute algumas análises para ver métricas de performance</p>
        </div>
      )}
    </Card>
  );
};
