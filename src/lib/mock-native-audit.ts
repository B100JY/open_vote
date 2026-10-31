import type { Election, PublicBallotLedger, ElectionResults } from "./types.ts";
import type { SavedReceipt } from "./vote-receipt.ts";
import { canonical, commitment, eventHead, hashObject, newSecret, type Manifest, type AuditEvent, type Signed, type AuditBundle } from "./native-audit.ts";

export type MockNativeState = {
  privateKey: CryptoKey;
  manifest: Signed<Manifest>;
  votes: AuditEvent[];
  commitments: string[];
};

/** 테스트 브라우저 안에서만 임시 P-256 키를 생성한다. 운영 서명키·서버는 사용하지 않는다. */
async function sign<T>(key: CryptoKey, payload: T, keyId: string): Promise<Signed<T>> {
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(canonical(payload)));
  return { payload, keyId, signature: [...new Uint8Array(signature)].map(x => x.toString(16).padStart(2, "0")).join("") };
}

export async function createMockNativeState(election: Election): Promise<MockNativeState> {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const keyId = await hashObject(publicKey);
  const payload: Manifest = {
    format: "moai-manifest-v1",
    election: {
      id: election.id, name: election.name, description: election.description,
      candidates: election.candidates, ballot_type: election.ballot_type,
      min_choices: election.min_choices, max_choices: election.max_choices,
      allow_blank: election.allow_blank, starts_at: election.starts_at, ends_at: election.ends_at,
    },
    electorate: 1000, smsRequired: false, singleCast: true,
    publicKey, keyId,
  };
  return { privateKey: keys.privateKey, manifest: await sign(keys.privateKey, payload, keyId), votes: [], commitments: [] };
}

export async function appendMockNativeVote(state: MockNativeState, receipt: SavedReceipt) {
  if (state.commitments.length >= 1000) throw new Error("테스트 선거는 1000표까지만 접수합니다.");
  const secret = newSecret();
  const manifestHash = await hashObject(state.manifest.payload);
  const value = await commitment(receipt.electionId, manifestHash, receipt.receiptHash, secret);
  const previous = state.votes.at(-1)?.head ?? manifestHash;
  const event: AuditEvent = {
    format: "moai-event-v1", electionId: receipt.electionId, manifestHash,
    index: state.votes.length + 1, kind: "vote", payload: { commitment: value },
    previous, head: "",
  };
  event.head = await eventHead(event);
  const witness = await sign(state.privateKey, event, state.manifest.payload.keyId);
  return {
    state: { ...state, votes: [...state.votes, event], commitments: [...state.commitments, value] },
    receipt: { ...receipt, audit: { secret, commitment: value, manifest: state.manifest, witness } } satisfies SavedReceipt,
  };
}

/** 실제 verifyBundle 이 해석하는 동일한 공개 묶음 구조로 모의 마감 스냅샷을 만든다. */
export async function makeMockAuditBundle(state: MockNativeState, ledger: PublicBallotLedger, results: ElectionResults): Promise<AuditBundle> {
  const manifestHash = await hashObject(state.manifest.payload);
  const final: AuditEvent = {
    format: "moai-event-v1", electionId: state.manifest.payload.election.id,
    manifestHash, index: state.votes.length + 1, kind: "final",
    previous: state.votes.at(-1)?.head ?? manifestHash,
    payload: {
      ballotCount: ledger.ballot_count,
      ledgerHash: ledger.ledger_hash,
      commitmentHash: await hashObject([...state.commitments].sort()),
      resultHash: await hashObject(results),
    }, head: "",
  };
  final.head = await eventHead(final);
  return { format: "moai-audit-bundle-v1", manifest: state.manifest, events: [...state.votes, final], ledger, results,
    final: await sign(state.privateKey, final, state.manifest.payload.keyId) };
}
