import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bot, TrendingUp, Sparkles, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const AutoTradingControl = () => {
  const [isActive, setIsActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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

  // Auto-execute analysis every 2 minutes when active
  useEffect(() => {
    if (isActive && user) {
      // Run immediately when activated
      runAnalysis();
      
      // Then run every 2 minutes (120000ms)
      const autoInterval = setInterval(() => {
        runAnalysis();
      }, 120000);
      
      return () => clearInterval(autoInterval);
    }
  }, [isActive, user]);

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
        const highConfidence = data.filter(a => a.confidence >= 75);
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
      
      if (checked) {
        runAnalysis();
      }

      toast({
        title: checked ? "IA Trading Ativado" : "IA Trading Desativado",
        description: checked 
          ? "A IA começará a analisar automaticamente todas as criptomoedas" 
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

  const runAnalysis = async () => {
    if (!user || isAnalyzing) return;

    setIsAnalyzing(true);
    toast({
      title: "Iniciando Análise IA",
      description: "Analisando todas as criptomoedas da Binance...",
    });

    try {
      const { data, error } = await supabase.functions.invoke('ai-auto-trade');

      if (error) throw error;

      toast({
        title: "✅ Análise Concluída",
        description: `${data.analyzed} pares analisados | ${data.opportunities} oportunidades | ${data.executed} trades executados`,
      });

      loadLastAnalysis();
    } catch (error) {
      console.error('Error running analysis:', error);
      toast({
        title: "Erro na Análise",
        description: error.message || "Falha ao executar análise",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
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
                <span className="text-muted-foreground">Oportunidades (≥75%):</span>
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

        {/* Manual Run Button */}
        <Button 
          onClick={runAnalysis}
          className="w-full bg-gradient-primary"
          disabled={!isActive || isAnalyzing}
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          {isAnalyzing ? "Analisando..." : "Executar Análise Agora"}
        </Button>

        {/* Active Info */}
        {isActive && (
          <div className="text-xs text-muted-foreground p-3 bg-success/5 rounded-lg border border-success/20">
            <div className="flex items-start gap-2">
              <Clock className="w-3 h-3 mt-0.5 text-success" />
              <div>
                <p className="font-medium text-foreground mb-1">✓ IA Ativa - 1 operação a cada 2 minutos</p>
                <p>A IA analisa TODAS as criptomoedas da Binance automaticamente a cada 2 minutos e executa apenas 1 trade por vez quando encontra oportunidades com confiança ≥ mínima configurada. Take Profit e Stop Loss são calculados baseados no saldo inicial do dia.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};