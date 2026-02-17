import { RISK_SETTINGS } from './riskService';

const isBrowser = typeof window !== 'undefined';

// Módulos Node.JS protegidos (Carregamento condicional para não quebrar o Vite/Browser)
let fs: any = null;
let path: any = null;

// Função auxiliar para carregar módulos do Node sem quebrar o bundler do navegador
const initNodeModules = async () => {
    if (!isBrowser && !fs) {
        try {
            // Usamos import dinâmico com /* @vite-ignore */ para evitar que o Vite analise o módulo
            const fsModule = await import(/* @vite-ignore */ 'fs');
            const pathModule = await import(/* @vite-ignore */ 'path');
            fs = fsModule.default || fsModule;
            path = pathModule.default || pathModule;
        } catch (e) {
            console.error('❌ Falha ao carregar módulos do Node:', e);
        }
    }
};

// Inicialização imediata se não for browser
if (!isBrowser) {
    initNodeModules();
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
