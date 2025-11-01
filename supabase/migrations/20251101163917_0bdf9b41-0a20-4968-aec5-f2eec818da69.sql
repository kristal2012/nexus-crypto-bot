-- Adicionar campo para rastrear quando a estratégia foi ajustada
ALTER TABLE public.auto_trading_config 
ADD COLUMN IF NOT EXISTS strategy_adjusted_at timestamp with time zone DEFAULT NULL;

COMMENT ON COLUMN public.auto_trading_config.strategy_adjusted_at IS 'Timestamp da última vez que a estratégia foi ajustada. Circuit breaker considera apenas trades após esta data.';