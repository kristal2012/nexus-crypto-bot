-- Create an atomic function to acquire analysis lock with row-level locking
-- This prevents race conditions in rate limiting
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
  -- Set cooldown period in seconds
  v_cooldown_seconds := p_cooldown_minutes * 60;

  -- Lock the row to prevent concurrent access (FOR UPDATE)
  SELECT * INTO v_config
  FROM auto_trading_config
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if config exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto trading configuration not found'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if active
  IF NOT v_config.is_active THEN
    RAISE EXCEPTION 'Auto trading is not active'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check rate limiting
  IF v_config.last_analysis_at IS NOT NULL THEN
    v_time_since_last_analysis := EXTRACT(EPOCH FROM (NOW() - v_config.last_analysis_at))::INTEGER;
    
    IF v_time_since_last_analysis < v_cooldown_seconds THEN
      RAISE EXCEPTION 'Rate limit: % seconds remaining', 
        (v_cooldown_seconds - v_time_since_last_analysis)
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Update last analysis timestamp atomically
  UPDATE auto_trading_config
  SET last_analysis_at = NOW()
  WHERE user_id = p_user_id;

  -- Return the configuration
  RETURN QUERY
  SELECT 
    v_config.is_active,
    NOW() as last_analysis_at,
    v_config.take_profit,
    v_config.stop_loss,
    v_config.leverage,
    v_config.max_daily_trades,
    v_config.min_confidence;
END;
$$;