import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Settings, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const TradingConfig = () => {
  const [leverage, setLeverage] = useState(10);
  const [takeProfit, setTakeProfit] = useState([2.5]);
  const [atrMultiplier, setAtrMultiplier] = useState([1.5]);
  const [minConfidence, setMinConfidence] = useState([70]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Calcula alavancagem automaticamente baseada nos parâmetros de risco e volatilidade
  useEffect(() => {
    const calculateSafeLeverage = () => {
      const atr = atrMultiplier[0];
      const tp = takeProfit[0];

      // Fórmula de segurança baseada em volatilidade (ATR)
      // Quanto menor o multiplicador ATR, mais conservador
      // ATR 1.0x = até 50x leverage
      // ATR 2.0x = até 25x leverage
      let calculatedLeverage = Math.floor(50 / atr);
      
      // Ajuste baseado no take profit (ser mais conservador se TP for muito alto)
      if (tp > 5) {
        calculatedLeverage = Math.floor(calculatedLeverage * 0.7);
      }
      
      // Limitar entre 1x e 125x
      calculatedLeverage = Math.max(1, Math.min(125, calculatedLeverage));
      
      setLeverage(calculatedLeverage);
    };

    calculateSafeLeverage();
  }, [takeProfit, atrMultiplier]);

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('auto_trading_config')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Não carregamos leverage do banco, será calculado automaticamente
        setTakeProfit([Number(data.take_profit)]);
        setAtrMultiplier([Number(data.stop_loss || 1.5)]); // stop_loss agora armazena o multiplicador ATR
        setMinConfidence([Number(data.min_confidence)]);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const handleSaveConfig = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from('auto_trading_config')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('auto_trading_config')
          .update({
            leverage: leverage,
            take_profit: takeProfit[0],
            stop_loss: atrMultiplier[0], // Armazena multiplicador ATR
            min_confidence: minConfidence[0]
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('auto_trading_config')
          .insert({
            user_id: user.id,
            leverage: leverage,
            take_profit: takeProfit[0],
            stop_loss: atrMultiplier[0], // Armazena multiplicador ATR
            min_confidence: minConfidence[0]
          });

        if (error) throw error;
      }

      toast({
        title: "Configuração salva",
        description: "Suas configurações de trading foram salvas com sucesso.",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Erro",
        description: "Falha ao salvar configurações.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Configuração IA Trading</h3>
      </div>

      <div className="space-y-4">
        <div className="bg-secondary/50 p-4 rounded-lg border border-border">
          <Label className="text-foreground mb-2">Alavancagem Calculada pela IA: {leverage}x</Label>
          <div className="h-2 w-full bg-secondary rounded-full mt-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-primary transition-all duration-300" 
              style={{ width: `${(leverage / 125) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1x</span>
            <span>125x</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            A IA calcula automaticamente a alavancagem ideal baseada em seus parâmetros de risco para proteger seu capital.
          </p>
        </div>

        <div>
          <Label className="text-foreground mb-2">Take Profit: {takeProfit}% do saldo inicial do dia</Label>
          <Slider
            value={takeProfit}
            onValueChange={setTakeProfit}
            min={0.5}
            max={15}
            step={0.5}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Baseado no saldo inicial do dia. Ex: Se saldo inicial for 1000 USDT, TP de {takeProfit}% = {(1000 * takeProfit[0] / 100).toFixed(2)} USDT
          </p>
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg border border-border">
          <Label className="text-foreground mb-2">Stop Loss Adaptativo (ATR): {atrMultiplier}x</Label>
          <Slider
            value={atrMultiplier}
            onValueChange={setAtrMultiplier}
            min={1.0}
            max={3.0}
            step={0.1}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1.0x (Conservador)</span>
            <span>3.0x (Agressivo)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            🧠 <strong>Stop Loss baseado em volatilidade (ATR - Average True Range):</strong> O sistema calcula automaticamente o SL ideal para cada trade usando ATR de 14 períodos. Quanto maior a volatilidade, maior o SL para evitar saídas prematuras. Multiplicador padrão: 1.5x.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            ⚙️ O SL é recalculado a cada candle de 15min e ajustado automaticamente em operações DCA (preço médio).
          </p>
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg border border-border">
          <Label className="text-foreground mb-2">Valor por Análise</Label>
          <div className="text-2xl font-bold text-primary mt-2">
            10% do Saldo Disponível
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            A cada análise, 10% do saldo disponível é distribuído entre as oportunidades com ≥70% de confiança nos 13 pares principais: BNB, SOL, ADA, DOGE, XRP, DOT, MATIC, AVAX, LINK, UNI, LTC, ATOM, NEAR.
          </p>
        </div>

        <div>
          <Label className="text-foreground mb-2">Confiança Mínima IA: {minConfidence}%</Label>
          <Slider
            value={minConfidence}
            onValueChange={setMinConfidence}
            min={70}
            max={100}
            step={1}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>70% (mínimo)</span>
            <span>100%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Apenas trades com confiança ≥ {minConfidence}% serão executados. O mínimo é 70% e não pode ser reduzido.
          </p>
        </div>

        <Button 
          onClick={handleSaveConfig}
          className="w-full bg-gradient-primary shadow-glow hover:shadow-glow/50 transition-all"
          disabled={loading}
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Salvando..." : "Salvar Configuração"}
        </Button>
      </div>
    </Card>
  );
};