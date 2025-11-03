/**
 * Last Trading Round Component
 * 
 * SRP: Apenas exibe métricas da última rodada de trades
 * Lógica de negócio está em lastTradingRoundService
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
  RefreshCw,
  Clock
} from "lucide-react";
import { 
  getLastTradingRound,
  getRoundRecommendations,
  type TradingRoundMetrics 
} from "@/services/lastTradingRoundService";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const LastTradingRound = () => {
  const [metrics, setMetrics] = useState<TradingRoundMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const roundMetrics = await getLastTradingRound();
      setMetrics(roundMetrics);
    } catch (error) {
      console.error('Error loading last trading round:', error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar a última rodada de trades.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Atualizar a cada 30 segundos
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Carregando última rodada...</span>
        </div>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className="p-6">
        <div className="text-center py-8 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nenhum trade executado ainda</p>
          <p className="text-xs mt-1">Execute uma análise para ver os resultados aqui</p>
        </div>
      </Card>
    );
  }

  const recommendations = getRoundRecommendations(metrics);
  const isProfitable = metrics.totalPnL > 0;
  const winRate = (metrics.winningTrades / metrics.totalTrades) * 100;
  const isHealthy = winRate >= 50 && metrics.totalPnL > 0;

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Performance da Última Rodada</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <Clock className="h-3 w-3" />
            <span>
              {format(new Date(metrics.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
            <Badge variant="outline" className="ml-2">
              {metrics.totalTrades} {metrics.totalTrades === 1 ? 'trade' : 'trades'}
            </Badge>
          </div>
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
              Rodada lucrativa
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            <span className="text-sm font-medium text-yellow-500">
              Rodada precisa de atenção
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
              {winRate.toFixed(1)}%
            </span>
            <Badge variant={winRate >= 50 ? "default" : "destructive"}>
              {winRate >= 50 ? "Bom" : "Baixo"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics.winningTrades}W / {metrics.losingTrades}L
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
          <p className="text-xs text-muted-foreground">P&L Médio</p>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${metrics.avgPnL > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {metrics.avgPnL > 0 ? '+' : ''}{metrics.avgPnL.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">USDT/trade</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Maior Ganho/Perda</p>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-green-500">
                +{metrics.largestWin.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">USDT</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-red-500">
                -{metrics.largestLoss.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">USDT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detalhes dos Trades */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Detalhes das Operações</span>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {metrics.trades.map((trade) => {
            const pnl = trade.profit_loss || 0;
            const isProfitableTrade = pnl > 0;
            
            return (
              <div 
                key={trade.id} 
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={trade.side === "BUY" ? "default" : "secondary"}>
                    {trade.side}
                  </Badge>
                  <div>
                    <p className="font-medium">{trade.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {trade.quantity} @ ${trade.price.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${isProfitableTrade ? 'text-green-500' : 'text-red-500'}`}>
                    {isProfitableTrade ? '+' : ''}{pnl.toFixed(2)} USDT
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(trade.executed_at || trade.created_at), "HH:mm:ss")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
    </Card>
  );
};
