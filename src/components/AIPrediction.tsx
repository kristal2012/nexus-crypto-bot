import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { usePricePrediction } from "@/hooks/usePricePrediction";

interface AIPredictionProps {
  symbol: string;
  currentPrice: number;
  historicalPrices: number[];
}

export const AIPrediction = ({ symbol, currentPrice, historicalPrices }: AIPredictionProps) => {
  const { prediction, isLoading } = usePricePrediction(symbol, historicalPrices);

  const getTrendIcon = () => {
    if (!prediction) return <Minus className="h-4 w-4" />;
    switch (prediction.trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getTrendColor = () => {
    if (!prediction) return "secondary";
    switch (prediction.trend) {
      case 'up':
        return "default";
      case 'down':
        return "destructive";
      default:
        return "secondary";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Previsão IA - {symbol}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">
            Analisando padrões...
          </div>
        ) : prediction ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Preço Atual</span>
              <span className="font-medium">${currentPrice.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Previsão</span>
              <div className="flex items-center gap-2">
                {getTrendIcon()}
                <span className="font-bold">${prediction.predictedPrice.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Confiança</span>
              <Badge variant="outline">
                {(prediction.confidence * 100).toFixed(0)}%
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tendência</span>
              <Badge variant={getTrendColor()}>
                {prediction.trend === 'up' ? 'Alta' : prediction.trend === 'down' ? 'Baixa' : 'Neutra'}
              </Badge>
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Baseado em análise de {historicalPrices.length} pontos de dados usando LSTM
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            Dados insuficientes para previsão (mínimo 10 pontos)
          </div>
        )}
      </CardContent>
    </Card>
  );
};
