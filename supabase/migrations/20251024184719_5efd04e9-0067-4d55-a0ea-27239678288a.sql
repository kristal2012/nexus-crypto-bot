-- Fix existing data that violates constraints
-- Cap leverage at maximum safe value of 20x
UPDATE public.auto_trading_config
SET leverage = 20
WHERE leverage > 20;

-- Ensure quantity_usdt is within safe bounds
UPDATE public.auto_trading_config
SET quantity_usdt = LEAST(GREATEST(quantity_usdt, 10), 10000);

-- Ensure demo_balance is within safe bounds
UPDATE public.trading_settings
SET demo_balance = LEAST(GREATEST(demo_balance, 100), 100000);

-- Now add CHECK constraints for position size limits
-- Constrain quantity_usdt to reasonable trading amounts ($10 - $10,000)
ALTER TABLE public.auto_trading_config
ADD CONSTRAINT quantity_usdt_limits CHECK (quantity_usdt >= 10 AND quantity_usdt <= 10000);

-- Constrain leverage to safe levels (1x - 20x)
ALTER TABLE public.auto_trading_config  
ADD CONSTRAINT leverage_limits CHECK (leverage >= 1 AND leverage <= 20);

-- Constrain demo balance to prevent unrealistic testing scenarios ($100 - $100,000)
ALTER TABLE public.trading_settings
ADD CONSTRAINT demo_balance_limits CHECK (demo_balance >= 100 AND demo_balance <= 100000);