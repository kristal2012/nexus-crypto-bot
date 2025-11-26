-- Adicionar coluna close_reason na tabela trades para rastrear motivo de fechamento
ALTER TABLE trades ADD COLUMN close_reason TEXT;

-- Adicionar comentário explicativo
COMMENT ON COLUMN trades.close_reason IS 'Motivo do fechamento: MANUAL_CLOSE, TP, SL, TRAILING_STOP, etc.';