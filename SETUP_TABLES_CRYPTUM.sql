-- 1. Funções Auxiliares
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Tabela de Configuração de Trading (SSOT)
CREATE TABLE IF NOT EXISTS public.auto_trading_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  is_active BOOLEAN DEFAULT false,
  take_profit NUMERIC DEFAULT 2.0,
  stop_loss NUMERIC DEFAULT 1.0,
  quantity_usdt NUMERIC DEFAULT 10.0,
  leverage INTEGER DEFAULT 1,
  min_confidence NUMERIC DEFAULT 70.0,
  last_analysis_at TIMESTAMPTZ,
  strategy_adjusted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 3. Tabela de Configuração do Robô (Meta-config)
CREATE TABLE IF NOT EXISTS public.bot_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  test_mode BOOLEAN DEFAULT true,
  test_balance DECIMAL(20, 8) DEFAULT 1000,
  trading_pair TEXT DEFAULT 'BTCUSDT',
  quantity DECIMAL(20, 8) DEFAULT 0.001,
  take_profit_percent DECIMAL(5, 2) DEFAULT 2.00,
  stop_loss_percent DECIMAL(5, 2) DEFAULT 1.00,
  daily_profit_goal DECIMAL(20, 8) DEFAULT 50,
  is_running BOOLEAN DEFAULT false,
  is_powered_on BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 4. Tabela de Trades
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  bot_config_id UUID REFERENCES public.bot_configurations(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  type TEXT NOT NULL CHECK (type IN ('MARKET', 'LIMIT')),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED')),
  binance_order_id TEXT,
  profit_loss NUMERIC,
  executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Tabela de Logs
CREATE TABLE IF NOT EXISTS public.bot_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  bot_config_id UUID REFERENCES public.bot_configurations(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARNING', 'ERROR', 'SUCCESS')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Tabela de Chaves API (Edge Functions)
CREATE TABLE IF NOT EXISTS public.binance_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  api_key TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 7. Função de Lock para Rate Limiting
CREATE OR REPLACE FUNCTION acquire_analysis_lock(
  p_user_id UUID,
  p_cooldown_minutes INTEGER DEFAULT 15
)
RETURNS TABLE (
  is_active BOOLEAN,
  last_analysis_at TIMESTAMPTZ,
  take_profit NUMERIC,
  stop_loss NUMERIC,
  leverage INTEGER,
  max_daily_trades INTEGER,
  min_confidence NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_time_since_last_analysis INTEGER;
  v_cooldown_seconds INTEGER;
BEGIN
  v_cooldown_seconds := p_cooldown_minutes * 60;

  SELECT * INTO v_config
  FROM auto_trading_config
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto trading configuration not found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_config.is_active THEN
    RAISE EXCEPTION 'Auto trading is not active' USING ERRCODE = 'P0001';
  END IF;

  IF v_config.last_analysis_at IS NOT NULL THEN
    v_time_since_last_analysis := EXTRACT(EPOCH FROM (NOW() - v_config.last_analysis_at))::INTEGER;
    IF v_time_since_last_analysis < v_cooldown_seconds THEN
      RAISE EXCEPTION 'Rate limit: % seconds remaining', (v_cooldown_seconds - v_time_since_last_analysis)
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE auto_trading_config SET last_analysis_at = NOW() WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT v_config.is_active, NOW(), v_config.take_profit, v_config.stop_loss, v_config.leverage, 100, v_config.min_confidence;
END;
$$;

-- 8. Row Level Security (Políticas Desativadas para o Gêmeos Headless)
ALTER TABLE public.auto_trading_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_configurations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.binance_api_keys DISABLE ROW LEVEL SECURITY;

-- 9. Triggers de Timestamp (Remover se já existirem para evitar erro 42710)
DROP TRIGGER IF EXISTS set_updated_at_trading_config ON public.auto_trading_config;
CREATE TRIGGER set_updated_at_trading_config BEFORE UPDATE ON public.auto_trading_config FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_bot_config ON public.bot_configurations;
CREATE TRIGGER set_updated_at_bot_config BEFORE UPDATE ON public.bot_configurations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_trades ON public.trades;
CREATE TRIGGER set_updated_at_trades BEFORE UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_api_keys ON public.binance_api_keys;
CREATE TRIGGER set_updated_at_api_keys BEFORE UPDATE ON public.binance_api_keys FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
