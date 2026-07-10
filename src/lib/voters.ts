/**
 * 유권자 명부 입력 정규화.
 *
 * 유권자는 휴대폰 번호(SMS 투표 링크) 또는 이메일(매직 링크) 중 하나 이상의
 * 연락처가 필요합니다. 전화번호는 숫자만 남겨 저장하며(01012345678),
 * 같은 선거 안에서 이메일/전화번호는 중복될 수 없습니다.
 */

export type NewVoter = {
  email?: string;
  phone?: string;
  name?: string;
};

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 휴대폰 번호를 숫자만 남겨 정규화. 유효하지 않으면 null (01로 시작, 10~11자리) */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return null;
  }
  const digits = String(raw).replace(/\D/g, "");
  if (!/^01[016789]\d{7,8}$/.test(digits)) {
    return null;
  }
  return digits;
}

export function formatPhone(digits: string | null | undefined): string {
  if (!digits) {
    return "-";
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export type CleanVotersResult = {
  voters: NewVoter[];
  /** 형식이 잘못돼 제외된 입력(오류 메시지 표시용) */
  invalid: string[];
};

/**
 * API 바디의 voters 배열([{phone, email, name}])을 정규화합니다.
 * - 전화번호/이메일 형식 검증, 이름 trim
 * - 선거 내 중복(같은 전화 또는 같은 이메일) 제거
 */
export function cleanVoters(value: unknown): CleanVotersResult {
  const invalid: string[] = [];
  const voters: NewVoter[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  if (!Array.isArray(value)) {
    return { voters, invalid };
  }

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const rawPhone = record.phone;
    const rawEmail = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";

    const phone =
      rawPhone === undefined || rawPhone === null || rawPhone === ""
        ? null
        : normalizePhone(rawPhone);
    if (phone === null && rawPhone !== undefined && rawPhone !== null && rawPhone !== "") {
      invalid.push(String(rawPhone));
      continue;
    }

    const email = rawEmail && emailPattern.test(rawEmail) ? rawEmail : null;
    if (!email && rawEmail) {
      invalid.push(rawEmail);
      continue;
    }

    if (!phone && !email) {
      continue;
    }

    if (phone) {
      if (seenPhones.has(phone)) {
        continue;
      }
      seenPhones.add(phone);
    }
    if (email) {
      if (seenEmails.has(email)) {
        continue;
      }
      seenEmails.add(email);
    }

    const voter: NewVoter = {};
    if (phone) voter.phone = phone;
    if (email) voter.email = email;
    if (name) voter.name = name;
    voters.push(voter);
  }

  return { voters, invalid };
}

/** 레거시 입력(voterEmails: string[] | 개행 구분 string)을 voters 배열로 변환 */
export function votersFromEmails(value: unknown): NewVoter[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]/)
      : [];

  const emails = Array.from(
    new Set(
      raw
        .map((item) => String(item).trim().toLowerCase())
        .filter((item) => item && emailPattern.test(item)),
    ),
  );

  return emails.map((email) => ({ email }));
}
