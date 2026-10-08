/**
 * Short runner name shown to customers (BOARD row 40): first name plus the
 * initial of the last name, e.g. "Kevin Otieno" -> "Kevin O.". A one-word
 * name is returned as is; null when the runner has not set a name.
 */
export const shortNameOf = (displayName: string | null | undefined): string | null => {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const first = parts[0];
  if (parts.length === 1) {
    return first;
  }
  const initial = /\p{L}/u.exec(parts[parts.length - 1])?.[0];
  return initial ? `${first} ${initial.toLocaleUpperCase()}.` : first;
};
