-- Adiciona coluna highest_price para trailing stop loss
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS highest_price DECIMAL(20, 8);

-- Inicializa highest_price com entry_price para posições existentes
UPDATE positions 
SET highest_price = entry_price 
WHERE highest_price IS NULL;