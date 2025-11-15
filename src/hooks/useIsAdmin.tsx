import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

export const useIsAdmin = () => {
  const { user } = useAuthContext();

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }

      return !!data;
    },
    enabled: !!user?.id,
  });

  return { isAdmin: isAdmin ?? false, isLoading };
};
