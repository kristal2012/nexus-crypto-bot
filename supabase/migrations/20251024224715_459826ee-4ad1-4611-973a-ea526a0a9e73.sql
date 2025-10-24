-- Drop and recreate acquire_analysis_lock function without max_daily_trades
DROP FUNCTION IF EXISTS public.acquire_analysis_lock(uuid, integer);

CREATE OR REPLACE FUNCTION public.acquire_analysis_lock(p_user_id uuid, p_cooldown_minutes integer DEFAULT 15)
 RETURNS TABLE(is_active boolean, last_analysis_at timestamp with time zone, take_profit numeric, stop_loss numeric, leverage integer, min_confidence numeric, quantity_usdt numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_config.min_confidence,
    v_config.quantity_usdt;
END;
$function$;