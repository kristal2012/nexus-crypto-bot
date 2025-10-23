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
      
      // Update analysis display every 60 seconds
      const displayInterval = setInterval(() => {
        loadLastAnalysis();
      }, 60000);
      
      return () => clearInterval(displayInterval);
    }
  }, [user]);

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
          ? "A IA distribuirá 10% do saldo por análise entre as oportunidades com ≥70% de confiança (exceto BTC/ETH)" 
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
                <p className="font-medium text-foreground mb-1">✓ IA Ativa - Operações Automáticas</p>
                <p>A cada análise (15 min), 10% do saldo disponível é distribuído entre as oportunidades com ≥70% de confiança, podendo executar uma ou várias operações (exceto BTC e ETH).</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};