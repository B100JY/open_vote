export type Contact = {
  id: string;
  name: string;
  phone: string;
  groupIds: string[];
};
export type ContactGroup = { id: string; name: string };
export function phoneBatches(
  contacts: Pick<Contact, "phone">[],
  size = 30,
): string[][] {
  if (!Number.isInteger(size) || size < 1 || size > 30)
    throw new Error("묶음은 1~30명입니다.");
  const phones = Array.from(
    new Set(
      contacts
        .map((c) => c.phone.replace(/\D/g, ""))
        .filter((p) => /^01[0-9]{8,9}$/.test(p)),
    ),
  );
  return Array.from({ length: Math.ceil(phones.length / size) }, (_, i) =>
    phones.slice(i * size, (i + 1) * size),
  );
}
/** iOS는 공식 SMS 링크의 본문 전달을 보장하지 않아 별도 복사를 제공한다. */
export function mobileSmsUri(phones: string[], body: string, ios = false) {
  if (
    !phones.length ||
    phones.length > 30 ||
    phones.some((p) => !/^01[0-9]{8,9}$/.test(p))
  )
    throw new Error("휴대폰 번호를 확인해주세요.");
  return `sms:${phones.join(",")}${body && !ios ? `?body=${encodeURIComponent(body)}` : ""}`;
}
