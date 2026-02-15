import 'dotenv/config';
import { tradingService } from './services/tradingService';
import { moltBotIntelService } from './services/moltBotIntelService';
import { RISK_SETTINGS } from './services/riskService';
import { supabaseSync } from './services/supabaseSyncService';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { localDb } from './services/localDbService';

/**
 * HEADLESS RUNNER - Volatile Trader
 * Execução 24/7 adaptada para VPS, integrada com MoltBot, Guardian e Supabase Cloud Sync.
 */

async function startHeadlessBot() {
    console.log('----------------------------------------------------');
    console.log('   VOLATILE TRADER - HEADLESS ENGINE (24/7)         ');
    console.log('----------------------------------------------------');
    console.log(`🕒 Início: ${new Date().toLocaleString()}`);

    // 1. Initialize Supabase Cloud Sync
    console.log('📡 Initializing Supabase cloud sync...');
    await supabaseSync.initialize();

    // 2. Configurações Iniciais
    const isTestMode = process.env.VITE_TRADING_MODE !== 'real';
    const initialBalance = Number(process.env.VITE_INITIAL_BALANCE) || 1000;

    console.log(`🛠️ Config: Modo=${isTestMode ? 'TESTE' : 'REAL'} | Saldo=$${initialBalance}`);

    // 2. Health Check Server (para o Guardian/Watchdog)
    const HEALTH_PORT = 8002; // Porta diferente do Flash Bot (8001) para evitar conflitos
    const healthServer = http.createServer((req, res) => {
        if (req.url === '/api/status') {
            const stats = {
                is_running: tradingService.getIsRunning(),
                connected_to_blockchain: true, // Binance API connection check conceptually
                last_heartbeat: new Date().toISOString()
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    healthServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ Health check port ${HEALTH_PORT} busy. Monitoring will continue without local health check.`);
        } else {
            console.error('❌ Health check server error:', err);
        }
    });

    healthServer.listen(HEALTH_PORT, '127.0.0.1', () => {
        console.log(`🛡️ Guardian Bridge ativo em 127.0.0.1:${HEALTH_PORT}`);
    });

    // 2.5. Sincronizador de Dados - (Desativado: PAINEL_VOLATILE.html foi removido em favor do Dashboard Vercel)
    // const syncDashboardData = () => { ... }
    // setInterval(syncDashboardData, 30000);

    // 3. Heartbeat Loop (Cloud Monitor)
    setInterval(() => {
        supabaseSync.heartbeat();
    }, 300000); // Check every 5 mins

    setInterval(async () => {
        try {
            const remoteConfig = await supabaseSync.fetchRemoteConfig();

            if (remoteConfig) {
                // Log estado remoto periódico para debug (cada ~1min)
                if (Date.now() % 60000 < 30000) {
                    console.log(`📡 [Remote Polling] Power=${remoteConfig.is_powered_on ? 'ON' : 'OFF'} | Mode=${remoteConfig.test_mode ? 'TEST' : 'REAL'} | isRunning=${tradingService.getIsRunning()}`);
                }

                // Apply powered on/off switch
                if (remoteConfig.is_powered_on === false && tradingService.getIsRunning()) {
                    console.log('🛑 [Remote] Shutdown command received from cloud.');
                    await tradingService.stop();
                } else if (remoteConfig.is_powered_on === true && !tradingService.getIsRunning()) {
                    console.log('🚀 [Remote] Startup command received from cloud. Starting trading engine...');

                    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
                    await tradingService.start({
                        userId: '00000000-0000-0000-0000-000000000000',
                        configId: remoteConfig.id,
                        symbols: symbols,
                        totalCapital: remoteConfig.test_balance || 1000,
                        takeProfitPercent: remoteConfig.take_profit_percent || 5,
                        stopLossPercent: remoteConfig.stop_loss_percent || 2.5,
                        testMode: remoteConfig.test_mode,
                        maxPositions: 5
                    });
                }
            } else {
                if (Date.now() % 60000 < 30000) {
                    console.warn('⚠️ [Remote Polling] Config não retornou dados. Verifique o ID no Supabase.');
                }
            }
        } catch (error) {
            console.error('❌ Error polling remote config:', error);
        }
    }, 30000); // Check every 30 seconds

    // 5. Intelligence Integration Loop (MoltBot AI)
    setInterval(() => {
        const intel = moltBotIntelService.getLatestIntel();
        if (intel) {
            console.log(`🧠 [MoltBot] Applying Intelligence optimize parameters...`);
            const adaptiveParams = moltBotIntelService.applyIntelToRisk(tradingService.getSettings());
            tradingService.updateParameters(adaptiveParams);
        }
    }, 600000); // Check every 10 min

    // 4. Iniciar Trading Service
    try {
        // Mocking do par de trading (No futuro buscar do pairSelectionService)
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

        console.log(`🚀 [Cryptum 7.1] Headless Bot iniciado. Monitorando: ${symbols.join(', ')}`);

        // Tentar buscar config do Supabase primeiro
        const remote = await supabaseSync.fetchRemoteConfig();
        console.log(`📋 Config inicial carregada: ${remote ? 'Sim' : 'Não'} (ID: ${remote?.id || 'Norteado'})`);

        await tradingService.start({
            userId: '00000000-0000-0000-0000-000000000000',
            configId: remote?.id || 'default-config-id',
            symbols: symbols,
            totalCapital: remote?.test_balance || initialBalance,
            takeProfitPercent: remote?.take_profit_percent || RISK_SETTINGS.TAKE_PROFIT_PERCENT,
            stopLossPercent: remote?.stop_loss_percent || RISK_SETTINGS.STOP_LOSS_PERCENT,
            testMode: remote?.test_mode !== undefined ? remote.test_mode : isTestMode,
            maxPositions: RISK_SETTINGS.MAX_POSITIONS
        });

    } catch (error) {
        console.error('❌ Erro crítico ao iniciar trading:', error);
        process.exit(1);
    }
}

// Lidar com encerramento gracioso
process.on('SIGINT', async () => {
    console.log('\n👋 Encerrando bot com segurança...');
    await tradingService.stop();
    process.exit(0);
});

startHeadlessBot();
