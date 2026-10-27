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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean | null
          label: string | null
          phone: string
          pincode: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          phone: string
          pincode: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          phone?: string
          pincode?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_order_value: number | null
          updated_at: string
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_value?: number | null
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_value?: number | null
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: []
      }
      document_uploads: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_url: string
          id: string
          order_id: string
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_url: string
          id?: string
          order_id: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_url?: string
          id?: string
          order_id?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_uploads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      footer_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      legal_documents: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          slug: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      locations: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          is_popular: boolean | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      mobile_slider_images: {
        Row: {
          created_at: string
          cta_link: string | null
          cta_text: string | null
          display_order: number
          id: string
          image_url: string
          is_active: boolean
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number
          id?: string
          image_url: string
          is_active?: boolean
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number
          id?: string
          image_url?: string
          is_active?: boolean
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      monthly_payments: {
        Row: {
          auto_debit_date: string | null
          billing_month: string
          created_at: string
          gst: number
          id: string
          monthly_rent: number
          order_id: string
          paid_at: string | null
          protection_plan_fee: number | null
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          auto_debit_date?: string | null
          billing_month: string
          created_at?: string
          gst: number
          id?: string
          monthly_rent: number
          order_id: string
          paid_at?: string | null
          protection_plan_fee?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_debit_date?: string | null
          billing_month?: string
          created_at?: string
          gst?: number
          id?: string
          monthly_rent?: number
          order_id?: string
          paid_at?: string | null
          protection_plan_fee?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          total_amount?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          cancellation_status: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          delivery_fee: number
          id: string
          installation_fee: number
          monthly_gst: number
          monthly_rent: number
          monthly_total: number
          order_number: string
          payable_now_total: number
          platform_commission: number
          product_id: string
          protection_plan_fee: number | null
          quantity: number
          rental_duration_months: number
          rental_end_date: string | null
          rental_plan_id: string
          rental_start_date: string | null
          security_deposit: number
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms_accepted_at: string | null
          terms_version: number | null
          updated_at: string
          vendor_id: string
          vendor_payout: number
        }
        Insert: {
          address_id?: string | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancellation_status?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          delivery_fee: number
          id?: string
          installation_fee: number
          monthly_gst: number
          monthly_rent: number
          monthly_total: number
          order_number: string
          payable_now_total: number
          platform_commission: number
          product_id: string
          protection_plan_fee?: number | null
          quantity?: number
          rental_duration_months: number
          rental_end_date?: string | null
          rental_plan_id: string
          rental_start_date?: string | null
          security_deposit: number
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          terms_accepted_at?: string | null
          terms_version?: number | null
          updated_at?: string
          vendor_id: string
          vendor_payout: number
        }
        Update: {
          address_id?: string | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancellation_status?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          delivery_fee?: number
          id?: string
          installation_fee?: number
          monthly_gst?: number
          monthly_rent?: number
          monthly_total?: number
          order_number?: string
          payable_now_total?: number
          platform_commission?: number
          product_id?: string
          protection_plan_fee?: number | null
          quantity?: number
          rental_duration_months?: number
          rental_end_date?: string | null
          rental_plan_id?: string
          rental_start_date?: string | null
          security_deposit?: number
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          terms_accepted_at?: string | null
          terms_version?: number | null
          updated_at?: string
          vendor_id?: string
          vendor_payout?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rental_plan_id_fkey"
            columns: ["rental_plan_id"]
            isOneToOne: false
            referencedRelation: "rental_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json | null
          order_id: string
          payment_date: string | null
          payment_gateway: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["payment_status"]
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json | null
          order_id: string
          payment_date?: string | null
          payment_gateway?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          order_id?: string
          payment_date?: string | null
          payment_gateway?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      product_locations: {
        Row: {
          created_at: string
          id: string
          location_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          created_at: string
          id: string
          product_id: string
          rating: number
          review_text: string | null
          review_type: string
          reviewer_name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          rating?: number
          review_text?: string | null
          review_type?: string
          reviewer_name?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          review_text?: string | null
          review_type?: string
          reviewer_name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variations: {
        Row: {
          created_at: string
          display_order: number
          id: string
          installation_cost: number | null
          is_active: boolean
          landing_cost: number | null
          maintenance_reserve: number | null
          price_adjustment: number | null
          product_id: string
          transport_cost: number | null
          updated_at: string
          variation_type: string
          variation_value: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          installation_cost?: number | null
          is_active?: boolean
          landing_cost?: number | null
          maintenance_reserve?: number | null
          price_adjustment?: number | null
          product_id: string
          transport_cost?: number | null
          updated_at?: string
          variation_type: string
          variation_value: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          installation_cost?: number | null
          is_active?: boolean
          landing_cost?: number | null
          maintenance_reserve?: number | null
          price_adjustment?: number | null
          product_id?: string
          transport_cost?: number | null
          updated_at?: string
          variation_type?: string
          variation_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          advance_discount_percent: number | null
          approved_at: string | null
          approved_by: string | null
          brand: string | null
          buy_price: number | null
          category_id: string | null
          created_at: string
          delivery_tat: number | null
          description: string | null
          features: string[] | null
          id: string
          images: string[] | null
          in_stock: boolean
          installation_charge_visible: boolean | null
          installation_tat: number | null
          is_popular: boolean | null
          landing_cost: number | null
          location_id: string | null
          maintenance_reserve: number | null
          name: string
          protection_plan_price: number | null
          protection_value: number | null
          rating: number | null
          rejection_reason: string | null
          review_count: number | null
          slug: string
          specifications: Json | null
          status: Database["public"]["Enums"]["product_status"]
          stock_quantity: number | null
          tags: string[] | null
          transport_cost: number | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          advance_discount_percent?: number | null
          approved_at?: string | null
          approved_by?: string | null
          brand?: string | null
          buy_price?: number | null
          category_id?: string | null
          created_at?: string
          delivery_tat?: number | null
          description?: string | null
          features?: string[] | null
          id?: string
          images?: string[] | null
          in_stock?: boolean
          installation_charge_visible?: boolean | null
          installation_tat?: number | null
          is_popular?: boolean | null
          landing_cost?: number | null
          location_id?: string | null
          maintenance_reserve?: number | null
          name: string
          protection_plan_price?: number | null
          protection_value?: number | null
          rating?: number | null
          rejection_reason?: string | null
          review_count?: number | null
          slug: string
          specifications?: Json | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_quantity?: number | null
          tags?: string[] | null
          transport_cost?: number | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          advance_discount_percent?: number | null
          approved_at?: string | null
          approved_by?: string | null
          brand?: string | null
          buy_price?: number | null
          category_id?: string | null
          created_at?: string
          delivery_tat?: number | null
          description?: string | null
          features?: string[] | null
          id?: string
          images?: string[] | null
          in_stock?: boolean
          installation_charge_visible?: boolean | null
          installation_tat?: number | null
          is_popular?: boolean | null
          landing_cost?: number | null
          location_id?: string | null
          maintenance_reserve?: number | null
          name?: string
          protection_plan_price?: number | null
          protection_value?: number | null
          rating?: number | null
          rejection_reason?: string | null
          review_count?: number | null
          slug?: string
          specifications?: Json | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_quantity?: number | null
          tags?: string[] | null
          transport_cost?: number | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rental_plans: {
        Row: {
          created_at: string
          delivery_fee: number | null
          duration_months: number
          first_month_discount: number
          id: string
          installation_fee: number | null
          is_active: boolean
          label: string
          monthly_rent: number
          product_id: string
          security_deposit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_fee?: number | null
          duration_months: number
          first_month_discount?: number
          id?: string
          installation_fee?: number | null
          is_active?: boolean
          label: string
          monthly_rent: number
          product_id: string
          security_deposit: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_fee?: number | null
          duration_months?: number
          first_month_discount?: number
          id?: string
          installation_fee?: number | null
          is_active?: boolean
          label?: string
          monthly_rent?: number
          product_id?: string
          security_deposit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_plans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      slider_images: {
        Row: {
          created_at: string
          cta_link: string | null
          cta_text: string | null
          display_order: number
          id: string
          image_url: string
          is_active: boolean
          mobile_image_url: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number
          id?: string
          image_url: string
          is_active?: boolean
          mobile_image_url?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number
          id?: string
          image_url?: string
          is_active?: boolean
          mobile_image_url?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
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
      vendor_payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string | null
          payout_type: string
          processed_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          transaction_reference: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id?: string | null
          payout_type: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_reference?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          payout_type?: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_reference?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payouts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payouts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          business_address: string | null
          business_email: string
          business_name: string
          business_phone: string | null
          commission_rate: number
          created_at: string
          gst_number: string | null
          id: string
          pan_number: string | null
          status: Database["public"]["Enums"]["vendor_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          business_address?: string | null
          business_email: string
          business_name: string
          business_phone?: string | null
          commission_rate?: number
          created_at?: string
          gst_number?: string | null
          id?: string
          pan_number?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          business_address?: string | null
          business_email?: string
          business_name?: string
          business_phone?: string | null
          commission_rate?: number
          created_at?: string
          gst_number?: string | null
          id?: string
          pan_number?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_vendor_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vendor" | "customer"
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "returned"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      product_status: "pending" | "approved" | "rejected" | "inactive"
      vendor_status: "pending" | "approved" | "rejected" | "suspended"
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
      app_role: ["admin", "vendor", "customer"],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
      ],
      payment_status: ["pending", "completed", "failed", "refunded"],
      product_status: ["pending", "approved", "rejected", "inactive"],
      vendor_status: ["pending", "approved", "rejected", "suspended"],
    },
  },
} as const
