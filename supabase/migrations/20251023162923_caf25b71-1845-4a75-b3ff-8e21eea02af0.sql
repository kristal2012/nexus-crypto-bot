-- Add last_analysis_at timestamp to auto_trading_config for rate limiting
ALTER TABLE public.auto_trading_config
ADD COLUMN last_analysis_at timestamp with time zone;