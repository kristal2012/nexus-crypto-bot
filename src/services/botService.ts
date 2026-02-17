// Build trigger: 2026-02-17
import { localDb } from "./localDbService";
import { supabaseSync } from "./supabaseSyncService";
import { z } from "zod";
import { generateBinanceSignature } from "@/utils/binance-auth";
import { binanceService } from "./binanceService";

export interface BotConfig {
  id: string;
  user_id: string;
  is_powered_on: boolean;
  is_running: boolean;
  test_mode: boolean;
  test_balance: number;
  quantity: number;
  take_profit_percent: number;
  stop_loss_percent: number;
  daily_profit_goal: number;
  trading_pair: string;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  reset_circuit_breaker?: boolean;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price: number;
  status: 'PENDING' | 'EXECUTED' | 'FAILED' | 'CANCELLED';
  profit_loss?: number;
  executed_at?: string;
  created_at: string;
  binance_order_id?: string;
}

export interface BotLog {
  id: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  message: string;
  details?: any;
  created_at: string;
}

// Client-side validation schema to fail fast and keep SRP
const TradeRequestSchema = z.object({
  symbol: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(
      z.string().regex(/^[A-Z0-9]{1,20}USDT$/, "Símbolo inválido. Use pares USDT, ex: BTCUSDT")
    ),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive().max(1000),
  type: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
  testMode: z.boolean().default(true),
});

function normalizeSymbol(symbol: string): string {
  const s = String(symbol || '').toUpperCase().trim();
  return s.endsWith('USDT') ? s : `${s}USDT`;
}

// Serviço para gerenciar configurações do bot
export const botConfigService = {
  async getConfig(userId?: string): Promise<BotConfig | null> {
    const local = localDb.getConfig();

    // Se já temos chaves locais, retornamos o local (mais rápido)
    if (local && local.api_key_encrypted && local.api_secret_encrypted) {
      return local;
    }

    // Caso contrário, tentamos sincronizar do Cloud
    if (userId) {
      const cloud = await supabaseSync.getCloudConfig();
      if (cloud) {
        // [FIX] Só substituir as chaves se o cloud realmente tiver chaves salvas
        // Se o cloud não tiver chaves, manter as locais (se houver)
        const mergedConfig = {
          ...cloud,
          api_key_encrypted: cloud.api_key_encrypted || local?.api_key_encrypted,
          api_secret_encrypted: cloud.api_secret_encrypted || local?.api_secret_encrypted,
        };
        localDb.saveConfig(mergedConfig);
        return mergedConfig;
      }
    }

    return local;
  },

  async updateConfig(_userId: string, updates: Partial<BotConfig>): Promise<boolean> {
    const current = localDb.getConfig();
    const newConfig = { ...current, ...updates };
    localDb.saveConfig(newConfig);

    // Sync to Supabase for VPS/Cloud
    await supabaseSync.syncConfig(newConfig);
    return true;
  },

  async saveApiCredentials(_userId: string, apiKey: string, apiSecret: string): Promise<boolean> {
    console.log('💾 Salvando credenciais API...', { apiKey: apiKey ? 'presente' : 'vazio', apiSecret: apiSecret ? 'presente' : 'vazio' });
    const current = localDb.getConfig();

    console.log('📋 Config atual antes de salvar:', {
      hasApiKey: !!current.api_key_encrypted,
      hasApiSecret: !!current.api_secret_encrypted
    });

    const newConfig = {
      ...current,
      api_key_encrypted: apiKey || current.api_key_encrypted,
      api_secret_encrypted: apiSecret || current.api_secret_encrypted
    };

    console.log('📋 Config nova a ser salva:', {
      hasApiKey: !!newConfig.api_key_encrypted,
      hasApiSecret: !!newConfig.api_secret_encrypted
    });

    localDb.saveConfig(newConfig);
    console.log('✅ Credenciais salvas localmente (NÃO enviados para Supabase por segurança)');
    return true;
  },

  async createConfig(userId: string, config: Partial<BotConfig>): Promise<boolean> {
    const current = localDb.getConfig();
    localDb.saveConfig({ ...current, ...config, user_id: userId });
    return true;
  }
};

// Serviço para gerenciar trades
export const tradeService = {
  async getTrades(_userId: string, limit = 50): Promise<Trade[]> {
    return localDb.getTrades(limit);
  },

  async executeTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, testMode = true, profitLoss?: number): Promise<any> {
    // Normalize and validate input
    const bodyCandidate = {
      symbol: normalizeSymbol(symbol),
      side,
      quantity,
      type: 'MARKET' as const,
      testMode,
    };

    const parsed = TradeRequestSchema.safeParse(bodyCandidate);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || 'Invalid trade parameters');
    }

    const { symbol: finalSymbol, side: finalSide, quantity: finalQuantity, type: finalType } = parsed.data;

    // LOCAL EXECUTION (Bypass Supabase)
    // LOCAL EXECUTION (Bypass Supabase)
    const apiKey = localDb.getConfig().api_key_encrypted;
    const apiSecret = localDb.getConfig().api_secret_encrypted;

    console.log(`[TradeService] Executando ordem LOCAL: ${finalSide} ${finalQuantity} ${finalSymbol}`);

    // Obter preço atual para registro (VIA PROXY)
    // Obter preço atual para registro (VIA binanceService para compatibilidade Node/Browser)
    const priceInfo = await binanceService.getPrice(finalSymbol);
    const currentPrice = priceInfo ? priceInfo.price : 0;

    if (!priceInfo) {
      console.warn(`[TradeService] Alerta: Preço não disponível para ${finalSymbol}, usando 0.`);
    }

    if (testMode) {
      console.log(`[TradeService] [SIMULAÇÃO] Simulando ordem de ${finalSide} para ${finalSymbol} ao preço de ${currentPrice}`);

      const simulatedTrade: Trade = {
        id: `sim-${Math.random().toString(36).substr(2, 9)}`,
        symbol: finalSymbol,
        side: finalSide,
        type: finalType,
        quantity: finalQuantity,
        price: currentPrice,
        status: finalSide === 'BUY' ? 'PENDING' : 'EXECUTED',
        created_at: new Date().toISOString(),
        profit_loss: profitLoss ?? (finalSide === 'SELL' ? 0 : undefined),
      };

      // Simular delay de rede para realismo (200-500ms)
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

      await supabaseSync.syncTrade(simulatedTrade);
      await supabaseSync.syncLog('SUCCESS', `[SIMULAÇÃO] Ordem de ${finalSide} executada com sucesso via Proxy (Preço Real: $${currentPrice.toFixed(2)})`, {
        testMode: true,
        tradeId: simulatedTrade.id,
        simulatedResponse: {
          symbol: finalSymbol,
          orderId: simulatedTrade.id,
          transactTime: Date.now(),
          price: currentPrice.toString(),
          origQty: finalQuantity.toString(),
          executedQty: finalQuantity.toString(),
          status: 'FILLED',
          type: 'MARKET',
          side: finalSide
        }
      });

      console.log(`✅ [SIMULAÇÃO] Ordem de ${finalSide} ${finalSymbol} processada.`);
      return { success: true, testMode: true, trade: simulatedTrade };
    }

    if (!apiKey || !apiSecret) {
      throw new Error('API credentials not configured for real trading');
    }

    const timestamp = Date.now();
    const params: any = {
      symbol: finalSymbol,
      side: finalSide,
      type: finalType,
      quantity: finalQuantity.toString(),
      timestamp: timestamp.toString(),
    };

    const queryString = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    const signature = generateBinanceSignature(queryString, apiSecret);
    const signedQuery = `${queryString}&signature=${signature}`;

    // USAR PROXY PARA ORDEM REAL
    const proxyUrlOrder = `/api/binance-proxy?path=/fapi/v1/order&${signedQuery}`;
    console.log(`[TradeService] Enviando ordem via Proxy: ${proxyUrlOrder}`);

    const response = await fetch(proxyUrlOrder, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey }
    });

    const data = await response.json();
    if (!response.ok) {
      await supabaseSync.syncLog('ERROR', `Binance Trade Failed: ${data.msg || 'Unknown error'}`, { data });
      throw new Error(data.msg || 'Binance Trade Error');
    }

    const realTrade: Trade = {
      id: data.orderId?.toString() || Math.random().toString(36).substr(2, 9),
      symbol: finalSymbol,
      side: finalSide,
      type: finalType,
      quantity: finalQuantity,
      price: parseFloat(data.price || currentPrice),
      status: finalSide === 'BUY' ? 'PENDING' : 'EXECUTED',
      binance_order_id: data.orderId?.toString(),
      executed_at: finalSide === 'SELL' ? new Date().toISOString() : undefined,
      created_at: new Date().toISOString(),
      profit_loss: profitLoss ?? (finalSide === 'SELL' ? 0 : undefined),
    };

    await supabaseSync.syncTrade(realTrade);
    await supabaseSync.syncLog('SUCCESS', `Trade executed: ${finalSide} ${finalQuantity} ${finalSymbol}`, { testMode: false, trade: realTrade });

    return { success: true, testMode: false, trade: realTrade };
  },

  async calculateProfit(trades: Trade[]): Promise<number> {
    return trades.reduce((total, trade) => {
      return total + (trade.profit_loss || 0);
    }, 0);
  }
};

// Serviço para gerenciar logs
export const logService = {
  async getLogs(_userId: string, _limit = 100): Promise<BotLog[]> {
    // In local mode, logs can be read from files as well
    // For now returning empty or implementing a local file logger
    return [];
  },

  async addLog(level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS', message: string, details?: any): Promise<void> {
    await supabaseSync.syncLog(level, message, details);
  }
};
