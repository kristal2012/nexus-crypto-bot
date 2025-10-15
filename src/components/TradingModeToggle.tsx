import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertCircle, TrendingUp } from "lucide-react";
import { useTradingSettings } from "@/hooks/useTradingSettings";

export const TradingModeToggle = () => {
  const { settings, loading, updateTradingMode } = useTradingSettings();

  if (loading || !settings) {
    return (
      <Card className="p-4 bg-gradient-card border-border shadow-card">
        <div className="h-24 bg-secondary animate-pulse rounded" />
      </Card>
    );
  }

  const isRealMode = settings.trading_mode === "REAL";

  return (
    <Card className="p-4 bg-gradient-card border-border shadow-card">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRealMode ? (
              <TrendingUp className="w-5 h-5 text-success" />
            ) : (
              <AlertCircle className="w-5 h-5 text-warning" />
            )}
            <div>
              <Label className="text-sm font-semibold text-foreground">
                Modo de Trading
              </Label>
              <p className="text-xs text-muted-foreground">
                {isRealMode ? "Operações reais" : "Operações simuladas"}
              </p>
            </div>
          </div>
          <Switch
            checked={isRealMode}
            onCheckedChange={(checked) => 
              updateTradingMode(checked ? "REAL" : "DEMO")
            }
          />
        </div>

        {!isRealMode && (
          <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-warning">Modo Demonstração Ativo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Todas as negociações são simuladas com base no mercado ao vivo. 
                  Saldo demo: ${settings.demo_balance.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {isRealMode && (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-success">Modo Real Ativo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Operações executadas na Binance com dinheiro real
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
