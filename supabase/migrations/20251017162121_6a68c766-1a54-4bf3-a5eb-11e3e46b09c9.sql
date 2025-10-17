-- Create auto trading configuration table
CREATE TABLE IF NOT EXISTS public.auto_trading_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  is_active BOOLEAN DEFAULT false,
  take_profit NUMERIC NOT NULL DEFAULT 2.0,
  stop_loss NUMERIC NOT NULL DEFAULT 1.0,
  quantity_usdt NUMERIC NOT NULL DEFAULT 100,
  leverage INTEGER NOT NULL DEFAULT 10,
  min_confidence NUMERIC NOT NULL DEFAULT 95.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auto_trading_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own config"
  ON public.auto_trading_config
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config"
  ON public.auto_trading_config
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
  ON public.auto_trading_config
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.auto_trading_config
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create table to track AI analysis results
CREATE TABLE IF NOT EXISTS public.ai_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  predicted_price NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  trend TEXT NOT NULL,
  recommended_dca_layers INTEGER NOT NULL,
  analysis_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_analysis_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own analysis"
  ON public.ai_analysis_results
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analysis"
  ON public.ai_analysis_results
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);