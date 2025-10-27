/**
 * Componente de Recomendação de Estratégia
 * Princípio: SRP - Responsável apenas por exibir recomendações
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertTriangle, Info } from "lucide-react";
import {
  selectOptimalStrategy,
  calculateExpectedProfit,
  calculateMaxRisk,
  calculateRiskRewardRatio,
  TRADING_STRATEGIES,
  type TradingStrategy,
} from "@/services/tradingStrategyService";

interface StrategyRecommendationProps {
  currentBalance: number;
}

export const StrategyRecommendation = ({ currentBalance }: StrategyRecommendationProps) => {
  const optimalStrategy = selectOptimalStrategy(currentBalance);
  const totalPositionSize = optimalStrategy.quantityPerLayer * optimalStrategy.numLayers;
  const expectedProfit = calculateExpectedProfit(
    totalPositionSize,
    optimalStrategy.leverage,
    optimalStrategy.takeProfit
  );
  const maxRisk = calculateMaxRisk(
    totalPositionSize,
    optimalStrategy.leverage,
    optimalStrategy.stopLoss
  );
  const riskRewardRatio = calculateRiskRewardRatio(
    optimalStrategy.stopLoss,
    optimalStrategy.takeProfit
  );

  const getStrategyColor = (name: string) => {
    switch (name) {
      case "Conservadora":
        return "bg-green-500";
      case "Moderada":
        return "bg-yellow-500";
      case "Agressiva":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Estratégia Recomendada
        </CardTitle>
        <CardDescription>
          Baseada no seu saldo atual de ${currentBalance.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Nome e Descrição */}
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getStrategyColor(optimalStrategy.name)}`} />
          <span className="font-semibold text-lg">{optimalStrategy.name}</span>
        </div>
        <p className="text-sm text-muted-foreground">{optimalStrategy.description}</p>

        {/* Parâmetros da Estratégia */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <span className="text-muted-foreground">Por Layer</span>
            <p className="font-semibold">${optimalStrategy.quantityPerLayer}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Layers</span>
            <p className="font-semibold">{optimalStrategy.numLayers}x</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Alavancagem</span>
            <p className="font-semibold">{optimalStrategy.leverage}x</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Total/Trade</span>
            <p className="font-semibold">${totalPositionSize}</p>
          </div>
        </div>

        {/* Stop Loss e Take Profit */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">Stop Loss</span>
            <p className="font-semibold text-destructive">{optimalStrategy.stopLoss}%</p>
            <p className="text-xs text-muted-foreground">Risco: ${maxRisk.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">Take Profit</span>
            <p className="font-semibold text-success">{optimalStrategy.takeProfit}%</p>
            <p className="text-xs text-muted-foreground">Ganho: ${expectedProfit.toFixed(2)}</p>
          </div>
        </div>

        {/* Relação Risco/Retorno */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Relação Risco/Retorno:</strong> 1:{riskRewardRatio.toFixed(1)}
            <br />
            Para cada ${maxRisk.toFixed(2)} em risco, você pode ganhar ${expectedProfit.toFixed(2)}
          </AlertDescription>
        </Alert>

        {/* Aviso se saldo for baixo */}
        {currentBalance < optimalStrategy.minBalance && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Saldo abaixo do recomendado para esta estratégia.
              Considere aumentar seu saldo para pelo menos ${optimalStrategy.minBalance}.
            </AlertDescription>
          </Alert>
        )}

        {/* Comparação com Estratégias */}
        <div className="pt-2 border-t space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Outras Estratégias:</p>
          {Object.values(TRADING_STRATEGIES).map((strategy) => (
            <div
              key={strategy.name}
              className={`text-xs flex justify-between p-2 rounded ${
                strategy.name === optimalStrategy.name
                  ? "bg-primary/10 border border-primary"
                  : "bg-secondary/50"
              }`}
            >
              <span>{strategy.name}</span>
              <Badge variant="outline" className="text-xs">
                Mín: ${strategy.minBalance}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
