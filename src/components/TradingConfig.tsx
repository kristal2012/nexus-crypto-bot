import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Settings, Save } from "lucide-react";

export const TradingConfig = () => {
  const [leverage, setLeverage] = useState([10]);
  const [takeProfit, setTakeProfit] = useState([1.5]);
  const [stopLoss, setStopLoss] = useState([1.0]);

  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Configuração</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-foreground mb-2">Par de Negociação</Label>
          <Select defaultValue="BTCUSDT">
            <SelectTrigger className="bg-secondary border-border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BTCUSDT">BTC/USDT</SelectItem>
              <SelectItem value="ETHUSDT">ETH/USDT</SelectItem>
              <SelectItem value="BNBUSDT">BNB/USDT</SelectItem>
              <SelectItem value="SOLUSDT">SOL/USDT</SelectItem>
              <SelectItem value="ADAUSDT">ADA/USDT</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
          <Label className="text-foreground mb-2">Quantidade (USDT)</Label>
          <Input
            type="number"
            placeholder="100.00"
            className="bg-secondary border-border text-foreground"
            defaultValue="100"
          />
        </div>

        <div>
          <Label className="text-foreground mb-2">Camadas DCA</Label>
          <Select defaultValue="3">
            <SelectTrigger className="bg-secondary border-border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Camada</SelectItem>
              <SelectItem value="2">2 Camadas</SelectItem>
              <SelectItem value="3">3 Camadas</SelectItem>
              <SelectItem value="5">5 Camadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full bg-gradient-primary shadow-glow hover:shadow-glow/50 transition-all">
          <Save className="w-4 h-4 mr-2" />
          Salvar Configuração
        </Button>
      </div>
    </Card>
  );
};
