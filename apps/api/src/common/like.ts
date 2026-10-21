/** Escapes `\`, `%` and `_` so a LIKE / ILIKE pattern with `ESCAPE '\'` matches them literally. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);
