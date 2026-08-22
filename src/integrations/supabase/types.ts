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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ad_categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      addresses: {
        Row: {
          address_text: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          lat: number | null
          lng: number | null
          user_id: string
        }
        Insert: {
          address_text: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          user_id: string
        }
        Update: {
          address_text?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ads: {
        Row: {
          address_text: string
          body: string
          category_id: string
          city_id: string | null
          contact_phone: string
          created_at: string
          currency: string
          expires_at: string | null
          governorate: string | null
          id: string
          images: string[]
          owner_id: string
          price: number | null
          published_at: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          status: Database["public"]["Enums"]["ad_status"]
          title: string
          updated_at: string
        }
        Insert: {
          address_text: string
          body: string
          category_id: string
          city_id?: string | null
          contact_phone: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          governorate?: string | null
          id?: string
          images?: string[]
          owner_id: string
          price?: number | null
          published_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["ad_status"]
          title: string
          updated_at?: string
        }
        Update: {
          address_text?: string
          body?: string
          category_id?: string
          city_id?: string | null
          contact_phone?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          governorate?: string | null
          id?: string
          images?: string[]
          owner_id?: string
          price?: number | null
          published_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["ad_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ad_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      areas: {
        Row: {
          city_id: string
          created_at: string
          id: string
          is_active: boolean
          is_served: boolean
          name: string
          sort_order: number
        }
        Insert: {
          city_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_served?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          city_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_served?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "areas_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      cities: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      commission_rules: {
        Row: {
          created_at: string
          fixed_amount: number
          id: string
          is_active: boolean
          name: string
          order_type: Database["public"]["Enums"]["order_type"] | null
          percent: number
          subscription_amount: number
          target_id: string | null
          target_type: string
        }
        Insert: {
          created_at?: string
          fixed_amount?: number
          id?: string
          is_active?: boolean
          name: string
          order_type?: Database["public"]["Enums"]["order_type"] | null
          percent?: number
          subscription_amount?: number
          target_id?: string | null
          target_type?: string
        }
        Update: {
          created_at?: string
          fixed_amount?: number
          id?: string
          is_active?: boolean
          name?: string
          order_type?: Database["public"]["Enums"]["order_type"] | null
          percent?: number
          subscription_amount?: number
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      delivery_offers: {
        Row: {
          distance_km: number | null
          driver_id: string
          expires_at: string
          id: string
          order_id: string
          rejection_reason: string | null
          responded_at: string | null
          sent_at: string
          status: Database["public"]["Enums"]["offer_status"]
        }
        Insert: {
          distance_km?: number | null
          driver_id: string
          expires_at: string
          id?: string
          order_id: string
          rejection_reason?: string | null
          responded_at?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Update: {
          distance_km?: number | null
          driver_id?: string
          expires_at?: string
          id?: string
          order_id?: string
          rejection_reason?: string | null
          responded_at?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_secrets: {
        Row: {
          name: string
          updated_at: string
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          value: string
        }
        Update: {
          name?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      maintenance_locks: {
        Row: {
          last_started_at: string
          name: string
        }
        Insert: {
          last_started_at?: string
          name: string
        }
        Update: {
          last_started_at?: string
          name?: string
        }
        Relationships: []
      }
      maintenance_runs: {
        Row: {
          completed: number
          created_at: string
          expired: number
          id: string
          note: string | null
          redispatched: number
          source: string
        }
        Insert: {
          completed?: number
          created_at?: string
          expired?: number
          id?: string
          note?: string | null
          redispatched?: number
          source: string
        }
        Update: {
          completed?: number
          created_at?: string
          expired?: number
          id?: string
          note?: string | null
          redispatched?: number
          source?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          provider_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          provider_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          provider_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          is_read: boolean
          kind: string
          order_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          kind?: string
          order_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          kind?: string
          order_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          name: string
          notes: string | null
          order_id: string
          product_id: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
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
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stops: {
        Row: {
          address_text: string
          created_at: string
          delivered_at: string | null
          id: string
          is_delivered: boolean
          lat: number | null
          lng: number | null
          notes: string | null
          order_id: string
          position: number
          recipient_name: string | null
          recipient_phone: string | null
        }
        Insert: {
          address_text: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_delivered?: boolean
          lat?: number | null
          lng?: number | null
          notes?: string | null
          order_id: string
          position: number
          recipient_name?: string | null
          recipient_phone?: string | null
        }
        Update: {
          address_text?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_delivered?: boolean
          lat?: number | null
          lng?: number | null
          notes?: string | null
          order_id?: string
          position?: number
          recipient_name?: string | null
          recipient_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_stops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        Insert: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          admin_review_reason?: string | null
          cancel_reason?: string | null
          cargo_description?: string | null
          cargo_weight_kg?: number | null
          city_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          delivery_fee?: number
          dispatch_alerted_at?: string | null
          dispatch_attempts?: number
          dispatch_last_attempt_at?: string | null
          driver_id?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          dropoff_text?: string | null
          id?: string
          notes?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_text?: string | null
          provider_id?: string | null
          requires_admin_approval?: boolean
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
        }
        Update: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          admin_review_reason?: string | null
          cancel_reason?: string | null
          cargo_description?: string | null
          cargo_weight_kg?: number | null
          city_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          delivery_fee?: number
          dispatch_alerted_at?: string | null
          dispatch_attempts?: number
          dispatch_last_attempt_at?: string | null
          driver_id?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          dropoff_text?: string | null
          id?: string
          notes?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_text?: string | null
          provider_id?: string | null
          requires_admin_approval?: boolean
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          payment_id: string | null
          provider: string
          provider_event_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          payment_id?: string | null
          provider: string
          provider_event_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          payment_id?: string | null
          provider?: string
          provider_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_secret: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: string
          paid_at: string | null
          provider: string
          provider_intent_id: string | null
          refund_error: string | null
          refund_reference: string | null
          refund_requested_amount: number
          refund_requested_at: string | null
          refund_status: string
          refunded_amount: number
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["payment_subject"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          client_secret?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          method?: string
          paid_at?: string | null
          provider?: string
          provider_intent_id?: string | null
          refund_error?: string | null
          refund_reference?: string | null
          refund_requested_amount?: number
          refund_requested_at?: string | null
          refund_status?: string
          refunded_amount?: number
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["payment_subject"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_secret?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          method?: string
          paid_at?: string | null
          provider?: string
          provider_intent_id?: string | null
          refund_error?: string | null
          refund_reference?: string | null
          refund_requested_amount?: number
          refund_requested_at?: string | null
          refund_status?: string
          refunded_amount?: number
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["payment_subject"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      phone_verifications: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          delivered: boolean
          expires_at: string
          id: string
          max_attempts: number
          phone: string
          salt: string
          send_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel?: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          delivered?: boolean
          expires_at: string
          id?: string
          max_attempts?: number
          phone: string
          salt: string
          send_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          delivered?: boolean
          expires_at?: string
          id?: string
          max_attempts?: number
          phone?: string
          salt?: string
          send_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          base_fee: number
          city_id: string | null
          created_at: string
          id: string
          is_active: boolean
          min_fee: number
          name: string
          order_type: Database["public"]["Enums"]["order_type"]
          per_km_fee: number
          provider_id: string | null
          taxi_class: Database["public"]["Enums"]["taxi_class"] | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        Insert: {
          base_fee?: number
          city_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          min_fee?: number
          name: string
          order_type?: Database["public"]["Enums"]["order_type"]
          per_km_fee?: number
          provider_id?: string | null
          taxi_class?: Database["public"]["Enums"]["taxi_class"] | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
        }
        Update: {
          base_fee?: number
          city_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          min_fee?: number
          name?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          per_km_fee?: number
          provider_id?: string | null
          taxi_class?: Database["public"]["Enums"]["taxi_class"] | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          keywords: string[]
          name: string
          price: number
          provider_id: string
          sort_order: number
          stock: number | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          keywords?: string[]
          name: string
          price?: number
          provider_id: string
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          keywords?: string[]
          name?: string
          price?: number
          provider_id?: string
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      profession_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          section_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          section_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          section_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "profession_categories_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "service_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city_id: string | null
          created_at: string
          full_name: string
          id: string
          is_blocked: boolean
          phone: string | null
          phone_verified_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city_id?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_blocked?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_services: {
        Row: {
          category_id: string | null
          cost_amount: number | null
          created_at: string
          description: string | null
          estimated_minutes: number | null
          id: string
          is_active: boolean
          name: string
          price_amount: number
          price_unit: Database["public"]["Enums"]["service_price_unit"]
          provider_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          cost_amount?: number | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          name: string
          price_amount?: number
          price_unit?: Database["public"]["Enums"]["service_price_unit"]
          provider_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          cost_amount?: number | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          name?: string
          price_amount?: number
          price_unit?: Database["public"]["Enums"]["service_price_unit"]
          provider_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "profession_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          address_text: string | null
          approval_code: string | null
          area_id: string | null
          avg_prep_minutes: number
          city_id: string | null
          commission_percent: number
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_open: boolean
          keywords: string[]
          kind: Database["public"]["Enums"]["provider_kind"]
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          orders_count: number
          owner_id: string | null
          phone: string | null
          profession_category_id: string | null
          rating: number
          ratings_count: number
          status: Database["public"]["Enums"]["provider_status"]
          updated_at: string
        }
        Insert: {
          address_text?: string | null
          approval_code?: string | null
          area_id?: string | null
          avg_prep_minutes?: number
          city_id?: string | null
          commission_percent?: number
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_open?: boolean
          keywords?: string[]
          kind?: Database["public"]["Enums"]["provider_kind"]
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name: string
          orders_count?: number
          owner_id?: string | null
          phone?: string | null
          profession_category_id?: string | null
          rating?: number
          ratings_count?: number
          status?: Database["public"]["Enums"]["provider_status"]
          updated_at?: string
        }
        Update: {
          address_text?: string | null
          approval_code?: string | null
          area_id?: string | null
          avg_prep_minutes?: number
          city_id?: string | null
          commission_percent?: number
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_open?: boolean
          keywords?: string[]
          kind?: Database["public"]["Enums"]["provider_kind"]
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          orders_count?: number
          owner_id?: string | null
          phone?: string | null
          profession_category_id?: string | null
          rating?: number
          ratings_count?: number
          status?: Database["public"]["Enums"]["provider_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "providers_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_profession_category_id_fkey"
            columns: ["profession_category_id"]
            isOneToOne: false
            referencedRelation: "profession_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rater_id: string
          stars: number
          target_id: string
          target_type: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rater_id: string
          stars: number
          target_id: string
          target_type: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rater_id?: string
          stars?: number
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          provider_id: string
          rater_id: string
          request_id: string
          stars: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          provider_id: string
          rater_id: string
          request_id: string
          stars: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          provider_id?: string
          rater_id?: string
          request_id?: string
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_ratings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_ratings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          request_id: string
          status: Database["public"]["Enums"]["service_request_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          request_id: string
          status: Database["public"]["Enums"]["service_request_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          request_id?: string
          status?: Database["public"]["Enums"]["service_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "service_request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          address_text: string
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          description: string | null
          id: string
          lat: number | null
          lng: number | null
          price_amount: number
          price_unit: Database["public"]["Enums"]["service_price_unit"]
          provider_id: string
          scheduled_at: string | null
          service_id: string | null
          service_name: string
          status: Database["public"]["Enums"]["service_request_status"]
          updated_at: string
        }
        Insert: {
          address_text: string
          cancel_reason?: string | null
          city_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          price_amount?: number
          price_unit?: Database["public"]["Enums"]["service_price_unit"]
          provider_id: string
          scheduled_at?: string | null
          service_id?: string | null
          service_name: string
          status?: Database["public"]["Enums"]["service_request_status"]
          updated_at?: string
        }
        Update: {
          address_text?: string
          cancel_reason?: string | null
          city_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          price_amount?: number
          price_unit?: Database["public"]["Enums"]["service_price_unit"]
          provider_id?: string
          scheduled_at?: string | null
          service_id?: string | null
          service_name?: string
          status?: Database["public"]["Enums"]["service_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "provider_services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_sections: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          placement: string[]
          route_path: string | null
          section_id: string | null
          service_type: Database["public"]["Enums"]["order_type"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          placement?: string[]
          route_path?: string | null
          section_id?: string | null
          service_type?: Database["public"]["Enums"]["order_type"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          placement?: string[]
          route_path?: string | null
          section_id?: string | null
          service_type?: Database["public"]["Enums"]["order_type"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "service_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_offers: {
        Row: {
          distance_km: number | null
          driver_id: string
          expires_at: string
          id: string
          rejection_reason: string | null
          responded_at: string | null
          sent_at: string
          status: Database["public"]["Enums"]["offer_status"]
          trip_id: string
        }
        Insert: {
          distance_km?: number | null
          driver_id: string
          expires_at: string
          id?: string
          rejection_reason?: string | null
          responded_at?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["offer_status"]
          trip_id: string
        }
        Update: {
          distance_km?: number | null
          driver_id?: string
          expires_at?: string
          id?: string
          rejection_reason?: string | null
          responded_at?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["offer_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_offers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_ratings: {
        Row: {
          comment: string | null
          created_at: string
          driver_id: string
          id: string
          rater_id: string
          stars: number
          trip_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          driver_id: string
          id?: string
          rater_id: string
          stars: number
          trip_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          rater_id?: string
          stars?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["trip_status"]
          trip_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          status: Database["public"]["Enums"]["trip_status"]
          trip_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["trip_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_status_history_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          destination_lat: number | null
          destination_lng: number | null
          destination_text: string
          distance_km: number
          driver_id: string | null
          fare: number
          id: string
          notes: string | null
          passengers: number
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
          taxi_class: Database["public"]["Enums"]["taxi_class"]
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          city_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_text: string
          distance_km?: number
          driver_id?: string | null
          fare?: number
          id?: string
          notes?: string | null
          passengers?: number
          payment_method?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_text: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          taxi_class?: Database["public"]["Enums"]["taxi_class"]
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          city_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_text?: string
          distance_km?: number
          driver_id?: string | null
          fare?: number
          id?: string
          notes?: string | null
          passengers?: number
          payment_method?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_text?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          taxi_class?: Database["public"]["Enums"]["taxi_class"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
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
      worker_locations: {
        Row: {
          is_online: boolean
          lat: number
          lng: number
          updated_at: string
          user_id: string
        }
        Insert: {
          is_online?: boolean
          lat: number
          lng: number
          updated_at?: string
          user_id: string
        }
        Update: {
          is_online?: boolean
          lat?: number
          lng?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worker_profiles: {
        Row: {
          city_id: string | null
          created_at: string
          is_approved: boolean
          is_available: boolean
          max_active_orders: number
          plate_number: string | null
          rating: number
          ratings_count: number
          requested_kind: Database["public"]["Enums"]["worker_kind"] | null
          taxi_class: Database["public"]["Enums"]["taxi_class"] | null
          taxi_seats: number
          updated_at: string
          user_id: string
          vehicle: string | null
          vehicle_color: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
          worker_kind: Database["public"]["Enums"]["worker_kind"] | null
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          is_approved?: boolean
          is_available?: boolean
          max_active_orders?: number
          plate_number?: string | null
          rating?: number
          ratings_count?: number
          requested_kind?: Database["public"]["Enums"]["worker_kind"] | null
          taxi_class?: Database["public"]["Enums"]["taxi_class"] | null
          taxi_seats?: number
          updated_at?: string
          user_id: string
          vehicle?: string | null
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
          worker_kind?: Database["public"]["Enums"]["worker_kind"] | null
        }
        Update: {
          city_id?: string | null
          created_at?: string
          is_approved?: boolean
          is_available?: boolean
          max_active_orders?: number
          plate_number?: string | null
          rating?: number
          ratings_count?: number
          requested_kind?: Database["public"]["Enums"]["worker_kind"] | null
          taxi_class?: Database["public"]["Enums"]["taxi_class"] | null
          taxi_seats?: number
          updated_at?: string
          user_id?: string
          vehicle?: string | null
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
          worker_kind?: Database["public"]["Enums"]["worker_kind"] | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_delivery_offer: {
        Args: { _offer_id: string }
        Returns: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_trip_offer: {
        Args: { _offer_id: string }
        Returns: {
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          destination_lat: number | null
          destination_lng: number | null
          destination_text: string
          distance_km: number
          driver_id: string | null
          fare: number
          id: string
          notes: string | null
          passengers: number
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
          taxi_class: Database["public"]["Enums"]["taxi_class"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_delete_profession_category: {
        Args: { _hard?: boolean; _id: string; _reassign_to?: string }
        Returns: undefined
      }
      admin_delete_service: {
        Args: { _hard?: boolean; _id: string }
        Returns: undefined
      }
      admin_delete_service_section: {
        Args: { _hard?: boolean; _id: string; _reassign_to?: string }
        Returns: undefined
      }
      admin_list_users: {
        Args: { _limit?: number; _search?: string }
        Returns: {
          created_at: string
          full_name: string
          is_blocked: boolean
          phone: string
          roles: string[]
          user_id: string
        }[]
      }
      admin_orders_report: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      admin_set_user_blocked: {
        Args: { _blocked: boolean; _user_id: string }
        Returns: boolean
      }
      admin_set_user_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      apply_as_driver: {
        Args: {
          _city_id?: string
          _phone?: string
          _plate_number?: string
          _taxi_class?: Database["public"]["Enums"]["taxi_class"]
          _taxi_seats?: number
          _vehicle_color?: string
          _vehicle_make?: string
          _vehicle_model?: string
          _vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          _worker_kind: Database["public"]["Enums"]["worker_kind"]
        }
        Returns: {
          city_id: string | null
          created_at: string
          is_approved: boolean
          is_available: boolean
          max_active_orders: number
          plate_number: string | null
          rating: number
          ratings_count: number
          requested_kind: Database["public"]["Enums"]["worker_kind"] | null
          taxi_class: Database["public"]["Enums"]["taxi_class"] | null
          taxi_seats: number
          updated_at: string
          user_id: string
          vehicle: string | null
          vehicle_color: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
          worker_kind: Database["public"]["Enums"]["worker_kind"] | null
        }
        SetofOptions: {
          from: "*"
          to: "worker_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_as_provider: {
        Args: {
          _address_text?: string
          _area_id?: string
          _city_id?: string
          _description?: string
          _kind: Database["public"]["Enums"]["provider_kind"]
          _lat?: number
          _lng?: number
          _name: string
          _phone?: string
          _profession_category_id?: string
        }
        Returns: {
          address_text: string | null
          approval_code: string | null
          area_id: string | null
          avg_prep_minutes: number
          city_id: string | null
          commission_percent: number
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_open: boolean
          keywords: string[]
          kind: Database["public"]["Enums"]["provider_kind"]
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          orders_count: number
          owner_id: string | null
          phone: string | null
          profession_category_id: string | null
          rating: number
          ratings_count: number
          status: Database["public"]["Enums"]["provider_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "providers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attach_payment_intent: {
        Args: {
          _client_secret: string
          _intent_id: string
          _payment_id: string
        }
        Returns: {
          amount: number
          client_secret: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: string
          paid_at: string | null
          provider: string
          provider_intent_id: string | null
          refund_error: string | null
          refund_reference: string | null
          refund_requested_amount: number
          refund_requested_at: string | null
          refund_status: string
          refunded_amount: number
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["payment_subject"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auto_complete_delivered_orders: { Args: never; Returns: number }
      call_maintenance_endpoint: { Args: never; Returns: undefined }
      can_see_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      can_see_service_request: {
        Args: { _request_id: string; _user_id: string }
        Returns: boolean
      }
      can_see_trip: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
      change_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _order_id: string
          _reason?: string
        }
        Returns: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_service_request_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["service_request_status"]
          _reason?: string
          _request_id: string
          _scheduled_at?: string
        }
        Returns: {
          address_text: string
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          description: string | null
          id: string
          lat: number | null
          lng: number | null
          price_amount: number
          price_unit: Database["public"]["Enums"]["service_price_unit"]
          provider_id: string
          scheduled_at: string | null
          service_id: string | null
          service_name: string
          status: Database["public"]["Enums"]["service_request_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_trip_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["trip_status"]
          _reason?: string
          _trip_id: string
        }
        Returns: {
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          destination_lat: number | null
          destination_lng: number | null
          destination_text: string
          distance_km: number
          driver_id: string | null
          fare: number
          id: string
          notes: string | null
          passengers: number
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
          taxi_class: Database["public"]["Enums"]["taxi_class"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_maintenance_slot: {
        Args: { _min_seconds?: number; _name?: string }
        Returns: boolean
      }
      complete_order_stop: {
        Args: { _stop_id: string }
        Returns: {
          address_text: string
          created_at: string
          delivered_at: string | null
          id: string
          is_delivered: boolean
          lat: number | null
          lng: number | null
          notes: string | null
          order_id: string
          position: number
          recipient_name: string | null
          recipient_phone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "order_stops"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_delivery_fee: {
        Args: {
          _city_id: string
          _distance_km: number
          _order_type: Database["public"]["Enums"]["order_type"]
          _provider_id: string
        }
        Returns: number
      }
      compute_delivery_fee_v: {
        Args: {
          _city_id: string
          _distance_km: number
          _order_type: Database["public"]["Enums"]["order_type"]
          _vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Returns: number
      }
      compute_taxi_fare: {
        Args: {
          _city_id: string
          _distance_km: number
          _taxi_class: Database["public"]["Enums"]["taxi_class"]
        }
        Returns: number
      }
      create_ad: {
        Args: {
          _address_text: string
          _body: string
          _category_id: string
          _city_id?: string
          _contact_phone: string
          _currency?: string
          _governorate?: string
          _images: string[]
          _price?: number
          _title: string
        }
        Returns: {
          address_text: string
          body: string
          category_id: string
          city_id: string | null
          contact_phone: string
          created_at: string
          currency: string
          expires_at: string | null
          governorate: string | null
          id: string
          images: string[]
          owner_id: string
          price: number | null
          published_at: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          status: Database["public"]["Enums"]["ad_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_courier_order: {
        Args: {
          _dropoff_lat?: number
          _dropoff_lng?: number
          _dropoff_text: string
          _notes?: string
          _pickup_lat?: number
          _pickup_lng?: number
          _pickup_text: string
        }
        Returns: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_customer_order: {
        Args: {
          _dropoff_lat?: number
          _dropoff_lng?: number
          _dropoff_text: string
          _items: Json
          _notes?: string
          _provider_id: string
        }
        Returns: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_payment_record: {
        Args: {
          _idempotency_key: string
          _provider?: string
          _subject_id: string
          _subject_type: Database["public"]["Enums"]["payment_subject"]
        }
        Returns: {
          amount: number
          client_secret: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: string
          paid_at: string | null
          provider: string
          provider_intent_id: string | null
          refund_error: string | null
          refund_reference: string | null
          refund_requested_amount: number
          refund_requested_at: string | null
          refund_status: string
          refunded_amount: number
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["payment_subject"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_service_request: {
        Args: {
          _address_text: string
          _description?: string
          _lat?: number
          _lng?: number
          _scheduled_at?: string
          _service_id: string
        }
        Returns: {
          address_text: string
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          description: string | null
          id: string
          lat: number | null
          lng: number | null
          price_amount: number
          price_unit: Database["public"]["Enums"]["service_price_unit"]
          provider_id: string
          scheduled_at: string | null
          service_id: string | null
          service_name: string
          status: Database["public"]["Enums"]["service_request_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_special_delivery_order: {
        Args: {
          _cargo_description?: string
          _cargo_weight_kg?: number
          _notes?: string
          _pickup_lat: number
          _pickup_lng: number
          _pickup_text: string
          _scheduled_at?: string
          _stops: Json
          _vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Returns: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_taxi_trip: {
        Args: {
          _dest_lat: number
          _dest_lng: number
          _destination_text: string
          _notes?: string
          _passengers?: number
          _pickup_lat: number
          _pickup_lng: number
          _pickup_text: string
          _taxi_class: Database["public"]["Enums"]["taxi_class"]
        }
        Returns: {
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          destination_lat: number | null
          destination_lng: number | null
          destination_text: string
          distance_km: number
          driver_id: string | null
          fare: number
          id: string
          notes: string | null
          passengers: number
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
          taxi_class: Database["public"]["Enums"]["taxi_class"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_ads: { Args: never; Returns: number }
      expire_due_ads: { Args: never; Returns: number }
      expire_stale_offers: { Args: { _order_id?: string }; Returns: number }
      expire_stale_trip_offers: { Args: { _trip_id?: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_km: {
        Args: { a_lat: number; a_lng: number; b_lat: number; b_lng: number }
        Returns: number
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_allowed_service_transition: {
        Args: {
          _actor: string
          _from: Database["public"]["Enums"]["service_request_status"]
          _to: Database["public"]["Enums"]["service_request_status"]
        }
        Returns: boolean
      }
      is_allowed_transition: {
        Args: {
          _actor: string
          _from: Database["public"]["Enums"]["order_status"]
          _order_type: Database["public"]["Enums"]["order_type"]
          _to: Database["public"]["Enums"]["order_status"]
        }
        Returns: boolean
      }
      is_allowed_trip_transition: {
        Args: {
          _actor: string
          _from: Database["public"]["Enums"]["trip_status"]
          _to: Database["public"]["Enums"]["trip_status"]
        }
        Returns: boolean
      }
      is_phone_verified: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      mark_dispatch_attempt: {
        Args: { _found: boolean; _order_id: string }
        Returns: Json
      }
      order_actor: {
        Args: { _order_id: string; _user_id: string }
        Returns: string
      }
      order_needs_admin_approval: {
        Args: { _order_type: Database["public"]["Enums"]["order_type"] }
        Returns: boolean
      }
      otp_flag: { Args: { _flag: string }; Returns: boolean }
      otp_mark_delivered: {
        Args: { _challenge_id: string; _channel: string; _delivered: boolean }
        Returns: undefined
      }
      otp_request: {
        Args: {
          _code_hash: string
          _phone: string
          _salt: string
          _user_id: string
        }
        Returns: Json
      }
      otp_verify: {
        Args: { _code_hash: string; _user_id: string }
        Returns: Json
      }
      owns_provider: {
        Args: { _provider_id: string; _user_id: string }
        Returns: boolean
      }
      payment_subject_info: {
        Args: {
          _subject_id: string
          _subject_type: Database["public"]["Enums"]["payment_subject"]
        }
        Returns: {
          amount: number
          is_terminal: boolean
          label: string
          owner_id: string
        }[]
      }
      push_notification: {
        Args: {
          _body: string
          _key?: string
          _kind: string
          _order_id?: string
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      quote_special_delivery: {
        Args: {
          _pickup_lat: number
          _pickup_lng: number
          _stops: Json
          _vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Returns: Json
      }
      quote_taxi_trip: {
        Args: {
          _dest_lat: number
          _dest_lng: number
          _pickup_lat: number
          _pickup_lng: number
          _taxi_class: Database["public"]["Enums"]["taxi_class"]
        }
        Returns: Json
      }
      rate_service_request: {
        Args: { _comment?: string; _request_id: string; _stars: number }
        Returns: {
          comment: string | null
          created_at: string
          id: string
          provider_id: string
          rater_id: string
          request_id: string
          stars: number
        }
        SetofOptions: {
          from: "*"
          to: "service_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rate_trip: {
        Args: { _comment?: string; _stars: number; _trip_id: string }
        Returns: {
          comment: string | null
          created_at: string
          driver_id: string
          id: string
          rater_id: string
          stars: number
          trip_id: string
        }
        SetofOptions: {
          from: "*"
          to: "trip_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_payment_refund: {
        Args: { _amount: number; _payment_id: string; _reason?: string }
        Returns: {
          amount: number
          client_secret: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: string
          paid_at: string | null
          provider: string
          provider_intent_id: string | null
          refund_error: string | null
          refund_reference: string | null
          refund_requested_amount: number
          refund_requested_at: string | null
          refund_status: string
          refunded_amount: number
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["payment_subject"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_delivery_offer: {
        Args: { _offer_id: string; _reason?: string }
        Returns: string
      }
      reject_trip_offer: {
        Args: { _offer_id: string; _reason?: string }
        Returns: string
      }
      request_payment_refund: {
        Args: { _amount?: number; _payment_id: string; _reason?: string }
        Returns: {
          amount: number
          client_secret: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: string
          paid_at: string | null
          provider: string
          provider_intent_id: string | null
          refund_error: string | null
          refund_reference: string | null
          refund_requested_amount: number
          refund_requested_at: string | null
          refund_status: string
          refunded_amount: number
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["payment_subject"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_order_approval: {
        Args: { _approve: boolean; _order_id: string; _reason?: string }
        Returns: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_sql_maintenance: { Args: never; Returns: Json }
      service_request_actor: {
        Args: { _request_id: string; _user_id: string }
        Returns: string
      }
      set_ad_status: {
        Args: {
          _ad_id: string
          _category_id?: string
          _expires_at?: string
          _reason?: string
          _sort_order?: number
          _status: Database["public"]["Enums"]["ad_status"]
        }
        Returns: {
          address_text: string
          body: string
          category_id: string
          city_id: string | null
          contact_phone: string
          created_at: string
          currency: string
          expires_at: string | null
          governorate: string | null
          id: string
          images: string[]
          owner_id: string
          price: number | null
          published_at: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          status: Database["public"]["Enums"]["ad_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_provider_status: {
        Args: {
          _provider_id: string
          _reason?: string
          _status: Database["public"]["Enums"]["provider_status"]
        }
        Returns: {
          address_text: string | null
          approval_code: string | null
          area_id: string | null
          avg_prep_minutes: number
          city_id: string | null
          commission_percent: number
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_open: boolean
          keywords: string[]
          kind: Database["public"]["Enums"]["provider_kind"]
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          orders_count: number
          owner_id: string | null
          phone: string | null
          profession_category_id: string | null
          rating: number
          ratings_count: number
          status: Database["public"]["Enums"]["provider_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "providers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_worker_approval: {
        Args: { _approve: boolean; _reason?: string; _user_id: string }
        Returns: {
          city_id: string | null
          created_at: string
          is_approved: boolean
          is_available: boolean
          max_active_orders: number
          plate_number: string | null
          rating: number
          ratings_count: number
          requested_kind: Database["public"]["Enums"]["worker_kind"] | null
          taxi_class: Database["public"]["Enums"]["taxi_class"] | null
          taxi_seats: number
          updated_at: string
          user_id: string
          vehicle: string | null
          vehicle_color: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
          worker_kind: Database["public"]["Enums"]["worker_kind"] | null
        }
        SetofOptions: {
          from: "*"
          to: "worker_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_payment: {
        Args: {
          _amount?: number
          _event_id?: string
          _event_type?: string
          _failure_reason?: string
          _intent_id: string
          _new_status: Database["public"]["Enums"]["payment_status"]
          _payload?: Json
          _provider: string
        }
        Returns: Json
      }
      settle_payment_refund: {
        Args: {
          _amount?: number
          _error?: string
          _payment_id: string
          _reference?: string
          _status: string
        }
        Returns: {
          amount: number
          client_secret: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: string
          paid_at: string | null
          provider: string
          provider_intent_id: string | null
          refund_error: string | null
          refund_reference: string | null
          refund_requested_amount: number
          refund_requested_at: string | null
          refund_status: string
          refunded_amount: number
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["payment_subject"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      special_delivery_distance: {
        Args: { _pickup_lat: number; _pickup_lng: number; _stops: Json }
        Returns: number
      }
      system_assign_driver: {
        Args: { _driver_id: string; _order_id: string }
        Returns: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      system_change_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _order_id: string
        }
        Returns: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_review_reason: string | null
          cancel_reason: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          dispatch_alerted_at: string | null
          dispatch_attempts: number
          dispatch_last_attempt_at: string | null
          driver_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_text: string | null
          id: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string | null
          provider_id: string | null
          requires_admin_approval: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      system_change_trip_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["trip_status"]
          _trip_id: string
        }
        Returns: {
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          destination_lat: number | null
          destination_lng: number | null
          destination_text: string
          distance_km: number
          driver_id: string | null
          fare: number
          id: string
          notes: string | null
          passengers: number
          payment_method: string
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
          taxi_class: Database["public"]["Enums"]["taxi_class"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      taxi_class_rank: {
        Args: { _c: Database["public"]["Enums"]["taxi_class"] }
        Returns: number
      }
      trip_actor: {
        Args: { _trip_id: string; _user_id: string }
        Returns: string
      }
      try_offer_delivery: {
        Args: {
          _distance_km: number
          _driver_id: string
          _order_id: string
          _timeout_seconds: number
        }
        Returns: boolean
      }
      try_offer_trip: {
        Args: {
          _distance_km: number
          _driver_id: string
          _timeout_seconds: number
          _trip_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      ad_status: "pending" | "published" | "rejected" | "paused" | "expired"
      app_role:
        | "super_admin"
        | "admin"
        | "supervisor"
        | "customer"
        | "worker"
        | "provider"
      offer_status: "sent" | "accepted" | "rejected" | "expired" | "cancelled"
      order_status:
        | "new"
        | "awaiting_provider"
        | "accepted"
        | "preparing"
        | "ready_for_pickup"
        | "searching_driver"
        | "offered_to_driver"
        | "driver_accepted"
        | "driver_heading_pickup"
        | "picked_up"
        | "on_the_way"
        | "delivered"
        | "completed"
        | "cancelled"
      order_type:
        | "restaurant"
        | "store"
        | "courier"
        | "special_delivery"
        | "taxi"
        | "profession"
      payment_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "refunded"
      payment_subject: "order" | "trip" | "service_request"
      provider_kind: "restaurant" | "store" | "profession"
      provider_status: "pending" | "approved" | "suspended" | "rejected"
      service_price_unit: "fixed" | "hourly" | "daily" | "visit" | "negotiable"
      service_request_status:
        | "requested"
        | "accepted"
        | "scheduled"
        | "en_route"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "rejected"
      taxi_class: "economy" | "comfort" | "van"
      trip_status:
        | "requested"
        | "searching_driver"
        | "driver_assigned"
        | "driver_arriving"
        | "driver_arrived"
        | "in_progress"
        | "completed"
        | "cancelled"
      vehicle_type: "bike" | "car" | "pickup" | "small_truck"
      worker_kind: "delivery" | "taxi"
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
      ad_status: ["pending", "published", "rejected", "paused", "expired"],
      app_role: [
        "super_admin",
        "admin",
        "supervisor",
        "customer",
        "worker",
        "provider",
      ],
      offer_status: ["sent", "accepted", "rejected", "expired", "cancelled"],
      order_status: [
        "new",
        "awaiting_provider",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "searching_driver",
        "offered_to_driver",
        "driver_accepted",
        "driver_heading_pickup",
        "picked_up",
        "on_the_way",
        "delivered",
        "completed",
        "cancelled",
      ],
      order_type: [
        "restaurant",
        "store",
        "courier",
        "special_delivery",
        "taxi",
        "profession",
      ],
      payment_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
        "refunded",
      ],
      payment_subject: ["order", "trip", "service_request"],
      provider_kind: ["restaurant", "store", "profession"],
      provider_status: ["pending", "approved", "suspended", "rejected"],
      service_price_unit: ["fixed", "hourly", "daily", "visit", "negotiable"],
      service_request_status: [
        "requested",
        "accepted",
        "scheduled",
        "en_route",
        "in_progress",
        "completed",
        "cancelled",
        "rejected",
      ],
      taxi_class: ["economy", "comfort", "van"],
      trip_status: [
        "requested",
        "searching_driver",
        "driver_assigned",
        "driver_arriving",
        "driver_arrived",
        "in_progress",
        "completed",
        "cancelled",
      ],
      vehicle_type: ["bike", "car", "pickup", "small_truck"],
      worker_kind: ["delivery", "taxi"],
    },
  },
} as const
