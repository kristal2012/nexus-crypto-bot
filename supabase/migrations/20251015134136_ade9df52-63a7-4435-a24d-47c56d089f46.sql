-- Create trading mode settings table
CREATE TABLE IF NOT EXISTS public.trading_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  trading_mode text NOT NULL DEFAULT 'DEMO' CHECK (trading_mode IN ('REAL', 'DEMO')),
  demo_balance numeric NOT NULL DEFAULT 10000,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trading_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own trading settings"
  ON public.trading_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trading settings"
  ON public.trading_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading settings"
  ON public.trading_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_trading_settings_updated_at
  BEFORE UPDATE ON public.trading_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add demo mode indicator to trades table
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;