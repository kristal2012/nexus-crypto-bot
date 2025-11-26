/**
 * Trading Mode Hook
 * 
 * SRP: Hook para acessar o modo de trading atual (DEMO/REAL)
 * SSOT: Única fonte da verdade para o trading mode
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';

export const useTradingMode = () => {
  const { user } = useAuthContext();
  const [tradingMode, setTradingMode] = useState<'DEMO' | 'REAL'>('DEMO');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchTradingMode = async () => {
      try {
        const { data, error } = await supabase
          .from('trading_settings')
          .select('trading_mode')
          .eq('user_id', user.id)
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
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          setTradingMode((payload.new as any).trading_mode);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    tradingMode,
    isDemoMode: tradingMode === 'DEMO',
    loading
  };
};