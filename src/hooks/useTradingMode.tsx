/**
 * Trading Mode Hook
 * 
 * SRP: Hook para acessar o modo de trading atual (DEMO/REAL)
 * SSOT: Única fonte da verdade para o trading mode
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FIXED_USER_ID } from '@/config/userConfig';
import { IS_SIMULATION } from '@/utils/env';

export const useTradingMode = () => {
  const [tradingMode, setTradingMode] = useState<'DEMO' | 'REAL'>('DEMO');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTradingMode = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('trading_settings')
          .select('trading_mode')
          .eq('user_id', FIXED_USER_ID)
          .maybeSingle();

        if (!error && data) {
          setTradingMode(data.trading_mode as 'DEMO' | 'REAL');
        }
      } catch (err) {
        console.error('Error fetching trading mode:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTradingMode();

    // Realtime subscription para mudanças
    const channel = supabase
      .channel('trading-mode-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trading_settings',
          filter: `user_id=eq.${FIXED_USER_ID}`
        },
        (payload) => {
          setTradingMode((payload.new as any).trading_mode);
        }
      )
      .subscribe();

    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, []);


  return {
    tradingMode: IS_SIMULATION ? 'DEMO' : tradingMode,
    isDemoMode: IS_SIMULATION ? true : tradingMode === 'DEMO',
    loading
  };
};