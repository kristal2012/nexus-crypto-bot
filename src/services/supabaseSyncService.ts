import { supabase } from '../integrations/supabase/client';
import { localDb } from './localDbService';
import type { BotConfig, Trade, BotLog } from './botService';

// Check if we're in Node.js environment
const isNode = typeof process !== 'undefined' && !!process.versions && !!process.versions.node;

/**
 * Supabase Sync Service
 * Automatically syncs local bot data to Supabase for cloud monitoring
 */
import { DEFAULT_USER_ID } from "@/constants";

class SupabaseSyncService {
    // Propriedades privadas da classe
    private userId: string | null = DEFAULT_USER_ID;
    private configId: string | null = null;
    private syncEnabled: boolean = false;
    // [NEW] Flag para indicar se o reset do CB foi solicitado via nuvem
    private resetCbRequested: boolean = false;

    async initialize() {
        try {
            // Check if we have a Service Role Key (Admin Mode)
            const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

            if (serviceKey && isNode) {
                console.log('📡 Supabase sync: Initializing in ADMIN mode.');
                this.syncEnabled = true;

                // For admin mode, we need a target user_id. 
                // We'll use the one from localDb or a static one if not found.
                const localConfig = localDb.getConfig();
                this.userId = localConfig.user_id || '00000000-0000-0000-0000-000000000000';
            } else {
                // Browser or No Service Key: Use Default ID (Auth Disabled)
                console.log('📡 Supabase sync: Using default local-user (Auth Disabled)');
                this.userId = DEFAULT_USER_ID;
                this.syncEnabled = true;

                // No Browser (Client), vamos forçar um sync inicial do que está no cloud para o LocalStorage
                if (!isNode) {
                    this.initClientSync();
                }
            }

            console.log('✅ Supabase sync enabled for user:', this.userId);

            // Load or create bot configuration
            await this.loadOrCreateConfig();

            return true;
        } catch (error) {
            console.warn('⚠️ Supabase sync initialization failed, using local-only mode:', error);
            this.syncEnabled = false;
            return false;
        }
    }

    /**
     * [NEW] Sincronização inicial para o Navegador (Browser)
     * Puxa os dados do Supabase para o LocalStorage local
     * DEFENSIVO: Nunca quebra o render, sempre retorna silenciosamente
     */
    async initClientSync(): Promise<void> {
        // Apenas no navegador
        if (isNode || !this.userId) {
            return;
        }

        try {
            console.log('🔄 [Client] Iniciando sincronização do cloud...');

            // [CRITICAL FIX] Preservar chaves API ao sincronizar
            // Não limpar mais o BOT_DATA para evitar perda de credenciais
            let keysPreserved = { api_key_encrypted: '', api_secret_encrypted: '' };

            if (typeof localStorage !== 'undefined') {
                const existingConfig = localStorage.getItem('BOT_DATA');

                if (existingConfig) {
                    try {
                        const parsed = JSON.parse(existingConfig);
                        keysPreserved = {
                            api_key_encrypted: parsed.api_key_encrypted || '',
                            api_secret_encrypted: parsed.api_secret_encrypted || ''
                        };
                        console.log('🔑 Chaves detectadas no LocalStorage:', {
                            hasApiKey: !!keysPreserved.api_key_encrypted,
                            hasApiSecret: !!keysPreserved.api_secret_encrypted
                        });
                    } catch (e) {
                        console.warn('⚠️ Erro ao parsear config existente');
                    }
                }

                // Limpar apenas trades e logs, não a config inteira
                localStorage.removeItem('bot_trades');
                localStorage.removeItem('bot_logs');

                console.log('✅ [Client] Limpeza seletiva concluída (credenciais preservadas)');
            }

            // 1. Puxar trades com timeout de 5 segundos
            const tradesPromise = supabase
                .from('trades')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            const { data: trades, error: tradesErr } = await Promise.race([
                tradesPromise,
                new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), 5000)
                )
            ]).catch(() => ({ data: null, error: 'timeout' }));

            if (!tradesErr && trades && Array.isArray(trades)) {
                let syncedCount = 0;
                trades.reverse().forEach((t: any) => {
                    try {
                        if (t && t.id && t.symbol) {
                            localDb.addTrade({
                                id: t.id,
                                symbol: t.symbol,
                                side: (t.side || 'BUY') as any,
                                type: (t.type || 'MARKET') as any,
                                quantity: Number(t.quantity) || 0,
                                price: Number(t.price) || 0,
                                status: (t.status || 'PENDING') as any,
                                profit_loss: t.profit_loss,
                                binance_order_id: t.binance_order_id,
                                executed_at: t.executed_at,
                                created_at: t.created_at || new Date().toISOString()
                            });
                            syncedCount++;
                        }
                    } catch (tradeErr) {
                        // Silently skip invalid trades
                    }
                });
                console.log(`✅ [Client] ${syncedCount} trades sincronizadas.`);
            } else {
                console.warn('⚠️ [Client] Nenhuma trade encontrada no cloud.');
            }
        } catch (error) {
            // NUNCA quebrar o render
            console.warn('⚠️ [Client] Sync falhou (modo offline):', error);
        }
    }

    /**
     * Periodically updates a heartbeat log to show the bot is alive
     */
    async heartbeat() {
        if (!this.syncEnabled || !this.userId) return;

        await this.syncLog('INFO', 'Bot Heartbeat: System is healthy and monitoring.', {
            timestamp: new Date().toISOString(),
            platform: process.platform,
            uptime: Math.floor(process.uptime())
        });
    }

    /**
     * Fetches the latest configuration from Supabase (Remote Dashboard)
     */
    async fetchRemoteConfig(): Promise<BotConfig | null> {
        if (!this.syncEnabled || !this.userId || !this.configId) return null;

        try {
            const { data, error } = await supabase
                .from('bot_configurations')
                .select('*')
                .eq('id', this.configId)
                .single();

            if (error) throw error;

            if (data) {
                // Sync to local if changed
                const local = localDb.getConfig();
                if (data.is_powered_on !== local.is_powered_on ||
                    data.is_running !== local.is_running ||
                    (data as any).reset_circuit_breaker === true) {

                    console.log('🔄 Remote config update detected:', data.is_powered_on ? 'ON' : 'OFF');

                    // [NEW] Lógica de reset remoto do CB
                    if ((data as any).reset_circuit_breaker === true) {
                        console.log('⚠️ [Remote] Reset de Circuit Breaker solicitado via Dashboard.');
                        this.resetCbRequested = true;

                        // Limpar a flag no Supabase para não repetir o reset infinitamente
                        if (isNode) {
                            await supabase.from('bot_configurations').update({ reset_circuit_breaker: false } as any).eq('id', this.configId);
                        }
                    }

                    // [FIX] Preservar chaves locais ao sincronizar do cloud
                    const localConfig = localDb.getConfig();
                    const mergedConfig = {
                        ...data,
                        api_key_encrypted: data.api_key_encrypted || localConfig.api_key_encrypted,
                        api_secret_encrypted: data.api_secret_encrypted || localConfig.api_secret_encrypted,
                    };
                    localDb.saveConfig(mergedConfig as any);
                }
                return data as any;
            }
            return null;
        } catch (error) {
            // Silently fail to avoid log spamming on poll
            return null;
        }
    }

    /**
     * [NEW] Verifica se o reset do CB foi solicitado e limpa a flag local
     */
    checkAndClearResetRequest(): boolean {
        const requested = this.resetCbRequested;
        this.resetCbRequested = false;
        return requested;
    }

    private async loadOrCreateConfig() {
        if (!this.userId) return;

        try {
            // Try to load existing config
            const { data: configs, error } = await supabase
                .from('bot_configurations')
                .select('*')
                .eq('user_id', this.userId)
                .limit(1);

            if (error) throw error;

            if (configs && configs.length > 0) {
                this.configId = configs[0].id;
                console.log('📋 Loaded existing config:', this.configId);

                // [FIX] Preservar chaves locais ao carregar do cloud
                const localConfig = localDb.getConfig();
                const mergedConfig = {
                    ...configs[0],
                    api_key_encrypted: configs[0].api_key_encrypted || localConfig.api_key_encrypted,
                    api_secret_encrypted: configs[0].api_secret_encrypted || localConfig.api_secret_encrypted,
                };
                localDb.saveConfig(mergedConfig as any);
            } else {
                // Create new config - SEM chaves API (segurança)
                const { data: newConfig, error: createError } = await supabase
                    .from('bot_configurations')
                    .insert({
                        user_id: this.userId,
                        test_mode: true,
                        test_balance: 1000,
                        trading_pair: 'BTCUSDT',
                        quantity: 0.001,
                        take_profit_percent: 6.0,
                        stop_loss_percent: 3.0,
                        daily_profit_goal: 50,
                        is_running: false,
                        is_powered_on: false,
                        api_key_encrypted: null,
                        api_secret_encrypted: null
                    })
                    .select()
                    .single();

                if (createError) throw createError;

                this.configId = newConfig.id;
                console.log('✨ Created new config:', this.configId);
            }
        } catch (error) {
            console.error('❌ Failed to load/create config:', error);
        }
    }

    /**
     * [NEW] Comando remoto para resetar o Circuit Breaker via Dahsboard
     */
    async requestCircuitBreakerReset() {
        if (!this.syncEnabled || !this.configId) return false;
        try {
            const { error } = await supabase
                .from('bot_configurations')
                .update({ reset_circuit_breaker: true } as any)
                .eq('id', this.configId);

            if (error) throw error;
            console.log('⚡ [Client] Solicitação de reset de CB enviada para o servidor.');
            return true;
        } catch (error) {
            console.error('❌ Erro ao solicitar reset de CB:', error);
            return false;
        }
    }

    async syncTrade(trade: Trade) {
        // Always save locally first
        localDb.addTrade(trade);

        if (!this.syncEnabled || !this.userId) {
            return;
        }

        try {
            const { error } = await supabase
                .from('trades')
                .insert({
                    user_id: this.userId,
                    bot_config_id: this.configId,
                    symbol: trade.symbol,
                    side: trade.side,
                    type: trade.type,
                    quantity: trade.quantity,
                    price: trade.price,
                    status: trade.status,
                    binance_order_id: trade.binance_order_id,
                    profit_loss: trade.profit_loss,
                    executed_at: trade.executed_at
                });

            if (error) {
                console.error('⚠️ Failed to sync trade to Supabase:', error);
            } else {
                console.log('✅ Trade synced to cloud:', trade.symbol, trade.side);
            }
        } catch (error) {
            console.error('❌ Supabase trade sync error:', error);
        }
    }

    async syncLog(level: BotLog['level'], message: string, details?: any) {
        // Always save locally first
        localDb.addLog(level, message, details);

        if (!this.syncEnabled || !this.userId) {
            return;
        }

        try {
            const { error } = await supabase
                .from('bot_logs')
                .insert({
                    user_id: this.userId,
                    bot_config_id: this.configId,
                    level,
                    message,
                    details: details ? JSON.parse(JSON.stringify(details)) : null
                });

            if (error) {
                console.error('⚠️ Failed to sync log to Supabase:', error);
            }
        } catch (error) {
            console.error('❌ Supabase log sync error:', error);
        }
    }

    async syncConfig(config: Partial<BotConfig>) {
        // [SECURITY FIX] Preservar chaves existentes APENAS localmente
        // As chaves NUNCA vão para o Supabase - ficam apenas no LocalStorage do navegador
        const currentConfig = localDb.getConfig();
        const mergedConfig = {
            ...currentConfig,
            ...config,
            api_key_encrypted: config.api_key_encrypted || currentConfig.api_key_encrypted,
            api_secret_encrypted: config.api_secret_encrypted || currentConfig.api_secret_encrypted,
        };

        // Always save locally first (LocalStorage only - secure!)
        localDb.saveConfig(mergedConfig as any);

        if (!this.syncEnabled || !this.userId || !this.configId) {
            return;
        }

        // [SECURITY] Não sincronizar chaves API com Supabase - deixar como null/undefined
        const configToSync = {
            test_mode: config.test_mode,
            test_balance: config.test_balance,
            trading_pair: config.trading_pair,
            quantity: config.quantity,
            take_profit_percent: config.take_profit_percent,
            stop_loss_percent: config.stop_loss_percent,
            daily_profit_goal: config.daily_profit_goal,
            is_running: config.is_running,
            is_powered_on: config.is_powered_on,
            // API keys: NÃO enviar para o Supabase - manter como null
            api_key_encrypted: null,
            api_secret_encrypted: null,
            updated_at: new Date().toISOString()
        };

        try {
            const { error } = await supabase
                .from('bot_configurations')
                .update(configToSync)
                .eq('id', this.configId);

            if (error) {
                console.error('⚠️ Failed to sync config to Supabase:', error);
            } else {
                console.log('✅ Config synced to cloud');
            }
        } catch (error) {
            console.error('❌ Supabase config sync error:', error);
        }
    }

    async getCloudConfig(): Promise<BotConfig | null> {
        if (!this.syncEnabled || !this.userId) {
            return null;
        }

        try {
            const { data, error } = await supabase
                .from('bot_configurations')
                .select('*')
                .eq('user_id', this.userId)
                .limit(1)
                .single();

            if (error) throw error;

            // [FIX] Preservar chaves locais ao buscar do cloud
            const localConfig = localDb.getConfig();
            const mergedConfig = {
                ...data,
                api_key_encrypted: data.api_key_encrypted || localConfig.api_key_encrypted,
                api_secret_encrypted: data.api_secret_encrypted || localConfig.api_secret_encrypted,
            };

            return mergedConfig as any;
        } catch (error) {
            console.error('❌ Failed to fetch cloud config:', error);
            return null;
        }
    }
}

// Export singleton instance
export const supabaseSync = new SupabaseSyncService();
