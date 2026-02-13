/**
 * Demo Position Monitor Hook
 * 
 * SRP: Hook responsável por monitorar posições DEMO e simular TP/SL/Trailing
 * Invoca a edge function monitor-demo-positions periodicamente
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FIXED_USER_ID } from '@/config/userConfig';

export const useDemoPositionMonitor = (isActive: boolean, isDemoMode: boolean) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Só monitora se estiver em modo DEMO e o bot estiver ativo
    if (!isActive || !isDemoMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    console.log('🔍 Iniciando monitoramento de posições DEMO...');

    const monitorPositions = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('monitor-demo-positions');

        if (error) {
          console.error('Erro ao monitorar posições DEMO:', error);
          return;
        }

        if (data?.closed > 0) {
          console.log(`✅ Posições fechadas por TP/SL/Trailing: ${data.closed}`);
          // A UI será atualizada automaticamente quando refetch for chamado
        }
      } catch (err) {
        console.error('Exceção ao monitorar posições:', err);
      }
    };

    // Executar imediatamente
    monitorPositions();

    // Repetir a cada 30 segundos
    intervalRef.current = setInterval(monitorPositions, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, isDemoMode]);

  return null;
};