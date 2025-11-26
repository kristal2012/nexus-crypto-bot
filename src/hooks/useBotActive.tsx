/**
 * Bot Active Hook
 * 
 * SRP: Hook para acessar o estado ativo do bot
 * SSOT: Única fonte da verdade para is_active
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';

export const useBotActive = () => {
  const { user } = useAuthContext();
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchBotStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('auto_trading_config')
          .select('is_active')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data) {
          setIsActive(data.is_active || false);
        }
      } catch (err) {
        console.error('Error fetching bot status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBotStatus();

    // Realtime subscription para mudanças
    const channel = supabase
      .channel('bot-active-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auto_trading_config',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          setIsActive((payload.new as any).is_active || false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    isActive,
    loading
  };
};