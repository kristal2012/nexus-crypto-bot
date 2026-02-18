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

    // Event listener for global sync
    const handleGlobalStatusChange = (event: any) => {
      if (event.detail?.userId === FIXED_USER_ID) {
        setIsActive(event.detail.isActive);
      }
    };

    window.addEventListener('bot-status-changed', handleGlobalStatusChange);

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
          const newStatus = (payload.new as any).is_active || false;
          setIsActive(newStatus);

          // Emit event for local sync
          window.dispatchEvent(new CustomEvent('bot-status-changed', {
            detail: { userId: FIXED_USER_ID, isActive: newStatus }
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('bot-status-changed', handleGlobalStatusChange);
    };
  }, []);

  const toggleBotActive = async (newValue: boolean) => {
    try {
      setLoading(true);

      // Use API Proxy to bypass RLS and update the correct table (bot_configurations)
      // The backend listens to 'bot_configurations', not 'auto_trading_config'
      const response = await fetch('/api/toggle-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: newValue ? 'start' : 'stop',
          userId: FIXED_USER_ID
        })
      });

      if (!response.ok) {
        throw new Error('Failed to toggle bot via API');
      }

      // Optimistic update
      setIsActive(newValue);

      // Persist in localStorage
      localStorage.setItem(`bot_active_${FIXED_USER_ID}`, newValue ? 'true' : 'false');

      // Dispatch global event
      window.dispatchEvent(new CustomEvent('bot-status-changed', {
        detail: { userId: FIXED_USER_ID, isActive: newValue }
      }));

    } catch (err) {
      console.error('Error toggling bot active:', err);
      // Revert optimism if needed, but for now log error
    } finally {
      setLoading(false);
    }
  };

  return {
    isActive,
    loading,
    toggleBotActive
  };
};