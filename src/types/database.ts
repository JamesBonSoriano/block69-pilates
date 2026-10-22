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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          agreed_at: string | null
          class_fee: number
          created_at: string
          discount: number
          drink_choice: string | null
          first_time: boolean
          health_notes: string | null
          hold_expires_at: string | null
          id: string
          mat_fee: number
          mat_rental: boolean
          not_pregnant_confirmed: boolean
          session_id: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number
          transferred_from: string | null
          updated_at: string
          user_id: string | null
          voucher_id: string | null
          walkin_contact: string | null
          walkin_name: string | null
        }
        Insert: {
          agreed_at?: string | null
          class_fee: number
          created_at?: string
          discount?: number
          drink_choice?: string | null
          first_time?: boolean
          health_notes?: string | null
          hold_expires_at?: string | null
          id?: string
          mat_fee?: number
          mat_rental?: boolean
          not_pregnant_confirmed?: boolean
          session_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          total: number
          transferred_from?: string | null
          updated_at?: string
          user_id?: string | null
          voucher_id?: string | null
          walkin_contact?: string | null
          walkin_name?: string | null
        }
        Update: {
          agreed_at?: string | null
          class_fee?: number
          created_at?: string
          discount?: number
          drink_choice?: string | null
          first_time?: boolean
          health_notes?: string | null
          hold_expires_at?: string | null
          id?: string
          mat_fee?: number
          mat_rental?: boolean
          not_pregnant_confirmed?: boolean
          session_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number
          transferred_from?: string | null
          updated_at?: string
          user_id?: string | null
          voucher_id?: string | null
          walkin_contact?: string | null
          walkin_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_transferred_from_fkey"
            columns: ["transferred_from"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          capacity: number
          created_at: string
          date: string
          end_time: string
          id: string
          start_time: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          date: string
          end_time: string
          id?: string
          start_time: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "schedule_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          booking_id: string | null
          id: string
          sent_at: string
          type: Database["public"]["Enums"]["email_type"]
          user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          id?: string
          sent_at?: string
          type: Database["public"]["Enums"]["email_type"]
          user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          id?: string
          sent_at?: string
          type?: Database["public"]["Enums"]["email_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          paid_at: string | null
          paymongo_ref: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          screenshot_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          paid_at?: string | null
          paymongo_ref?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          paid_at?: string | null
          paymongo_ref?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birthday: string | null
          created_at: string
          email: string
          email_reminders: boolean
          full_name: string
          id: string
          instagram: string | null
          is_active: boolean
          mobile: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          email?: string
          email_reminders?: boolean
          full_name?: string
          id: string
          instagram?: string | null
          is_active?: boolean
          mobile?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          birthday?: string | null
          created_at?: string
          email?: string
          email_reminders?: boolean
          full_name?: string
          id?: string
          instagram?: string | null
          is_active?: boolean
          mobile?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      schedule_templates: {
        Row: {
          created_at: string
          default_capacity: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          default_capacity?: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          default_capacity?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          is_public: boolean
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          is_public?: boolean
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          is_public?: boolean
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      site_content: {
        Row: {
          body: string | null
          created_at: string
          id: string
          image_path: string | null
          page: string
          section: string
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          page: string
          section: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          page?: string
          section?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          amount_off: number | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          owner_id: string | null
          percent_off: number | null
          source: Database["public"]["Enums"]["voucher_source"]
          updated_at: string
          uses_left: number
        }
        Insert: {
          amount_off?: number | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_id?: string | null
          percent_off?: number | null
          source: Database["public"]["Enums"]["voucher_source"]
          updated_at?: string
          uses_left?: number
        }
        Update: {
          amount_off?: number | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_id?: string | null
          percent_off?: number | null
          source?: Database["public"]["Enums"]["voucher_source"]
          updated_at?: string
          uses_left?: number
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_cancel_session: { Args: { p_session_id: string }; Returns: number }
      admin_review_manual_payment: {
        Args: { p_approve: boolean; p_payment_id: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      admin_set_attendance: {
        Args: {
          p_booking_id: string
          p_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      admin_walkin_booking: {
        Args: {
          p_agreed: boolean
          p_contact: string
          p_drink_choice?: string
          p_first_time?: boolean
          p_health_notes?: string
          p_mat_rental?: boolean
          p_name: string
          p_not_pregnant: boolean
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_session_id: string
        }
        Returns: {
          booking_id: string
          payment_id: string
          total: number
        }[]
      }
      at_manila: { Args: { p_date: string; p_time: string }; Returns: string }
      book_seat: {
        Args: {
          p_agreed: boolean
          p_drink_choice?: string
          p_first_time?: boolean
          p_health_notes?: string
          p_mat_rental?: boolean
          p_not_pregnant: boolean
          p_session_id: string
          p_voucher_code?: string
        }
        Returns: {
          booking_id: string
          class_fee: number
          discount: number
          hold_expires_at: string
          mat_fee: number
          total: number
        }[]
      }
      booking_closes_at: {
        Args: { p_date: string; p_start_time: string }
        Returns: string
      }
      booking_family: { Args: { p_booking_id: string }; Returns: string[] }
      cancel_my_booking: {
        Args: { p_booking_id: string }
        Returns: {
          new_status: Database["public"]["Enums"]["booking_status"]
          voucher_code: string
          voucher_expires_at: string
        }[]
      }
      check_drink_choice: { Args: { p_choice: string }; Returns: string }
      check_voucher: {
        Args: { p_code: string }
        Returns: {
          amount_off: number
          code: string
          discount: number
          expires_at: string
          percent_off: number
        }[]
      }
      deactivate_my_account: { Args: never; Returns: undefined }
      find_usable_voucher: {
        Args: { p_code: string; p_user_id: string }
        Returns: {
          amount_off: number | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          owner_id: string | null
          percent_off: number | null
          source: Database["public"]["Enums"]["voucher_source"]
          updated_at: string
          uses_left: number
        }
        SetofOptions: {
          from: "*"
          to: "vouchers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_sessions: { Args: { p_weeks?: number }; Returns: number }
      get_my_booking: {
        Args: { p_booking_id: string }
        Returns: {
          booking_id: string
          class_date: string
          class_fee: number
          created_at: string
          discount: number
          drink_choice: string
          end_time: string
          first_time: boolean
          health_notes: string
          hold_expires_at: string
          hold_seconds_left: number
          mat_fee: number
          mat_rental: boolean
          paid_amount: number
          paid_at: string
          paid_method: Database["public"]["Enums"]["payment_method"]
          session_id: string
          session_status: Database["public"]["Enums"]["session_status"]
          start_time: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number
          voucher_amount_off: number
          voucher_code: string
          voucher_percent_off: number
        }[]
      }
      get_my_session_booking: {
        Args: { p_session_id: string }
        Returns: {
          booking_id: string
          status: Database["public"]["Enums"]["booking_status"]
        }[]
      }
      get_open_sessions: {
        Args: { p_from_date?: string; p_to_date?: string }
        Returns: {
          booking_closes_at: string
          capacity: number
          date: string
          end_time: string
          is_bookable: boolean
          seats_left: number
          session_id: string
          start_time: string
          state: string
          status: Database["public"]["Enums"]["session_status"]
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      manila_today: { Args: never; Returns: string }
      my_seat_status: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      release_my_hold: { Args: { p_booking_id: string }; Returns: string }
      require_active_user: { Args: never; Returns: string }
      require_admin: { Args: never; Returns: string }
      seats_left: { Args: { p_session_id: string }; Returns: number }
      seats_taken: { Args: { p_session_id: string }; Returns: number }
      setting_number: { Args: { p_key: string }; Returns: number }
      setting_text: {
        Args: { p_default?: string; p_key: string }
        Returns: string
      }
      transfer_my_booking: {
        Args: { p_booking_id: string; p_new_session_id: string }
        Returns: string
      }
      voucher_discount: {
        Args: {
          p_class_fee: number
          p_voucher: Database["public"]["Tables"]["vouchers"]["Row"]
        }
        Returns: number
      }
    }
    Enums: {
      booking_status:
        | "pending_payment"
        | "awaiting_verification"
        | "confirmed"
        | "paid_needs_action"
        | "expired"
        | "transferred"
        | "cancelled_with_voucher"
        | "forfeited"
        | "no_show"
        | "attended"
      email_type:
        | "confirmation"
        | "reminder"
        | "cancellation"
        | "voucher"
        | "session_notice"
        | "admin_alert"
      payment_method: "gcash" | "maya" | "card" | "bpi" | "cash"
      payment_provider: "paymongo" | "manual" | "cash"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "expired"
        | "rejected"
        | "refunded"
      session_status: "open" | "closed" | "cancelled"
      user_role: "client" | "admin"
      voucher_source: "cancellation" | "promo"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: [
        "pending_payment",
        "awaiting_verification",
        "confirmed",
        "paid_needs_action",
        "expired",
        "transferred",
        "cancelled_with_voucher",
        "forfeited",
        "no_show",
        "attended",
      ],
      email_type: [
        "confirmation",
        "reminder",
        "cancellation",
        "voucher",
        "session_notice",
        "admin_alert",
      ],
      payment_method: ["gcash", "maya", "card", "bpi", "cash"],
      payment_provider: ["paymongo", "manual", "cash"],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "expired",
        "rejected",
        "refunded",
      ],
      session_status: ["open", "closed", "cancelled"],
      user_role: ["client", "admin"],
      voucher_source: ["cancellation", "promo"],
    },
  },
} as const
