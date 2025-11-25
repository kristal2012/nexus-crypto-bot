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
  Clock,
  AlertTriangle
} from "lucide-react";
import { 
  getLastTradingRound,
  type TradingRoundMetrics 
} from "@/services/lastTradingRoundService";
import { closeAllDemoPositions } from "@/services/demoAccountService";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const LastTradingRound = () => {
  const [metrics, setMetrics] = useState<TradingRoundMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const { user } = useAuthContext();
  const { settings } = useTradingSettings();
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

  const handleClosePositions = async () => {
    if (!user?.id) return;
    
    setClosing(true);
    try {
      await closeAllDemoPositions(user.id);
      await loadData(); // Recarregar dados após fechar posições
      
      toast({
        title: "Posições fechadas",
        description: "Todas as posições demo foram fechadas com sucesso",
      });
    } catch (error) {
      console.error('Error closing positions:', error);
      toast({
        title: "Erro ao fechar posições",
        description: error instanceof Error ? error.message : "Não foi possível fechar as posições",
        variant: "destructive"
      });
    } finally {
      setClosing(false);
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

  const isProfitable = metrics.totalPnL >= 0;
  const winRate = (metrics.winningTrades / metrics.totalTrades) * 100;
  const isHealthy = winRate >= 50 && isProfitable;
  const hasOpenPositions = metrics.trades.some(t => t.is_open_position);
  const isDemoMode = settings?.trading_mode === "DEMO";

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {hasOpenPositions ? 'Posições Abertas Atualmente' : 'Performance da Última Rodada'}
          </h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <Clock className="h-3 w-3" />
            <span>
              {format(new Date(metrics.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
            <Badge variant="outline" className="ml-2">
              {metrics.totalTrades} {metrics.totalTrades === 1 ? 'posição' : 'posições'}
            </Badge>
            {hasOpenPositions && (
              <Badge variant="outline" className="border-amber-500 text-amber-500">
                ● Aguardando fechamento
              </Badge>
            )}
          </div>
        </div>
        {hasOpenPositions && isDemoMode && (
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={handleClosePositions}
            disabled={closing}
          >
            <AlertCircle className={`h-4 w-4 mr-2 ${closing ? 'animate-spin' : ''}`} />
            Fechar Posições Abertas
          </Button>
        )}
      </div>

      {/* Status Geral */}
      <div className={`p-4 rounded-lg border-2 ${
        isHealthy 
          ? 'bg-green-500/10 border-green-500/50' 
          : 'bg-amber-500/10 border-amber-500/50'
      }`}>
        <div className="flex items-center gap-3">
          {isHealthy ? (
            <TrendingUp className="h-6 w-6 text-green-500" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          )}
          <div>
            <p className="text-sm text-muted-foreground">
              {hasOpenPositions ? 'Lucro Atual (Não Realizado)' : 'Status da Rodada'}
            </p>
            <p className={`font-bold ${isHealthy ? 'text-green-500' : 'text-amber-500'}`}>
              {hasOpenPositions 
                ? (isProfitable ? 'Em Lucro' : 'Em Perda Temporária')
                : (isHealthy ? 'Desempenho Positivo' : 'Necessita Atenção')
              }
            </p>
          </div>
        </div>
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
          <p className="text-xs text-muted-foreground">
            {hasOpenPositions ? 'P&L Não Realizado' : 'P&L Total'}
          </p>
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
          <p className="text-xs text-muted-foreground">
            USDT
            {hasOpenPositions && <span className="ml-1 text-amber-500">(provisório)</span>}
          </p>
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
          <span className="text-sm font-medium">
            {hasOpenPositions ? 'Posições Abertas' : 'Detalhes das Operações'}
          </span>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {metrics.trades.map((trade) => {
            const pnl = trade.is_open_position ? (trade.unrealized_pnl || 0) : (trade.profit_loss || 0);
            const isProfitableTrade = pnl >= 0;
            const pnlPercent = trade.is_open_position && trade.entry_price && trade.current_price
              ? ((trade.current_price - trade.entry_price) / trade.entry_price) * 100
              : 0;
            
            return (
              <div 
                key={trade.id} 
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm border-l-4"
                style={{ borderColor: isProfitableTrade ? 'rgb(34 197 94)' : 'rgb(239 68 68)' }}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={trade.side === "BUY" ? "default" : "secondary"}>
                        {trade.side}
                      </Badge>
                      <p className="font-medium">{trade.symbol}</p>
                      {trade.is_open_position && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-500">
                          ABERTA
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {trade.quantity.toFixed(4)} @ ${(trade.entry_price || trade.price).toFixed(4)}
                    </p>
                    {trade.is_open_position && trade.current_price && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Preço atual: ${trade.current_price.toFixed(4)}
                        <span className={`ml-2 font-medium ${pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                        </span>
                      </p>
                    )}
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
    </Card>
  );
};
