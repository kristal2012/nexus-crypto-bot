-- Create enum for trade side
CREATE TYPE public.trade_side AS ENUM ('BUY', 'SELL');

-- Create enum for trade type
CREATE TYPE public.trade_type AS ENUM ('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT');

-- Create enum for trade status
CREATE TYPE public.trade_status AS ENUM ('PENDING', 'FILLED', 'PARTIAL', 'CANCELLED', 'FAILED');

-- Create enum for performance period
CREATE TYPE public.performance_period AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME');

-- Create trades history table
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side trade_side NOT NULL,
  type trade_type NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8) NOT NULL,
  status trade_status NOT NULL DEFAULT 'PENDING',
  order_id TEXT,
  profit_loss DECIMAL(20, 8),
  commission DECIMAL(20, 8),
  executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on trades
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- RLS policies for trades
CREATE POLICY "Users can view their own trades"
  ON public.trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trades"
  ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trades"
  ON public.trades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trades"
  ON public.trades FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for trades updated_at
CREATE TRIGGER update_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create strategies table
CREATE TABLE public.strategies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  parameters JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Enable RLS on strategies
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

-- RLS policies for strategies
CREATE POLICY "Users can view their own strategies"
  ON public.strategies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own strategies"
  ON public.strategies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategies"
  ON public.strategies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategies"
  ON public.strategies FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for strategies updated_at
CREATE TRIGGER update_strategies_updated_at
  BEFORE UPDATE ON public.strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create performance statistics table
CREATE TABLE public.performance_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period performance_period NOT NULL,
  period_date DATE NOT NULL,
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  total_profit_loss DECIMAL(20, 8) NOT NULL DEFAULT 0,
  total_volume DECIMAL(20, 8) NOT NULL DEFAULT 0,
  win_rate DECIMAL(5, 2),
  average_profit DECIMAL(20, 8),
  average_loss DECIMAL(20, 8),
  largest_win DECIMAL(20, 8),
  largest_loss DECIMAL(20, 8),
  max_drawdown DECIMAL(20, 8),
  sharpe_ratio DECIMAL(10, 4),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, period, period_date)
);

-- Enable RLS on performance_stats
ALTER TABLE public.performance_stats ENABLE ROW LEVEL SECURITY;

-- RLS policies for performance_stats
CREATE POLICY "Users can view their own performance stats"
  ON public.performance_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own performance stats"
  ON public.performance_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own performance stats"
  ON public.performance_stats FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own performance stats"
  ON public.performance_stats FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for performance_stats updated_at
CREATE TRIGGER update_performance_stats_updated_at
  BEFORE UPDATE ON public.performance_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create indexes for better query performance
CREATE INDEX idx_trades_user_id ON public.trades(user_id);
CREATE INDEX idx_trades_symbol ON public.trades(symbol);
CREATE INDEX idx_trades_created_at ON public.trades(created_at DESC);
CREATE INDEX idx_strategies_user_id ON public.strategies(user_id);
CREATE INDEX idx_strategies_is_active ON public.strategies(is_active);
CREATE INDEX idx_performance_stats_user_id ON public.performance_stats(user_id);
CREATE INDEX idx_performance_stats_period ON public.performance_stats(period, period_date DESC);