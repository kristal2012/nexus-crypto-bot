import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Settings, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const TradingConfig = () => {
  const [leverage, setLeverage] = useState([10]);
  const [takeProfit, setTakeProfit] = useState([2]);
  const [stopLoss, setStopLoss] = useState([1]);
  const [quantityUsdt, setQuantityUsdt] = useState("100");
  const [minConfidence, setMinConfidence] = useState([95]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

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
        setLeverage([data.leverage]);
        setTakeProfit([Number(data.take_profit)]);
        setStopLoss([Number(data.stop_loss)]);
        setQuantityUsdt(String(data.quantity_usdt));
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
            leverage: leverage[0],
            take_profit: takeProfit[0],
            stop_loss: stopLoss[0],
            quantity_usdt: Number(quantityUsdt),
            min_confidence: minConfidence[0]
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('auto_trading_config')
          .insert({
            user_id: user.id,
            leverage: leverage[0],
            take_profit: takeProfit[0],
            stop_loss: stopLoss[0],
            quantity_usdt: Number(quantityUsdt),
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
        <div>
          <Label className="text-foreground mb-2">Alavancagem: {leverage}x</Label>
          <Slider
            value={leverage}
            onValueChange={setLeverage}
            min={1}
            max={125}
            step={1}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1x</span>
            <span>125x</span>
          </div>
        </div>

        <div>
          <Label className="text-foreground mb-2">Take Profit: {takeProfit}%</Label>
          <Slider
            value={takeProfit}
            onValueChange={setTakeProfit}
            min={0.5}
            max={10}
            step={0.1}
            className="mt-2"
          />
        </div>

        <div>
          <Label className="text-foreground mb-2">Stop Loss: {stopLoss}%</Label>
          <Slider
            value={stopLoss}
            onValueChange={setStopLoss}
            min={0.5}
            max={5}
            step={0.1}
            className="mt-2"
          />
        </div>

        <div>
          <Label className="text-foreground mb-2">Quantidade por Trade (USDT)</Label>
          <Input
            type="number"
            placeholder="100.00"
            className="bg-secondary border-border text-foreground"
            value={quantityUsdt}
            onChange={(e) => setQuantityUsdt(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Valor dividido automaticamente entre camadas DCA
          </p>
        </div>

        <div>
          <Label className="text-foreground mb-2">Confiança Mínima IA: {minConfidence}%</Label>
          <Slider
            value={minConfidence}
            onValueChange={setMinConfidence}
            min={75}
            max={100}
            step={1}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>75% (mínimo)</span>
            <span>100%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Apenas trades com confiança ≥ {minConfidence}% serão executados. O mínimo é 75% e não pode ser reduzido.
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