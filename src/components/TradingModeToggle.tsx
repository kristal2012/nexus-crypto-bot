import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AlertCircle, TrendingUp } from "lucide-react";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const TradingModeToggle = () => {
  const { settings, loading, updateTradingMode } = useTradingSettings();
  const [showRealModeDialog, setShowRealModeDialog] = useState(false);

  const handleModeChange = (mode: "REAL" | "DEMO") => {
    if (mode === "REAL") {
      setShowRealModeDialog(true);
    } else {
      updateTradingMode(mode);
    }
  };

  const confirmRealMode = () => {
    updateTradingMode("REAL");
    setShowRealModeDialog(false);
  };

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
        <div>
          <Label className="text-sm font-semibold text-foreground mb-3 block">
            Escolha o Modo de Trading
          </Label>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleModeChange("DEMO")}
              className={`p-4 rounded-lg border-2 transition-all ${
                !isRealMode
                  ? "border-warning bg-warning/10"
                  : "border-border bg-secondary/50 hover:border-warning/50"
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <AlertCircle className={`w-6 h-6 ${!isRealMode ? "text-warning" : "text-muted-foreground"}`} />
                <div className="text-center">
                  <p className={`text-sm font-semibold ${!isRealMode ? "text-warning" : "text-foreground"}`}>
                    Modo Demo
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Operações simuladas
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleModeChange("REAL")}
              className={`p-4 rounded-lg border-2 transition-all ${
                isRealMode
                  ? "border-success bg-success/10"
                  : "border-border bg-secondary/50 hover:border-success/50"
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <TrendingUp className={`w-6 h-6 ${isRealMode ? "text-success" : "text-muted-foreground"}`} />
                <div className="text-center">
                  <p className={`text-sm font-semibold ${isRealMode ? "text-success" : "text-foreground"}`}>
                    Conta Real
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Saldo real
                  </p>
                </div>
              </div>
            </button>
          </div>
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

      <AlertDialog open={showRealModeDialog} onOpenChange={setShowRealModeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Confirmar Modo Real
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-semibold">
                Você está prestes a ativar o modo de trading com dinheiro real.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span>Todas as operações serão executadas na Binance com saldo real</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span>Você pode perder dinheiro real se as operações forem desfavoráveis</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span>Esta confirmação expira após 5 minutos por segurança</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span>Certifique-se de que suas chaves da API Binance estão configuradas corretamente</span>
                </li>
              </ul>
              <p className="font-semibold text-destructive">
                Tem certeza que deseja continuar?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRealMode}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, Ativar Modo Real
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
