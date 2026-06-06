export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      md_settings: {
        Row: {
          id: string;
          company_id: string;
          trading_name: string;
          hospitality_module: boolean;
          advanced_geofencing: boolean;
          auto_approve_payroll: boolean;
          created_at: string;
          updated_at: string;
          security_day_start?: string | null;
          security_day_end?: string | null;
          security_night_start?: string | null;
          security_night_end?: string | null;
          cafe_morning_shift_start?: string | null;
          cafe_morning_shift_end?: string | null;
          cafe_evening_shift_start?: string | null;
          cafe_evening_shift_end?: string | null;
          company_logo_url?: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          trading_name: string;
          hospitality_module?: boolean;
          advanced_geofencing?: boolean;
          auto_approve_payroll?: boolean;
          created_at?: string;
          updated_at?: string;
          security_day_start?: string | null;
          security_day_end?: string | null;
          security_night_start?: string | null;
          security_night_end?: string | null;
          cafe_morning_shift_start?: string | null;
          cafe_morning_shift_end?: string | null;
          cafe_evening_shift_start?: string | null;
          cafe_evening_shift_end?: string | null;
          company_logo_url?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          trading_name?: string;
          hospitality_module?: boolean;
          advanced_geofencing?: boolean;
          auto_approve_payroll?: boolean;
          created_at?: string;
          updated_at?: string;
          security_day_start?: string | null;
          security_day_end?: string | null;
          security_night_start?: string | null;
          security_night_end?: string | null;
          cafe_morning_shift_start?: string | null;
          cafe_morning_shift_end?: string | null;
          cafe_evening_shift_start?: string | null;
          cafe_evening_shift_end?: string | null;
          company_logo_url?: string | null;
        };
        Relationships: [];
      };
      site_profiles: {
        Row: {
          id: string;
          company_id: string;
          site_name: string;
          site_type:
            | 'OFFICE'
            | 'BANK'
            | 'PHARMACY'
            | 'STORAGE'
            | 'HOTEL'
            | 'RESIDENTIAL'
            | 'OTHER';
          address: string | null;
          provides_food: boolean;
          food_allowance_lkr: number;
          provides_accommodation: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          site_name: string;
          site_type:
            | 'OFFICE'
            | 'BANK'
            | 'PHARMACY'
            | 'STORAGE'
            | 'HOTEL'
            | 'RESIDENTIAL'
            | 'OTHER';
          address?: string | null;
          provides_food?: boolean;
          food_allowance_lkr?: number;
          provides_accommodation?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          site_name?: string;
          site_type?:
            | 'OFFICE'
            | 'BANK'
            | 'PHARMACY'
            | 'STORAGE'
            | 'HOTEL'
            | 'RESIDENTIAL'
            | 'OTHER';
          address?: string | null;
          provides_food?: boolean;
          food_allowance_lkr?: number;
          provides_accommodation?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      guard_sector_assignments: {
        Row: {
          id: string;
          company_id: string;
          guard_id: string;
          sector_id: string;
          is_home_sector: boolean;
          loan_expiry_date: string | null;
          assigned_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          guard_id: string;
          sector_id: string;
          is_home_sector?: boolean;
          loan_expiry_date?: string | null;
          assigned_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          guard_id?: string;
          sector_id?: string;
          is_home_sector?: boolean;
          loan_expiry_date?: string | null;
          assigned_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      discrepancy_recovery_plans: {
        Row: {
          id: string;
          attendance_log_id: string;
          company_id: string;
          guard_id: string;
          deduction_method: 'CUT_SHIFTS' | 'MONTHLY';
          recovery_amount_lkr: number;
          months_to_recover: number;
          notes: string | null;
          status: 'ACTIVE' | 'SUPERSEDED' | 'COMPLETED' | 'CANCELLED';
          created_by: string;
          created_by_name: string;
          updated_by: string | null;
          updated_by_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attendance_log_id: string;
          company_id: string;
          guard_id: string;
          deduction_method?: 'CUT_SHIFTS' | 'MONTHLY';
          recovery_amount_lkr?: number;
          months_to_recover?: number;
          notes?: string | null;
          status?: 'ACTIVE' | 'SUPERSEDED' | 'COMPLETED' | 'CANCELLED';
          created_by: string;
          created_by_name?: string;
          updated_by?: string | null;
          updated_by_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          attendance_log_id?: string;
          company_id?: string;
          guard_id?: string;
          deduction_method?: 'CUT_SHIFTS' | 'MONTHLY';
          recovery_amount_lkr?: number;
          months_to_recover?: number;
          notes?: string | null;
          status?: 'ACTIVE' | 'SUPERSEDED' | 'COMPLETED' | 'CANCELLED';
          created_by?: string;
          created_by_name?: string;
          updated_by?: string | null;
          updated_by_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payroll_deductions: {
        Row: {
          id: string;
          company_id: string;
          guard_id: string;
          amount: number;
          category: 'UNIFORM' | 'MEAL_OVERAGE' | 'DISCIPLINARY' | 'OTHER';
          reason: string | null;
          applied_month: string;
          added_by: string | null;
          approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          guard_id: string;
          amount: number;
          category: 'UNIFORM' | 'MEAL_OVERAGE' | 'DISCIPLINARY' | 'OTHER';
          reason?: string | null;
          applied_month: string;
          added_by?: string | null;
          approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          guard_id?: string;
          amount?: number;
          category?: 'UNIFORM' | 'MEAL_OVERAGE' | 'DISCIPLINARY' | 'OTHER';
          reason?: string | null;
          applied_month?: string;
          added_by?: string | null;
          approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
          created_at?: string;
        };
        Relationships: [];
      };
      meal_suppliers: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          address: string | null;
          phone: string | null;
          bank_name: string | null;
          bank_branch: string | null;
          account_name: string | null;
          account_number: string | null;
          status: 'ACTIVE' | 'ARCHIVED';
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          bank_name?: string | null;
          bank_branch?: string | null;
          account_name?: string | null;
          account_number?: string | null;
          status?: 'ACTIVE' | 'ARCHIVED';
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          bank_name?: string | null;
          bank_branch?: string | null;
          account_name?: string | null;
          account_number?: string | null;
          status?: 'ACTIVE' | 'ARCHIVED';
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_meal_supplier_assignments: {
        Row: {
          id: string;
          company_id: string;
          site_profile_id: string;
          meal_supplier_id: string;
          notes: string | null;
          assigned_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          site_profile_id: string;
          meal_supplier_id: string;
          notes?: string | null;
          assigned_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          site_profile_id?: string;
          meal_supplier_id?: string;
          notes?: string | null;
          assigned_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payroll_deduction_month_locks: {
        Row: {
          id: string;
          company_id: string;
          payroll_month: string;
          locked_at: string;
          locked_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          payroll_month: string;
          locked_at?: string;
          locked_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          payroll_month?: string;
          locked_at?: string;
          locked_by?: string | null;
        };
        Relationships: [];
      };
      payroll_monthly_deduction_entries: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string;
          payroll_month: string;
          uniform_amount_lkr: number;
          meals_amount_lkr: number;
          status: 'DRAFT' | 'APPROVED';
          notes: string | null;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          employee_id: string;
          payroll_month: string;
          uniform_amount_lkr?: number;
          meals_amount_lkr?: number;
          status?: 'DRAFT' | 'APPROVED';
          notes?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          employee_id?: string;
          payroll_month?: string;
          uniform_amount_lkr?: number;
          meals_amount_lkr?: number;
          status?: 'DRAFT' | 'APPROVED';
          notes?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
