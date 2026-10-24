export type ElectionStatus = "draft" | "active" | "paused" | "closed";

export type BallotType = "single" | "multi" | "rank" | "approve";

export type BallotRules = {
  ballot_type: BallotType;
  min_choices: number;
  max_choices: number;
  allow_blank: boolean;
};

export type Candidate = {
  id: string;
  name: string;
  description?: string;
};

export type Election = BallotRules & {
  id: string;
  name: string;
  description: string | null;
  candidates: Candidate[];
  total_voter_codes: number;
  status: ElectionStatus;
  /** sms_token(문자 개인 링크) · email_link 등. 화면에서 투표 안내를 고르는 데만 쓴다. */
  auth_mode?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VoterRegistry = {
  id: string;
  election_id: string;
  user_id: string | null;
  email: string | null;
  phone: string | null;
  voter_name: string | null;
  has_voted: boolean;
  invited_at: string | null;
  created_at: string;
};

export type CreditTransaction = {
  id: string;
  amount: number;
  balance_after: number;
  tx_type: "charge" | "vote_creation" | "refund" | "admin_adjust" | string;
  election_id: string | null;
  memo: string | null;
  created_at: string;
};

export type CreditsSummary = {
  balance: number;
  unitPrice: number;
  isAdmin: boolean;
  transactions: CreditTransaction[];
};

export type SmsInviteResponse = {
  requested: number;
  sent: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  batchId: string | null;
  /** 중간에 멈춘 이유(앞 묶음은 발송됨) */
  stopped: string | null;
  failures: Array<{
    ref: string | null;
    phone: string;
    status: string;
    reason?: string | null;
  }>;
};

export type ElectionStats = {
  election: {
    id: string;
    name: string;
    status: ElectionStatus;
  };
  voter_codes: {
    total: number;
    used: number;
    remaining: number;
  };
  voter_registry?: {
    total: number;
    used: number;
    remaining: number;
  };
  ballots: {
    total: number;
  };
  progress: number;
};

export type CandidateResult = {
  candidate_id: string;
  /** single/multi: 득표, rank: 순위에 넣은 표 수 */
  votes?: number;
  /** single/multi: 유효표 대비 %, rank: 1순위 득표 % */
  percentage?: number;
  /** approve */
  yes?: number;
  no?: number;
  yes_percentage?: number;
  /** rank */
  first_choice?: number;
  points?: number;
  rank_counts?: number[];
};

export type ElectionResults = {
  election_id: string;
  ballot_type: BallotType;
  min_choices: number;
  max_choices: number;
  total_ballots: number;
  blank_ballots: number;
  valid_ballots: number;
  candidates: CandidateResult[];
};

export type PublicLedgerBallot = {
  receipt_hash: string;
  selection: string;
};

export type PublicBallotLedger = {
  election_id: string;
  ballot_count: number;
  ledger_hash: string;
  ballots: PublicLedgerBallot[];
};

export type ApiError = {
  success?: false;
  error?: string;
  message: string;
};
