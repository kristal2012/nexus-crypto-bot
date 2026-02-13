/**
 * Strategy Information Component - Apenas exibe informações sobre estratégia
 * Princípios: SRP - Responsabilidade única de exibir estado da estratégia
 * 
 * Sistema adaptativo: Ajustes automáticos são feitos pelo backend
 * Este componente apenas informa ao usuário qual estratégia está ativa
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Info } from "lucide-react";
import { FIXED_USER_ID } from "@/config/userConfig";
import { 
  getCurrentStrategyName, 
  hasStrategyChangedSinceLastRound 
} from "@/services/adaptiveStrategyService";
import { useTradingConfig } from "@/hooks/useTradingConfig";

export const StrategyAdjustmentSuggestions = () => {
  const [strategyInfo, setStrategyInfo] = useState<{
    currentStrategy: string;
    changed: boolean;
    changeDate?: string;
  } | null>(null);
  const { config } = useTradingConfig();

  useEffect(() => {
    const fetchStrategyInfo = async () => {
      if (!config) return;

      const strategyCheck = await hasStrategyChangedSinceLastRound(FIXED_USER_ID);
      const currentStrategy = getCurrentStrategyName({
        leverage: config.leverage,
        stopLoss: config.stopLoss,
        takeProfit: config.takeProfit,
        minConfidence: config.minConfidence
      });

      setStrategyInfo({
        currentStrategy: strategyCheck.currentStrategy || currentStrategy,
        changed: strategyCheck.changed,
        changeDate: strategyCheck.changeDate
      });

      console.log(`📊 Info Estratégia:`, {
        current: currentStrategy,
        changed: strategyCheck.changed,
        changeDate: strategyCheck.changeDate
      });
    };

    fetchStrategyInfo();
    
    const interval = setInterval(fetchStrategyInfo, 60000);
    return () => clearInterval(interval);
  }, [config]);

  if (!strategyInfo) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-gradient-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <CardTitle>Estratégia Atual</CardTitle>
        </div>
        <CardDescription>
          Sistema de ajuste automático ativo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2 text-sm">
              <p><strong>Estratégia em Uso:</strong> {strategyInfo.currentStrategy}</p>
              
              {config && (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>• Alavancagem: {config.leverage}x</p>
                  <p>• Stop Loss: {config.stopLoss}%</p>
                  <p>• Take Profit: {config.takeProfit}%</p>
                  <p>• Confiança Mínima: {config.minConfidence}%</p>
                  <p>• Budget por Trade: 10% do saldo</p>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>

        {strategyInfo.changed && strategyInfo.changeDate && (
          <Alert className="border-success/50 bg-success/5">
            <Info className="h-4 w-4 text-success" />
            <AlertDescription className="text-sm">
              <p><strong>Mudança Recente Detectada</strong></p>
              <p className="text-muted-foreground mt-1">
                Estratégia ajustada automaticamente em {new Date(strategyInfo.changeDate).toLocaleString('pt-BR')}
              </p>
              <p className="text-muted-foreground mt-1">
                O sistema está monitorando a performance e fará novos ajustes automáticos se necessário.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {!strategyInfo.changed && (
          <p className="text-xs text-muted-foreground">
            O sistema adaptativo monitora continuamente a performance e ajusta <strong>automaticamente</strong>
            os parâmetros de trading para otimizar resultados e prevenir perdas consecutivas. Nenhuma ação manual é necessária.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
