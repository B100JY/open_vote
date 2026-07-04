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
  app_nozolink: {
    Tables: {
      account_setup_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          reason: string | null
          target_id: string | null
          target_table: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_features: {
        Row: {
          category: Database["app_nozolink"]["Enums"]["admin_feature_category"]
          created_at: string
          description: string
          highlights: string[]
          href: string
          id: string
          metadata: Json
          owner_only: boolean
          sort_order: number
          status: Database["app_nozolink"]["Enums"]["admin_feature_status"]
          title: string
          updated_at: string
        }
        Insert: {
          category: Database["app_nozolink"]["Enums"]["admin_feature_category"]
          created_at?: string
          description: string
          highlights?: string[]
          href: string
          id: string
          metadata?: Json
          owner_only?: boolean
          sort_order?: number
          status?: Database["app_nozolink"]["Enums"]["admin_feature_status"]
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["app_nozolink"]["Enums"]["admin_feature_category"]
          created_at?: string
          description?: string
          highlights?: string[]
          href?: string
          id?: string
          metadata?: Json
          owner_only?: boolean
          sort_order?: number
          status?: Database["app_nozolink"]["Enums"]["admin_feature_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          id: string
          role: Database["app_nozolink"]["Enums"]["admin_role"]
          union_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["app_nozolink"]["Enums"]["admin_role"]
          union_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["app_nozolink"]["Enums"]["admin_role"]
          union_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      dues_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          memo: string | null
          payment_date: string
          status: Database["app_nozolink"]["Enums"]["dues_payment_status"]
          updated_at: string
          user_union_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          memo?: string | null
          payment_date: string
          status?: Database["app_nozolink"]["Enums"]["dues_payment_status"]
          updated_at?: string
          user_union_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          memo?: string | null
          payment_date?: string
          status?: Database["app_nozolink"]["Enums"]["dues_payment_status"]
          updated_at?: string
          user_union_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dues_payments_user_union_id_fkey"
            columns: ["user_union_id"]
            isOneToOne: false
            referencedRelation: "user_unions"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_organizations: {
        Row: {
          contact_info: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_type: Database["app_nozolink"]["Enums"]["labor_organization_type"]
          parent_organization_id: string | null
          short_name: string | null
          sort_order: number
          updated_at: string
          website_url: string | null
        }
        Insert: {
          contact_info?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_type?: Database["app_nozolink"]["Enums"]["labor_organization_type"]
          parent_organization_id?: string | null
          short_name?: string | null
          sort_order?: number
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          contact_info?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_type?: Database["app_nozolink"]["Enums"]["labor_organization_type"]
          parent_organization_id?: string | null
          short_name?: string | null
          sort_order?: number
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labor_organizations_parent_organization_id_fkey"
            columns: ["parent_organization_id"]
            isOneToOne: false
            referencedRelation: "labor_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          joined_at: string
          membership_role: string
          metadata: Json
          user_union_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          joined_at?: string
          membership_role?: string
          metadata?: Json
          user_union_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          joined_at?: string
          membership_role?: string
          metadata?: Json
          user_union_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "member_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_group_members_user_union_id_fkey"
            columns: ["user_union_id"]
            isOneToOne: false
            referencedRelation: "user_unions"
            referencedColumns: ["id"]
          },
        ]
      }
      member_groups: {
        Row: {
          created_at: string
          created_by_admin_user_id: string | null
          description: string | null
          group_type: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          sort_order: number
          union_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_admin_user_id?: string | null
          description?: string | null
          group_type?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          sort_order?: number
          union_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_admin_user_id?: string | null
          description?: string | null
          group_type?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          sort_order?: number
          union_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_groups_created_by_admin_user_id_fkey"
            columns: ["created_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_groups_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      member_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          show_company: boolean
          show_contributions: boolean
          updated_at: string
          user_id: string
          visibility: Database["app_nozolink"]["Enums"]["profile_visibility"]
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          show_company?: boolean
          show_contributions?: boolean
          updated_at?: string
          user_id: string
          visibility?: Database["app_nozolink"]["Enums"]["profile_visibility"]
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          show_company?: boolean
          show_contributions?: boolean
          updated_at?: string
          user_id?: string
          visibility?: Database["app_nozolink"]["Enums"]["profile_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "member_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      member_voice_likes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          voice_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          voice_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_voice_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_voice_likes_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "member_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      member_voice_reports: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reporter_user_id: string
          voice_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_user_id: string
          voice_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_user_id?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_voice_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_voice_reports_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "member_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      member_voices: {
        Row: {
          author_label: string
          author_user_id: string
          author_user_union_id: string | null
          body: string
          company_label: string | null
          created_at: string
          display_mode: Database["app_nozolink"]["Enums"]["member_voice_display_mode"]
          id: string
          like_count: number
          report_count: number
          status: Database["app_nozolink"]["Enums"]["member_voice_status"]
          union_id: string | null
          updated_at: string
        }
        Insert: {
          author_label: string
          author_user_id: string
          author_user_union_id?: string | null
          body: string
          company_label?: string | null
          created_at?: string
          display_mode?: Database["app_nozolink"]["Enums"]["member_voice_display_mode"]
          id?: string
          like_count?: number
          report_count?: number
          status?: Database["app_nozolink"]["Enums"]["member_voice_status"]
          union_id?: string | null
          updated_at?: string
        }
        Update: {
          author_label?: string
          author_user_id?: string
          author_user_union_id?: string | null
          body?: string
          company_label?: string | null
          created_at?: string
          display_mode?: Database["app_nozolink"]["Enums"]["member_voice_display_mode"]
          id?: string
          like_count?: number
          report_count?: number
          status?: Database["app_nozolink"]["Enums"]["member_voice_status"]
          union_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_voices_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_voices_author_user_union_id_fkey"
            columns: ["author_user_union_id"]
            isOneToOne: false
            referencedRelation: "user_unions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_voices_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_requests: {
        Row: {
          attempts: number
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          ip_address: unknown
          otp_hash: string
          phone_hash: string
          purpose: string
        }
        Insert: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: unknown
          otp_hash: string
          phone_hash: string
          purpose?: string
        }
        Update: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: unknown
          otp_hash?: string
          phone_hash?: string
          purpose?: string
        }
        Relationships: []
      }
      post_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comment_reports: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          reason: string | null
          reporter_user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          reason?: string | null
          reporter_user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          reporter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comment_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_label: string
          author_user_id: string
          author_user_union_id: string | null
          body: string
          created_at: string
          display_mode: Database["app_nozolink"]["Enums"]["post_comment_display_mode"]
          id: string
          like_count: number
          parent_comment_id: string | null
          post_id: string
          reply_count: number
          report_count: number
          status: Database["app_nozolink"]["Enums"]["post_comment_status"]
          union_id: string
          updated_at: string
        }
        Insert: {
          author_label: string
          author_user_id: string
          author_user_union_id?: string | null
          body: string
          created_at?: string
          display_mode?: Database["app_nozolink"]["Enums"]["post_comment_display_mode"]
          id?: string
          like_count?: number
          parent_comment_id?: string | null
          post_id: string
          reply_count?: number
          report_count?: number
          status?: Database["app_nozolink"]["Enums"]["post_comment_status"]
          union_id: string
          updated_at?: string
        }
        Update: {
          author_label?: string
          author_user_id?: string
          author_user_union_id?: string | null
          body?: string
          created_at?: string
          display_mode?: Database["app_nozolink"]["Enums"]["post_comment_display_mode"]
          id?: string
          like_count?: number
          parent_comment_id?: string | null
          post_id?: string
          reply_count?: number
          report_count?: number
          status?: Database["app_nozolink"]["Enums"]["post_comment_status"]
          union_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_author_user_union_id_fkey"
            columns: ["author_user_union_id"]
            isOneToOne: false
            referencedRelation: "user_unions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "union_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      union_agenda_events: {
        Row: {
          actor_admin_user_id: string | null
          agenda_id: string
          created_at: string
          event_type: string
          from_status:
            | Database["app_nozolink"]["Enums"]["union_agenda_status"]
            | null
          id: string
          metadata: Json
          note: string | null
          to_status:
            | Database["app_nozolink"]["Enums"]["union_agenda_status"]
            | null
        }
        Insert: {
          actor_admin_user_id?: string | null
          agenda_id: string
          created_at?: string
          event_type: string
          from_status?:
            | Database["app_nozolink"]["Enums"]["union_agenda_status"]
            | null
          id?: string
          metadata?: Json
          note?: string | null
          to_status?:
            | Database["app_nozolink"]["Enums"]["union_agenda_status"]
            | null
        }
        Update: {
          actor_admin_user_id?: string | null
          agenda_id?: string
          created_at?: string
          event_type?: string
          from_status?:
            | Database["app_nozolink"]["Enums"]["union_agenda_status"]
            | null
          id?: string
          metadata?: Json
          note?: string | null
          to_status?:
            | Database["app_nozolink"]["Enums"]["union_agenda_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "union_agenda_events_actor_admin_user_id_fkey"
            columns: ["actor_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_agenda_events_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "union_agendas"
            referencedColumns: ["id"]
          },
        ]
      }
      union_agendas: {
        Row: {
          created_at: string
          decided_at: string | null
          due_at: string | null
          id: string
          metadata: Json
          status: Database["app_nozolink"]["Enums"]["union_agenda_status"]
          submitted_by_admin_user_id: string | null
          summary: string | null
          title: string
          union_id: string
          updated_at: string
          visibility: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          status?: Database["app_nozolink"]["Enums"]["union_agenda_status"]
          submitted_by_admin_user_id?: string | null
          summary?: string | null
          title: string
          union_id: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          status?: Database["app_nozolink"]["Enums"]["union_agenda_status"]
          submitted_by_admin_user_id?: string | null
          summary?: string | null
          title?: string
          union_id?: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "union_agendas_submitted_by_admin_user_id_fkey"
            columns: ["submitted_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_agendas_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_calendar_events: {
        Row: {
          agenda_id: string | null
          created_at: string
          created_by_admin_user_id: string | null
          description: string | null
          ends_at: string | null
          event_type: string
          id: string
          location: string | null
          metadata: Json
          related_feature_id: string | null
          starts_at: string
          title: string
          union_id: string
          updated_at: string
          visibility: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
          vote_id: string | null
        }
        Insert: {
          agenda_id?: string | null
          created_at?: string
          created_by_admin_user_id?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          metadata?: Json
          related_feature_id?: string | null
          starts_at: string
          title: string
          union_id: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
          vote_id?: string | null
        }
        Update: {
          agenda_id?: string | null
          created_at?: string
          created_by_admin_user_id?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          metadata?: Json
          related_feature_id?: string | null
          starts_at?: string
          title?: string
          union_id?: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
          vote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "union_calendar_events_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "union_agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_calendar_events_created_by_admin_user_id_fkey"
            columns: ["created_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_calendar_events_related_feature_id_fkey"
            columns: ["related_feature_id"]
            isOneToOne: false
            referencedRelation: "admin_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_calendar_events_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_calendar_events_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "union_votes"
            referencedColumns: ["id"]
          },
        ]
      }
      union_creation_requests: {
        Row: {
          company_name: string | null
          contact_info: string | null
          created_at: string
          created_union_id: string | null
          expected_member_count: number | null
          id: string
          reason: string | null
          requester_user_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_admin_user_id: string | null
          status: Database["app_nozolink"]["Enums"]["union_request_status"]
          union_kind: Database["app_nozolink"]["Enums"]["union_kind"]
          union_name: string
          updated_at: string
          website_url: string | null
          workplace: string | null
        }
        Insert: {
          company_name?: string | null
          contact_info?: string | null
          created_at?: string
          created_union_id?: string | null
          expected_member_count?: number | null
          id?: string
          reason?: string | null
          requester_user_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_user_id?: string | null
          status?: Database["app_nozolink"]["Enums"]["union_request_status"]
          union_kind?: Database["app_nozolink"]["Enums"]["union_kind"]
          union_name: string
          updated_at?: string
          website_url?: string | null
          workplace?: string | null
        }
        Update: {
          company_name?: string | null
          contact_info?: string | null
          created_at?: string
          created_union_id?: string | null
          expected_member_count?: number | null
          id?: string
          reason?: string | null
          requester_user_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_user_id?: string | null
          status?: Database["app_nozolink"]["Enums"]["union_request_status"]
          union_kind?: Database["app_nozolink"]["Enums"]["union_kind"]
          union_name?: string
          updated_at?: string
          website_url?: string | null
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "union_creation_requests_created_union_id_fkey"
            columns: ["created_union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_creation_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_creation_requests_reviewed_by_admin_user_id_fkey"
            columns: ["reviewed_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      union_inquiries: {
        Row: {
          body: string
          created_at: string
          honeypot_tripped: boolean
          id: string
          last_reply_at: string | null
          reply_count: number
          status: Database["app_nozolink"]["Enums"]["union_inquiry_status"]
          submitter_contact: string
          submitter_name: string
          submitter_user_id: string | null
          union_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          honeypot_tripped?: boolean
          id?: string
          last_reply_at?: string | null
          reply_count?: number
          status?: Database["app_nozolink"]["Enums"]["union_inquiry_status"]
          submitter_contact: string
          submitter_name: string
          submitter_user_id?: string | null
          union_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          honeypot_tripped?: boolean
          id?: string
          last_reply_at?: string | null
          reply_count?: number
          status?: Database["app_nozolink"]["Enums"]["union_inquiry_status"]
          submitter_contact?: string
          submitter_name?: string
          submitter_user_id?: string | null
          union_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_inquiries_submitter_user_id_fkey"
            columns: ["submitter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_inquiries_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_inquiry_replies: {
        Row: {
          author_label: string
          author_role: Database["app_nozolink"]["Enums"]["inquiry_reply_author"]
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          inquiry_id: string
        }
        Insert: {
          author_label: string
          author_role: Database["app_nozolink"]["Enums"]["inquiry_reply_author"]
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          inquiry_id: string
        }
        Update: {
          author_label?: string
          author_role?: Database["app_nozolink"]["Enums"]["inquiry_reply_author"]
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          inquiry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_inquiry_replies_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_inquiry_replies_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "union_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      union_meeting_minutes: {
        Row: {
          approved_at: string | null
          approved_by_admin_user_id: string | null
          body: string | null
          created_at: string
          created_by_admin_user_id: string | null
          id: string
          meeting_id: string
          metadata: Json
          published_at: string | null
          status: Database["app_nozolink"]["Enums"]["union_minutes_status"]
          title: string
          updated_at: string
          version: number
          visibility: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Insert: {
          approved_at?: string | null
          approved_by_admin_user_id?: string | null
          body?: string | null
          created_at?: string
          created_by_admin_user_id?: string | null
          id?: string
          meeting_id: string
          metadata?: Json
          published_at?: string | null
          status?: Database["app_nozolink"]["Enums"]["union_minutes_status"]
          title: string
          updated_at?: string
          version?: number
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Update: {
          approved_at?: string | null
          approved_by_admin_user_id?: string | null
          body?: string | null
          created_at?: string
          created_by_admin_user_id?: string | null
          id?: string
          meeting_id?: string
          metadata?: Json
          published_at?: string | null
          status?: Database["app_nozolink"]["Enums"]["union_minutes_status"]
          title?: string
          updated_at?: string
          version?: number
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "union_meeting_minutes_approved_by_admin_user_id_fkey"
            columns: ["approved_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_meeting_minutes_created_by_admin_user_id_fkey"
            columns: ["created_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_meeting_minutes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "union_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      union_meetings: {
        Row: {
          agenda_id: string | null
          calendar_event_id: string | null
          created_at: string
          created_by_admin_user_id: string | null
          ends_at: string | null
          id: string
          location: string | null
          meeting_type: string
          metadata: Json
          starts_at: string | null
          status: Database["app_nozolink"]["Enums"]["union_meeting_status"]
          title: string
          union_id: string
          updated_at: string
          visibility: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Insert: {
          agenda_id?: string | null
          calendar_event_id?: string | null
          created_at?: string
          created_by_admin_user_id?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          meeting_type?: string
          metadata?: Json
          starts_at?: string | null
          status?: Database["app_nozolink"]["Enums"]["union_meeting_status"]
          title: string
          union_id: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Update: {
          agenda_id?: string | null
          calendar_event_id?: string | null
          created_at?: string
          created_by_admin_user_id?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          meeting_type?: string
          metadata?: Json
          starts_at?: string | null
          status?: Database["app_nozolink"]["Enums"]["union_meeting_status"]
          title?: string
          union_id?: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "union_meetings_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "union_agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_meetings_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "union_calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_meetings_created_by_admin_user_id_fkey"
            columns: ["created_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_meetings_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_offline_count_requests: {
        Row: {
          id: string
          note: string | null
          previous_count: number
          requested_at: string
          requested_by: string | null
          requested_count: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          union_id: string
        }
        Insert: {
          id?: string
          note?: string | null
          previous_count?: number
          requested_at?: string
          requested_by?: string | null
          requested_count: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          union_id: string
        }
        Update: {
          id?: string
          note?: string | null
          previous_count?: number
          requested_at?: string
          requested_by?: string | null
          requested_count?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          union_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_offline_count_requests_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_offline_import_batches: {
        Row: {
          column_mapping: Json
          created_at: string
          created_by: string | null
          filename: string | null
          id: string
          inserted_count: number
          skipped_count: number
          total_rows: number
          union_id: string
          updated_count: number
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          inserted_count?: number
          skipped_count?: number
          total_rows?: number
          union_id: string
          updated_count?: number
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          inserted_count?: number
          skipped_count?: number
          total_rows?: number
          union_id?: string
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "union_offline_import_batches_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_offline_members: {
        Row: {
          batch_id: string | null
          birth_date: string
          created_at: string
          created_by: string | null
          extra: Json
          gender: string | null
          id: string
          linked_at: string | null
          linked_user_id: string | null
          member_key: string
          name: string
          phone: string | null
          source: string
          status: string
          union_id: string
          updated_at: string
          workplace: string | null
        }
        Insert: {
          batch_id?: string | null
          birth_date: string
          created_at?: string
          created_by?: string | null
          extra?: Json
          gender?: string | null
          id?: string
          linked_at?: string | null
          linked_user_id?: string | null
          member_key: string
          name: string
          phone?: string | null
          source?: string
          status?: string
          union_id: string
          updated_at?: string
          workplace?: string | null
        }
        Update: {
          batch_id?: string | null
          birth_date?: string
          created_at?: string
          created_by?: string | null
          extra?: Json
          gender?: string | null
          id?: string
          linked_at?: string | null
          linked_user_id?: string | null
          member_key?: string
          name?: string
          phone?: string | null
          source?: string
          status?: string
          union_id?: string
          updated_at?: string
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "union_offline_members_linked_user_id_fkey"
            columns: ["linked_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_offline_members_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_operational_snapshots: {
        Row: {
          active_member_count: number
          created_at: string
          dues_paid_amount: number
          dues_unpaid_count: number
          id: string
          metadata: Json
          open_agenda_count: number
          open_vote_count: number
          pending_member_count: number
          snapshot_date: string
          union_id: string
          updated_at: string
        }
        Insert: {
          active_member_count?: number
          created_at?: string
          dues_paid_amount?: number
          dues_unpaid_count?: number
          id?: string
          metadata?: Json
          open_agenda_count?: number
          open_vote_count?: number
          pending_member_count?: number
          snapshot_date?: string
          union_id: string
          updated_at?: string
        }
        Update: {
          active_member_count?: number
          created_at?: string
          dues_paid_amount?: number
          dues_unpaid_count?: number
          id?: string
          metadata?: Json
          open_agenda_count?: number
          open_vote_count?: number
          pending_member_count?: number
          snapshot_date?: string
          union_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_operational_snapshots_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          union_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          union_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          union_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "labor_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_organization_memberships_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_posts: {
        Row: {
          author_admin_user_id: string | null
          body: string
          created_at: string
          id: string
          is_published: boolean
          post_type: Database["app_nozolink"]["Enums"]["union_post_type"]
          published_at: string | null
          title: string
          union_id: string
          updated_at: string
          visibility: Database["app_nozolink"]["Enums"]["union_post_visibility"]
        }
        Insert: {
          author_admin_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_published?: boolean
          post_type?: Database["app_nozolink"]["Enums"]["union_post_type"]
          published_at?: string | null
          title: string
          union_id: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_post_visibility"]
        }
        Update: {
          author_admin_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_published?: boolean
          post_type?: Database["app_nozolink"]["Enums"]["union_post_type"]
          published_at?: string | null
          title?: string
          union_id?: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_post_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "union_posts_author_admin_user_id_fkey"
            columns: ["author_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_posts_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_request_organizations: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          union_creation_request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          union_creation_request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          union_creation_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_request_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "labor_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_request_organizations_union_creation_request_id_fkey"
            columns: ["union_creation_request_id"]
            isOneToOne: false
            referencedRelation: "union_creation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      union_resources: {
        Row: {
          created_at: string
          created_by_admin_user_id: string | null
          description: string | null
          external_url: string | null
          file_path: string | null
          id: string
          is_published: boolean
          metadata: Json
          published_at: string | null
          resource_type: string
          title: string
          union_id: string
          updated_at: string
          version_label: string | null
          visibility: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Insert: {
          created_at?: string
          created_by_admin_user_id?: string | null
          description?: string | null
          external_url?: string | null
          file_path?: string | null
          id?: string
          is_published?: boolean
          metadata?: Json
          published_at?: string | null
          resource_type?: string
          title: string
          union_id: string
          updated_at?: string
          version_label?: string | null
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Update: {
          created_at?: string
          created_by_admin_user_id?: string | null
          description?: string | null
          external_url?: string | null
          file_path?: string | null
          id?: string
          is_published?: boolean
          metadata?: Json
          published_at?: string | null
          resource_type?: string
          title?: string
          union_id?: string
          updated_at?: string
          version_label?: string | null
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "union_resources_created_by_admin_user_id_fkey"
            columns: ["created_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_resources_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_stats: {
        Row: {
          id: string
          total_members: number
          trend_joined_dates: string[]
          updated_at: string
        }
        Insert: {
          id?: string
          total_members?: number
          trend_joined_dates?: string[]
          updated_at?: string
        }
        Update: {
          id?: string
          total_members?: number
          trend_joined_dates?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      union_vote_ballots: {
        Row: {
          abstained: boolean
          cast_at: string
          id: string
          metadata: Json
          option_id: string | null
          user_union_id: string
          vote_id: string
        }
        Insert: {
          abstained?: boolean
          cast_at?: string
          id?: string
          metadata?: Json
          option_id?: string | null
          user_union_id: string
          vote_id: string
        }
        Update: {
          abstained?: boolean
          cast_at?: string
          id?: string
          metadata?: Json
          option_id?: string | null
          user_union_id?: string
          vote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_vote_ballots_option_vote_fk"
            columns: ["vote_id", "option_id"]
            isOneToOne: false
            referencedRelation: "union_vote_options"
            referencedColumns: ["vote_id", "id"]
          },
          {
            foreignKeyName: "union_vote_ballots_user_union_id_fkey"
            columns: ["user_union_id"]
            isOneToOne: false
            referencedRelation: "user_unions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_vote_ballots_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "union_votes"
            referencedColumns: ["id"]
          },
        ]
      }
      union_vote_options: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
          metadata: Json
          sort_order: number
          vote_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          label: string
          metadata?: Json
          sort_order?: number
          vote_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          metadata?: Json
          sort_order?: number
          vote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_vote_options_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "union_votes"
            referencedColumns: ["id"]
          },
        ]
      }
      union_votes: {
        Row: {
          agenda_id: string | null
          allow_abstain: boolean
          created_at: string
          created_by_admin_user_id: string | null
          description: string | null
          ends_at: string | null
          id: string
          metadata: Json
          result_summary: Json
          starts_at: string | null
          status: Database["app_nozolink"]["Enums"]["union_vote_status"]
          title: string
          union_id: string
          updated_at: string
          visibility: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
          voter_scope: Json
        }
        Insert: {
          agenda_id?: string | null
          allow_abstain?: boolean
          created_at?: string
          created_by_admin_user_id?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          result_summary?: Json
          starts_at?: string | null
          status?: Database["app_nozolink"]["Enums"]["union_vote_status"]
          title: string
          union_id: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
          voter_scope?: Json
        }
        Update: {
          agenda_id?: string | null
          allow_abstain?: boolean
          created_at?: string
          created_by_admin_user_id?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          result_summary?: Json
          starts_at?: string | null
          status?: Database["app_nozolink"]["Enums"]["union_vote_status"]
          title?: string
          union_id?: string
          updated_at?: string
          visibility?: Database["app_nozolink"]["Enums"]["union_admin_visibility"]
          voter_scope?: Json
        }
        Relationships: [
          {
            foreignKeyName: "union_votes_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "union_agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_votes_created_by_admin_user_id_fkey"
            columns: ["created_by_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_votes_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      union_workplace_eligibilities: {
        Row: {
          created_at: string
          id: string
          union_id: string
          workplace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          union_id: string
          workplace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          union_id?: string
          workplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "union_workplace_eligibilities_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "union_workplace_eligibilities_workplace_id_fkey"
            columns: ["workplace_id"]
            isOneToOne: false
            referencedRelation: "workplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      unions: {
        Row: {
          admin_metadata: Json
          all_workplaces_allowed: boolean
          contact_info: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          offline_member_count: number
          parent_union_id: string | null
          public_metadata: Json
          short_name: string | null
          sort_order: number
          theme: string
          union_kind: Database["app_nozolink"]["Enums"]["union_kind"]
          website_url: string | null
        }
        Insert: {
          admin_metadata?: Json
          all_workplaces_allowed?: boolean
          contact_info?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          offline_member_count?: number
          parent_union_id?: string | null
          public_metadata?: Json
          short_name?: string | null
          sort_order?: number
          theme?: string
          union_kind?: Database["app_nozolink"]["Enums"]["union_kind"]
          website_url?: string | null
        }
        Update: {
          admin_metadata?: Json
          all_workplaces_allowed?: boolean
          contact_info?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          offline_member_count?: number
          parent_union_id?: string | null
          public_metadata?: Json
          short_name?: string | null
          sort_order?: number
          theme?: string
          union_kind?: Database["app_nozolink"]["Enums"]["union_kind"]
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unions_parent_union_id_fkey"
            columns: ["parent_union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_unions: {
        Row: {
          company_info: string | null
          id: string
          join_visibility: string | null
          joined_at: string
          member_admin_metadata: Json
          member_public_metadata: Json
          status: Database["app_nozolink"]["Enums"]["union_membership_status"]
          union_id: string
          updated_at: string
          user_id: string
          workplace_id: string | null
        }
        Insert: {
          company_info?: string | null
          id?: string
          join_visibility?: string | null
          joined_at?: string
          member_admin_metadata?: Json
          member_public_metadata?: Json
          status?: Database["app_nozolink"]["Enums"]["union_membership_status"]
          union_id: string
          updated_at?: string
          user_id: string
          workplace_id?: string | null
        }
        Update: {
          company_info?: string | null
          id?: string
          join_visibility?: string | null
          joined_at?: string
          member_admin_metadata?: Json
          member_public_metadata?: Json
          status?: Database["app_nozolink"]["Enums"]["union_membership_status"]
          union_id?: string
          updated_at?: string
          user_id?: string
          workplace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_unions_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unions_workplace_id_fkey"
            columns: ["workplace_id"]
            isOneToOne: false
            referencedRelation: "workplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          birth_date: string | null
          company_name: string | null
          created_at: string
          id: string
          name: string
          nickname: string | null
          phone_encrypted: string | null
          phone_hash: string | null
          phone_last4: string | null
          updated_at: string
          workplace_id: string | null
        }
        Insert: {
          birth_date?: string | null
          company_name?: string | null
          created_at?: string
          id: string
          name: string
          nickname?: string | null
          phone_encrypted?: string | null
          phone_hash?: string | null
          phone_last4?: string | null
          updated_at?: string
          workplace_id?: string | null
        }
        Update: {
          birth_date?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          name?: string
          nickname?: string | null
          phone_encrypted?: string | null
          phone_hash?: string | null
          phone_last4?: string | null
          updated_at?: string
          workplace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_workplace_id_fkey"
            columns: ["workplace_id"]
            isOneToOne: false
            referencedRelation: "workplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workplace_union_presences: {
        Row: {
          created_at: string
          id: string
          union_id: string
          workplace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          union_id: string
          workplace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          union_id?: string
          workplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workplace_union_presences_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workplace_union_presences_workplace_id_fkey"
            columns: ["workplace_id"]
            isOneToOne: false
            referencedRelation: "workplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workplaces: {
        Row: {
          address: string | null
          admin_notes: string | null
          category: string | null
          contact_info: string | null
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
          is_listed: boolean
          name: string
          normalized_name: string
          region: string | null
          related_keywords: string[]
          sort_order: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_notes?: string | null
          category?: string | null
          contact_info?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_listed?: boolean
          name: string
          normalized_name?: string
          region?: string | null
          related_keywords?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_notes?: string | null
          category?: string | null
          contact_info?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_listed?: boolean
          name?: string
          normalized_name?: string
          region?: string | null
          related_keywords?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_union_role: {
        Args: {
          p_roles: Database["app_nozolink"]["Enums"]["admin_role"][]
          p_union_id: string
        }
        Returns: boolean
      }
      is_app_admin: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_union_member: { Args: { p_union_id: string }; Returns: boolean }
      normalize_workplace_name: { Args: { input: string }; Returns: string }
    }
    Enums: {
      admin_feature_category:
        | "member"
        | "governance"
        | "records"
        | "insights"
        | "system"
      admin_feature_status: "available" | "planned" | "disabled"
      admin_role: "admin" | "owner" | "manager"
      dues_payment_status: "paid" | "unpaid" | "waived" | "refunded"
      inquiry_reply_author: "admin" | "submitter"
      labor_organization_type:
        | "confederation"
        | "federation"
        | "regional_headquarters"
        | "alliance"
        | "solidarity_network"
        | "council"
        | "other"
      member_voice_display_mode: "nickname" | "masked" | "anonymous" | "name"
      member_voice_status: "visible" | "hidden" | "removed"
      post_comment_display_mode: "name" | "nickname" | "masked" | "anonymous"
      post_comment_status: "visible" | "hidden" | "removed"
      profile_visibility: "public" | "private"
      union_admin_visibility: "admins" | "members" | "public"
      union_agenda_status:
        | "draft"
        | "submitted"
        | "reviewing"
        | "voting"
        | "approved"
        | "rejected"
        | "archived"
      union_inquiry_status: "open" | "answered" | "closed" | "spam"
      union_kind:
        | "enterprise"
        | "industrial"
        | "supra_enterprise"
        | "branch"
        | "local"
        | "other"
      union_meeting_status: "scheduled" | "completed" | "cancelled"
      union_membership_status: "pending" | "active" | "paused" | "withdrawn"
      union_minutes_status: "draft" | "approved" | "published" | "archived"
      union_post_type: "news" | "notice"
      union_post_visibility: "public" | "members"
      union_request_status: "pending" | "approved" | "rejected" | "cancelled"
      union_vote_status: "draft" | "scheduled" | "open" | "closed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  app_open_vote: {
    Tables: {
      api_clients: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          last_used_at: string | null
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          last_used_at?: string | null
          name: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          last_used_at?: string | null
          name?: string
          owner_user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          created_at: string
          details: Json
          election_id: string | null
          event_type: string
          id: string
          ip_address: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          election_id?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          election_id?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: []
      }
      ballots: {
        Row: {
          chain_hash: string | null
          election_id: string
          id: string
          previous_chain_hash: string | null
          receipt_hash: string | null
          selected_candidate: string
          sequence_number: number | null
        }
        Insert: {
          chain_hash?: string | null
          election_id: string
          id?: string
          previous_chain_hash?: string | null
          receipt_hash?: string | null
          selected_candidate: string
          sequence_number?: number | null
        }
        Update: {
          chain_hash?: string | null
          election_id?: string
          id?: string
          previous_chain_hash?: string | null
          receipt_hash?: string | null
          selected_candidate?: string
          sequence_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ballots_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_accounts: {
        Row: {
          balance: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          election_id: string | null
          id: string
          memo: string | null
          tx_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          election_id?: string | null
          id?: string
          memo?: string | null
          tx_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          election_id?: string | null
          id?: string
          memo?: string | null
          tx_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      elections: {
        Row: {
          candidates: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          name: string
          starts_at: string | null
          status: string
          total_voter_codes: number
          updated_at: string | null
        }
        Insert: {
          candidates?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          name: string
          starts_at?: string | null
          status?: string
          total_voter_codes?: number
          updated_at?: string | null
        }
        Update: {
          candidates?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          starts_at?: string | null
          status?: string
          total_voter_codes?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          attempt_count: number
          blocked_until: string | null
          created_at: string | null
          endpoint: string
          id: number
          ip_address: string
          last_attempt_at: string | null
        }
        Insert: {
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string | null
          endpoint: string
          id?: number
          ip_address: string
          last_attempt_at?: string | null
        }
        Update: {
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string | null
          endpoint?: string
          id?: number
          ip_address?: string
          last_attempt_at?: string | null
        }
        Relationships: []
      }
      voter_codes: {
        Row: {
          code: string
          created_at: string | null
          election_id: string
          id: string
          is_used: boolean
          phone_suffix: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          election_id: string
          id?: string
          is_used?: boolean
          phone_suffix: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          election_id?: string
          id?: string
          is_used?: boolean
          phone_suffix?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voter_codes_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      voter_registry: {
        Row: {
          access_token_hash: string | null
          created_at: string
          election_id: string
          email: string | null
          has_voted: boolean
          id: string
          invited_at: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
          voted_at: string | null
          voter_name: string | null
        }
        Insert: {
          access_token_hash?: string | null
          created_at?: string
          election_id: string
          email?: string | null
          has_voted?: boolean
          id?: string
          invited_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          voted_at?: string | null
          voter_name?: string | null
        }
        Update: {
          access_token_hash?: string | null
          created_at?: string
          election_id?: string
          email?: string | null
          has_voted?: boolean
          id?: string
          invited_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          voted_at?: string | null
          voter_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voter_registry_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_credits: {
        Args: {
          p_actor?: string
          p_amount: number
          p_memo?: string
          p_tx_type: string
          p_user_id: string
        }
        Returns: Json
      }
      cast_anonymous_vote: {
        Args: {
          p_code: string
          p_election_id: string
          p_phone_suffix: string
          p_selected_candidate: string
        }
        Returns: Json
      }
      cast_link_vote: {
        Args: {
          p_election_id: string
          p_receipt_hash: string
          p_selected_candidate: string
          p_token_hash: string
        }
        Returns: Json
      }
      cast_registered_vote:
        | {
            Args: {
              p_election_id: string
              p_selected_candidate: string
              p_user_email: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_election_id: string
              p_receipt_hash: string
              p_selected_candidate: string
              p_user_email: string
              p_user_id: string
            }
            Returns: Json
          }
      create_billed_election: {
        Args: {
          p_candidates: Json
          p_creator: string
          p_description: string
          p_ends_at?: string
          p_name: string
          p_starts_at?: string
          p_unit_price: number
          p_voters: Json
        }
        Returns: Json
      }
      find_user_id_by_email: {
        Args: { p_email: string }
        Returns: string
      }
      generate_voter_codes_batch: {
        Args: {
          p_count: number
          p_election_id: string
          p_phone_suffixes?: string[]
        }
        Returns: {
          code: string
          id: string
          phone_suffix: string
        }[]
      }
      get_election_stats: { Args: { p_election_id: string }; Returns: Json }
      get_public_ballot_ledger: {
        Args: { p_election_id: string }
        Returns: Json
      }
      get_vote_results: { Args: { p_election_id: string }; Returns: Json }
      record_rate_limit_attempt: {
        Args: {
          p_block_duration_ms: number
          p_endpoint: string
          p_ip_address: string
          p_max_attempts: number
        }
        Returns: undefined
      }
      rotate_voter_tokens: {
        Args: { p_election_id: string; p_tokens: Json }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  core: {
    Tables: {
      apps: {
        Row: {
          app_code: string
          created_at: string
          name: string
          schema_name: string
          status: string
        }
        Insert: {
          app_code: string
          created_at?: string
          name: string
          schema_name: string
          status?: string
        }
        Update: {
          app_code?: string
          created_at?: string
          name?: string
          schema_name?: string
          status?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          app_code: string
          created_at: string
          id: string
          role: Database["core"]["Enums"]["app_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_code: string
          created_at?: string
          id?: string
          role?: Database["core"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_code?: string
          created_at?: string
          id?: string
          role?: Database["core"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_app_code_fkey"
            columns: ["app_code"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["app_code"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_app_access: { Args: { p_app_code: string }; Returns: boolean }
      has_min_role: {
        Args: {
          p_app_code: string
          p_min: Database["core"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      my_memberships: {
        Args: never
        Returns: {
          app_code: string
          role: Database["core"]["Enums"]["app_role"]
          status: string
        }[]
      }
    }
    Enums: {
      app_role: "viewer" | "member" | "admin" | "owner"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  app_nozolink: {
    Enums: {
      admin_feature_category: [
        "member",
        "governance",
        "records",
        "insights",
        "system",
      ],
      admin_feature_status: ["available", "planned", "disabled"],
      admin_role: ["admin", "owner", "manager"],
      dues_payment_status: ["paid", "unpaid", "waived", "refunded"],
      inquiry_reply_author: ["admin", "submitter"],
      labor_organization_type: [
        "confederation",
        "federation",
        "regional_headquarters",
        "alliance",
        "solidarity_network",
        "council",
        "other",
      ],
      member_voice_display_mode: ["nickname", "masked", "anonymous", "name"],
      member_voice_status: ["visible", "hidden", "removed"],
      post_comment_display_mode: ["name", "nickname", "masked", "anonymous"],
      post_comment_status: ["visible", "hidden", "removed"],
      profile_visibility: ["public", "private"],
      union_admin_visibility: ["admins", "members", "public"],
      union_agenda_status: [
        "draft",
        "submitted",
        "reviewing",
        "voting",
        "approved",
        "rejected",
        "archived",
      ],
      union_inquiry_status: ["open", "answered", "closed", "spam"],
      union_kind: [
        "enterprise",
        "industrial",
        "supra_enterprise",
        "branch",
        "local",
        "other",
      ],
      union_meeting_status: ["scheduled", "completed", "cancelled"],
      union_membership_status: ["pending", "active", "paused", "withdrawn"],
      union_minutes_status: ["draft", "approved", "published", "archived"],
      union_post_type: ["news", "notice"],
      union_post_visibility: ["public", "members"],
      union_request_status: ["pending", "approved", "rejected", "cancelled"],
      union_vote_status: ["draft", "scheduled", "open", "closed", "cancelled"],
    },
  },
  app_open_vote: {
    Enums: {},
  },
  core: {
    Enums: {
      app_role: ["viewer", "member", "admin", "owner"],
    },
  },
  public: {
    Enums: {},
  },
} as const
