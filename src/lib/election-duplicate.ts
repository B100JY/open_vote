import type { BallotType, Candidate, Election } from "./types.ts";

/** Only reusable ballot settings; deliberately excludes IDs, dates and voters. */
export type ElectionDuplicateTemplate = {
  name: string;
  organizationName: string;
  description: string;
  descriptionPublic: boolean;
  smsTitle: string;
  voterMode: "sms" | "email";
  ballotType: BallotType;
  minChoices: number;
  maxChoices: number;
  allowBlank: boolean;
  enableAudit: boolean;
  smsRequired: boolean;
  contentRestricted: boolean;
  candidates: Array<Pick<Candidate, "name" | "description">>;
};

export function makeElectionDuplicateTemplate(
  original: Election,
  smsRequired: boolean,
): ElectionDuplicateTemplate {
  return {
    name: original.name,
    organizationName: original.organization_name ?? "",
    description: original.description ?? "",
    descriptionPublic: original.description_public === true,
    smsTitle: original.sms_title ?? "",
    voterMode: original.auth_mode === "email_link" ? "email" : "sms",
    ballotType: original.ballot_type,
    minChoices: original.min_choices,
    maxChoices: original.max_choices,
    allowBlank: original.allow_blank,
    enableAudit: original.audit_version === 1,
    smsRequired: original.audit_version === 1 && smsRequired,
    contentRestricted: original.content_restricted !== false,
    candidates: original.candidates.map(({ name, description }) => ({
      name,
      ...(description ? { description } : {}),
    })),
  };
}
