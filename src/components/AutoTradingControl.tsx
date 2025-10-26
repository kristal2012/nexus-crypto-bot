import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const AutoTradingControl = () => {
  const [isActive, setIsActive] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadStatus();
      loadLastAnalysis();
      checkCredentials();
      
      // Update analysis display every 60 seconds
      const displayInterval = setInterval(() => {
        loadLastAnalysis();
      }, 60000);
      
      return () => clearInterval(displayInterval);
    }
  }, [user]);

  const checkCredentials = async () => {
    try {
      const { data } = await supabase
        .from('binance_api_keys')
        .select('api_key, api_secret_encrypted')
        .eq('user_id', user.id)
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
    if (!user || !isActive) return;

    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    const executeAutoAnalysis = async () => {
      try {
        console.log('Executing automatic analysis...');
        const { data, error } = await supabase.functions.invoke('ai-auto-trade');

        if (error) {
          console.error('Auto analysis error:', error);
          
          // Show the specific error message
          const errorMessage = error.message || 'Erro desconhecido ao executar análise';
          
          toast({
            title: "Erro na Análise",
            description: errorMessage,
            variant: "destructive",
          });
          return;
        }

        // Check for specific error responses from the function
        if (data && !data.success && data.error) {
          console.log('Function returned error:', data.error);
          toast({
            title: "Erro na Análise",
            description: data.message || data.error,
            variant: "destructive",
          });
          return;
        }

        if (data?.rate_limited) {
          console.log('Rate limited:', data.message);
          // Don't show toast for rate limit - it's expected behavior
          // Schedule next execution after the remaining cooldown time
          if (data.remaining_seconds) {
            const waitTime = (data.remaining_seconds + 10) * 1000; // Add 10 seconds buffer
            console.log(`Scheduling next analysis in ${data.remaining_seconds + 10} seconds`);
            timeoutId = setTimeout(executeAutoAnalysis, waitTime);
          }
          return;
        }
        
        if (data?.executed_trades && data.executed_trades.length > 0) {
          console.log(`Auto analysis completed: ${data.executed_trades.length} trades executed`);
          loadLastAnalysis();
          toast({
            title: "Análise Automática Concluída",
            description: `${data.executed_trades.length} operações executadas`,
          });
        } else {
          console.log('Auto analysis completed: no trades');
          loadLastAnalysis();
        }
      } catch (error) {
        console.error('Error in auto analysis:', error);
        toast({
          title: "Erro na Análise",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
      }
    };

    // Execute immediately on activation
    executeAutoAnalysis();

    // Then execute every 15 minutes (900000 ms)
    intervalId = setInterval(executeAutoAnalysis, 900000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [user, isActive]);

  // Analysis runs automatically on the backend every 15 minutes when active
  // This component just displays the results

  const loadStatus = async () => {
    try {
      const { data } = await supabase
        .from('auto_trading_config')
        .select('is_active, min_confidence')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setIsActive(data.is_active);
      }
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  const loadLastAnalysis = async () => {
    try {
      const { data } = await supabase
        .from('ai_analysis_results')
        .select('*')
        .eq('user_id', user.id)
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
    if (!user) return;

    try {
      const { data: existing } = await supabase
        .from('auto_trading_config')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('auto_trading_config')
          .update({ is_active: checked })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('auto_trading_config')
          .insert({
            user_id: user.id,
            is_active: checked
          });
      }

      setIsActive(checked);

      toast({
        title: checked ? "IA Trading Ativado" : "IA Trading Desativado",
        description: checked 
          ? "A IA executará análises automaticamente a cada 15 minutos e distribuirá 10% do saldo entre oportunidades com ≥70% de confiança" 
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
                <span className="text-muted-foreground">Oportunidades (≥70%):</span>
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
                    <span>DCA recomendado:</span>
                    <span className="text-foreground font-medium">
                      {lastAnalysis.bestOpportunity.recommended_dca_layers} camadas
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Info */}
        {isActive && (
          <div className="text-xs text-muted-foreground p-3 bg-success/5 rounded-lg border border-success/20">
            <div className="flex items-start gap-2">
              <Clock className="w-3 h-3 mt-0.5 text-success" />
              <div>
                <p className="font-medium text-foreground mb-1">✓ IA Ativa - Análises Automáticas</p>
                <p>A IA executa análises automaticamente a cada 15 minutos. Em cada análise, 10% do saldo disponível é distribuído entre as oportunidades com ≥70% de confiança em 13 pares principais (BNB, SOL, ADA, DOGE, XRP, DOT, MATIC, AVAX, LINK, UNI, LTC, ATOM, NEAR).</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};