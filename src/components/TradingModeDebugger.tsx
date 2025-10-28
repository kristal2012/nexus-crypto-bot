/**
 * Trading Mode Debugger Component
 * 
 * Componente de debug para visualizar o estado do modo de trading
 * e identificar discrepâncias entre configuração e execução
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle, Shield, AlertTriangle } from "lucide-react";

interface DebugInfo {
  configuredMode: "DEMO" | "REAL" | null;
  demoBalance: number;
  realModeConfirmed: boolean;
  confirmationTimestamp: string | null;
  recentTrades: Array<{
    symbol: string;
    is_demo: boolean;
    created_at: string;
  }>;
  recentPositions: Array<{
    symbol: string;
    is_demo: boolean;
  }>;
}

export const TradingModeDebugger = () => {
  const { settings, loading } = useTradingSettings();
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const loadDebugInfo = async () => {
      if (!settings) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch confirmation timestamp from database
      const { data: tradingSettingsData } = await supabase
        .from("trading_settings")
        .select("real_mode_confirmed_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: trades } = await supabase
        .from("trades")
        .select("symbol, is_demo, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: positions } = await supabase
        .from("positions")
        .select("symbol, is_demo")
        .eq("user_id", user.id)
        .limit(10);

      setDebugInfo({
        configuredMode: settings.trading_mode,
        demoBalance: settings.demo_balance,
        realModeConfirmed: !!tradingSettingsData?.real_mode_confirmed_at,
        confirmationTimestamp: tradingSettingsData?.real_mode_confirmed_at || null,
        recentTrades: trades || [],
        recentPositions: positions || [],
      });
    };

    loadDebugInfo();
  }, [settings]);

  if (loading || !settings || !debugInfo) return null;

  // Check for inconsistencies
  const tradesMatchMode = debugInfo.recentTrades.every(
    (t) => t.is_demo === (debugInfo.configuredMode === "DEMO")
  );
  const positionsMatchMode = debugInfo.recentPositions.every(
    (p) => p.is_demo === (debugInfo.configuredMode === "DEMO")
  );
  const isConsistent = tradesMatchMode && positionsMatchMode;

  return (
    <Card className="p-4 border-border/50 bg-card/50">
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-2 w-full text-left"
      >
        {isConsistent ? (
          <CheckCircle className="w-5 h-5 text-success" />
        ) : (
          <AlertCircle className="w-5 h-5 text-destructive" />
        )}
        <span className="font-medium">
          {isConsistent ? "Sistema Consistente" : "⚠️ Inconsistência Detectada"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {show ? "Ocultar" : "Ver detalhes"}
        </span>
      </button>

      {show && (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Modo Configurado:</span>
            <Badge
              variant={debugInfo.configuredMode === "DEMO" ? "secondary" : "destructive"}
            >
              {debugInfo.configuredMode === "DEMO" ? (
                <Shield className="w-3 h-3 mr-1" />
              ) : (
                <AlertTriangle className="w-3 h-3 mr-1" />
              )}
              {debugInfo.configuredMode}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Saldo Demo:</span>
            <span className="font-mono">${debugInfo.demoBalance.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Modo Real Confirmado:</span>
            <Badge variant={debugInfo.realModeConfirmed ? "default" : "outline"}>
              {debugInfo.realModeConfirmed ? "Sim" : "Não"}
            </Badge>
          </div>

          <div className="border-t border-border/50 pt-3">
            <div className="text-xs text-muted-foreground mb-2">Últimas 5 trades:</div>
            {debugInfo.recentTrades.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Nenhuma trade ainda</div>
            ) : (
              <div className="space-y-1">
                {debugInfo.recentTrades.map((trade, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span>{trade.symbol}</span>
                    <Badge
                      variant={trade.is_demo ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {trade.is_demo ? "DEMO" : "REAL"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 pt-3">
            <div className="text-xs text-muted-foreground mb-2">Posições abertas:</div>
            {debugInfo.recentPositions.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Nenhuma posição aberta</div>
            ) : (
              <div className="space-y-1">
                {debugInfo.recentPositions.map((pos, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span>{pos.symbol}</span>
                    <Badge
                      variant={pos.is_demo ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {pos.is_demo ? "DEMO" : "REAL"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isConsistent && (
            <div className="border-t border-destructive/20 pt-3">
              <div className="flex items-start gap-2 p-2 rounded bg-destructive/10 text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <strong>Inconsistência detectada!</strong> Algumas trades/posições não correspondem
                  ao modo configurado. Isso pode indicar um problema na lógica de execução.
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
