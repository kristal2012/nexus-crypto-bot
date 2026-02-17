/**
 * Bot Active Hook
 * 
 * SRP: Hook para acessar o estado ativo do bot
 * SSOT: Única fonte da verdade para is_active
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FIXED_USER_ID } from '@/config/userConfig';

export const useBotActive = () => {
  const [isActive, setIsActive] = useState(() => {
    return localStorage.getItem(`bot_active_${FIXED_USER_ID}`) === 'true';
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBotStatus = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('auto_trading_config')
          .select('is_active')
          .eq('user_id', FIXED_USER_ID)
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
          filter: `user_id=eq.${FIXED_USER_ID}`
        },
        (payload) => {
          setIsActive((payload.new as any).is_active || false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleBotActive = async (newValue: boolean) => {
    try {
      const { data: existing } = await (supabase as any)
        .from('auto_trading_config')
        .select('id')
        .eq('user_id', FIXED_USER_ID)
        .maybeSingle();

      if (existing) {
        await (supabase as any)
          .from('auto_trading_config')
          .update({ is_active: newValue })
          .eq('user_id', FIXED_USER_ID);
      } else {
        await (supabase as any)
          .from('auto_trading_config')
          .insert({
            user_id: FIXED_USER_ID,
            is_active: newValue
          });
      }

      // Optimistic update
      setIsActive(newValue);

      // Persist in localStorage as a temporary cache/fallback
      localStorage.setItem(`bot_active_${FIXED_USER_ID}`, newValue ? 'true' : 'false');
    } catch (err) {
      console.error('Error toggling bot active:', err);
      // Revert if error? For now keeping it optimistic for better UX
    }
  };

  return {
    isActive,
    loading,
    toggleBotActive
  };
};