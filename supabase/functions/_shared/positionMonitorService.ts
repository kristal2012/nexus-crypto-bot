/**
 * Position Monitor Service - Lógica de monitoramento e fechamento de posições
 * Princípios: SRP, DRY
 * Agora com Trailing Stop Loss para proteger lucros
 */

import { getCurrentPrice } from './priceService.ts';
import { calculateTrailingStop, shouldMoveToBreakeven, TRAILING_STOP_CONFIGS } from './trailingStopService.ts';

interface Position {
  id: string;
  symbol: string;
  entry_price: string;
  quantity: string;
  highest_price?: string | null;
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
  highestPrice?: number;
  trailingStopPrice?: number;
  shouldUpdateHighest?: boolean;
}

export async function evaluatePosition(
  position: Position,
  stopLossPercent: number,
  takeProfitPercent: number = 5.0  // Take profit em 5% (comprovadamente lucrativo)
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

  // 1. TAKE PROFIT PRINCIPAL (5% - valor comprovado)
  if (unrealizedPnL > 0 && pnlPercent >= takeProfitPercent) {
    return {
      shouldClose: true,
      reason: 'TAKE_PROFIT',
      currentPrice,
      pnl: unrealizedPnL,
      pnlPercent
    };
  }

  // 2. TRAILING STOP LOSS (protege lucros acima de 2%)
  const highestPrice = position.highest_price ? parseFloat(position.highest_price) : null;
  const trailingConfig = TRAILING_STOP_CONFIGS.moderate; // Usa configuração moderada
  
  const trailingResult = calculateTrailingStop(
    entryPrice,
    currentPrice,
    highestPrice,
    trailingConfig
  );

  if (trailingResult.shouldClose) {
    return {
      shouldClose: true,
      reason: 'TRAILING_STOP',
      currentPrice,
      pnl: unrealizedPnL,
      pnlPercent,
      highestPrice: trailingResult.highestPrice,
      trailingStopPrice: trailingResult.trailingStopPrice
    };
  }

  // 3. BREAKEVEN PROTECTION (move stop para entrada após 2% lucro)
  if (shouldMoveToBreakeven(entryPrice, currentPrice, 2.0)) {
    // Se preço caiu abaixo da entrada após ter atingido 2% de lucro
    if (currentPrice <= entryPrice) {
      return {
        shouldClose: true,
        reason: 'BREAKEVEN_STOP',
        currentPrice,
        pnl: unrealizedPnL,
        pnlPercent
      };
    }
  }

  // 4. STOP LOSS TRADICIONAL (último recurso)
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

  // Atualiza highest_price se necessário
  return {
    shouldClose: false,
    reason: '',
    currentPrice,
    pnl: unrealizedPnL,
    pnlPercent,
    highestPrice: trailingResult.highestPrice,
    shouldUpdateHighest: trailingResult.highestPrice > (highestPrice || entryPrice)
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
