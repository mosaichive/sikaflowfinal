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
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          performed_by: string | null
          performed_by_name: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          performed_by?: string | null
          performed_by_name?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          performed_by?: string | null
          performed_by_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          bank_name: string
          branch: string | null
          created_at: string
          id: string
          mobile_money_name: string | null
          mobile_money_number: string | null
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          branch?: string | null
          created_at?: string
          id?: string
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          branch?: string | null
          created_at?: string
          id?: string
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          note?: string | null
          updated_at?: string
          user_id?: string
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
          attachment_name: string | null
          attachment_path: string | null
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          note: string | null
          payment_method: string | null
          recorded_by: string | null
          recorded_by_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          attachment_name?: string | null
          attachment_path?: string | null
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          payment_method?: string | null
          recorded_by?: string | null
          recorded_by_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          attachment_name?: string | null
          attachment_path?: string | null
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          payment_method?: string | null
          recorded_by?: string | null
          recorded_by_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investments: {
        Row: {
          amount: number
          created_at: string
          id: string
          investment_date: string
          name: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          investment_date?: string
          name?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          investment_date?: string
          name?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investor_funding: {
        Row: {
          amount: number
          created_at: string
          date_received: string
          id: string
          investor_name: string
          note: string | null
          reference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date_received?: string
          id?: string
          investor_name?: string
          note?: string | null
          reference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date_received?: string
          id?: string
          investor_name?: string
          note?: string | null
          reference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      other_income: {
        Row: {
          amount: number
          attachment_name: string | null
          attachment_path: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          income_date: string
          note: string | null
          payment_method: string | null
          recorded_by: string | null
          recorded_by_name: string | null
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          attachment_name?: string | null
          attachment_path?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          income_date?: string
          note?: string | null
          payment_method?: string | null
          recorded_by?: string | null
          recorded_by_name?: string | null
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          attachment_name?: string | null
          attachment_path?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          income_date?: string
          note?: string | null
          payment_method?: string | null
          recorded_by?: string | null
          recorded_by_name?: string | null
          source?: string | null
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
          avatar_url: string | null
          bio: string | null
          business_name: string | null
          business_type: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          location: string | null
          logo_url: string | null
          num_employees: string | null
          onboarding_completed: boolean
          opening_cash_balance: number
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
          avatar_url?: string | null
          bio?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id: string
          location?: string | null
          logo_url?: string | null
          num_employees?: string | null
          onboarding_completed?: boolean
          opening_cash_balance?: number
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
          avatar_url?: string | null
          bio?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          location?: string | null
          logo_url?: string | null
          num_employees?: string | null
          onboarding_completed?: boolean
          opening_cash_balance?: number
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
      restocks: {
        Row: {
          category: string
          cost_price_per_unit: number
          created_at: string
          id: string
          is_opening_stock: boolean
          note: string | null
          payment_method: string
          product_id: string | null
          product_name: string
          quantity_added: number
          recorded_by: string | null
          recorded_by_name: string | null
          reference: string | null
          restock_date: string
          status: string
          total_cost: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string
          cost_price_per_unit?: number
          created_at?: string
          id?: string
          is_opening_stock?: boolean
          note?: string | null
          payment_method?: string
          product_id?: string | null
          product_name?: string
          quantity_added?: number
          recorded_by?: string | null
          recorded_by_name?: string | null
          reference?: string | null
          restock_date?: string
          status?: string
          total_cost?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          cost_price_per_unit?: number
          created_at?: string
          id?: string
          is_opening_stock?: boolean
          note?: string | null
          payment_method?: string
          product_id?: string | null
          product_name?: string
          quantity_added?: number
          recorded_by?: string | null
          recorded_by_name?: string | null
          reference?: string | null
          restock_date?: string
          status?: string
          total_cost?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sale_documents: {
        Row: {
          amount_ghs: number
          amount_paid_ghs: number
          balance_ghs: number
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          document_number: string
          id: string
          issued_at: string
          issued_by: string | null
          kind: string
          payment_status: string
          sale_date: string
          sale_id: string
          seller_name: string | null
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_ghs?: number
          amount_paid_ghs?: number
          balance_ghs?: number
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          document_number: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind: string
          payment_status?: string
          sale_date?: string
          sale_id: string
          seller_name?: string | null
          snapshot?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_ghs?: number
          amount_paid_ghs?: number
          balance_ghs?: number
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          document_number?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind?: string
          payment_status?: string
          sale_date?: string
          sale_id?: string
          seller_name?: string | null
          snapshot?: Json
          updated_at?: string
          user_id?: string
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
      savings: {
        Row: {
          account_name: string | null
          amount: number
          bank_account_id: string | null
          created_at: string
          id: string
          institution: string | null
          note: string | null
          recorded_by: string | null
          reference: string | null
          savings_date: string
          source: string | null
          type: Database["public"]["Enums"]["savings_type"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          id?: string
          institution?: string | null
          note?: string | null
          recorded_by?: string | null
          reference?: string | null
          savings_date?: string
          source?: string | null
          type?: Database["public"]["Enums"]["savings_type"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          id?: string
          institution?: string | null
          note?: string | null
          recorded_by?: string | null
          reference?: string | null
          savings_date?: string
          source?: string | null
          type?: Database["public"]["Enums"]["savings_type"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          business_owner_id: string
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          permissions: Json
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          business_owner_id: string
          created_at?: string
          display_name?: string | null
          email: string
          expires_at?: string
          id?: string
          permissions?: Json
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          business_owner_id?: string
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          permissions?: Json
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_members: {
        Row: {
          active: boolean
          business_owner_id: string
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          permissions: Json
          staff_user_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_owner_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          permissions?: Json
          staff_user_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_owner_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          permissions?: Json
          staff_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          added_by_name: string | null
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
          added_by_name?: string | null
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
          added_by_name?: string | null
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
      accept_staff_invite: { Args: { _token: string }; Returns: Json }
      admin_platform_stats: { Args: never; Returns: Json }
      get_table_columns: {
        Args: { _table_name: string }
        Returns: {
          column_name: string
          data_type: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recompute_product_stock: {
        Args: never
        Returns: {
          new_stock: number
          product_id: string
        }[]
      }
      sync_product_stock: {
        Args: { _product_id: string; _user_id: string }
        Returns: number
      }
    }
    Enums: {
      announcement_audience: "all" | "trial" | "active" | "expired"
      announcement_priority: "low" | "normal" | "high"
      app_role: "super_admin" | "business_owner" | "staff"
      savings_type: "bank" | "mobile_money" | "susu"
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
      savings_type: ["bank", "mobile_money", "susu"],
      subscription_plan: ["trial", "monthly", "annual"],
      subscription_status: ["trial", "active", "expired", "suspended"],
    },
  },
} as const
