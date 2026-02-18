import { GeminiIntelService } from "../services/GeminiIntelService";
import { GroqIntelService } from "../services/GroqIntelService";
import { IntelReport, MarketMetrics, NetworkMetrics, MarketSignal } from "../types.js";

export class ArbitrageIntelAgent {
  private geminiService: GeminiIntelService;
  private groqService: GroqIntelService;
  private currentMetrics: NetworkMetrics;
  private currentMarketData: MarketMetrics[] = [];

  public onIntelReady?: (report: IntelReport) => void;
  public onLog?: (msg: string) => void;

  constructor() {
    this.geminiService = new GeminiIntelService();
    this.groqService = new GroqIntelService();
    this.currentMetrics = {
      binanceLatency: 0,
      proxyStatus: "Direct",
      lastHeartbeat: new Date().toISOString()
    };
  }

  public async start() {
    this.log("🚀 Agente de Inteligência MoltBot iniciado em modo BINANCE CEX.");
    this.log(`🔍 [ENV CHECK] Groq Key: ${process.env.GROQ_API_KEY ? 'Presente' : 'AUSENTE'}`);
    this.log(`🔍 [ENV CHECK] Gemini Key: ${process.env.API_KEY ? 'Presente' : 'AUSENTE'}`);
  }

  // Monitoramento de Preços da Binance (VIA PROXY + FALLBACK)
  public async scanBinanceMarket() {
    this.log("📡 [MARKET] Analisando preços e volatilidade na Binance (via Proxy/Mirrors)...");

    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
      const results: MarketMetrics[] = [];
      const startTime = Date.now();

      // Mirror Proxy (Bypass Geoblock)
      const VERCEL_PROXY = process.env.VITE_BINANCE_PROXY_URL || 'https://volatile-trader-app.vercel.app/api/binance-proxy';
      const BINANCE_MIRRORS = ['https://fapi.binance.me', 'https://fapi.binance.com'];

      for (const symbol of symbols) {
        let data: any = null;
        let success = false;

        // 1. Tentar via Proxy
        try {
          const proxyUrl = new URL(VERCEL_PROXY);
          proxyUrl.searchParams.append('path', '/fapi/v1/ticker/24hr');
          proxyUrl.searchParams.append('symbol', symbol);

          const response = await fetch(proxyUrl.toString());
          if (response.ok) {
            data = await response.json();
            success = true;
          } else {
            console.warn(`[DEBUG] Proxy falhou para ${symbol}: ${response.status}`);
          }
        } catch (err) {
          console.warn(`[DEBUG] Erro ao conectar no proxy para ${symbol}`);
        }

        // 2. Fallback: Tentar Mirrors Diretos (Essencial para VPS)
        if (!success) {
          for (const mirror of BINANCE_MIRRORS) {
            try {
              const url = `${mirror}/fapi/v1/ticker/24hr?symbol=${symbol}`;
              const response = await fetch(url);
              if (response.ok) {
                data = await response.json();
                success = true;
                break;
              }
            } catch (err) {
              continue;
            }
          }
        }

        if (success && data) {
          results.push({
            symbol: data.symbol,
            price: parseFloat(data.lastPrice),
            priceChange24h: parseFloat(data.priceChangePercent),
            volatility: (parseFloat(data.highPrice) - parseFloat(data.lowPrice)) / parseFloat(data.lastPrice),
            volume24h: parseFloat(data.quoteVolume)
          });
        }
      }

      this.currentMarketData = results;
      this.currentMetrics.binanceLatency = Date.now() - startTime;
      this.currentMetrics.lastHeartbeat = new Date().toISOString();

      this.log(`📈 Scanner concluído. ${results.length} pares analisados. Latência: ${this.currentMetrics.binanceLatency}ms`);

    } catch (e) {
      this.log(`❌ Erro ao buscar dados da Binance: ${e}`);
    }
  }

  public async generateStrategicReport() {
    this.log(`📊 GERANDO RELATÓRIO ESTRATÉGICO BINANCE...`);

    try {
      // Prioridade: Groq -> Gemini
      try {
        this.log(`📊 [DEBUG] Tentando Groq (Llama 3.3)...`);
        const report = await this.groqService.generateDailyStrategicReport([], this.currentMetrics, this.currentMarketData);
        this.completeReport(report);
      } catch (e) {
        this.log(`⚠️ Groq Indisponível. Tentando Gemini fallback...`);
        const report = await this.geminiService.generateDailyStrategicReport([], this.currentMetrics, this.currentMarketData);
        this.completeReport(report);
      }

    } catch (e: any) {
      this.log(`❌ [DEBUG] Falha total em todos os provedores de IA: ${e}`);
    }
  }

  private completeReport(report: IntelReport) {
    this.log(`🚀 INTELIGÊNCIA BINANCE PRONTA: Sentimento ${report.strategyUpdates.marketSentiment}`);
    if (this.onIntelReady) this.onIntelReady(report);
  }

  private log(msg: string) {
    if (this.onLog) this.onLog(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);
  }
}
