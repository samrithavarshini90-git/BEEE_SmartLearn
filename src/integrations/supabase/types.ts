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
      achievements: {
        Row: {
          code: string
          created_at: string
          criteria: Json
          description: string
          icon: string
          id: string
          points: number
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          criteria?: Json
          description: string
          icon?: string
          id?: string
          points?: number
          title: string
        }
        Update: {
          code?: string
          created_at?: string
          criteria?: Json
          description?: string
          icon?: string
          id?: string
          points?: number
          title?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          topic: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          topic?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      formulas: {
        Row: {
          created_at: string
          explanation: string | null
          formula: string
          id: string
          latex: string | null
          name: string
          topic: string
          unit_number: number
          variables: Json | null
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          formula: string
          id?: string
          latex?: string | null
          name: string
          topic: string
          unit_number: number
          variables?: Json | null
        }
        Update: {
          created_at?: string
          explanation?: string | null
          formula?: string
          id?: string
          latex?: string | null
          name?: string
          topic?: string
          unit_number?: number
          variables?: Json | null
        }
        Relationships: []
      }
      important_questions: {
        Row: {
          answer_outline: string | null
          created_at: string
          diagram_hint: string | null
          formulas_used: Json | null
          id: string
          marks: number
          question: string
          topic: string
          unit_number: number
        }
        Insert: {
          answer_outline?: string | null
          created_at?: string
          diagram_hint?: string | null
          formulas_used?: Json | null
          id?: string
          marks: number
          question: string
          topic: string
          unit_number: number
        }
        Update: {
          answer_outline?: string | null
          created_at?: string
          diagram_hint?: string | null
          formulas_used?: Json | null
          id?: string
          marks?: number
          question?: string
          topic?: string
          unit_number?: number
        }
        Relationships: []
      }
      numerical_problems: {
        Row: {
          created_at: string
          final_answer: string | null
          formulas_used: Json | null
          id: string
          problem: string
          solution_steps: Json
          topic: string
          unit_number: number
        }
        Insert: {
          created_at?: string
          final_answer?: string | null
          formulas_used?: Json | null
          id?: string
          problem: string
          solution_steps?: Json
          topic: string
          unit_number: number
        }
        Update: {
          created_at?: string
          final_answer?: string | null
          formulas_used?: Json | null
          id?: string
          problem?: string
          solution_steps?: Json
          topic?: string
          unit_number?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          correct: number
          created_at: string
          details: Json
          duration_seconds: number
          id: string
          score: number
          total: number
          unit_number: number
          user_id: string
        }
        Insert: {
          correct?: number
          created_at?: string
          details?: Json
          duration_seconds?: number
          id?: string
          score?: number
          total?: number
          unit_number: number
          user_id: string
        }
        Update: {
          correct?: number
          created_at?: string
          details?: Json
          duration_seconds?: number
          id?: string
          score?: number
          total?: number
          unit_number?: number
          user_id?: string
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          correct_index: number
          created_at: string
          difficulty: string
          explanation: string | null
          id: string
          options: Json
          question: string
          topic: string
          unit_number: number
        }
        Insert: {
          correct_index: number
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          options: Json
          question: string
          topic: string
          unit_number: number
        }
        Update: {
          correct_index?: number
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          options?: Json
          question?: string
          topic?: string
          unit_number?: number
        }
        Relationships: []
      }
      solved_problems: {
        Row: {
          created_at: string
          id: string
          marks: number | null
          question: string
          solution: Json
          topic: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marks?: number | null
          question: string
          solution: Json
          topic?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marks?: number | null
          question?: string
          solution?: Json
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      syllabus_units: {
        Row: {
          created_at: string
          description: string | null
          id: string
          title: string
          topics: Json
          unit_number: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          title: string
          topics?: Json
          unit_number: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          topics?: Json
          unit_number?: number
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_code: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_code: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_code?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_code_fkey"
            columns: ["achievement_code"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["code"]
          },
        ]
      }
      user_progress: {
        Row: {
          id: string
          items_completed: number
          last_activity_at: string
          points_earned: number
          unit_number: number
          user_id: string
        }
        Insert: {
          id?: string
          items_completed?: number
          last_activity_at?: string
          points_earned?: number
          unit_number: number
          user_id: string
        }
        Update: {
          id?: string
          items_completed?: number
          last_activity_at?: string
          points_earned?: number
          unit_number?: number
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "student" | "admin"
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
      app_role: ["student", "admin"],
    },
  },
} as const
