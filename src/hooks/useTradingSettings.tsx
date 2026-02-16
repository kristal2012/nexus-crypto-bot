import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FIXED_USER_ID } from "@/config/userConfig";

interface TradingSettings {
  trading_mode: "REAL" | "DEMO";
  demo_balance: number;
}

export const useTradingSettings = () => {
  const [settings, setSettings] = useState<TradingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSettings = async () => {

    try {

      let { data, error } = await supabase
        .from("trading_settings")
        .select("*")
        .eq("user_id", FIXED_USER_ID)
        .maybeSingle();

      if (error) throw error;

      // Create default settings if none exist
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from("trading_settings")
          .insert({
            user_id: FIXED_USER_ID,
            trading_mode: "DEMO",
            demo_balance: 10000,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        data = newSettings;
      }

      setSettings({
        trading_mode: data.trading_mode as "REAL" | "DEMO",
        demo_balance: typeof data.demo_balance === 'string' ? parseFloat(data.demo_balance) : data.demo_balance,
      });
    } catch (error) {
      console.error("Error fetching trading settings:", error);
      toast({
        title: "Erro ao carregar configurações",
        description: "Não foi possível carregar as configurações de trading",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateTradingMode = async (mode: "REAL" | "DEMO") => {
    try {

      // If switching to REAL mode, set confirmation timestamp
      const updateData: any = { trading_mode: mode };
      if (mode === "REAL") {
        updateData.real_mode_confirmed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("trading_settings")
        .update(updateData)
        .eq("user_id", FIXED_USER_ID);

      if (error) throw error;

      setSettings((prev) => prev ? { ...prev, trading_mode: mode } : null);

      toast({
        title: "Modo alterado",
        description: `Modo de trading alterado para ${mode === "DEMO" ? "Demonstração" : "Real"}`,
      });
    } catch (error) {
      console.error("Error updating trading mode:", error);
      toast({
        title: "Erro ao alterar modo",
        description: "Não foi possível alterar o modo de trading",
        variant: "destructive",
      });
    }
  };

  const updateDemoBalance = async (amount: number) => {
    try {
      const { error } = await supabase
        .from("trading_settings")
        .update({ demo_balance: amount })
        .eq("user_id", FIXED_USER_ID);

      if (error) throw error;

      setSettings((prev) => prev ? { ...prev, demo_balance: amount } : null);
    } catch (error) {
      console.error("Error updating demo balance:", error);
      throw error;
    }
  };

  const isSimulation = (typeof process !== 'undefined' && process.env?.VITE_TRADING_MODE === 'test') ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_TRADING_MODE === 'test');

  return {
    settings: isSimulation ? {
      trading_mode: "DEMO" as const,
      demo_balance: settings?.demo_balance || 10000
    } : settings,
    loading,
    updateTradingMode,
    updateDemoBalance,
    refetch: fetchSettings,
  };
};
