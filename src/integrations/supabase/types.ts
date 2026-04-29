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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          created_at: string
          created_by: string | null
          id: string
          message: string
          priority: Database["public"]["Enums"]["announcement_priority"]
          publish_at: string
          target_plan: Database["public"]["Enums"]["subscription_plan"] | null
          target_user_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          priority?: Database["public"]["Enums"]["announcement_priority"]
          publish_at?: string
          target_plan?: Database["public"]["Enums"]["subscription_plan"] | null
          target_user_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          priority?: Database["public"]["Enums"]["announcement_priority"]
          publish_at?: string
          target_plan?: Database["public"]["Enums"]["subscription_plan"] | null
          target_user_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          note: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          note?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          note?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          expense_date: string
          id: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          expense_date?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          expense_date?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      other_income: {
        Row: {
          amount: number
          created_at: string
          id: string
          income_date: string
          note: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          income_date?: string
          note?: string | null
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          income_date?: string
          note?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          details: Json
          id: string
          label: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          details?: Json
          id?: string
          label: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          details?: Json
          id?: string
          label?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          cost: number
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          price: number
          sku: string | null
          stock: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name: string
          price?: number
          sku?: string | null
          stock?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          price?: number
          sku?: string | null
          stock?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_name: string | null
          business_type: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          location: string | null
          num_employees: string | null
          onboarding_completed: boolean
          phone: string | null
          role: string | null
          subscription_end_date: string | null
          subscription_plan: Database["public"]["Enums"]["subscription_plan"]
          subscription_start_date: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          suspended: boolean
          trial_end_date: string
          trial_start_date: string
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id: string
          location?: string | null
          num_employees?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          role?: string | null
          subscription_end_date?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_start_date?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          suspended?: boolean
          trial_end_date?: string
          trial_start_date?: string
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          location?: string | null
          num_employees?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          role?: string | null
          subscription_end_date?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_start_date?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          suspended?: boolean
          trial_end_date?: string
          trial_start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          unit_cost: number
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          unit_cost?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          unit_cost?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          cost_total: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          discount: number
          id: string
          invoice_number: string | null
          note: string | null
          payment_method: string
          sale_date: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number
          cost_total?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          invoice_number?: string | null
          note?: string | null
          payment_method?: string
          sale_date?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          cost_total?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          invoice_number?: string | null
          note?: string | null
          payment_method?: string
          sale_date?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          change: number
          created_at: string
          id: string
          note: string | null
          product_id: string
          reason: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          change: number
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          reason?: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          change?: number
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          reason?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          payment_method: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          payment_method: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          payment_method?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
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
      admin_platform_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      announcement_audience: "all" | "trial" | "active" | "expired"
      announcement_priority: "low" | "normal" | "high"
      app_role: "super_admin" | "business_owner" | "staff"
      subscription_plan: "trial" | "monthly" | "annual"
      subscription_status: "trial" | "active" | "expired" | "suspended"
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
      announcement_audience: ["all", "trial", "active", "expired"],
      announcement_priority: ["low", "normal", "high"],
      app_role: ["super_admin", "business_owner", "staff"],
      subscription_plan: ["trial", "monthly", "annual"],
      subscription_status: ["trial", "active", "expired", "suspended"],
    },
  },
} as const
