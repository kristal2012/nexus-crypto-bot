import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MarketPriceProps {
  symbol: string;
}

export const MarketPrice = ({ symbol }: MarketPriceProps) => {
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`);
        const data = await response.json();
        setPrice(parseFloat(data.lastPrice));
        setChange(parseFloat(data.priceChangePercent));
        setLoading(false);
      } catch (error) {
        console.error("Error fetching price:", error);
        setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);

    return () => clearInterval(interval);
  }, [symbol]);

  const isPositive = change >= 0;

  return (
    <Card className="p-4 bg-gradient-card border-border shadow-card hover:shadow-glow/10 transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">{symbol}</span>
        <div className={`flex items-center gap-1 text-xs font-medium ${
          isPositive ? "text-success" : "text-destructive"
        }`}>
          {isPositive ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {isPositive ? "+" : ""}{change.toFixed(2)}%
        </div>
      </div>
      
      {loading ? (
        <div className="h-8 bg-secondary animate-pulse rounded" />
      ) : (
        <p className="text-2xl font-bold font-mono text-foreground">
          ${price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      )}
      
      <p className="text-xs text-muted-foreground mt-1">Binance Futures</p>
    </Card>
  );
};
