-- Adicionar campos para armazenar IDs das ordens condicionais
ALTER TABLE positions 
ADD COLUMN tp_order_id TEXT,
ADD COLUMN sl_order_id TEXT;

-- Criar índice para melhorar performance de consultas
CREATE INDEX idx_positions_order_ids ON positions(tp_order_id, sl_order_id) WHERE tp_order_id IS NOT NULL OR sl_order_id IS NOT NULL;

COMMENT ON COLUMN positions.tp_order_id IS 'ID da ordem TAKE_PROFIT_MARKET criada automaticamente';
COMMENT ON COLUMN positions.sl_order_id IS 'ID da ordem STOP_MARKET criada automaticamente';