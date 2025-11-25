-- Adiciona política DELETE para bot_daily_stats
-- Permite usuários deletarem suas próprias estatísticas diárias
CREATE POLICY "Users can delete their own daily stats" 
ON bot_daily_stats FOR DELETE 
USING (auth.uid() = user_id);