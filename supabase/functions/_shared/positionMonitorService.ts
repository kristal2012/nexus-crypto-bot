/**
 * Position Monitor Service - Estratégia simplificada e otimizada
 * Princípios: SRP, KISS, YAGNI
 * Apenas TP e SL - sem trailing stop (remover complexidade desnecessária)
 */

import { getCurrentPrice } from './priceService.ts';

interface Position {
  id: string;
  symbol: string;
  entry_price: string;
  quantity: string;
}

interface MonitorResult {
  symbol: string;
  reason: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl?: number;
}

interface EvaluationResult {
  shouldClose: boolean;
  reason: string;
  currentPrice: number | null;
  pnl: number;
  pnlPercent: number;
}

/**
 * SSOT: Avalia posição usando configuração do usuário
 * Recebe stopLossPercent e takeProfitPercent de auto_trading_config
 */
export async function evaluatePosition(
  position: Position,
  stopLossPercent: number,
  takeProfitPercent: number
): Promise<EvaluationResult> {
  const currentPrice = await getCurrentPrice(position.symbol);
  
  if (!currentPrice) {
    return { 
      shouldClose: false, 
      reason: '', 
      currentPrice: null, 
      pnl: 0, 
      pnlPercent: 0 
    };
  }

  const entryPrice = parseFloat(position.entry_price);
  const quantity = parseFloat(position.quantity);
  const positionValue = entryPrice * quantity;
  const unrealizedPnL = (currentPrice - entryPrice) * quantity;
  const pnlPercent = (unrealizedPnL / positionValue) * 100;

  // 1. TAKE PROFIT (usando valor da config do usuário)
  if (unrealizedPnL > 0 && pnlPercent >= takeProfitPercent) {
    return {
      shouldClose: true,
      reason: 'TAKE_PROFIT',
      currentPrice,
      pnl: unrealizedPnL,
      pnlPercent
    };
  }

  // 2. STOP LOSS (usando valor da config do usuário)
  const stopLossAmount = (positionValue * stopLossPercent) / 100;
  if (unrealizedPnL < 0 && Math.abs(unrealizedPnL) >= stopLossAmount) {
    return {
      shouldClose: true,
      reason: 'STOP_LOSS',
      currentPrice,
      pnl: unrealizedPnL,
      pnlPercent
    };
  }

  // Posição não atinge nenhum critério de saída - mantém aberta
  return {
    shouldClose: false,
    reason: '',
    currentPrice,
    pnl: unrealizedPnL,
    pnlPercent
  };
}

export async function closePosition(
  supabase: any,
  position: Position,
  currentPrice: number,
  reason: string
): Promise<MonitorResult | null> {
  try {
    const { data: tradeResult, error: tradeError } = await supabase.functions.invoke('auto-trade', {
      body: {
        symbol: position.symbol,
        side: 'SELL',
        quantity: position.quantity.toString()
      }
    });

    if (!tradeError && tradeResult?.success) {
      const entryPrice = parseFloat(position.entry_price);
      const quantity = parseFloat(position.quantity);
      const pnl = (currentPrice - entryPrice) * quantity;

      console.log(`✅ Closed ${position.symbol}: ${reason} (P&L: ${pnl.toFixed(2)} USDT)`);
      
      return {
        symbol: position.symbol,
        reason,
        entry_price: entryPrice,
        exit_price: currentPrice,
        quantity,
        pnl
      };
    }

    return null;
  } catch (error) {
    console.error(`Error closing position ${position.symbol}:`, error);
    return null;
  }
}
