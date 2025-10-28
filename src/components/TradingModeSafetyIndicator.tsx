/**
 * Trading Mode Safety Indicator
 * 
 * Displays a clear, prominent indicator of the current trading mode
 * to prevent accidental real trades when in demo mode and vice versa.
 */

import { Shield, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTradingSettings } from "@/hooks/useTradingSettings";

export const TradingModeSafetyIndicator = () => {
  const { settings, loading } = useTradingSettings();

  if (loading || !settings) {
    return null;
  }

  const isDemo = settings.trading_mode === "DEMO";

  return (
    <Card className={`p-4 border-2 ${
      isDemo 
        ? "bg-warning/5 border-warning" 
        : "bg-destructive/5 border-destructive"
    }`}>
      <div className="flex items-center gap-3">
        {isDemo ? (
          <Shield className="w-8 h-8 text-warning flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-8 h-8 text-destructive flex-shrink-0 animate-pulse" />
        )}
        
        <div className="flex-1">
          <h3 className={`text-lg font-bold ${
            isDemo ? "text-warning" : "text-destructive"
          }`}>
            {isDemo ? "🛡️ Modo Demonstração Ativo" : "⚠️ Modo Real Ativo"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isDemo ? (
              <>
                Todas as operações são <strong>simuladas</strong>. Nenhuma ordem será executada na Binance.
                Saldo demo: <strong>${settings.demo_balance.toLocaleString()}</strong>
              </>
            ) : (
              <>
                Operações estão sendo executadas <strong>na sua conta real da Binance</strong> com dinheiro real.
                <strong className="text-destructive"> Você pode perder dinheiro.</strong>
              </>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
};
