import { supabase } from '../integrations/supabase/client';
import { localDb } from './localDbService';
import type { BotConfig, Trade, BotLog } from './botService';

// Check if we're in Node.js environment
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/**
 * Supabase Sync Service
 * Automatically syncs local bot data to Supabase for cloud monitoring
 */
import { DEFAULT_USER_ID } from "../constants";

class SupabaseSyncService {
    private userId: string | null = DEFAULT_USER_ID;
    private configId: string | null = null;
    private syncEnabled: boolean = false;

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
                if (data.is_powered_on !== local.is_powered_on || data.is_running !== local.is_running) {
                    console.log('🔄 Remote config update detected:', data.is_powered_on ? 'ON' : 'OFF');

                    // Preservar chaves locais ao sincronizar do cloud
                    const mergedConfig = {
                        ...data,
                        api_key_encrypted: data.api_key_encrypted || local.api_key_encrypted,
                        api_secret_encrypted: data.api_secret_encrypted || local.api_secret_encrypted,
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

                // Sync config to local
                localDb.saveConfig(configs[0] as any);
                // Create new config
                const localConfig = localDb.getConfig();
                const { data: newConfig, error: createError } = await supabase
                    .from('bot_configurations')
                    .insert({
                        user_id: this.userId,
                        test_mode: localConfig.test_mode ?? true,
                        test_balance: localConfig.test_balance ?? 1000,
                        trading_pair: localConfig.trading_pair ?? 'BTCUSDT',
                        quantity: localConfig.quantity ?? 100,
                        take_profit_percent: 5.0,
                        stop_loss_percent: 2.5,
                        daily_profit_goal: localConfig.daily_profit_goal ?? 50,
                        is_running: false,
                        is_powered_on: false
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
        // Always save locally first
        localDb.saveConfig(config as any);

        if (!this.syncEnabled || !this.userId || !this.configId) {
            return;
        }

        try {
            const { error } = await supabase
                .from('bot_configurations')
                .update({
                    test_mode: config.test_mode,
                    test_balance: config.test_balance,
                    trading_pair: config.trading_pair,
                    quantity: config.quantity,
                    take_profit_percent: config.take_profit_percent,
                    stop_loss_percent: config.stop_loss_percent,
                    daily_profit_goal: config.daily_profit_goal,
                    is_running: config.is_running,
                    is_powered_on: config.is_powered_on,
                    updated_at: new Date().toISOString()
                })
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

            return data as any;
        } catch (error) {
            console.error('❌ Failed to fetch cloud config:', error);
            return null;
        }
    }
}

// Export singleton instance
export const supabaseSync = new SupabaseSyncService();
