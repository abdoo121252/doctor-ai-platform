export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      doctors: {
        Row: {
          id: string;
          name: string | null;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          email?: string;
          created_at?: string;
        };
      };
      google_connections: {
        Row: {
          id: string;
          doctor_id: string;
          status: string;
          refresh_token_encrypted: string | null;
          connected_at: string;
          last_checked_at: string | null;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          status?: string;
          refresh_token_encrypted?: string | null;
          connected_at?: string;
          last_checked_at?: string | null;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          status?: string;
          refresh_token_encrypted?: string | null;
          connected_at?: string;
          last_checked_at?: string | null;
        };
      };
      microsoft_connections: {
        Row: {
          id: string;
          doctor_id: string;
          status: string;
          refresh_token_encrypted: string | null;
          connected_at: string;
          last_checked_at: string | null;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          status?: string;
          refresh_token_encrypted?: string | null;
          connected_at?: string;
          last_checked_at?: string | null;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          status?: string;
          refresh_token_encrypted?: string | null;
          connected_at?: string;
          last_checked_at?: string | null;
        };
      };
      conversations: {
        Row: {
          id: string;
          doctor_id: string;
          session_id: string | null;
          session_type: string;
          role: string;
          content: string;
          parts: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          session_id?: string | null;
          session_type: string;
          role: string;
          content: string;
          parts?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          session_id?: string | null;
          session_type?: string;
          role?: string;
          content?: string;
          parts?: Json | null;
          created_at?: string;
        };
      };
      chat_sessions: {
        Row: {
          id: string;
          doctor_id: string;
          title: string;
          created_at: string;
          updated_at: string;
          public_access_token: string | null;
          last_event_id: string | null;
          session_type: string;
          source_id: string | null;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
          public_access_token?: string | null;
          last_event_id?: string | null;
          session_type?: string;
          source_id?: string | null;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
          public_access_token?: string | null;
          last_event_id?: string | null;
          session_type?: string;
          source_id?: string | null;
        };
      };
      tool_sensitivity_settings: {
        Row: {
          doctor_id: string;
          tool_name: string;
          sensitive: boolean;
          updated_at: string;
        };
        Insert: {
          doctor_id: string;
          tool_name: string;
          sensitive: boolean;
          updated_at?: string;
        };
        Update: {
          doctor_id?: string;
          tool_name?: string;
          sensitive?: boolean;
          updated_at?: string;
        };
      };
      automation_tool_overrides: {
        Row: {
          id: string;
          doctor_id: string;
          automation_type: string;
          automation_id: string;
          tool_name: string;
          sensitive: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          automation_type: string;
          automation_id: string;
          tool_name: string;
          sensitive: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          automation_type?: string;
          automation_id?: string;
          tool_name?: string;
          sensitive?: boolean;
          updated_at?: string;
        };
      };
      approval_requests: {
        Row: {
          id: string;
          doctor_id: string;
          session_id: string | null;
          action_type: string;
          action_payload: Json;
          status: string;
          trigger_token_id: string | null;
          requested_at: string;
          resolved_at: string | null;
          rejection_reason: string | null;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          session_id?: string | null;
          action_type: string;
          action_payload: Json;
          status?: string;
          trigger_token_id?: string | null;
          requested_at?: string;
          resolved_at?: string | null;
          rejection_reason?: string | null;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          session_id?: string | null;
          action_type?: string;
          action_payload?: Json;
          status?: string;
          trigger_token_id?: string | null;
          requested_at?: string;
          resolved_at?: string | null;
          rejection_reason?: string | null;
        };
      };
      scheduled_tasks: {
        Row: {
          id: string;
          doctor_id: string;
          name: string;
          cron_expression: string | null;
          schedule_type: string;
          instructions: string;
          enabled: boolean;
          timezone: string;
          last_run_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          name: string;
          cron_expression?: string | null;
          schedule_type?: string;
          instructions: string;
          enabled?: boolean;
          timezone?: string;
          last_run_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          name?: string;
          cron_expression?: string | null;
          schedule_type?: string;
          instructions?: string;
          enabled?: boolean;
          timezone?: string;
          last_run_at?: string | null;
          created_at?: string;
        };
      };
      scheduled_task_dates: {
        Row: {
          id: string;
          task_id: string;
          run_at: string;
          fired_at: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          run_at: string;
          fired_at?: string | null;
        };
        Update: {
          id?: string;
          task_id?: string;
          run_at?: string;
          fired_at?: string | null;
        };
      };
      event_triggers: {
        Row: {
          id: string;
          doctor_id: string;
          name: string;
          event_source: string;
          instructions: string;
          enabled: boolean;
          filter_rules: Json;
          last_checked_at: string | null;
          condition: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          name: string;
          event_source: string;
          instructions: string;
          enabled?: boolean;
          filter_rules?: Json;
          last_checked_at?: string | null;
          condition?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          name?: string;
          event_source?: string;
          instructions?: string;
          enabled?: boolean;
          filter_rules?: Json;
          last_checked_at?: string | null;
          condition?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
