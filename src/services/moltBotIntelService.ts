import { RISK_SETTINGS } from './riskService';

// Módulos Node.JS protegidos para não quebrar o build do Vite (Frontend)
let fs: any = null;
let path: any = null;

const isBrowser = typeof window !== 'undefined';

if (!isBrowser) {
    import('fs').then(module => fs = module);
    import('path').then(module => path = module);
}

interface MoltBotIntel {
    networkAnalysis: {
        recommendedLatencyMax: number;
        stableMirror: string;
        cexTriggerThreshold: number;
    };
    strategyUpdates: {
        topPairs: string[];
        marketSentiment: string;
        volatilityAlerts: string[];
        competitorBehaviors: string;
    };
    optimizedParameters: {
        takeProfitPercent: number;
        stopLossPercent: number;
        orderSizeMultiplier: number;
        maxPositions: number;
        minConfidence?: number;
    };
    date: string;
    provider: string;
}

class MoltBotIntelService {
    private intelPath: string | null = null;

    constructor() {
        if (!isBrowser) {
            this.intelPath = 'C:\\THE_FLASH_BOT\\data\\intelligence\\latest_intel.json';
        }
    }

    public getLatestIntel(): MoltBotIntel | null {
        if (isBrowser || !this.intelPath) {
            return null;
        }

        try {
            if (!fs?.existsSync(this.intelPath)) {
                console.warn(`[MoltBot] Relatório não encontrado em: ${this.intelPath}`);
                return null;
            }

            const content = fs.readFileSync(this.intelPath, 'utf-8');
            return JSON.parse(content) as MoltBotIntel;
        } catch (error) {
            console.error('[MoltBot] Erro ao ler inteligência:', error);
            return null;
        }
    }

    public applyIntelToRisk(currentParams: any): any {
        const intel = this.getLatestIntel();
        if (!intel) return currentParams;

        console.log(`🧠 [MoltBot] Aplicando Inteligência ${intel.provider} de ${new Date(intel.date).toLocaleString()}`);

        return {
            ...currentParams,
            takeProfitPercent: intel.optimizedParameters.takeProfitPercent || currentParams.takeProfitPercent,
            stopLossPercent: intel.optimizedParameters.stopLossPercent || currentParams.stopLossPercent,
            maxPositions: intel.optimizedParameters.maxPositions || currentParams.maxPositions,
            momentumBuyThreshold: intel.networkAnalysis.cexTriggerThreshold * 100 || currentParams.momentumBuyThreshold,
            minConfidence: intel.optimizedParameters.minConfidence || 0.6
        };
    }
}

export const moltBotIntelService = new MoltBotIntelService();
