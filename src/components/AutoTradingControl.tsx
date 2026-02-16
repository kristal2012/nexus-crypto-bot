import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FIXED_USER_ID } from "@/config/userConfig";
import { executeAutoTradeAnalysis, AutoTradeError } from "@/services/autoTradeService";
import { useTradingConfig } from "@/hooks/useTradingConfig";
import { useBotActive } from "@/hooks/useBotActive";

export const AutoTradingControl = () => {
  const [lastAnalysis, setLastAnalysis] = useState<any>(null);
  const { toast } = useToast();
  const { config } = useTradingConfig();
  const { isActive, toggleBotActive } = useBotActive();

  useEffect(() => {
    loadLastAnalysis();
    checkCredentials();

    // Update analysis display every 60 seconds
    const displayInterval = setInterval(() => {
      loadLastAnalysis();
    }, 60000);

    return () => clearInterval(displayInterval);
  }, []);

  const checkCredentials = async () => {
    // BYPASS PARA MODO SIMULAÇÃO
    const isSimulation = (typeof process !== 'undefined' && process.env?.VITE_TRADING_MODE === 'test') ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_TRADING_MODE === 'test');

    if (isSimulation) return;

    try {
      const { data } = await supabase
        .from('binance_api_keys')
        .select('api_key, api_secret_encrypted')
        .eq('user_id', FIXED_USER_ID)
        .maybeSingle();

      if (!data?.api_key || !data?.api_secret_encrypted) {
        toast({
          title: "Configuração Necessária",
          description: "Configure suas credenciais da Binance nas configurações antes de ativar o IA Trading.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error checking credentials:', error);
    }
  };

  // Automatic analysis execution every 15 minutes when active
  useEffect(() => {
    if (!isActive) return;

    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;
    let isExecuting = false; // Prevent concurrent executions

    const executeAutoAnalysis = async () => {
      // Prevent concurrent executions
      if (isExecuting) {
        console.log('⚠️ [AutoTradingControl] Analysis already running, skipping');
        return;
      }

      isExecuting = true;
      try {
        console.log('🤖 [AutoTradingControl] Executing automatic analysis...');
        const response = await executeAutoTradeAnalysis();

        console.log('✅ [AutoTradingControl] Response received:', {
          success: response.success,
          rate_limited: response.rate_limited,
          remaining_seconds: response.remaining_seconds,
          trades_count: response.executed_trades?.length
        });

        // Handle rate limit (don't show error, just schedule next run)
        if (response.rate_limited) {
          console.log(`⏳ [AutoTradingControl] Rate limit active - waiting ${response.remaining_seconds}s`);
          if (response.remaining_seconds) {
            const waitTime = (response.remaining_seconds + 10) * 1000;
            console.log(`⏰ [AutoTradingControl] Next analysis scheduled in ${response.remaining_seconds + 10}s`);
            timeoutId = setTimeout(executeAutoAnalysis, waitTime);
          }
          return;
        }

        // Handle circuit breaker (stop trading)
        if (response.circuit_breaker) {
          console.error(`🛑 [AutoTradingControl] Circuit breaker activated - stopping automatic trading`);
          await toggleBotActive(false);
          toast({
            title: "🛑 Trading Pausado Automaticamente",
            description: response.message || "Performance crítica detectada. Revise a estratégia.",
            variant: "destructive",
          });
          return;
        }

        // Handle successful execution
        if (response.executed_trades && response.executed_trades.length > 0) {
          console.log(`Auto analysis completed: ${response.executed_trades.length} trades executed`);
          loadLastAnalysis();
          toast({
            title: "Análise Automática Concluída",
            description: `${response.executed_trades.length} operações executadas`,
          });
        } else {
          console.log('Auto analysis completed: no trades');
          loadLastAnalysis();
        }
      } catch (error) {
        // Error is already parsed by autoTradeService
        const autoTradeError = error as AutoTradeError;
        console.error('❌ [AutoTradingControl] Error caught:', {
          isRateLimit: autoTradeError.isRateLimit,
          message: autoTradeError.message,
          remainingSeconds: autoTradeError.remainingSeconds
        });

        // Handle rate limit silently (don't show error toast, just schedule next run)
        if (autoTradeError.isRateLimit) {
          console.log('⏳ [AutoTradingControl] Rate limit in catch block - scheduling retry');
          if (autoTradeError.remainingSeconds) {
            const waitTime = (autoTradeError.remainingSeconds + 10) * 1000;
            console.log(`⏰ [AutoTradingControl] Retry scheduled in ${autoTradeError.remainingSeconds + 10}s`);
            timeoutId = setTimeout(executeAutoAnalysis, waitTime);
          }
          return;
        }

        // Show error toast for non-rate-limit errors
        console.error('💥 [AutoTradingControl] Showing error toast to user');
        toast({
          title: "Erro na Análise",
          description: autoTradeError.displayMessage,
          variant: "destructive",
        });
      } finally {
        isExecuting = false;
      }
    };

    // Delay first execution to avoid immediate rate limit on page load
    const initialDelay = 2000; // 2 seconds
    console.log(`⏰ [AutoTradingControl] Scheduling first analysis in ${initialDelay / 1000}s`);
    timeoutId = setTimeout(executeAutoAnalysis, initialDelay);

    // Then execute every 5 minutes (300000 ms)
    intervalId = setInterval(executeAutoAnalysis, 300000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [isActive]);

  const loadLastAnalysis = async () => {
    try {
      const { data } = await supabase
        .from('ai_analysis_results')
        .select('*')
        .eq('user_id', FIXED_USER_ID)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        const highConfidence = data.filter(a => a.confidence >= 70);
        setLastAnalysis({
          total: data.length,
          highConfidence: highConfidence.length,
          lastRun: data[0].created_at,
          bestOpportunity: data.reduce((best, current) =>
            current.confidence > best.confidence ? current : best
            , data[0])
        });
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
    }
  };

  const handleToggle = async (checked: boolean) => {
    try {
      await toggleBotActive(checked);

      const minConf = config?.minConfidence || 60;
      const qty = config?.quantityUsdt || 10;

      toast({
        title: checked ? "IA Trading Ativado" : "IA Trading Desativado",
        description: checked
          ? `A IA executará análises a cada 5min, operando ${qty} USDT por trade em pares com ≥${minConf}% de confiança`
          : "A análise automática foi pausada",
      });
    } catch (error) {
      console.error('Error toggling:', error);
      toast({
        title: "Erro",
        description: "Falha ao atualizar status",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bot className={`w-5 h-5 ${isActive ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">IA Trading Automático</h3>
              <p className="text-xs text-muted-foreground">
                Análise contínua de todas as criptos
              </p>
            </div>
          </div>
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "ATIVO" : "PAUSADO"}
          </Badge>
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
          <Label htmlFor="auto-trading" className="cursor-pointer text-sm font-medium">
            Ativar IA Automática
          </Label>
          <Switch
            id="auto-trading"
            checked={isActive}
            onCheckedChange={handleToggle}
          />
        </div>

        {/* Last Analysis Stats */}
        {lastAnalysis && (
          <div className="space-y-3">
            <div className="p-3 bg-background/50 rounded-lg space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Última análise:</span>
                <span className="text-foreground">
                  {new Date(lastAnalysis.lastRun).toLocaleTimeString('pt-BR')}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Pares analisados:</span>
                <span className="text-foreground font-medium">{lastAnalysis.total}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Oportunidades (≥85%):</span>
                <span className="text-success font-bold">{lastAnalysis.highConfidence}</span>
              </div>
            </div>

            {lastAnalysis.bestOpportunity && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-foreground">Melhor Oportunidade</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm font-bold text-foreground">
                      {lastAnalysis.bestOpportunity.symbol}
                    </span>
                    <Badge variant="default" className="text-xs">
                      {lastAnalysis.bestOpportunity.confidence.toFixed(1)}% confiança
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Estratégia:</span>
                    <span className="text-foreground font-medium">
                      Entrada única (TP: 0.30% | SL: 1.00%)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Info */}
        {isActive && config && (
          <div className="text-xs text-muted-foreground p-3 bg-success/5 rounded-lg border border-success/20">
            <div className="flex items-start gap-2">
              <Clock className="w-3 h-3 mt-0.5 text-success" />
              <div>
                <p className="font-medium text-foreground mb-1">✓ IA Ativa - Análises Automáticas</p>
                <p>A IA executa análises a cada 5min operando <strong>{config.quantityUsdt} USDT</strong> por trade com alavancagem <strong>{config.leverage}x</strong>. Take Profit: <strong className="text-success">{config.takeProfit}%</strong> | Stop Loss: <strong className="text-destructive">{config.stopLoss}%</strong> | Confiança mínima: <strong>{config.minConfidence}%</strong></p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};