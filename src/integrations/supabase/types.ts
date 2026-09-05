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
      ad_applications: {
        Row: {
          ad_goal: string | null
          budget: string | null
          business_name: string
          business_type: string | null
          contact_name: string
          created_at: string
          email: string
          id: string
          message: string | null
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          ad_goal?: string | null
          budget?: string | null
          business_name: string
          business_type?: string | null
          contact_name: string
          created_at?: string
          email: string
          id?: string
          message?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          ad_goal?: string | null
          budget?: string | null
          business_name?: string
          business_type?: string | null
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          business_id: string | null
          created_at: string
          details: string | null
          id: string
          performed_by: string
          performed_by_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          business_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          performed_by: string
          performed_by_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          performed_by?: string
          performed_by_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          bank_name: string
          branch: string | null
          business_id: string
          created_at: string
          id: string
          mobile_money_name: string | null
          mobile_money_number: string | null
          note: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name: string
          branch?: string | null
          business_id: string
          created_at?: string
          id?: string
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          note?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          branch?: string | null
          business_id?: string
          created_at?: string
          id?: string
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          note?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_announcement_reads: {
        Row: {
          announcement_id: string
          business_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          business_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          business_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "business_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_announcement_reads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_announcements: {
        Row: {
          active: boolean
          body: string
          business_id: string
          created_at: string
          created_by: string | null
          created_by_name: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body?: string
          business_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_announcements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          allow_sales_without_stock: boolean
          business_type: string
          created_at: string
          email: string | null
          email_verified: boolean
          id: string
          location: string | null
          logo_dark_url: string | null
          logo_light_url: string | null
          name: string
          number_of_employees: number | null
          owner_user_id: string | null
          phone: string | null
          phone_verified: boolean
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          allow_sales_without_stock?: boolean
          business_type?: string
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id?: string
          location?: string | null
          logo_dark_url?: string | null
          logo_light_url?: string | null
          name: string
          number_of_employees?: number | null
          owner_user_id?: string | null
          phone?: string | null
          phone_verified?: boolean
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          allow_sales_without_stock?: boolean
          business_type?: string
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id?: string
          location?: string | null
          logo_dark_url?: string | null
          logo_light_url?: string | null
          name?: string
          number_of_employees?: number | null
          owner_user_id?: string | null
          phone?: string | null
          phone_verified?: boolean
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          active: boolean
          code: string
          country: string | null
          created_at: string
          decimals: number
          flag: string | null
          is_default: boolean
          name: string
          sort_order: number
          symbol: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          country?: string | null
          created_at?: string
          decimals?: number
          flag?: string | null
          is_default?: boolean
          name: string
          sort_order?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          country?: string | null
          created_at?: string
          decimals?: number
          flag?: string | null
          is_default?: boolean
          name?: string
          sort_order?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          id: string
          location: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      damaged_goods: {
        Row: {
          business_id: string
          category: string
          created_at: string
          damage_date: string
          id: string
          notes: string | null
          product_id: string | null
          product_name: string
          quantity: number
          quantity_after: number
          reason: string
          recorded_by: string | null
          recorded_by_name: string
          total_value: number
          unit_cost: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          category?: string
          created_at?: string
          damage_date?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity: number
          quantity_after?: number
          reason: string
          recorded_by?: string | null
          recorded_by_name?: string
          total_value?: number
          unit_cost?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string
          damage_date?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          quantity_after?: number
          reason?: string
          recorded_by?: string | null
          recorded_by_name?: string
          total_value?: number
          unit_cost?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damaged_goods_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damaged_goods_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_preferences: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          layout: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          layout?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          layout?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_preferences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_rate_limits: {
        Row: {
          action: string
          key_hash: string
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          action: string
          key_hash: string
          request_count?: number
          updated_at?: string
          window_start: string
        }
        Update: {
          action?: string
          key_hash?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      email_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          campaign_id: string | null
          created_at: string
          details: Json
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          campaign_id?: string | null
          created_at?: string
          details?: Json
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          campaign_id?: string | null
          created_at?: string
          details?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_audit_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_recipients: {
        Row: {
          bounced_at: string | null
          campaign_id: string
          click_count: number
          created_at: string
          delivered_at: string | null
          email: string
          error_message: string | null
          first_clicked_at: string | null
          id: string
          merge_data: Json
          open_count: number
          opened_at: string | null
          resend_message_id: string | null
          sent_at: string | null
          status: string
          unsubscribed_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bounced_at?: string | null
          campaign_id: string
          click_count?: number
          created_at?: string
          delivered_at?: string | null
          email: string
          error_message?: string | null
          first_clicked_at?: string | null
          id?: string
          merge_data?: Json
          open_count?: number
          opened_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bounced_at?: string | null
          campaign_id?: string
          click_count?: number
          created_at?: string
          delivered_at?: string | null
          email?: string
          error_message?: string | null
          first_clicked_at?: string | null
          id?: string
          merge_data?: Json
          open_count?: number
          opened_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience_filter: Json
          audience_type: string
          body_html: string
          bounce_count: number
          click_count: number
          created_at: string
          created_by: string | null
          delivered_count: number
          failed_count: number
          from_email: string
          from_name: string
          id: string
          name: string
          open_count: number
          preview_text: string | null
          recipient_count: number
          reply_to: string | null
          scheduled_at: string | null
          sent_at: string | null
          started_at: string | null
          status: string
          subject: string
          template_id: string | null
          timezone: string | null
          unique_click_count: number
          unique_open_count: number
          unsubscribe_count: number
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          audience_type?: string
          body_html?: string
          bounce_count?: number
          click_count?: number
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          failed_count?: number
          from_email?: string
          from_name?: string
          id?: string
          name: string
          open_count?: number
          preview_text?: string | null
          recipient_count?: number
          reply_to?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          started_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          timezone?: string | null
          unique_click_count?: number
          unique_open_count?: number
          unsubscribe_count?: number
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          audience_type?: string
          body_html?: string
          bounce_count?: number
          click_count?: number
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          failed_count?: number
          from_email?: string
          from_name?: string
          id?: string
          name?: string
          open_count?: number
          preview_text?: string | null
          recipient_count?: number
          reply_to?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          started_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          timezone?: string | null
          unique_click_count?: number
          unique_open_count?: number
          unsubscribe_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_marketing_unsubscribes: {
        Row: {
          created_at: string
          email: string
          id: string
          reason: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          reason?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          reason?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      email_media_library: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          preview_text: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          body_html?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          preview_text?: string | null
          subject?: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          preview_text?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          base_currency: string
          created_at: string
          expires_at: string
          fetched_at: string
          id: string
          provider: string
          rate: number
          target_currency: string
          updated_at: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          provider?: string
          rate: number
          target_currency: string
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          provider?: string
          rate?: number
          target_currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          attachment_name: string | null
          attachment_path: string | null
          business_id: string
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          payment_method: string
          recorded_by: string | null
          recorded_by_name: string | null
        }
        Insert: {
          amount?: number
          attachment_name?: string | null
          attachment_path?: string | null
          business_id: string
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string
          recorded_by?: string | null
          recorded_by_name?: string | null
        }
        Update: {
          amount?: number
          attachment_name?: string | null
          attachment_path?: string | null
          business_id?: string
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string
          recorded_by?: string | null
          recorded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      investments: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          duration: string | null
          expected_return: number | null
          id: string
          investment_date: string
          investment_name: string
          note: string | null
          recorded_by: string
          reference: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          duration?: string | null
          expected_return?: number | null
          id?: string
          investment_date?: string
          investment_name: string
          note?: string | null
          recorded_by: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          duration?: string | null
          expected_return?: number | null
          id?: string
          investment_date?: string
          investment_name?: string
          note?: string | null
          recorded_by?: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_funding: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          date_received: string
          email: string | null
          expected_return: number | null
          id: string
          investment_type: string | null
          investor_name: string
          note: string | null
          payment_method: string
          phone: string | null
          recorded_by: string
          reference: string | null
          repayment_terms: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          date_received?: string
          email?: string | null
          expected_return?: number | null
          id?: string
          investment_type?: string | null
          investor_name: string
          note?: string | null
          payment_method?: string
          phone?: string | null
          recorded_by: string
          reference?: string | null
          repayment_terms?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          date_received?: string
          email?: string | null
          expected_return?: number | null
          id?: string
          investment_type?: string | null
          investor_name?: string
          note?: string | null
          payment_method?: string
          phone?: string | null
          recorded_by?: string
          reference?: string | null
          repayment_terms?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_funding_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_funding_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_reviews: {
        Row: {
          avatar_fit: string
          avatar_position_x: number
          avatar_position_y: number
          avatar_url: string | null
          avatar_zoom: number
          business_name: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          id: string
          media_fit: string
          media_position_x: number
          media_position_y: number
          media_type: string | null
          media_url: string | null
          media_zoom: number
          rating: number
          sort_order: number
          testimonial: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          avatar_fit?: string
          avatar_position_x?: number
          avatar_position_y?: number
          avatar_url?: string | null
          avatar_zoom?: number
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          id?: string
          media_fit?: string
          media_position_x?: number
          media_position_y?: number
          media_type?: string | null
          media_url?: string | null
          media_zoom?: number
          rating?: number
          sort_order?: number
          testimonial?: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          avatar_fit?: string
          avatar_position_x?: number
          avatar_position_y?: number
          avatar_url?: string | null
          avatar_zoom?: number
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          id?: string
          media_fit?: string
          media_position_x?: number
          media_position_y?: number
          media_type?: string | null
          media_url?: string | null
          media_zoom?: number
          rating?: number
          sort_order?: number
          testimonial?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      order_items: {
        Row: {
          business_id: string
          cost_price: number
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string
          unit_price: number
          user_id: string | null
        }
        Insert: {
          business_id: string
          cost_price?: number
          created_at?: string
          id?: string
          line_total?: number
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sku?: string
          unit_price?: number
          user_id?: string | null
        }
        Update: {
          business_id?: string
          cost_price?: number
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string
          unit_price?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number
          assigned_to: string | null
          assigned_to_name: string
          balance: number
          business_id: string
          carrier_name: string | null
          carrier_phone: string | null
          confirmation_token: string | null
          created_at: string
          created_by: string | null
          created_by_name: string
          customer_confirmed_at: string | null
          customer_id: string | null
          customer_name: string
          customer_payment_name: string | null
          customer_payment_reference: string | null
          customer_phone: string
          delivered_at: string | null
          delivery_fee: number
          delivery_location: string
          discount: number
          due_date: string | null
          estimated_delivery_date: string | null
          fulfillment_type: string
          id: string
          notes: string
          order_date: string
          payment_method: string
          payment_status: string
          source: string
          status: string
          subtotal: number
          total: number
          tracking_code: string | null
          tracking_notes: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_paid?: number
          assigned_to?: string | null
          assigned_to_name?: string
          balance?: number
          business_id: string
          carrier_name?: string | null
          carrier_phone?: string | null
          confirmation_token?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          customer_confirmed_at?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_payment_name?: string | null
          customer_payment_reference?: string | null
          customer_phone?: string
          delivered_at?: string | null
          delivery_fee?: number
          delivery_location?: string
          discount?: number
          due_date?: string | null
          estimated_delivery_date?: string | null
          fulfillment_type?: string
          id?: string
          notes?: string
          order_date?: string
          payment_method?: string
          payment_status?: string
          source?: string
          status?: string
          subtotal?: number
          total?: number
          tracking_code?: string | null
          tracking_notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_paid?: number
          assigned_to?: string | null
          assigned_to_name?: string
          balance?: number
          business_id?: string
          carrier_name?: string | null
          carrier_phone?: string | null
          confirmation_token?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          customer_confirmed_at?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_payment_name?: string | null
          customer_payment_reference?: string | null
          customer_phone?: string
          delivered_at?: string | null
          delivery_fee?: number
          delivery_location?: string
          discount?: number
          due_date?: string | null
          estimated_delivery_date?: string | null
          fulfillment_type?: string
          id?: string
          notes?: string
          order_date?: string
          payment_method?: string
          payment_status?: string
          source?: string
          status?: string
          subtotal?: number
          total?: number
          tracking_code?: string | null
          tracking_notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      other_income: {
        Row: {
          amount: number
          attachment_name: string | null
          attachment_path: string | null
          business_id: string
          category: string
          created_at: string
          description: string
          id: string
          income_date: string
          payment_method: string
          recorded_by: string | null
          recorded_by_name: string
          updated_at: string
        }
        Insert: {
          amount?: number
          attachment_name?: string | null
          attachment_path?: string | null
          business_id: string
          category: string
          created_at?: string
          description?: string
          id?: string
          income_date?: string
          payment_method?: string
          recorded_by?: string | null
          recorded_by_name?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_name?: string | null
          attachment_path?: string | null
          business_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          income_date?: string
          payment_method?: string
          recorded_by?: string | null
          recorded_by_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "other_income_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_otps: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          otp_code: string
          phone: string
          used: boolean
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          id?: string
          otp_code: string
          phone: string
          used?: boolean
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          otp_code?: string
          phone?: string
          used?: boolean
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          business_id: string
          created_at: string
          event_source: string
          event_type: string
          id: string
          message: string | null
          payload: Json
          payment_id: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          event_source?: string
          event_type: string
          id?: string
          message?: string | null
          payload?: Json
          payment_id: string
          status: string
        }
        Update: {
          business_id?: string
          created_at?: string
          event_source?: string
          event_type?: string
          id?: string
          message?: string | null
          payload?: Json
          payment_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
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
          label?: string
          sort_order?: number
          type?: string
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
      payments: {
        Row: {
          activated_at: string | null
          amount_ghs: number
          amount_paid_ghs: number | null
          billing_cycle: string | null
          business_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          discount_ghs: number
          duplicate_of_payment_id: string | null
          expires_at: string | null
          gateway_message: string | null
          gateway_status: string | null
          id: string
          method: string
          network: string | null
          note: string | null
          notification_sent_at: string | null
          payer_name: string | null
          payer_phone: string | null
          payment_date: string
          paystack_reference: string | null
          plan: string
          provider_response: Json
          provider_transaction_id: string | null
          reference: string | null
          requested_plan: string | null
          resolved_plan: string | null
          review_reason: string | null
          status: string
          submitted_by: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          amount_ghs?: number
          amount_paid_ghs?: number | null
          billing_cycle?: string | null
          business_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          discount_ghs?: number
          duplicate_of_payment_id?: string | null
          expires_at?: string | null
          gateway_message?: string | null
          gateway_status?: string | null
          id?: string
          method?: string
          network?: string | null
          note?: string | null
          notification_sent_at?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_date?: string
          paystack_reference?: string | null
          plan: string
          provider_response?: Json
          provider_transaction_id?: string | null
          reference?: string | null
          requested_plan?: string | null
          resolved_plan?: string | null
          review_reason?: string | null
          status?: string
          submitted_by?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          amount_ghs?: number
          amount_paid_ghs?: number | null
          billing_cycle?: string | null
          business_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          discount_ghs?: number
          duplicate_of_payment_id?: string | null
          expires_at?: string | null
          gateway_message?: string | null
          gateway_status?: string | null
          id?: string
          method?: string
          network?: string | null
          note?: string | null
          notification_sent_at?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_date?: string
          paystack_reference?: string | null
          plan?: string
          provider_response?: Json
          provider_transaction_id?: string | null
          reference?: string | null
          requested_plan?: string | null
          resolved_plan?: string | null
          review_reason?: string | null
          status?: string
          submitted_by?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_duplicate_of_payment_id_fkey"
            columns: ["duplicate_of_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_ads: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          cta_text: string | null
          cta_url: string | null
          description: string
          id: string
          image_url: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          cta_text?: string | null
          cta_url?: string | null
          description?: string
          id?: string
          image_url: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          cta_text?: string | null
          cta_url?: string | null
          description?: string
          id?: string
          image_url?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_announcement_reads: {
        Row: {
          announcement_id: string
          business_id: string
          created_at: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          business_id: string
          created_at?: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          business_id?: string
          created_at?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "platform_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_announcement_reads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          active: boolean
          audience: string
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          level: string
          starts_at: string
          target_business_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          level?: string
          starts_at?: string
          target_business_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          level?: string
          starts_at?: string
          target_business_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_announcements_target_business_id_fkey"
            columns: ["target_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          performed_by: string
          performed_by_email: string | null
          target_business_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by: string
          performed_by_email?: string | null
          target_business_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string
          performed_by_email?: string | null
          target_business_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_log_target_business_id_fkey"
            columns: ["target_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_methods: {
        Row: {
          active: boolean
          badge: string | null
          created_at: string
          created_by: string | null
          details: Json
          id: string
          instructions: string | null
          kind: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          instructions?: string | null
          kind: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          instructions?: string | null
          kind?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_support_settings: {
        Row: {
          created_at: string
          id: string
          office_address: string
          phone_number: string
          show_email: boolean
          show_office_address: boolean
          show_phone: boolean
          show_whatsapp: boolean
          singleton_key: string
          support_email: string
          updated_at: string
          updated_by: string | null
          whatsapp_link: string
          whatsapp_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          office_address?: string
          phone_number?: string
          show_email?: boolean
          show_office_address?: boolean
          show_phone?: boolean
          show_whatsapp?: boolean
          singleton_key?: string
          support_email?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_link?: string
          whatsapp_number?: string
        }
        Update: {
          created_at?: string
          id?: string
          office_address?: string
          phone_number?: string
          show_email?: boolean
          show_office_address?: boolean
          show_phone?: boolean
          show_whatsapp?: boolean
          singleton_key?: string
          support_email?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_link?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      pricing_plans: {
        Row: {
          created_at: string
          cta_label: string
          description: string
          features: Json
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          price_annual: number
          price_monthly: number
          sort_order: number
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_label?: string
          description?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          price_annual?: number
          price_monthly?: number
          sort_order?: number
          tier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_label?: string
          description?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          price_annual?: number
          price_monthly?: number
          sort_order?: number
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          available_online: boolean
          barcode: string | null
          brand: string | null
          business_id: string
          category: string
          colors: string[] | null
          cost_price: number
          created_at: string
          id: string
          image_url: string | null
          is_archived: boolean
          low_stock_threshold: number | null
          name: string
          online_description: string | null
          quantity: number
          reorder_level: number
          selling_price: number
          sizes: string[] | null
          sku: string
          stock: number
          supplier: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          available_online?: boolean
          barcode?: string | null
          brand?: string | null
          business_id: string
          category?: string
          colors?: string[] | null
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          is_archived?: boolean
          low_stock_threshold?: number | null
          name: string
          online_description?: string | null
          quantity?: number
          reorder_level?: number
          selling_price?: number
          sizes?: string[] | null
          sku: string
          stock?: number
          supplier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          available_online?: boolean
          barcode?: string | null
          brand?: string | null
          business_id?: string
          category?: string
          colors?: string[] | null
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          is_archived?: boolean
          low_stock_threshold?: number | null
          name?: string
          online_description?: string | null
          quantity?: number
          reorder_level?: number
          selling_price?: number
          sizes?: string[] | null
          sku?: string
          stock?: number
          supplier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allow_sales_without_stock: boolean
          avatar_url: string | null
          bio: string | null
          business_id: string | null
          business_name: string | null
          business_type: string | null
          created_at: string
          currency: string
          display_name: string | null
          email: string | null
          email_verified: boolean
          id: string
          last_activity_at: string | null
          last_login_at: string | null
          last_verified_phone: string | null
          location: string | null
          login_count: number
          logo_url: string | null
          marketing_emails_opted_out: boolean
          monthly_statement_enabled: boolean
          num_employees: string | null
          onboarding_completed: boolean
          online_ordering_enabled: boolean
          opening_cash_balance: number
          orders_auto_publish_products: boolean
          phone: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          referral_claimed_at: string | null
          referred_by_user_id: string | null
          role: string | null
          sms_notify_low_stock: boolean
          sms_notify_new_order: boolean
          sms_notify_order_status: boolean
          sms_notify_sale_thanks: boolean
          sms_notify_team_invite: boolean
          store_allow_delivery: boolean
          store_allow_pickup: boolean
          store_default_delivery_fee: number
          store_enable_delivery_address: boolean
          store_enable_notes: boolean
          store_enable_product_images: boolean
          store_payment_instructions: string | null
          store_payment_methods: string[]
          store_show_stock: boolean
          store_slug: string | null
          subscription_end_date: string | null
          subscription_plan: Database["public"]["Enums"]["subscription_plan"]
          subscription_start_date: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          suspended: boolean | null
          title: string | null
          trial_end_date: string
          trial_start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_sales_without_stock?: boolean
          avatar_url?: string | null
          bio?: string | null
          business_id?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          display_name?: string | null
          email?: string | null
          email_verified?: boolean
          id?: string
          last_activity_at?: string | null
          last_login_at?: string | null
          last_verified_phone?: string | null
          location?: string | null
          login_count?: number
          logo_url?: string | null
          marketing_emails_opted_out?: boolean
          monthly_statement_enabled?: boolean
          num_employees?: string | null
          onboarding_completed?: boolean
          online_ordering_enabled?: boolean
          opening_cash_balance?: number
          orders_auto_publish_products?: boolean
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          referral_claimed_at?: string | null
          referred_by_user_id?: string | null
          role?: string | null
          sms_notify_low_stock?: boolean
          sms_notify_new_order?: boolean
          sms_notify_order_status?: boolean
          sms_notify_sale_thanks?: boolean
          sms_notify_team_invite?: boolean
          store_allow_delivery?: boolean
          store_allow_pickup?: boolean
          store_default_delivery_fee?: number
          store_enable_delivery_address?: boolean
          store_enable_notes?: boolean
          store_enable_product_images?: boolean
          store_payment_instructions?: string | null
          store_payment_methods?: string[]
          store_show_stock?: boolean
          store_slug?: string | null
          subscription_end_date?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_start_date?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          suspended?: boolean | null
          title?: string | null
          trial_end_date?: string
          trial_start_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_sales_without_stock?: boolean
          avatar_url?: string | null
          bio?: string | null
          business_id?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          display_name?: string | null
          email?: string | null
          email_verified?: boolean
          id?: string
          last_activity_at?: string | null
          last_login_at?: string | null
          last_verified_phone?: string | null
          location?: string | null
          login_count?: number
          logo_url?: string | null
          marketing_emails_opted_out?: boolean
          monthly_statement_enabled?: boolean
          num_employees?: string | null
          onboarding_completed?: boolean
          online_ordering_enabled?: boolean
          opening_cash_balance?: number
          orders_auto_publish_products?: boolean
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          referral_claimed_at?: string | null
          referred_by_user_id?: string | null
          role?: string | null
          sms_notify_low_stock?: boolean
          sms_notify_new_order?: boolean
          sms_notify_order_status?: boolean
          sms_notify_sale_thanks?: boolean
          sms_notify_team_invite?: boolean
          store_allow_delivery?: boolean
          store_allow_pickup?: boolean
          store_default_delivery_fee?: number
          store_enable_delivery_address?: boolean
          store_enable_notes?: boolean
          store_enable_product_images?: boolean
          store_payment_instructions?: string | null
          store_payment_methods?: string[]
          store_show_stock?: boolean
          store_slug?: string | null
          subscription_end_date?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_start_date?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          suspended?: boolean | null
          title?: string | null
          trial_end_date?: string
          trial_start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_accounts: {
        Row: {
          business_id: string
          created_at: string
          current_cycle_ends_at: string | null
          current_cycle_rewarded_count: number
          current_cycle_started_at: string | null
          id: string
          last_reward_applied_at: string | null
          lifetime_rewarded_count: number
          owner_user_id: string
          referral_code: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_cycle_ends_at?: string | null
          current_cycle_rewarded_count?: number
          current_cycle_started_at?: string | null
          id?: string
          last_reward_applied_at?: string | null
          lifetime_rewarded_count?: number
          owner_user_id: string
          referral_code?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_cycle_ends_at?: string | null
          current_cycle_rewarded_count?: number
          current_cycle_started_at?: string | null
          id?: string
          last_reward_applied_at?: string | null
          lifetime_rewarded_count?: number
          owner_user_id?: string
          referral_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          cycle_ends_at: string | null
          cycle_started_at: string | null
          flagged_by: string | null
          id: string
          qualified_payment_id: string | null
          referral_account_id: string
          referral_code: string
          referred_business_id: string | null
          referred_device_id: string | null
          referred_email: string | null
          referred_phone: string | null
          referred_signup_ip: string | null
          referred_user_agent: string | null
          referred_user_id: string
          referrer_business_id: string
          referrer_user_id: string
          reward_applied_at: string | null
          reward_months: number
          status: string
          subscribed_plan: string | null
          updated_at: string
          validation_reason: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          cycle_ends_at?: string | null
          cycle_started_at?: string | null
          flagged_by?: string | null
          id?: string
          qualified_payment_id?: string | null
          referral_account_id: string
          referral_code: string
          referred_business_id?: string | null
          referred_device_id?: string | null
          referred_email?: string | null
          referred_phone?: string | null
          referred_signup_ip?: string | null
          referred_user_agent?: string | null
          referred_user_id: string
          referrer_business_id: string
          referrer_user_id: string
          reward_applied_at?: string | null
          reward_months?: number
          status?: string
          subscribed_plan?: string | null
          updated_at?: string
          validation_reason?: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          cycle_ends_at?: string | null
          cycle_started_at?: string | null
          flagged_by?: string | null
          id?: string
          qualified_payment_id?: string | null
          referral_account_id?: string
          referral_code?: string
          referred_business_id?: string | null
          referred_device_id?: string | null
          referred_email?: string | null
          referred_phone?: string | null
          referred_signup_ip?: string | null
          referred_user_agent?: string | null
          referred_user_id?: string
          referrer_business_id?: string
          referrer_user_id?: string
          reward_applied_at?: string | null
          reward_months?: number
          status?: string
          subscribed_plan?: string | null
          updated_at?: string
          validation_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_qualified_payment_id_fkey"
            columns: ["qualified_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referral_account_id_fkey"
            columns: ["referral_account_id"]
            isOneToOne: false
            referencedRelation: "referral_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_business_id_fkey"
            columns: ["referred_business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_business_id_fkey"
            columns: ["referrer_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      restocks: {
        Row: {
          bank_account_id: string | null
          business_id: string
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
          recorded_by: string
          recorded_by_name: string | null
          reference: string | null
          restock_date: string
          sku: string
          status: string
          supplier: string | null
          total_cost: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bank_account_id?: string | null
          business_id: string
          category?: string
          cost_price_per_unit?: number
          created_at?: string
          id?: string
          is_opening_stock?: boolean
          note?: string | null
          payment_method?: string
          product_id?: string | null
          product_name: string
          quantity_added?: number
          recorded_by: string
          recorded_by_name?: string | null
          reference?: string | null
          restock_date?: string
          sku?: string
          status?: string
          supplier?: string | null
          total_cost?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bank_account_id?: string | null
          business_id?: string
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
          recorded_by?: string
          recorded_by_name?: string | null
          reference?: string | null
          restock_date?: string
          sku?: string
          status?: string
          supplier?: string | null
          total_cost?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restocks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restocks_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_logs: {
        Row: {
          backup_business_name: string | null
          backup_created_at: string | null
          backup_version: number | null
          business_id: string | null
          created_at: string
          error_message: string | null
          id: string
          restore_mode: string
          restored_counts: Json
          skipped_counts: Json
          status: string
          user_id: string
        }
        Insert: {
          backup_business_name?: string | null
          backup_created_at?: string | null
          backup_version?: number | null
          business_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          restore_mode: string
          restored_counts?: Json
          skipped_counts?: Json
          status?: string
          user_id: string
        }
        Update: {
          backup_business_name?: string | null
          backup_created_at?: string | null
          backup_version?: number | null
          business_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          restore_mode?: string
          restored_counts?: Json
          skipped_counts?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restore_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_record_map: {
        Row: {
          created_at: string
          entity: string
          id: string
          new_id: string
          restore_id: string | null
          source_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity: string
          id?: string
          new_id: string
          restore_id?: string | null
          source_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity?: string
          id?: string
          new_id?: string
          restore_id?: string | null
          source_id?: string
          user_id?: string
        }
        Relationships: []
      }
      sale_documents: {
        Row: {
          amount_ghs: number
          amount_paid_ghs: number
          balance_ghs: number
          business_id: string
          created_at: string
          currency: string
          customer_name: string
          customer_phone: string | null
          document_number: string
          id: string
          issued_at: string
          issued_by: string
          kind: string
          payment_status: string
          sale_date: string
          sale_id: string
          seller_name: string | null
          snapshot: Json
          updated_at: string
        }
        Insert: {
          amount_ghs?: number
          amount_paid_ghs?: number
          balance_ghs?: number
          business_id: string
          created_at?: string
          currency?: string
          customer_name?: string
          customer_phone?: string | null
          document_number: string
          id?: string
          issued_at?: string
          issued_by: string
          kind: string
          payment_status: string
          sale_date: string
          sale_id: string
          seller_name?: string | null
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          amount_ghs?: number
          amount_paid_ghs?: number
          balance_ghs?: number
          business_id?: string
          created_at?: string
          currency?: string
          customer_name?: string
          customer_phone?: string | null
          document_number?: string
          id?: string
          issued_at?: string
          issued_by?: string
          kind?: string
          payment_status?: string
          sale_date?: string
          sale_id?: string
          seller_name?: string | null
          snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          business_id: string
          color: string | null
          cost_price: number
          created_at: string
          default_price: number
          id: string
          line_total: number
          price_note: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          size: string | null
          sku: string | null
          unit_price: number
        }
        Insert: {
          business_id: string
          color?: string | null
          cost_price?: number
          created_at?: string
          default_price?: number
          id?: string
          line_total?: number
          price_note?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          size?: string | null
          sku?: string | null
          unit_price?: number
        }
        Update: {
          business_id?: string
          color?: string | null
          cost_price?: number
          created_at?: string
          default_price?: number
          id?: string
          line_total?: number
          price_note?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          size?: string | null
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
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
          balance: number
          business_id: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          due_date: string | null
          id: string
          notes: string | null
          order_id: string | null
          payment_method: string
          payment_status: string
          sale_channel: string
          sale_date: string
          staff_id: string | null
          staff_name: string | null
          status: string
          stock_shortfall: number
          stock_status: string
          subtotal: number
          total: number
        }
        Insert: {
          amount_paid?: number
          balance?: number
          business_id: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_method?: string
          payment_status?: string
          sale_channel?: string
          sale_date?: string
          staff_id?: string | null
          staff_name?: string | null
          status?: string
          stock_shortfall?: number
          stock_status?: string
          subtotal?: number
          total?: number
        }
        Update: {
          amount_paid?: number
          balance?: number
          business_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_method?: string
          payment_status?: string
          sale_channel?: string
          sale_date?: string
          staff_id?: string | null
          staff_name?: string | null
          status?: string
          stock_shortfall?: number
          stock_status?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_id_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      savings: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          id: string
          note: string | null
          recorded_by: string
          reference: string | null
          savings_date: string
          source: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          note?: string | null
          recorded_by: string
          reference?: string | null
          savings_date?: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          note?: string | null
          recorded_by?: string
          reference?: string | null
          savings_date?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_otps: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          otp_code: string
          phone: string
          used: boolean
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          id?: string
          otp_code: string
          phone: string
          used?: boolean
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          otp_code?: string
          phone?: string
          used?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          business_id: string
          created_at: string
          error_message: string | null
          id: string
          message_preview: string | null
          notification_type: string
          provider_response: Json | null
          recipient_phone: string
          reference_id: string | null
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_preview?: string | null
          notification_type: string
          provider_response?: Json | null
          recipient_phone: string
          reference_id?: string | null
          status: string
        }
        Update: {
          business_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_preview?: string | null
          notification_type?: string
          provider_response?: Json | null
          recipient_phone?: string
          reference_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
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
          phone: string | null
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
          phone?: string | null
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
          phone?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_members: {
        Row: {
          active: boolean
          business_id: string | null
          business_owner_id: string
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          permissions: Json
          staff_user_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id?: string | null
          business_owner_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          permissions?: Json
          staff_user_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string | null
          business_owner_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          permissions?: Json
          staff_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_deliveries: {
        Row: {
          business_id: string
          business_name: string | null
          created_at: string
          email: string
          error_message: string | null
          generated_at: string | null
          id: string
          period: string
          provider_message_id: string | null
          retry_count: number
          sent_at: string | null
          status: string
          totals: Json
          updated_at: string
        }
        Insert: {
          business_id: string
          business_name?: string | null
          created_at?: string
          email: string
          error_message?: string | null
          generated_at?: string | null
          id?: string
          period: string
          provider_message_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          business_name?: string | null
          created_at?: string
          email?: string
          error_message?: string | null
          generated_at?: string | null
          id?: string
          period?: string
          provider_message_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_deliveries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_settings: {
        Row: {
          automation_enabled: boolean
          created_at: string
          from_email: string
          from_name: string
          id: string
          last_run_at: string | null
          last_run_period: string | null
          send_day: number
          singleton_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          automation_enabled?: boolean
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          last_run_at?: string | null
          last_run_period?: string | null
          send_day?: number
          singleton_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          automation_enabled?: boolean
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          last_run_at?: string | null
          last_run_period?: string | null
          send_day?: number
          singleton_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          created_by_name: string
          id: string
          movement_date: string
          movement_type: string
          note: string
          product_id: string | null
          quantity_after: number
          quantity_change: number
          source_id: string | null
          source_table: string | null
          unit_cost: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          movement_date?: string
          movement_type: string
          note?: string
          product_id?: string | null
          quantity_after?: number
          quantity_change: number
          source_id?: string | null
          source_table?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          movement_date?: string
          movement_type?: string
          note?: string
          product_id?: string | null
          quantity_after?: number
          quantity_change?: number
          source_id?: string | null
          source_table?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          amount_paid: number | null
          created_at: string
          expires_at: string | null
          id: string
          network: string | null
          note: string | null
          payment_method: string
          paystack_reference: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          provider_response: Json | null
          reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          amount_paid?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          network?: string | null
          note?: string | null
          payment_method: string
          paystack_reference?: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          provider_response?: Json | null
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          amount_paid?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          network?: string | null
          note?: string | null
          payment_method?: string
          paystack_reference?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          provider_response?: Json | null
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          business_id: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          discount_percent: number
          id: string
          next_renewal_date: string | null
          notes: string | null
          plan: string
          price_ghs: number
          status: string
          trial_end_date: string | null
          trial_start_date: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_percent?: number
          id?: string
          next_renewal_date?: string | null
          notes?: string | null
          plan?: string
          price_ghs?: number
          status?: string
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_percent?: number
          id?: string
          next_renewal_date?: string | null
          notes?: string | null
          plan?: string
          price_ghs?: number
          status?: string
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          sender_contact: string
          sender_name: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          read_at?: string | null
          sender_contact: string
          sender_name: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          sender_contact?: string
          sender_name?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          created_at: string
          id: string
          label: string
          options: Json
          position: number
          required: boolean
          survey_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          options?: Json
          position?: number
          required?: boolean
          survey_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          options?: Json
          position?: number
          required?: boolean
          survey_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_response_answers: {
        Row: {
          answer: Json
          created_at: string
          id: string
          question_id: string
          response_id: string
        }
        Insert: {
          answer?: Json
          created_at?: string
          id?: string
          question_id: string
          response_id: string
        }
        Update: {
          answer?: Json
          created_at?: string
          id?: string
          question_id?: string
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_response_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_response_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "survey_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          business_id: string | null
          email: string | null
          id: string
          name: string | null
          phone: string | null
          rating: number | null
          submitted_at: string
          survey_id: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          rating?: number | null
          submitted_at?: string
          survey_id: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          rating?: number | null
          submitted_at?: string
          survey_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_user_status: {
        Row: {
          id: string
          shown_at: string | null
          skipped_at: string | null
          status: string
          submitted_at: string | null
          survey_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          shown_at?: string | null
          skipped_at?: string | null
          status: string
          submitted_at?: string | null
          survey_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          shown_at?: string | null
          skipped_at?: string | null
          status?: string
          submitted_at?: string | null
          survey_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_user_status_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          enabled_at: string | null
          id: string
          thank_you_message: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          enabled_at?: string | null
          id?: string
          thank_you_message?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          enabled_at?: string | null
          id?: string
          thank_you_message?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_staff_invite: {
        Args: { _full_name?: string; _position?: string; _token: string }
        Returns: Json
      }
      admin_user_activity: {
        Args: never
        Returns: {
          business_name: string
          created_at: string
          display_name: string
          email: string
          id: string
          last_activity_at: string
          last_login_at: string
          login_count: number
          phone: string
          role: string
          subscription_plan: string
          subscription_status: string
          suspended: boolean
        }[]
      }
      business_has_access: { Args: { _business_id: string }; Returns: boolean }
      consume_edge_rate_limit: {
        Args: {
          p_action: string
          p_key_hash: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      create_business_for_owner: {
        Args: {
          _email: string
          _employees: number
          _location: string
          _logo_dark_url: string
          _logo_light_url: string
          _name: string
          _phone: string
        }
        Returns: string
      }
      ensure_business_workspace_membership: {
        Args: { _business_id: string; _display_name?: string; _phone?: string }
        Returns: string
      }
      ensure_unique_store_slug: {
        Args: { _base: string; _owner: string }
        Returns: string
      }
      gen_tracking_code: { Args: never; Returns: string }
      generate_referral_code: { Args: never; Returns: string }
      generate_sale_document_number: {
        Args: { _kind: string }
        Returns: string
      }
      get_table_columns: {
        Args: { _table_name: string }
        Returns: {
          column_name: string
          data_type: string
        }[]
      }
      get_user_business_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_business:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _business_id?: string
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      is_business_member:
        | { Args: { _owner_id: string }; Returns: boolean }
        | { Args: { _business_id: string; _user_id: string }; Returns: boolean }
      is_business_member_module: {
        Args: { _module: string; _owner_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      kuditrack_restore_bool: {
        Args: { _fallback?: boolean; _value: string }
        Returns: boolean
      }
      kuditrack_restore_date: { Args: { _value: string }; Returns: string }
      kuditrack_restore_int: {
        Args: { _fallback?: number; _value: string }
        Returns: number
      }
      kuditrack_restore_numeric: {
        Args: { _fallback?: number; _value: string }
        Returns: number
      }
      kuditrack_restore_text_array: {
        Args: { _value: Json }
        Returns: string[]
      }
      kuditrack_restore_timestamptz: {
        Args: { _fallback?: string; _value: string }
        Returns: string
      }
      kuditrack_restore_uuid: { Args: { _value: string }; Returns: string }
      preview_staff_invite: { Args: { _token: string }; Returns: Json }
      public_confirm_order_receipt_by_code: {
        Args: { _code: string }
        Returns: Json
      }
      public_get_order_by_tracking: { Args: { _code: string }; Returns: Json }
      public_get_store: { Args: { _slug: string }; Returns: Json }
      recompute_product_stock: {
        Args: never
        Returns: {
          new_stock: number
          product_id: string
        }[]
      }
      record_damaged_goods_v2: {
        Args: {
          _business_id: string
          _damage_date: string
          _notes: string
          _product_id: string
          _quantity: number
          _reason: string
          _recorded_by_name: string
        }
        Returns: {
          damaged_good_id: string
          quantity_after: number
          total_value: number
        }[]
      }
      record_user_login: { Args: never; Returns: undefined }
      restore_business_backup: {
        Args: { _mode?: string; _payload: Json }
        Returns: Json
      }
      slugify: { Args: { _input: string }; Returns: string }
      staff_member_has_any_module: {
        Args: { _modules: string[]; _owner_id: string }
        Returns: boolean
      }
      staff_member_has_module: {
        Args: { _module: string; _owner_id: string }
        Returns: boolean
      }
      sync_product_stock: {
        Args: { _business_id: string; _product_id: string }
        Returns: number
      }
      touch_user_activity: { Args: never; Returns: undefined }
      user_can_access_business: {
        Args: { _business_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "staff"
        | "manager"
        | "salesperson"
        | "distributor"
        | "super_admin"
        | "cashier"
      subscription_plan:
        | "trial"
        | "monthly"
        | "annual"
        | "lifetime"
        | "starter"
        | "business"
        | "business_plus"
      subscription_status:
        | "trial"
        | "active"
        | "expired"
        | "suspended"
        | "lifetime"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "admin",
        "staff",
        "manager",
        "salesperson",
        "distributor",
        "super_admin",
        "cashier",
      ],
      subscription_plan: [
        "trial",
        "monthly",
        "annual",
        "lifetime",
        "starter",
        "business",
        "business_plus",
      ],
      subscription_status: [
        "trial",
        "active",
        "expired",
        "suspended",
        "lifetime",
      ],
    },
  },
} as const
