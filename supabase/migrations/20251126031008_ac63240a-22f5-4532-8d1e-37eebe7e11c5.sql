-- Adicionar colunas para TP/SL targets nas posições
ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS tp_price NUMERIC,
ADD COLUMN IF NOT EXISTS sl_price NUMERIC,
ADD COLUMN IF NOT EXISTS trailing_activation NUMERIC;

-- Resetar bot_daily_stats para permitir trading novamente
UPDATE public.bot_daily_stats
SET can_trade = true,
    stop_reason = NULL
WHERE is_active = true
  AND date = CURRENT_DATE;

COMMENT ON COLUMN public.positions.tp_price IS 'Preço alvo de Take Profit calculado';
COMMENT ON COLUMN public.positions.sl_price IS 'Preço alvo de Stop Loss calculado';
COMMENT ON COLUMN public.positions.trailing_activation IS 'Preço de ativação do Trailing Stop';