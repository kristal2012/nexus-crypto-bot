import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, X } from "lucide-react";

interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
}

interface PositionCardProps {
  position: Position;
}

export const PositionCard = ({ position }: PositionCardProps) => {
  const isProfit = position.pnl > 0;
  
  return (
    <Card className="p-5 bg-gradient-card border-border shadow-card hover:shadow-glow/20 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            position.side === "LONG" 
              ? "bg-success/20 text-success" 
              : "bg-destructive/20 text-destructive"
          }`}>
            {position.side === "LONG" ? (
              <TrendingUp className="w-6 h-6" />
            ) : (
              <TrendingDown className="w-6 h-6" />
            )}
          </div>
          <div>
            <h4 className="text-lg font-bold text-foreground">{position.symbol}</h4>
            <Badge 
              variant={position.side === "LONG" ? "default" : "destructive"}
              className={position.side === "LONG" ? "bg-success text-success-foreground" : ""}
            >
              {position.side} {position.leverage}x
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Entrada</p>
          <p className="text-sm font-mono text-foreground">${position.entryPrice.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Atual</p>
          <p className="text-sm font-mono text-foreground">${position.currentPrice.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Quantidade</p>
          <p className="text-sm font-mono text-foreground">{position.quantity}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">P&L</p>
          <p className={`text-sm font-mono font-bold ${
            isProfit ? "text-success" : "text-destructive"
          }`}>
            {isProfit ? "+" : ""}{position.pnl.toFixed(2)} USDT
          </p>
        </div>
      </div>

      <div className={`p-3 rounded-lg border ${
        isProfit 
          ? "bg-success/10 border-success/30" 
          : "bg-destructive/10 border-destructive/30"
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Retorno</span>
          <span className={`text-lg font-bold ${
            isProfit ? "text-success" : "text-destructive"
          }`}>
            {isProfit ? "+" : ""}{position.pnlPercent.toFixed(2)}%
          </span>
        </div>
      </div>
    </Card>
  );
};
