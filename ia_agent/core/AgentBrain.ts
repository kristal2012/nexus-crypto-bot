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

  // Monitoramento de Preços da Binance (VIA PROXY + FALLBACK MULTI-SOURCE)
  public async scanBinanceMarket() {
    this.log("📡 [MARKET] Analisando preços e volatilidade na Binance (via Proxy/Mirrors)...");

    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
      const results: MarketMetrics[] = [];
      const startTime = Date.now();

      // Fontes em ordem de prioridade (do mais rápido ao mais confiável)
      const VERCEL_PROXY = process.env.VITE_BINANCE_PROXY_URL || 'https://volatile-trader-app.vercel.app/api/binance-proxy';
      // Spot API (sem geo-block para a maioria das regiões) e mirrors
      const BINANCE_SPOT_MIRRORS = [
        'https://api.binance.com/api/v3',
        'https://api1.binance.com/api/v3',
        'https://api2.binance.com/api/v3',
        'https://api3.binance.com/api/v3',
      ];

      // Mapeamento para CoinGecko IDs (fallback final)
      const COINGECKO_IDS: Record<string, string> = {
        'BTCUSDT': 'bitcoin',
        'ETHUSDT': 'ethereum',
        'SOLUSDT': 'solana',
        'BNBUSDT': 'binancecoin',
        'XRPUSDT': 'ripple',
      };

      for (const symbol of symbols) {
        let data: any = null;
        let success = false;

        // 1. Tentar via Proxy Vercel
        try {
          const proxyUrl = new URL(VERCEL_PROXY);
          proxyUrl.searchParams.append('path', '/api/v3/ticker/24hr');
          proxyUrl.searchParams.append('symbol', symbol);
          const response = await fetch(proxyUrl.toString(), { signal: AbortSignal.timeout(4000) });
          if (response.ok) {
            data = await response.json();
            success = true;
          }
        } catch (_) { /* silently try next */ }

        // 2. Fallback: Binance Spot API (api.binance.com - geralmente sem geo-block)
        if (!success) {
          for (const base of BINANCE_SPOT_MIRRORS) {
            try {
              const url = `${base}/ticker/24hr?symbol=${symbol}`;
              const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
              if (response.ok) {
                data = await response.json();
                success = true;
                break;
              }
            } catch (_) { continue; }
          }
        }

        // 3. Fallback final: CoinGecko (API pública, sem autenticação)
        if (!success) {
          try {
            const geckoId = COINGECKO_IDS[symbol];
            if (geckoId) {
              const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_24hr_high=true&include_24hr_low=true`;
              const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
              if (response.ok) {
                const geckoData = await response.json();
                const coin = geckoData[geckoId];
                if (coin) {
                  const price = coin.usd || 0;
                  const high = coin.usd_24h_high || price * 1.01;
                  const low = coin.usd_24h_low || price * 0.99;
                  data = {
                    symbol,
                    lastPrice: price.toString(),
                    priceChangePercent: (coin.usd_24h_change || 0).toString(),
                    highPrice: high.toString(),
                    lowPrice: low.toString(),
                    quoteVolume: (coin.usd_24h_vol || 0).toString(),
                  };
                  success = true;
                }
              }
            }
          } catch (_) { /* all sources failed */ }
        }

        if (success && data) {
          results.push({
            symbol: data.symbol || symbol,
            price: parseFloat(data.lastPrice),
            priceChange24h: parseFloat(data.priceChangePercent),
            volatility: (parseFloat(data.highPrice) - parseFloat(data.lowPrice)) / parseFloat(data.lastPrice),
            volume24h: parseFloat(data.quoteVolume)
          });
        } else {
          this.log(`⚠️ [MARKET] Sem dados para ${symbol} em todas as fontes.`);
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
