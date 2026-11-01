/** Change exactly one membership without losing the contact's other groups. */
export function updateContactGroupIds(
  currentIds: readonly string[],
  groupId: string,
  assigned: boolean,
): string[] {
  if (assigned) return currentIds.includes(groupId) ? [...currentIds] : [...currentIds, groupId];
  return currentIds.filter(id => id !== groupId);
}
