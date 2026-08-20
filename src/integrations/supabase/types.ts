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
      orders: {
        Row: {
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
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
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          city_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          delivery_fee?: number
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
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          city_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          delivery_fee?: number
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
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
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
      profiles: {
        Row: {
          avatar_url: string | null
          city_id: string | null
          created_at: string
          full_name: string
          id: string
          is_blocked: boolean
          phone: string | null
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
      service_sections: {
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
      services: {
        Row: {
          created_at: string
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
          rating: number
          ratings_count: number
          requested_kind: Database["public"]["Enums"]["worker_kind"] | null
          updated_at: string
          user_id: string
          vehicle: string | null
          worker_kind: Database["public"]["Enums"]["worker_kind"] | null
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          is_approved?: boolean
          is_available?: boolean
          max_active_orders?: number
          rating?: number
          ratings_count?: number
          requested_kind?: Database["public"]["Enums"]["worker_kind"] | null
          updated_at?: string
          user_id: string
          vehicle?: string | null
          worker_kind?: Database["public"]["Enums"]["worker_kind"] | null
        }
        Update: {
          city_id?: string | null
          created_at?: string
          is_approved?: boolean
          is_available?: boolean
          max_active_orders?: number
          rating?: number
          ratings_count?: number
          requested_kind?: Database["public"]["Enums"]["worker_kind"] | null
          updated_at?: string
          user_id?: string
          vehicle?: string | null
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
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
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
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auto_complete_delivered_orders: { Args: never; Returns: number }
      can_see_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      change_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _order_id: string
          _reason?: string
        }
        Returns: {
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
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
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_maintenance_slot: {
        Args: { _min_seconds?: number; _name?: string }
        Returns: boolean
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
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
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
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_stale_offers: { Args: { _order_id?: string }; Returns: number }
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
      is_allowed_transition: {
        Args: {
          _actor: string
          _from: Database["public"]["Enums"]["order_status"]
          _to: Database["public"]["Enums"]["order_status"]
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      order_actor: {
        Args: { _order_id: string; _user_id: string }
        Returns: string
      }
      owns_provider: {
        Args: { _provider_id: string; _user_id: string }
        Returns: boolean
      }
      reject_delivery_offer: {
        Args: { _offer_id: string; _reason?: string }
        Returns: string
      }
      run_sql_maintenance: { Args: never; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      system_change_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _order_id: string
        }
        Returns: {
          cancel_reason: string | null
          city_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
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
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
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
      provider_kind: "restaurant" | "store" | "profession"
      provider_status: "pending" | "approved" | "suspended" | "rejected"
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
      provider_kind: ["restaurant", "store", "profession"],
      provider_status: ["pending", "approved", "suspended", "rejected"],
      worker_kind: ["delivery", "taxi"],
    },
  },
} as const
