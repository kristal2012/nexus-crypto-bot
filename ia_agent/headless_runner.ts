import { ArbitrageIntelAgent } from './core/AgentBrain.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env explicitamente do diretório ia_agent
import { config } from 'dotenv';
config({ path: path.join(__dirname, '.env') });

// Centralized report path
const REPORT_PATH = 'C:\\cryptum7.1_bot\\data\\intelligence\\latest_intel.json';

async function main() {
    console.log("🚀 Starting MoltBot Binance Intelligence Agent...");

    const agent = new ArbitrageIntelAgent();

    // Ensure report directory exists
    const reportDir = path.dirname(REPORT_PATH);
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    agent.onLog = (msg) => {
        console.log(msg);
    };

    await agent.start();

    agent.onIntelReady = (report: any) => {
        console.log("📊 Intelligence Report Ready! Writing to disk...");
        try {
            // Salva JSON padrão
            fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
            console.log(`✅ Saved JSON report to: ${REPORT_PATH}`);

            // Salva JSONP (JavaScript) para acesso local sem CORS
            const jsPath = REPORT_PATH.replace('.json', '.js');
            const jsonpContent = `window.updateMoltBotIntelSCALPING(${JSON.stringify(report, null, 2)});`;
            fs.writeFileSync(jsPath, jsonpContent);
            console.log(`✅ Saved JSONP script to: ${jsPath}`);

        } catch (e) {
            console.error(`❌ [ERROR] Falha crítica ao salvar relatório: ${e}`);
        }
    };

    // Immediate start for market scan
    await agent.scanBinanceMarket();
    await agent.generateStrategicReport();

    // Start intervals
    setInterval(async () => {
        await agent.scanBinanceMarket();
    }, 60000); // 1 minute market refresh

    setInterval(async () => {
        console.log("🔄 [PERIODIC] Refreshing strategic intelligence...");
        await agent.generateStrategicReport();
    }, 600000); // 10 minutes AI analysis
}

main().catch(err => {
    console.error("FATAL ERROR in Intel Agent:", err);
    process.exit(1);
});
