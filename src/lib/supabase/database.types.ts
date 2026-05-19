import type { ElectionStatus } from "@/lib/types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type ElectionRow = {
  id: string;
  name: string;
  description: string | null;
  candidates: Json;
  total_voter_codes: number;
  status: ElectionStatus;
  created_by: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type VoterCodeRow = {
  id: string;
  election_id: string;
  code: string;
  phone_suffix: string;
  is_used: boolean;
  used_at: string | null;
  created_at: string;
};

type VoterRegistryRow = {
  id: string;
  election_id: string;
  user_id: string | null;
  email: string;
  has_voted: boolean;
  invited_at: string | null;
  voted_at: string | null;
  created_at: string;
  updated_at: string;
};

type BallotRow = {
  id: string;
  election_id: string;
  selected_candidate: string;
  sequence_number: number | null;
  receipt_hash: string | null;
  previous_chain_hash: string | null;
  chain_hash: string | null;
};

type RateLimitRow = {
  id: number;
  ip_address: string;
  endpoint: string;
  attempt_count: number;
  last_attempt_at: string | null;
  blocked_until: string | null;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  event_type: string;
  election_id: string | null;
  details: Json;
  ip_address: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      elections: Table<
        ElectionRow,
        Partial<ElectionRow> & {
          name: string;
          candidates?: Json;
        },
        Partial<ElectionRow>
      >;
      voter_codes: Table<VoterCodeRow>;
      voter_registry: Table<
        VoterRegistryRow,
        Partial<VoterRegistryRow> & {
          election_id: string;
          email: string;
        },
        Partial<VoterRegistryRow>
      >;
      ballots: Table<BallotRow>;
      rate_limits: Table<
        RateLimitRow,
        Partial<RateLimitRow> & {
          ip_address: string;
          endpoint: string;
        },
        Partial<RateLimitRow>
      >;
      audit_logs: Table<
        AuditLogRow,
        Partial<AuditLogRow> & {
          event_type: string;
        },
        Partial<AuditLogRow>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      cast_anonymous_vote: {
        Args: {
          p_election_id: string;
          p_code: string;
          p_phone_suffix: string;
          p_selected_candidate: string;
        };
        Returns: {
          success: boolean;
          error?: string;
          message?: string;
        };
      };
      cast_registered_vote: {
        Args: {
          p_election_id: string;
          p_user_id: string;
          p_user_email: string | null;
          p_selected_candidate: string;
          p_receipt_hash: string;
        };
        Returns: {
          success: boolean;
          error?: string;
          message?: string;
          receipt_hash?: string;
          sequence_number?: number;
          chain_hash?: string;
        };
      };
      generate_voter_codes_batch: {
        Args: {
          p_election_id: string;
          p_count: number;
          p_phone_suffixes?: string[] | null;
        };
        Returns: Array<{
          id: string;
          code: string;
          phone_suffix: string;
        }>;
      };
      get_election_stats: {
        Args: {
          p_election_id: string;
        };
        Returns: Json;
      };
      get_vote_results: {
        Args: {
          p_election_id: string;
        };
        Returns: Json;
      };
      get_public_ballot_ledger: {
        Args: {
          p_election_id: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
