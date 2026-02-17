import { binanceService } from "./binanceService";
import { tradeService, logService } from "./botService";
import { localDb } from "./localDbService";
import { multiPairService } from "./multiPairService";
import { capitalDistributionService, type CapitalAllocation } from "./capitalDistributionService";
import { momentumStrategyService } from "./momentumStrategyService";
import { RISK_SETTINGS } from "./riskService";
import { operationsStatsService } from "./operationsStatsService";
import { adaptiveStrategyService, type AdaptiveRiskParams } from "./adaptiveStrategyService";
import { moltBotIntelService } from "./moltBotIntelService";
import { statsService } from "./statsService";

export interface TradingConfig {
  userId: string;
  configId: string;
  symbols: string[]; // Agora suporta múltiplos pares
  totalCapital: number;
  quantityPerTrade?: number; // Quantidade fixa por trade (em USDT) - se não definido, usa cálculo automático
  takeProfitPercent: number;
  stopLossPercent: number;
  testMode: boolean;
  maxPositions?: number; // Máximo de posições simultâneas
}

export interface Position {
  tradeId: string;
  symbol: string;
  buyPrice: number;
  quantity: number;
  timestamp: number;
}

class TradingService {
  private isRunning = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceCheckInterval: NodeJS.Timeout | null = null;
  private reinvestInterval: NodeJS.Timeout | null = null;
  private config: TradingConfig | null = null;
  private openPositions: Map<string, Position> = new Map();
  private capitalAllocations: Map<string, CapitalAllocation> = new Map();
  private pairCooldowns: Map<string, number> = new Map(); // Timestamp da última venda por par
  private pairLossCount: Map<string, number> = new Map(); // Contador de perdas por par
  private circuitBreakerUntil: number = 0; // Timestamp até quando o circuit breaker está ativo
  private lastCBLogTime: number = 0; // Track last circuit breaker log time
  private currentAdaptiveParams: AdaptiveRiskParams | null = null; // Parâmetros adaptativos atuais
  private lastLossStreak: number = 0; // Loss streak anterior (para detectar mudanças)
  private lastAnalysisLogTime: number = 0; // Timestamp do último log de análise geral

  // FASE 3: Zona de recompra rápida
  private lastProfitableSells: Map<string, { price: number; time: number }> = new Map();

  // Momentum Trading Strategy Parameters (SSOT via RISK_SETTINGS)
  private readonly PRICE_CHECK_INTERVAL = 1000; // 1 segundo (High Frequency)
  private readonly POSITION_CHECK_INTERVAL = 1000; // 1 segundo (High Frequency)
  private readonly REINVEST_CHECK_INTERVAL = 5000; // 5 segundos
  private readonly MAX_POSITIONS = RISK_SETTINGS.MAX_POSITIONS;

  async start(config: TradingConfig): Promise<void> {
    if (this.isRunning) {
      console.log("Trading already running");
      return;
    }

    this.config = config;
    this.isRunning = true;

    console.log("Starting multi-pair automated trading...", config);

    // Iniciar serviço de múltiplos pares com os símbolos configurados
    await multiPairService.start(config.symbols);

    // Distribuir capital entre os pares
    this.capitalAllocations = await capitalDistributionService.distributeCapital(
      config.userId,
      config.totalCapital,
      config.symbols,
      config.testMode,
      config.quantityPerTrade
    );

    // multiPairService.start já loga internamente

    // Load existing open positions
    await this.loadOpenPositions();

    // Start monitoring market and positions
    this.startMarketMonitoring();
    this.startPositionMonitoring();

    // Start auto-reinvestment monitoring
    if (RISK_SETTINGS.AUTO_REINVEST) {
      this.startReinvestmentMonitoring();
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Updates trading parameters at runtime (from AI or Remote)
   */
  public updateParameters(params: Partial<AdaptiveRiskParams>): void {
    if (!this.isRunning) return;

    if (params.stopLossPercent !== undefined) RISK_SETTINGS.STOP_LOSS_PERCENT = params.stopLossPercent;
    if (params.takeProfitPercent !== undefined) RISK_SETTINGS.TAKE_PROFIT_PERCENT = params.takeProfitPercent;
    if (params.momentumBuyThreshold !== undefined) RISK_SETTINGS.MOMENTUM_BUY_THRESHOLD = params.momentumBuyThreshold;

    console.log('🧠 [TradingService] Parameters updated:', {
      SL: RISK_SETTINGS.STOP_LOSS_PERCENT,
      TP: RISK_SETTINGS.TAKE_PROFIT_PERCENT,
      Threshold: RISK_SETTINGS.MOMENTUM_BUY_THRESHOLD
    });

    // Atualizar confiança mínima no momentumStrategyService se fornecido
    if (params.minConfidence !== undefined) {
      momentumStrategyService.setMinConfidence(params.minConfidence);
    }

    // Mirror to Supabase if config is available
    if (this.config) {
      logService.addLog('INFO', 'AI/Remote updated trading parameters', { params });
    }
  }

  public getSettings() {
    return RISK_SETTINGS;
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.priceCheckInterval) {
      clearInterval(this.priceCheckInterval);
      this.priceCheckInterval = null;
    }

    if (this.reinvestInterval) {
      clearInterval(this.reinvestInterval);
      this.reinvestInterval = null;
    }

    // Parar serviço de múltiplos pares
    multiPairService.stop();

    // Fechar todas as posições abertas antes de parar
    console.log("🔴 Fechando todas as posições abertas...");
    for (const [tradeId, position] of this.openPositions) {
      try {
        const currentPrice = await binanceService.getPrice(position.symbol);
        if (currentPrice?.price) {
          await this.executeSell(position, currentPrice.price, "EMERGENCY_STOP");
        }
      } catch (e) {
        console.error(`❌ Erro ao fechar posição ${position.symbol}:`, e);
      }
    }
    this.openPositions.clear();

    console.log("Stopped Momentum Trading");
  }

  /**
   * Reconcilia o estado em memória com o banco de dados local
   */
  public async reconcile(): Promise<void> {
    console.log("🔄 [TradingService] Reconciliando posições...");
    await this.loadOpenPositions();
  }

  private async loadOpenPositions(): Promise<void> {
    if (!this.config) return;

    try {
      const trades = localDb.getTrades(200);
      const openTrades = trades.filter((t: any) => t.status === 'PENDING' && t.side === 'BUY');

      if (openTrades.length > 0) {
        console.log(`📂 Carregadas ${openTrades.length} posições abertas do banco local`);

        openTrades.forEach((trade: any) => {
          this.openPositions.set(trade.id, {
            tradeId: trade.id,
            symbol: trade.symbol,
            buyPrice: Number(trade.price),
            quantity: Number(trade.quantity),
            timestamp: new Date(trade.created_at).getTime(),
          });
        });
        console.log(`✅ ${this.openPositions.size} posições ativas carregadas`);
      }
    } catch (error) {
      console.error("Error loading open positions:", error);
    }
  }

  private startMarketMonitoring(): void {
    // Executa imediatamente para começar a acumular histórico e avaliar na largada
    (async () => {
      try {
        await this.analyzeMarketAndTrade();
      } catch (error) {
        console.error("Error in initial market analysis:", error);
      }
    })();

    this.monitoringInterval = setInterval(async () => {
      if (!this.isRunning || !this.config) return;

      try {
        await this.analyzeMarketAndTrade();
      } catch (error) {
        console.error("Error in market monitoring:", error);
      }
    }, this.PRICE_CHECK_INTERVAL);
  }

  private startPositionMonitoring(): void {
    this.priceCheckInterval = setInterval(async () => {
      if (!this.isRunning || !this.config) return;

      try {
        await this.checkOpenPositions();
      } catch (error) {
        console.error("Error in position monitoring:", error);
      }
    }, this.POSITION_CHECK_INTERVAL);
  }

  private async analyzeMarketAndTrade(): Promise<void> {
    if (!this.config) return;

    // Array para coletar resumo da análise (feedback periódico)
    const analysisSummary: string[] = [];
    const shouldLogAnalysis = Date.now() - this.lastAnalysisLogTime > 300000; // 5 minutos

    // ===== ESTRATÉGIA ADAPTATIVA (antes do Circuit Breaker) =====
    // 1. Buscar stats e aplicar estratégia adaptativa ANTES do circuit breaker
    const stats = await operationsStatsService.getTodayOperationsStats(this.config.userId);
    const lossStreak = stats.lossStreak || 0;

    // Aplicar ajuste adaptativo baseado em loss streak
    this.currentAdaptiveParams = adaptiveStrategyService.getAdaptiveParams(lossStreak);

    // Detectar mudança de modo e logar
    if (adaptiveStrategyService.hasStrategyChanged(this.lastLossStreak, lossStreak)) {
      const summary = adaptiveStrategyService.getAdjustmentSummary(this.currentAdaptiveParams);
      console.info(`🔄 ESTRATÉGIA ADAPTATIVA: ${this.currentAdaptiveParams.mode.toUpperCase()}`);
      console.info(`📊 Loss Streak: ${lossStreak} | Ajustes: ${summary}`);

      const { logService } = await import("./botService");
      await logService.addLog(
        'INFO',
        `Estratégia adaptativa ativada: ${this.currentAdaptiveParams.mode}`,
        {
          lossStreak,
          mode: this.currentAdaptiveParams.mode,
          reason: this.currentAdaptiveParams.reason,
          adjustments: summary,
        }
      );
    }
    this.lastLossStreak = lossStreak;

    // ===== INTEGRAÇÃO MOLTBOT INTEL (Gemini/Groq) =====
    // Aplicar ajustes sugeridos pela inteligência externa
    const intel = moltBotIntelService.getLatestIntel();
    if (intel) {
      console.info(`🧠 [MoltBot Intel] Relatório de ${new Date(intel.date).toLocaleTimeString()} carregado.`);
      // O moltBotIntelService.applyIntelToRisk ajusta parâmetros em tempo real
      // Aqui poderíamos injetar modificadores na estratégia adaptive
    }

    // ===== CIRCUIT BREAKER (após ajustes adaptativos) =====
    const now = Date.now();
    if (now < this.circuitBreakerUntil) {
      const minutesLeft = Math.ceil((this.circuitBreakerUntil - now) / 60000);
      if (minutesLeft > 0) {
        console.log(`🚫 Circuit breaker ativo (${minutesLeft} min restantes)`);
      }
      return; // Não entrar em novas operações
    }

    // 2. Verificar circuit breaker baseado em estatísticas do dia
    const cbCheck = operationsStatsService.shouldActivateCircuitBreaker(stats, this.config.totalCapital);

    if (cbCheck.shouldPause) {
      this.circuitBreakerUntil = cbCheck.pauseUntil;
      const minutesLeft = Math.ceil((cbCheck.pauseUntil - now) / 60000);
      console.log(`⚠️ Circuit breaker ativado: ${cbCheck.reason}`);

      // Registrar log persistente na primeira vez que detectar
      if (!this.lastCBLogTime || now - this.lastCBLogTime > 300000) { // Log a cada 5min
        const { logService } = await import("./botService");
        await logService.addLog(
          'WARNING',
          `Circuit Breaker Ativado: ${cbCheck.reason}`,
          {
            lossStreak: stats.lossStreak,
            dailyPnL: stats.dailyPnL,
            pauseMinutes: minutesLeft,
            pauseUntil: new Date(cbCheck.pauseUntil).toISOString(),
          }
        );
        this.lastCBLogTime = now;
      }

      logService.addLog('ERROR', `Trading pausado: ${cbCheck.reason}`);
      return;
    }

    // 3. Log estado da estratégia adaptativa (se ativa)
    if (this.currentAdaptiveParams && this.currentAdaptiveParams.mode !== 'normal') {
      console.info(`🛡️ Modo ${this.currentAdaptiveParams.mode.toUpperCase()} ativo | Loss Streak: ${lossStreak}`);
    }

    // Verificar se atingimos o limite de posições
    const maxPositions = this.config.maxPositions || this.MAX_POSITIONS;
    if (this.openPositions.size >= maxPositions) {
      return; // Já temos posições suficientes abertas
    }

    // Analisar todos os pares monitorados
    for (const symbol of this.config.symbols) {
      try {
        // Buscar candles para Mean Reversion (necessário 21+ para BB+RSI)
        const candles = await binanceService.getCandles(symbol, '1m', 50);
        if (!candles || candles.length < 3) {
          console.log(`${symbol}: Aguardando dados de candles...`);
          continue;
        }

        const currentPrice = candles[candles.length - 1].close;

        // Adicionar candles ao histórico do multi-pair service
        const pairMonitor = multiPairService.getPair(symbol);
        if (pairMonitor) {
          candles.forEach(candle => multiPairService.addCandle(symbol, candle));
        }

        // Buscar dados de mercado (incluindo volume) para compatibilidade
        const marketData = await binanceService.getMarketData(symbol);
        const volume = marketData?.volume;

        // Adicionar preço e volume ao histórico do multi-pair service (compatibilidade)
        multiPairService.addPrice(symbol, currentPrice, volume);

        if (!pairMonitor || candles.length < 3) {
          // Aguardar histórico mínimo para análise (3 candles)
          continue;
        }

        // Verificar se já temos posição aberta neste par
        const hasOpenPosition = Array.from(this.openPositions.values())
          .some(pos => pos.symbol === symbol);

        if (hasOpenPosition) continue;

        // ===== FASE 3: ZONA DE RECOMPRA RÁPIDA =====
        const lastProfitSell = this.lastProfitableSells.get(symbol);
        const now = Date.now();

        // Se vendeu com lucro nos últimos 30s e preço voltou para zona de compra
        if (lastProfitSell && now - lastProfitSell.time < 30000) {
          const momentum = momentumStrategyService.analyzeMomentum(
            pairMonitor?.lastPrices || [],
            undefined,
            candles
          );
          const avgLows = momentum.avgLows || 0;
          const rebuyZone = avgLows * 1.003; // +0.3% de tolerância

          if (currentPrice <= rebuyZone) {
            // [FIX] Verificar se NÃO já tem posição aberta para este símbolo
            if (this.openPositions.has(symbol)) {
              console.log(`⏭️ ${symbol} RECOMPRA: Posição já existe, ignorando`);
              continue;
            }
            console.log(`🔄 ${symbol} RECOMPRA RÁPIDA: Preço voltou para $${currentPrice.toFixed(2)} (zona: $${rebuyZone.toFixed(2)})`);
            const allocation = this.capitalAllocations.get(symbol);
            if (allocation && this.openPositions.size < maxPositions) {
              await this.executeBuy(symbol, currentPrice, allocation.quantity);
              this.lastProfitableSells.delete(symbol); // Limpar após recompra
              continue;
            }
          }
        }

        // ===== COOLDOWN DINÂMICO com parâmetros adaptativos =====
        const lastSellTime = this.pairCooldowns.get(symbol) || 0;
        const lossCount = this.pairLossCount.get(symbol) || 0;

        // Cooldown adaptativo (aumenta em modo defensivo)
        const adaptiveCooldownSeconds = this.currentAdaptiveParams?.pairCooldownSeconds || RISK_SETTINGS.PAIR_COOLDOWN_SECONDS;
        const baseCooldownMs = adaptiveCooldownSeconds * 1000;
        const lossCooldownMs = lossCount * RISK_SETTINGS.LOSS_COOLDOWN_BASE_MINUTES * 60000;
        const totalCooldownMs = baseCooldownMs + lossCooldownMs;

        if (now - lastSellTime < totalCooldownMs) {
          const remainingMinutes = Math.ceil((totalCooldownMs - (now - lastSellTime)) / 60000);
          if (lossCount > 0) {
            console.log(`⏳ ${symbol} em cooldown estendido (${remainingMinutes} min | ${lossCount} perdas recentes)`);
          } else {
            console.log(`⏳ ${symbol} em cooldown (${remainingMinutes} min)`);
          }
          continue;
        }

        // === THREE MIN/MAX STRATEGY ===
        // Analisar momentum do par com candles FRESCOS (50 candles)
        const volumes = pairMonitor.lastVolumes.length > 0 ? pairMonitor.lastVolumes : undefined;
        const momentum = momentumStrategyService.analyzeMomentum(
          pairMonitor.lastPrices,
          volumes,
          candles // CORREÇÃO: usar candles frescos (50) ao invés de pairMonitor.lastCandles (20)
        );

        // Aplicar filtros adaptativos (liquidez + volatilidade)
        const quoteVolume = marketData?.volume && marketData?.price
          ? marketData.volume * marketData.price
          : undefined;

        // Filtro 1: Liquidez com parâmetros adaptativos
        const minQuoteVolumeAdaptive = this.currentAdaptiveParams?.minQuoteVolume24hUsdt || RISK_SETTINGS.MIN_QUOTE_VOLUME_24H_USDT;
        if (quoteVolume && quoteVolume < minQuoteVolumeAdaptive) {
          console.log(`❌ ${symbol}: Volume insuficiente (${(quoteVolume / 1_000_000).toFixed(1)}M < ${(minQuoteVolumeAdaptive / 1_000_000).toFixed(1)}M) [${this.currentAdaptiveParams?.mode || 'normal'}]`);
          continue;
        }

        // Filtro 2: Volatilidade com parâmetros adaptativos
        const recentPrices = pairMonitor.lastPrices.slice(-RISK_SETTINGS.VOLATILITY_WINDOW_TICKS);
        const volatility = momentumStrategyService.calculateShortTermVolatility(recentPrices);
        const minVolatilityAdaptive = this.currentAdaptiveParams?.minVolatilityPercent || RISK_SETTINGS.MIN_VOLATILITY_PERCENT;
        if (volatility < minVolatilityAdaptive) {
          console.log(`❌ ${symbol}: Volatilidade baixa (${volatility.toFixed(3)}% < ${minVolatilityAdaptive.toFixed(3)}%) [${this.currentAdaptiveParams?.mode || 'normal'}]`);
          continue;
        }

        const signal = momentumStrategyService.generateBuySignal(
          symbol,
          momentum,
          quoteVolume,
          pairMonitor.lastPrices,
          candles // CORREÇÃO: usar candles frescos (50) ao invés de pairMonitor.lastCandles (20)
        );

        const avgLows = momentum.avgLows || 0;
        const avgHighs = momentum.avgHighs || 0;

        // Log detalhado com razão do sinal
        if (signal.confidence > 0) {
          console.log(`🎯 ${symbol} | Preço: $${currentPrice.toFixed(2)} | Confiança: ${(signal.confidence * 100).toFixed(0)}% | ${signal.reason}`);
        } else {
          console.log(`📊 ${symbol} | ${signal.reason}`);
        }

        // FEEDBACK: Coletar dados para log periódico
        if (shouldLogAnalysis) {
          const status = signal.confidence > 0 ? 'SINAL' : 'AGUARDA';
          // Usar reason pois indicators não está exposto na interface MomentumSignal
          analysisSummary.push(`${symbol}: ${status} [${signal.reason}]`);
        }

        // Debug: Verificar por que sinais não estão sendo aceitos
        console.log(`🔍 DEBUG ${symbol}: shouldBuy=${signal.shouldBuy}, confidence=${signal.confidence.toFixed(2)}, openPositions=${this.openPositions.size}/${maxPositions}, candles=${candles.length}`);

        // Sanidade: Confirmar que estamos usando os candles corretos
        console.log(`🧪 Candles usados p/ sinal ${symbol}: fresh=${candles.length}, monitor=${pairMonitor.lastCandles?.length ?? 0}`);

        // Verificar sinal de compra com alocação adaptativa
        // [FIX] Verificar se já existe posição aberta para este símbolo (usando símbolo, não tradeId)
        const hasOpenPositionForSymbol = Array.from(this.openPositions.values())
          .some(pos => pos.symbol === symbol);

        // Calcular capital já alocado em posições abertas
        const allocatedCapital = Array.from(this.openPositions.values())
          .reduce((sum, pos) => sum + (pos.buyPrice * pos.quantity), 0);

        const availableCapital = this.config.totalCapital - allocatedCapital;

        const allocation = this.capitalAllocations.get(symbol);
        const tradeCost = allocation ? allocation.quantity * currentPrice : 0;

        if (signal.shouldBuy &&
          this.openPositions.size < maxPositions &&
          !hasOpenPositionForSymbol &&
          availableCapital >= tradeCost) {

          if (allocation && tradeCost > 0) {
            // Ajustar quantidade baseado em alocação adaptativa
            const adaptiveAllocationPercent = this.currentAdaptiveParams?.maxAllocationPerPairPercent || RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT;
            const originalAllocationPercent = RISK_SETTINGS.MAX_ALLOCATION_PER_PAIR_PERCENT;
            const allocationFactor = adaptiveAllocationPercent / originalAllocationPercent;
            const adjustedQuantity = allocation.quantity * allocationFactor;

            console.log(`🎯 Sinal de compra: ${signal.reason} | Alocação: ${adaptiveAllocationPercent}% (${this.currentAdaptiveParams?.mode || 'normal'})`);
            console.log(`💰 Capital: disponível $${availableCapital.toFixed(2)} | custo trade: $${tradeCost.toFixed(2)}`);
            await this.executeBuy(symbol, currentPrice, adjustedQuantity);
          }
        } else if (hasOpenPositionForSymbol) {
          console.log(`⏭️ ${symbol}: Posição já existe para este símbolo, ignorando sinal`);
        } else if (availableCapital < tradeCost) {
          console.log(`⚠️ ${symbol}: Capital insuficiente (disponível: $${availableCapital.toFixed(2)}, necessário: $${tradeCost.toFixed(2)})`);
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }
    }
  }

  // Log periódico do estado do mercado (Heartbeat para o Dashboard)
  if(shouldLogAnalysis && analysisSummary.length > 0) {
  console.log('📡 Enviando resumo de mercado para o Dashboard...');
  logService.addLog('INFO', `Análise de Mercado (${analysisSummary.length} pares)`, {
    timestamp: new Date().toISOString(),
    summary: analysisSummary
  });
  this.lastAnalysisLogTime = Date.now();
}
  }

  private async checkOpenPositions(): Promise < void> {
  if(!this.config) return;

  // [RECONCILIATION] Se a memória estiver vazia mas houver trades abertas no DB, carregar
  if(this.openPositions.size === 0) {
  const stats = await statsService.getAccountStats(this.config.userId, this.config.testMode, this.config.totalCapital);
  if (stats.activeTrades.length > 0) {
    console.log(`🔄 [Reconciliation] Recuperando ${stats.activeTrades.length} posições abertas do armazenamento local.`);
    stats.activeTrades.forEach(t => {
      this.openPositions.set(t.id, {
        tradeId: t.id,
        symbol: t.symbol,
        buyPrice: t.price,
        quantity: t.quantity,
        timestamp: new Date(t.created_at).getTime()
      });
    });
  }
}

if (this.openPositions.size === 0) return;

for (const [tradeId, position] of this.openPositions.entries()) {
  const now = Date.now();
  const elapsedMinutes = (now - position.timestamp) / 60000;

  // Verificar se posição está expirada (hold time)
  if (elapsedMinutes > RISK_SETTINGS.MAX_HOLD_MINUTES) {
    console.log(`⚠️ Marcando posição expirada como TIMEOUT_EXIT: ${position.symbol} (${elapsedMinutes.toFixed(0)} min > ${RISK_SETTINGS.MAX_HOLD_MINUTES} min)`);
    const currentPriceData = await binanceService.getPrice(position.symbol);
    await this.executeSell(position, currentPriceData?.price || position.buyPrice, "TIMEOUT_EXIT");
    continue;
  }

  const currentPriceResult = await binanceService.getPrice(position.symbol);
  if (!currentPriceResult) continue;
  const currentPrice = currentPriceResult.price;

  const profitPercent = ((currentPrice - position.buyPrice) / position.buyPrice) * 100;

  // Parâmetros adaptativos ou padrão
  const adaptiveTakeProfit = this.currentAdaptiveParams?.takeProfitPercent || this.config?.takeProfitPercent || RISK_SETTINGS.TAKE_PROFIT_PERCENT;
  const adaptiveStopLoss = this.currentAdaptiveParams?.stopLossPercent || this.config?.stopLossPercent || RISK_SETTINGS.STOP_LOSS_PERCENT;
  const adaptiveProfitProtect = this.currentAdaptiveParams?.profitProtectThreshold || RISK_SETTINGS.PROFIT_PROTECT_THRESHOLD;

  // Log detalhado de monitoramento (importante para o usuário ver que está vivo)
  const targetTP = position.buyPrice * (1 + (adaptiveTakeProfit / 100));
  const targetSL = position.buyPrice * (1 - (adaptiveStopLoss / 100));
  const distTP = ((targetTP - currentPrice) / currentPrice) * 100;

  console.log(`📡 [Monitor] ${position.symbol} | Preço: $${currentPrice.toFixed(2)} | P/L: ${profitPercent.toFixed(2)}% | Alvo: $${targetTP.toFixed(2)} (${distTP.toFixed(2)}% p/ TP) | SL: $${targetSL.toFixed(2)}`);

  // 1. Take Profit
  if (profitPercent >= adaptiveTakeProfit) {
    console.log(`✅ Take profit atingido em ${position.symbol}: ${profitPercent.toFixed(2)}%`);
    await this.executeSell(position, currentPrice, "TAKE_PROFIT");
    continue;
  }

  // 2. Stop Loss
  if (profitPercent <= -adaptiveStopLoss) {
    console.log(`🛑 Stop loss atingido em ${position.symbol}: ${profitPercent.toFixed(2)}%`);
    await this.executeSell(position, currentPrice, "STOP_LOSS");
    continue;
  }

  // 3. Estratégias Adicionais (Bollinger, RSI, etc)
  const candles = await binanceService.getCandles(position.symbol, '1m', 50);
  if (candles && candles.length >= 21) {
    if (momentumStrategyService.shouldSell(candles, position.buyPrice)) {
      console.log(`💰 [Strategy] Venda por Mean Reversion detectada em ${position.symbol}`);
      await this.executeSell(position, currentPrice, "STRATEGY_EXIT");
      continue;
    }

    const momentum = momentumStrategyService.analyzeMomentum([], undefined, candles);
    const avgHighs = momentum.avgHighs || 0;

    // Proteção de lucro parcil
    if (profitPercent >= adaptiveProfitProtect && currentPrice >= avgHighs * 0.98) {
      console.log(`💰 [ProfitProtect] Protegendo lucro atual em ${position.symbol}: ${profitPercent.toFixed(2)}%`);
      await this.executeSell(position, currentPrice, "PROFIT_PROTECT");
      continue;
    }
  }
}
  }

  /**
   * Monitora capital liberado e reinveste automaticamente
   */
  private startReinvestmentMonitoring(): void {
  this.reinvestInterval = setInterval(async () => {
    if (!this.isRunning || !this.config) return;

    try {
      // Se temos menos posições que o máximo, tentar abrir novas
      const maxPositions = this.config.maxPositions || this.MAX_POSITIONS;
      if (this.openPositions.size < maxPositions) {
        console.log(`💰 Capital disponível para reinvestimento. Posições abertas: ${this.openPositions.size}/${maxPositions}`);
        // O analyzeMarketAndTrade já vai cuidar de abrir novas posições
      }
    } catch (error) {
      console.error("Error in reinvestment monitoring:", error);
    }
  }, this.REINVEST_CHECK_INTERVAL);
}

  private async executeBuy(symbol: string, price: number, quantity: number): Promise < void> {
  if(!this.config) return;

  try {
    console.log(`🟢 Executando COMPRA: ${symbol} @ $${price.toFixed(2)} (qty: ${quantity})`);

    const result = await tradeService.executeTrade(
      symbol,
      "BUY",
      quantity,
      this.config.testMode
    );

    if(result && result.trade) {
  this.openPositions.set(result.trade.id, {
    tradeId: result.trade.id,
    symbol: symbol,
    buyPrice: price,
    quantity: quantity,
    timestamp: Date.now(),
  });

  logService.addLog('SUCCESS', `🚀 Compra: ${symbol} @ $${price.toFixed(2)}`);
}
    } catch (error: any) {
  console.error("Error executing buy:", error);
  logService.addLog('ERROR', "Erro ao executar compra", {
    message: error?.message || 'Erro desconhecido',
    stack: error?.stack
  });
}
  }

  private async executeSell(position: Position, price: number, reason: string): Promise < void> {
  if(!this.config) return;

  try {
    const profitPercent = ((price - position.buyPrice) / position.buyPrice) * 100;
    const reasonEmoji = reason === "TAKE_PROFIT" ? "✅" : reason === "STOP_LOSS" ? "🛑" : "⚠️";

    console.log(`[TradeService] [${this.config.testMode ? 'SIMULAÇÃO' : 'REAL'}] Executando ${position.symbol} @ $${price.toFixed(2)} | ${reason} (${profitPercent.toFixed(2)}%)`);

    // Trava de segurança extra
    if(this.config.testMode && !this.config.testMode === false) {
  // redundância para garantir que nada passe
}

const result = await tradeService.executeTrade(
  position.symbol,
  "SELL",
  position.quantity,
  this.config.testMode
);

if (result) {
  // Calculate profit/loss
  const profitLoss = binanceService.calculateProfitLoss(
    position.buyPrice,
    price,
    position.quantity
  );

  // Pass profit_loss to trade execution
  await tradeService.executeTrade(
    position.symbol,
    "SELL",
    position.quantity,
    this.config.testMode,
    profitLoss
  );

  // Remover posição após venda
  this.openPositions.delete(position.tradeId);

  // Registrar cooldown do par
  this.pairCooldowns.set(position.symbol, Date.now());

  // ===== COOLDOWN DINÂMICO: Atualizar contador de perdas =====
  if (reason === "STOP_LOSS") {
    const currentCount = this.pairLossCount.get(position.symbol) || 0;
    this.pairLossCount.set(position.symbol, currentCount + 1);
    console.log(`📉 Perda registrada para ${position.symbol} (total: ${currentCount + 1})`);
  } else if (reason === "TAKE_PROFIT" || reason === "PROFIT_PROTECT" || reason === "STRATEGY_EXIT") {
    // Reset contador de perdas ao ter sucesso
    this.pairLossCount.set(position.symbol, 0);
    console.log(`✅ Contador de perdas resetado para ${position.symbol}`);

    // FASE 3: Registrar venda lucrativa para zona de recompra
    this.lastProfitableSells.set(position.symbol, {
      price: price,
      time: Date.now()
    });
    console.log(`🔄 Zona de recompra ativada para ${position.symbol} (30s)`);
  }

  logService.addLog('SUCCESS',
    `${reasonEmoji} Venda: ${position.symbol} @ $${price.toFixed(2)} | ${profitPercent > 0 ? "Lucro" : "Perda"}: ${profitPercent.toFixed(2)}%`
  );

  // Após venda, capital está disponível para reinvestimento automático
  console.log(`💰 Capital liberado! Posições restantes: ${this.openPositions.size}/${this.MAX_POSITIONS}`);
}
    } catch (error) {
  console.error("Error executing sell:", error);
  logService.addLog('ERROR', `Erro ao executar venda: ${position.symbol}`);
}
  }

isActive(): boolean {
  return this.isRunning;
}

getOpenPositionsCount(): number {
  return this.openPositions.size;
}

getWatchedPairsCount(): number {
  return multiPairService.getWatchedPairsCount();
}

getCapitalAllocations(): Map < string, CapitalAllocation > {
  return this.capitalAllocations;
}

  /**
   * Retorna estado atual do circuit breaker
   */
  async getCircuitBreakerState(): Promise < {
  active: boolean;
  minutesLeft: number;
  reason: string;
} > {
  if(!this.config) {
  return { active: false, minutesLeft: 0, reason: '' };
}

const opStats = await operationsStatsService.getTodayOperationsStats(this.config.userId);
const cbCheck = operationsStatsService.shouldActivateCircuitBreaker(
  opStats,
  this.config.totalCapital
);

return {
  active: cbCheck.shouldPause,
  minutesLeft: Math.ceil((cbCheck.pauseUntil - Date.now()) / 60000),
  reason: cbCheck.reason,
};
  }

  /**
   * Limpa circuit breaker (apenas em modo teste com confirmação)
   */
  async clearCircuitBreaker(): Promise < boolean > {
  if(!this.config) return false;

  // Apenas permitido em modo teste
  if(!this.config.testMode) {
  console.warn('⚠️ Clear circuit breaker só permitido em modo teste');
  return false;
}

console.log('✅ Circuit breaker limpo manualmente (modo teste)');
this.lastCBLogTime = 0;
this.circuitBreakerUntil = 0;

// Log da ação
const { logService } = await import("./botService");
await logService.addLog(
  'INFO',
  'Circuit Breaker limpo manualmente (modo teste)',
  { timestamp: new Date().toISOString() }
);

return true;
  }
}

export const tradingService = new TradingService();
