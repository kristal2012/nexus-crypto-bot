import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TradeParams {
  symbol: string;
  side: "BUY" | "SELL";
  quantity?: string;
  quoteOrderQty?: string;
}

export const useAutoTrade = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const { toast } = useToast();

  const executeTrade = async (params: TradeParams) => {
    setIsExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-trade', {
        body: params
      });

      if (error) throw error;

      if (!data.success) {
        toast({
          title: "Trade não executado",
          description: data.message || "Limites diários atingidos",
          variant: "destructive",
        });
        return { success: false, data };
      }

      toast({
        title: "Trade executado com sucesso",
        description: `${params.side} ${params.quoteOrderQty || params.quantity} USDT de ${params.symbol}`,
      });

      return { success: true, data };
    } catch (error) {
      console.error('Error executing trade:', error);
      toast({
        title: "Erro ao executar trade",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { success: false, error };
    } finally {
      setIsExecuting(false);
    }
  };

  return {
    executeTrade,
    isExecuting,
  };
};
