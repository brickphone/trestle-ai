import type {
  Organization,
  Membership,
  StaffUser,
  SourceSnapshot,
  Job,
  ChangeOrder,
  Invoice,
  Payment,
  Balance,
  RecurringCost,
  Assumption,
  AuditEvent,
} from "../data/types";
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type ApiValue<T> = T extends Date ? string : T extends null ? null : T;
export type ApiRow<T> = { [K in keyof T]: ApiValue<T[K]> };
type Table<T> = {
  Row: ApiRow<T>;
  Insert: Partial<ApiRow<T>>;
  Update: Partial<ApiRow<T>>;
  Relationships: [];
};
export type SecurityContext = { role: string; user_id: string | null; rls_active: boolean };
export type Database = {
  public: {
    Tables: {
      organizations: Table<Organization>;
      onboarding_drafts: Table<{ user_id: string; draft: Json }>;
      memberships: Table<Membership>;
      staff_users: Table<StaffUser>;
      source_snapshots: Table<SourceSnapshot>;
      jobs: Table<Job>;
      change_orders: Table<ChangeOrder>;
      government_invoices: Table<Invoice>;
      government_payments: Table<Payment>;
      cash_balance_entries: Table<Balance>;
      recurring_costs: Table<RecurringCost>;
      forecast_assumptions: Table<Assumption>;
      audit_events: Table<AuditEvent>;
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      request_security_context: { Args: Record<string, never>; Returns: SecurityContext };
      complete_onboarding: {
        Args: {
          company_name: string;
          company_uei: string | null;
          company_origin: string;
          awards: Json;
          opening_balance: number | null;
          balance_date: string;
          payroll: number | null;
          retainage_bps: number;
          payment_terms_days: number;
          other_monthly_costs?: number | null;
          job_inputs?: Json;
        };
        Returns: string;
      };
      save_government_invoice: {
        Args: { org_id: string; invoice_id: string | null; invoice_values: Json };
        Returns: string;
      };
      record_government_payment: {
        Args: { org_id: string; payment_values: Json };
        Returns: string;
      };
      void_financial_record: {
        Args: { org_id: string; record_kind: string; record_id: string; reason: string };
        Returns: boolean;
      };
      provision_staff: { Args: { target_user: string }; Returns: boolean };
      reset_demo: { Args: { demo_user_id: string }; Returns: string };
    };
  };
};
export type TableName = keyof Database["public"]["Tables"];
export type Rows = { [K in TableName]: Database["public"]["Tables"][K]["Row"] };
export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
