import type { CandidateResult, Election, ElectionResults, PublicLedgerBallot } from "./types.ts";
import { BLANK_SELECTION } from "./ballot.ts";

/**
 * 관리자 브라우저 안에서만 쓰는 합성 집계.
 * 운영 DB의 get_election_results (20261010000000_ballot_types_and_secrecy.sql)와
 * 같은 투표 방식별 계산식을 적용한다. 운영 원장이나 API에 기록하지 않는다.
 */
export function mockElectionResults(election: Election, ballots: PublicLedgerBallot[]): ElectionResults {
  const total = ballots.length;
  const blank = ballots.filter(ballot => ballot.selection === BLANK_SELECTION).length;
  const valid = total - blank;
  const pct = (a: number, b: number) => b ? Math.round(a * 10000 / b) / 100 : 0;
  const candidates: CandidateResult[] = election.candidates.map(candidate => {
    const id = candidate.id;
    if (election.ballot_type === "approve") {
      let yes = 0, no = 0;
      for (const ballot of ballots) {
        const answer = ballot.selection.split(",").find(part => part.startsWith(id + ":"))?.slice(id.length + 1);
        if (answer === "yes") yes++;
        if (answer === "no") no++;
      }
      return { candidate_id: id, yes, no, yes_percentage: pct(yes, yes + no) };
    }
    if (election.ballot_type === "rank") {
      const rank_counts = Array.from({ length: election.max_choices }, () => 0);
      for (const ballot of ballots) {
        const rank = ballot.selection === BLANK_SELECTION ? -1 : ballot.selection.split(">").indexOf(id);
        if (rank >= 0 && rank < rank_counts.length) rank_counts[rank]++;
      }
      const votes = rank_counts.reduce((a, b) => a + b, 0);
      const points = rank_counts.reduce((a, b, i) => a + b * (election.max_choices - i), 0);
      const first_choice = rank_counts[0] ?? 0;
      return { candidate_id: id, votes, first_choice, points, rank_counts: votes ? rank_counts : [], percentage: pct(first_choice, valid) };
    }
    const votes = ballots.filter(ballot => ballot.selection !== BLANK_SELECTION && ballot.selection.split(",").includes(id)).length;
    return { candidate_id: id, votes, percentage: pct(votes, valid) };
  });
  return {
    election_id: election.id, ballot_type: election.ballot_type,
    min_choices: election.min_choices, max_choices: election.max_choices,
    total_ballots: total, blank_ballots: blank, valid_ballots: valid, candidates,
  };
}
