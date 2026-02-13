import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FIXED_USER_ID } from "@/config/userConfig";

export const useIsAdmin = () => {
  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ['is-admin', FIXED_USER_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', FIXED_USER_ID)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }

      return !!data;
    },
  });

  return { isAdmin: isAdmin ?? false, isLoading };
};
