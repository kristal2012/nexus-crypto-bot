import * as fs from 'fs';
import * as path from 'path';
import { RISK_SETTINGS } from './riskService';

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
        minConfidence?: number; // Novo campo para ajuste dinâmico de assertividade
    };
    date: string;
    provider: string;
}

const isBrowser = typeof window !== 'undefined';

class MoltBotIntelService {
    private readonly INTEL_FILE_PATH = 'C:\\THE_FLASH_BOT\\data\\intelligence\\latest_intel.json';
    private intelPath: string | null = null;

    constructor() {
        if (!isBrowser) {
            // Caminho absoluto centralizado na VPS
            // USANDO INTELIGÊNCIA COMPARTILHADA (CÉREBRO ÚNICO)
            this.intelPath = this.INTEL_FILE_PATH;
        }
    }

    public getLatestIntel(): MoltBotIntel | null {
        if (isBrowser || !this.intelPath) {
            // No navegador, a inteligência via filesystem não está disponível
            return null;
        }

        try {
            if (!fs.existsSync(this.intelPath)) {
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

    /**
     * Aplica a inteligência do MoltBot aos parâmetros de risco do Volatile Trader
     */
    public applyIntelToRisk(currentParams: any): any {
        const intel = this.getLatestIntel();
        if (!intel) return currentParams;

        console.log(`🧠 [MoltBot] Aplicando Inteligência ${intel.provider} de ${new Date(intel.date).toLocaleString()}`);

        return {
            ...currentParams,
            // Ajustes dinâmicos baseados na IA
            takeProfitPercent: intel.optimizedParameters.takeProfitPercent || currentParams.takeProfitPercent,
            stopLossPercent: intel.optimizedParameters.stopLossPercent || currentParams.stopLossPercent,
            maxPositions: intel.optimizedParameters.maxPositions || currentParams.maxPositions,
            momentumBuyThreshold: intel.networkAnalysis.cexTriggerThreshold * 100 || currentParams.momentumBuyThreshold,
            minConfidence: intel.optimizedParameters.minConfidence || 0.6 // Default 60% se não vier da IA
        };
    }
}

export const moltBotIntelService = new MoltBotIntelService();
