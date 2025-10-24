-- Prevent users from directly updating real_mode_confirmed_at timestamp
-- This prevents bypass of the 5-minute confirmation safety window

-- Drop existing policy
DROP POLICY IF EXISTS "Users can update their own trading settings" ON public.trading_settings;

-- Create new policy that prevents updating real_mode_confirmed_at
CREATE POLICY "Users can update their own trading settings except confirmation"
ON public.trading_settings
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  real_mode_confirmed_at IS NOT DISTINCT FROM (
    SELECT real_mode_confirmed_at 
    FROM public.trading_settings 
    WHERE user_id = auth.uid()
  )
);