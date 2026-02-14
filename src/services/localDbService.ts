import * as fs from 'fs';
import * as path from 'path';

const isBrowser = typeof window !== 'undefined';

// No Navegador, usamos localStorage para persistência local rápida
const getBrowserData = () => {
    if (!isBrowser) return { config: {}, trades: [], logs: [] };
    try {
        const data = localStorage.getItem('BOT_DATA');
        return data ? JSON.parse(data) : { config: {}, trades: [], logs: [] };
    } catch (e) {
        return { config: {}, trades: [], logs: [] };
    }
};

const saveBrowserData = (data: any) => {
    if (isBrowser) {
        localStorage.setItem('BOT_DATA', JSON.stringify(data));
    }
};

export const localDb = {
    // Configurações do Bot
    getConfig: () => {
        if (isBrowser) {
            return getBrowserData().config || {};
        }

        const DATA_DIR = path.resolve(process.cwd(), 'data');
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

        const filePath = path.join(DATA_DIR, 'config.json');

        if (!fs.existsSync(filePath)) {
            return {
                is_powered_on: false,
                is_running: false,
                test_mode: true,
                test_balance: 1000,
                quantity: 100,
                take_profit_percent: 5,
                stop_loss_percent: 2.5,
                daily_profit_goal: 50,
                trading_pair: 'BTCUSDT'
            };
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    },

    saveConfig: (config: any) => {
        if (isBrowser) {
            const data = getBrowserData();
            data.config = { ...data.config, ...config };
            saveBrowserData(data);
            return true;
        }

        const DATA_DIR = path.resolve(process.cwd(), 'data');
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

        const filePath = path.join(DATA_DIR, 'config.json');
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        return true;
    },

    // Histórico de Trades
    getTrades: (limit = 50) => {
        if (isBrowser) {
            const trades = getBrowserData().trades || [];
            return [...trades].reverse().slice(0, limit);
        }

        const DATA_DIR = path.resolve(process.cwd(), 'data');
        const filePath = path.join(DATA_DIR, 'trades.json');
        if (!fs.existsSync(filePath)) return [];
        const trades = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return (trades as any[]).slice(-limit).reverse();
    },

    addTrade: (trade: any) => {
        if (isBrowser) {
            const data = getBrowserData();
            data.trades = data.trades || [];
            data.trades.push(trade);
            if (data.trades.length > 500) data.trades.shift();
            saveBrowserData(data);
            return true;
        }

        const DATA_DIR = path.resolve(process.cwd(), 'data');
        if (!fs.existsSync(DATA_DIR)) {
            console.log('📁 Criando diretório data para trades...');
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const filePath = path.join(DATA_DIR, 'trades.json');
        let trades = [];
        if (fs.existsSync(filePath)) {
            try {
                trades = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            } catch (e) {
                console.error('❌ Erro ao ler trades.json, resetando...', e);
                trades = [];
            }
        }
        trades.push({
            id: Math.random().toString(36).substr(2, 9),
            created_at: new Date().toISOString(),
            ...trade
        });
        fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
        return true;
    },

    // Logs do Bot
    addLog: (level: string, message: string, details?: any) => {
        if (isBrowser) {
            const data = getBrowserData();
            data.logs = data.logs || [];
            data.logs.push({
                id: Math.random().toString(36).substr(2, 9),
                created_at: new Date().toISOString(),
                level,
                message,
                details
            });
            if (data.logs.length > 500) data.logs.shift();
            saveBrowserData(data);
            return true;
        }

        const DATA_DIR = path.resolve(process.cwd(), 'data');
        if (!fs.existsSync(DATA_DIR)) {
            console.log('📁 Criando diretório data para logs...');
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const filePath = path.join(DATA_DIR, 'logs.json');
        let logs = [];
        if (fs.existsSync(filePath)) {
            try {
                logs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            } catch (e) {
                console.error('❌ Erro ao ler logs.json, resetando...', e);
                logs = [];
            }
        }
        logs.push({
            id: Math.random().toString(36).substr(2, 9),
            created_at: new Date().toISOString(),
            level,
            message,
            details
        });
        if (logs.length > 500) logs = logs.slice(-500);
        fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
        return true;
    },

    getLogs: (limit = 100) => {
        if (isBrowser) {
            const logs = getBrowserData().logs || [];
            return [...logs].reverse().slice(0, limit);
        }

        const DATA_DIR = path.resolve(process.cwd(), 'data');
        const filePath = path.join(DATA_DIR, 'logs.json');
        if (!fs.existsSync(filePath)) return [];
        const logs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return (logs as any[]).slice(-limit).reverse();
    }
};
