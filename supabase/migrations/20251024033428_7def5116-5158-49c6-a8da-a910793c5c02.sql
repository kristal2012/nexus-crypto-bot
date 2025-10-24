-- Add confirmation timestamp to trading_settings
ALTER TABLE public.trading_settings 
ADD COLUMN IF NOT EXISTS real_mode_confirmed_at TIMESTAMP WITH TIME ZONE;

-- Create audit table for trading mode changes
CREATE TABLE IF NOT EXISTS public.trading_mode_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_mode TEXT,
  new_mode TEXT,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE public.trading_mode_audit ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs"
ON public.trading_mode_audit
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own audit logs
CREATE POLICY "Users can insert their own audit logs"
ON public.trading_mode_audit
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create function to log mode changes
CREATE OR REPLACE FUNCTION public.log_trading_mode_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log if trading_mode changed
  IF (TG_OP = 'UPDATE' AND OLD.trading_mode IS DISTINCT FROM NEW.trading_mode) THEN
    INSERT INTO public.trading_mode_audit (user_id, old_mode, new_mode, confirmed_at)
    VALUES (NEW.user_id, OLD.trading_mode, NEW.trading_mode, NEW.real_mode_confirmed_at);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for trading_settings updates
DROP TRIGGER IF EXISTS trading_mode_change_trigger ON public.trading_settings;
CREATE TRIGGER trading_mode_change_trigger
AFTER UPDATE ON public.trading_settings
FOR EACH ROW
EXECUTE FUNCTION public.log_trading_mode_change();