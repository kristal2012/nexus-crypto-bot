-- Adiciona campo para armazenar o capital inicial (saldo de partida da conta)
ALTER TABLE public.trading_settings 
ADD COLUMN initial_capital numeric DEFAULT 10000 NOT NULL;

-- Atualiza registros existentes: define initial_capital como o valor atual de demo_balance
UPDATE public.trading_settings 
SET initial_capital = demo_balance;