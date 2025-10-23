-- Alterar o valor padrão de min_confidence para 70
ALTER TABLE auto_trading_config 
ALTER COLUMN min_confidence SET DEFAULT 70.0;

-- Atualizar registros existentes que ainda estão com 95% para 70%
UPDATE auto_trading_config 
SET min_confidence = 70.0 
WHERE min_confidence = 95.0;