export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_analysis_results: {
        Row: {
          analysis_data: Json | null
          confidence: number
          created_at: string | null
          id: string
          predicted_price: number
          recommended_dca_layers: number
          symbol: string
          trend: string
          user_id: string
        }
        Insert: {
          analysis_data?: Json | null
          confidence: number
          created_at?: string | null
          id?: string
          predicted_price: number
          recommended_dca_layers: number
          symbol: string
          trend: string
          user_id: string
        }
        Update: {
          analysis_data?: Json | null
          confidence?: number
          created_at?: string | null
          id?: string
          predicted_price?: number
          recommended_dca_layers?: number
          symbol?: string
          trend?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_trading_config: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_analysis_at: string | null
          leverage: number
          min_confidence: number
          quantity_usdt: number
          stop_loss: number
          take_profit: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_analysis_at?: string | null
          leverage?: number
          min_confidence?: number
          quantity_usdt?: number
          stop_loss?: number
          take_profit?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_analysis_at?: string | null
          leverage?: number
          min_confidence?: number
          quantity_usdt?: number
          stop_loss?: number
          take_profit?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      binance_api_keys: {
        Row: {
          api_key: string
          api_secret_encrypted: string
          created_at: string
          encryption_salt: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          api_secret_encrypted: string
          created_at?: string
          encryption_salt?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          api_secret_encrypted?: string
          created_at?: string
          encryption_salt?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_daily_stats: {
        Row: {
          can_trade: boolean
          created_at: string
          current_balance: number
          date: string
          id: string
          is_active: boolean
          profit_loss_percent: number
          starting_balance: number
          stop_reason: string | null
          trades_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          can_trade?: boolean
          created_at?: string
          current_balance?: number
          date?: string
          id?: string
          is_active?: boolean
          profit_loss_percent?: number
          starting_balance?: number
          stop_reason?: string | null
          trades_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          can_trade?: boolean
          created_at?: string
          current_balance?: number
          date?: string
          id?: string
          is_active?: boolean
          profit_loss_percent?: number
          starting_balance?: number
          stop_reason?: string | null
          trades_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      emergency_stop_audit: {
        Row: {
          action: string
          created_at: string
          emergency_message: string | null
          id: string
          trading_enabled: boolean
          triggered_by: string
        }
        Insert: {
          action: string
          created_at?: string
          emergency_message?: string | null
          id?: string
          trading_enabled: boolean
          triggered_by: string
        }
        Update: {
          action?: string
          created_at?: string
          emergency_message?: string | null
          id?: string
          trading_enabled?: boolean
          triggered_by?: string
        }
        Relationships: []
      }
      performance_stats: {
        Row: {
          average_loss: number | null
          average_profit: number | null
          created_at: string
          id: string
          largest_loss: number | null
          largest_win: number | null
          losing_trades: number
          max_drawdown: number | null
          period: Database["public"]["Enums"]["performance_period"]
          period_date: string
          sharpe_ratio: number | null
          total_profit_loss: number
          total_trades: number
          total_volume: number
          updated_at: string
          user_id: string
          win_rate: number | null
          winning_trades: number
        }
        Insert: {
          average_loss?: number | null
          average_profit?: number | null
          created_at?: string
          id?: string
          largest_loss?: number | null
          largest_win?: number | null
          losing_trades?: number
          max_drawdown?: number | null
          period: Database["public"]["Enums"]["performance_period"]
          period_date: string
          sharpe_ratio?: number | null
          total_profit_loss?: number
          total_trades?: number
          total_volume?: number
          updated_at?: string
          user_id: string
          win_rate?: number | null
          winning_trades?: number
        }
        Update: {
          average_loss?: number | null
          average_profit?: number | null
          created_at?: string
          id?: string
          largest_loss?: number | null
          largest_win?: number | null
          losing_trades?: number
          max_drawdown?: number | null
          period?: Database["public"]["Enums"]["performance_period"]
          period_date?: string
          sharpe_ratio?: number | null
          total_profit_loss?: number
          total_trades?: number
          total_volume?: number
          updated_at?: string
          user_id?: string
          win_rate?: number | null
          winning_trades?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          parameters: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parameters?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parameters?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          emergency_message: string | null
          id: string
          is_singleton: boolean
          trading_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          emergency_message?: string | null
          id?: string
          is_singleton?: boolean
          trading_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          emergency_message?: string | null
          id?: string
          is_singleton?: boolean
          trading_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          commission: number | null
          created_at: string
          executed_at: string | null
          id: string
          is_demo: boolean
          order_id: string | null
          price: number
          profit_loss: number | null
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          status: Database["public"]["Enums"]["trade_status"]
          symbol: string
          type: Database["public"]["Enums"]["trade_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          commission?: number | null
          created_at?: string
          executed_at?: string | null
          id?: string
          is_demo?: boolean
          order_id?: string | null
          price: number
          profit_loss?: number | null
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          symbol: string
          type: Database["public"]["Enums"]["trade_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          commission?: number | null
          created_at?: string
          executed_at?: string | null
          id?: string
          is_demo?: boolean
          order_id?: string | null
          price?: number
          profit_loss?: number | null
          quantity?: number
          side?: Database["public"]["Enums"]["trade_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          symbol?: string
          type?: Database["public"]["Enums"]["trade_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_mode_audit: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          new_mode: string | null
          old_mode: string | null
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          new_mode?: string | null
          old_mode?: string | null
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          new_mode?: string | null
          old_mode?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trading_settings: {
        Row: {
          created_at: string
          demo_balance: number
          id: string
          real_mode_confirmed_at: string | null
          trading_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          demo_balance?: number
          id?: string
          real_mode_confirmed_at?: string | null
          trading_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          demo_balance?: number
          id?: string
          real_mode_confirmed_at?: string | null
          trading_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_analysis_lock: {
        Args: { p_cooldown_minutes?: number; p_user_id: string }
        Returns: {
          is_active: boolean
          last_analysis_at: string
          leverage: number
          min_confidence: number
          quantity_usdt: number
          stop_loss: number
          take_profit: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_daily_bot_stats: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
      performance_period: "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME"
      trade_side: "BUY" | "SELL"
      trade_status: "PENDING" | "FILLED" | "PARTIAL" | "CANCELLED" | "FAILED"
      trade_type: "MARKET" | "LIMIT" | "STOP_LOSS" | "TAKE_PROFIT"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      performance_period: ["DAILY", "WEEKLY", "MONTHLY", "ALL_TIME"],
      trade_side: ["BUY", "SELL"],
      trade_status: ["PENDING", "FILLED", "PARTIAL", "CANCELLED", "FAILED"],
      trade_type: ["MARKET", "LIMIT", "STOP_LOSS", "TAKE_PROFIT"],
    },
  },
} as const
