/**
 * Position Progress Bar Component
 * Mostra visualmente a posição atual do preço entre SL e TP
 */

import { Progress } from "@/components/ui/progress";

interface PositionProgressBarProps {
  slPrice: number;
  currentPrice: number;
  tpPrice: number;
  entryPrice: number;
}

export const PositionProgressBar = ({ 
  slPrice, 
  currentPrice, 
  tpPrice,
  entryPrice 
}: PositionProgressBarProps) => {
  // Calcular a posição percentual entre SL (0%) e TP (100%)
  const range = tpPrice - slPrice;
  const currentPosition = currentPrice - slPrice;
  const progressPercent = Math.max(0, Math.min(100, (currentPosition / range) * 100));
  
  // Determinar cor baseada na posição
  const getColorClass = () => {
    if (progressPercent < 33) return 'bg-red-500';
    if (progressPercent < 66) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const distanceToSL = ((currentPrice - slPrice) / currentPrice) * 100;
  const distanceToTP = ((tpPrice - currentPrice) / currentPrice) * 100;

  return (
    <div className="space-y-2 mt-3">
      {/* Labels */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <div className="text-left">
          <div className="font-medium text-red-500">SL</div>
          <div>${slPrice.toFixed(4)}</div>
          <div className="text-[10px] mt-0.5">-{distanceToSL.toFixed(2)}%</div>
        </div>
        <div className="text-center">
          <div className="font-medium">Entrada</div>
          <div>${entryPrice.toFixed(4)}</div>
        </div>
        <div className="text-right">
          <div className="font-medium text-green-500">TP</div>
          <div>${tpPrice.toFixed(4)}</div>
          <div className="text-[10px] mt-0.5">+{distanceToTP.toFixed(2)}%</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <Progress value={progressPercent} className="h-3" />
        <div 
          className={`absolute top-0 h-3 rounded-full transition-all ${getColorClass()}`}
          style={{ width: `${progressPercent}%` }}
        />
        
        {/* Indicador de posição atual */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-1 h-5 bg-foreground border-2 border-background shadow-lg"
          style={{ left: `${progressPercent}%` }}
        >
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold">
            ${currentPrice.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Zona de Risco</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Zona Neutra</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Zona de Lucro</span>
        </div>
      </div>
    </div>
  );
};