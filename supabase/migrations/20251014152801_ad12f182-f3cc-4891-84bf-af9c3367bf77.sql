-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create bot_daily_stats table to track daily performance
CREATE TABLE public.bot_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  starting_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  profit_loss_percent numeric NOT NULL DEFAULT 0,
  trades_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  can_trade boolean NOT NULL DEFAULT true,
  stop_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE public.bot_daily_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own daily stats"
  ON public.bot_daily_stats
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily stats"
  ON public.bot_daily_stats
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily stats"
  ON public.bot_daily_stats
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_bot_daily_stats_updated_at
  BEFORE UPDATE ON public.bot_daily_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create function to reset daily stats at midnight
CREATE OR REPLACE FUNCTION public.reset_daily_bot_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update all active bot stats to allow trading for new day
  UPDATE public.bot_daily_stats
  SET 
    date = CURRENT_DATE,
    starting_balance = current_balance,
    profit_loss_percent = 0,
    trades_count = 0,
    can_trade = true,
    stop_reason = NULL,
    updated_at = now()
  WHERE is_active = true 
    AND date < CURRENT_DATE;
END;
$$;

-- Schedule daily reset at midnight (00:00 UTC)
SELECT cron.schedule(
  'reset-bot-daily-stats',
  '0 0 * * *',
  $$SELECT public.reset_daily_bot_stats();$$
);