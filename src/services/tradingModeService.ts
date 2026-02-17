/**
 * Trading Mode Service
 * 
 * Centralizes all trading mode validation logic following SRP principle.
 * This is the SINGLE SOURCE OF TRUTH for trading mode state.
 */

import { supabase } from "@/integrations/supabase/client";

export type TradingMode = "DEMO" | "REAL";

export interface TradingModeState {
  mode: TradingMode;
  demoBalance: number;
  realModeConfirmedAt: string | null;
  isRealModeValid: boolean;
}

/**
 * Validates if REAL mode is currently active and confirmed.
 * REAL mode requires confirmation within the last 5 minutes for security.
 */
export const validateRealMode = (
  mode: TradingMode,
  confirmedAt: string | null
): { isValid: boolean; error?: string } => {
  if (mode !== "REAL") {
    return { isValid: true }; // DEMO mode always valid
  }

  if (!confirmedAt) {
    return {
      isValid: false,
      error: "Real mode requires confirmation",
    };
  }

  const confirmed = new Date(confirmedAt);
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  if (confirmed < fiveMinutesAgo) {
    return {
      isValid: false,
      error: "Real mode confirmation expired (5 min limit)",
    };
  }

  return { isValid: true };
};

/**
 * Gets the current trading mode state for the authenticated user.
 * This is the SSOT for trading mode across the entire application.
 */
export const getTradingModeState = async (): Promise<TradingModeState | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: settings, error } = await (supabase as any)
      .from("trading_settings")
      .select("trading_mode, demo_balance, real_mode_confirmed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching trading mode:", error);
      return null;
    }

    if (!settings) {
      // Create default DEMO mode if none exists
      const { data: newSettings, error: createError } = await (supabase as any)
        .from("trading_settings")
        .insert({
          user_id: user.id,
          trading_mode: "DEMO",
          demo_balance: 1000,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating default settings:", createError);
        return null;
      }

      return {
        mode: "DEMO",
        demoBalance: 1000,
        realModeConfirmedAt: null,
        isRealModeValid: false,
      };
    }

    const mode = settings.trading_mode as TradingMode;
    const validation = validateRealMode(mode, settings.real_mode_confirmed_at);

    return {
      mode,
      demoBalance: typeof settings.demo_balance === 'string'
        ? parseFloat(settings.demo_balance)
        : settings.demo_balance,
      realModeConfirmedAt: settings.real_mode_confirmed_at,
      isRealModeValid: validation.isValid,
    };
  } catch (error) {
    console.error("Exception in getTradingModeState:", error);
    return null;
  }
};

/**
 * Determines if a trade should be executed in demo mode.
 * CRITICAL SAFETY CHECK: Returns true (DEMO) if ANY validation fails.
 */
export const shouldExecuteInDemoMode = (state: TradingModeState | null): boolean => {
  // FAIL-SAFE: If state is null or invalid, always use DEMO mode
  if (!state) {
    console.warn("⚠️ SAFETY: No trading mode state - defaulting to DEMO mode");
    return true;
  }

  if (state.mode === "DEMO") {
    console.log("✅ DEMO mode active - trades will be simulated");
    return true;
  }

  if (!state.isRealModeValid) {
    console.warn("⚠️ SAFETY: Real mode not valid - falling back to DEMO mode");
    return true;
  }

  console.warn("🔴 REAL MODE ACTIVE - trades will execute on Binance");
  return false;
};
