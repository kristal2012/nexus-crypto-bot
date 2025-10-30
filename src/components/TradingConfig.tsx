import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Settings, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTradingConfig } from "@/hooks/useTradingConfig";

export const TradingConfig = () => {
  const { config, loading: configLoading, updateConfig } = useTradingConfig();
  const [leverage, setLeverage] = useState(10);
  const [takeProfit, setTakeProfit] = useState(2.5);
  const [stopLoss, setStopLoss] = useState(1.5);
  const [minConfidence, setMinConfidence] = useState([60]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Sincroniza estado local com configuração do SSOT
  useEffect(() => {
    if (config) {
      setLeverage(config.leverage);
      setTakeProfit(config.takeProfit);
      setStopLoss(config.stopLoss);
      setMinConfidence([config.minConfidence]);
    }
  }, [config]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const success = await updateConfig({
        leverage,
        takeProfit,
        stopLoss,
        minConfidence: minConfidence[0],
      });

      if (success) {
        toast({
          title: "Configuração salva",
          description: "Suas configurações de trading foram atualizadas com sucesso.",
        });
      } else {
        throw new Error("Falha ao salvar configurações");
      }
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast({
        title: "Erro ao salvar",
        description: error.message || "Falha ao salvar configurações.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
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
          <Label className="text-foreground mb-2">Alavancagem: {leverage}x</Label>
          <Slider
            value={[leverage]}
            onValueChange={(value) => setLeverage(value[0])}
            min={1}
            max={125}
            step={1}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1x</span>
            <span>125x</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Controla a exposição de capital. Alavancagem alta aumenta tanto lucros quanto riscos.
          </p>
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg border border-border">
          <Label className="text-foreground mb-2">Take Profit: {takeProfit.toFixed(1)}%</Label>
          <Slider
            value={[takeProfit]}
            onValueChange={(value) => setTakeProfit(value[0])}
            min={0.5}
            max={20}
            step={0.5}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0.5%</span>
            <span>20%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Percentual de lucro baseado no saldo inicial do dia. Posições são fechadas quando atingem este ganho.
          </p>
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg border border-border">
          <Label className="text-foreground mb-2">Stop Loss: {stopLoss.toFixed(1)}%</Label>
          <Slider
            value={[stopLoss]}
            onValueChange={(value) => setStopLoss(value[0])}
            min={0.5}
            max={10}
            step={0.5}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0.5%</span>
            <span>10%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Percentual de perda máxima por posição baseado no valor investido. Protege seu capital limitando perdas.
          </p>
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg border border-border">
          <Label className="text-foreground mb-2">Quantidade por Trade: {config?.quantityUsdt || 10} USDT</Label>
          <div className="text-2xl font-bold text-primary mt-2">
            {config?.quantityUsdt || 10} USDT
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Valor em USDT alocado para cada operação individual. Este valor é multiplicado pela alavancagem.
          </p>
        </div>

        <div>
          <Label className="text-foreground mb-2">Confiança Mínima IA: {minConfidence[0]}%</Label>
          <Slider
            value={minConfidence}
            onValueChange={setMinConfidence}
            min={50}
            max={100}
            step={1}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>50%</span>
            <span>100%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Apenas trades com confiança ≥ {minConfidence[0]}% serão executados pela IA.
          </p>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">
            ⚙️ <strong>SSOT Ativo:</strong> Estas configurações são a fonte única de verdade para todo o sistema. 
            Stop Loss e Take Profit configurados aqui são usados por todas as edge functions (ai-auto-trade, monitor-positions).
          </p>
        </div>

        <Button 
          onClick={handleSaveConfig}
          className="w-full bg-gradient-primary shadow-glow hover:shadow-glow/50 transition-all"
          disabled={saving || configLoading}
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Configuração"}
        </Button>
      </div>
    </Card>
  );
};