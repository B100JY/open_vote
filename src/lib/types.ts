export type ElectionStatus = "draft" | "active" | "paused" | "closed";

export type Candidate = {
  id: string;
  name: string;
  description?: string;
};

export type Election = {
  id: string;
  name: string;
  description: string | null;
  candidates: Candidate[];
  total_voter_codes: number;
  status: ElectionStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VoterRegistry = {
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

export type VoteResultRow = {
  candidate_id: string;
  vote_count: number;
  percentage: number;
};

export type VoteResults = {
  election_id: string;
  total_votes: number;
  results: VoteResultRow[];
};

export type PublicLedgerBallot = {
  sequence_number: number;
  selected_candidate: string;
  receipt_hash: string;
  previous_chain_hash: string | null;
  chain_hash: string;
};

export type PublicBallotLedger = {
  election_id: string;
  ballot_count: number;
  final_chain_hash: string | null;
  ballots: PublicLedgerBallot[];
};

export type ApiError = {
  success?: false;
  error?: string;
  message: string;
};
