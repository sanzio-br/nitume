/**
 * WQ-8 (owner, 2026-10-28): browser origins allowed to use the web auth
 * session (refresh token in an httpOnly cookie) and credentialed CORS.
 *
 * `WEB_ORIGINS` is a comma-separated list of exact origins
 * (`scheme://host[:port]`, no path, no trailing slash). `*` is never
 * accepted. Unset: `http://localhost:4200` (the website's `ng serve`) in
 * development, and no origin anywhere else, so the cookie routes fail closed
 * until the deployment lists the website origin.
 */
export const DEV_WEB_ORIGINS = ['http://localhost:4200'];

const ORIGIN = /^https?:\/\/[^/\s*]+$/;

/** Returns the error for a bad entry, or null when the list is valid. */
export const webOriginsError = (raw: string | undefined): string | null => {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  for (const entry of raw.split(',').map((o) => o.trim()).filter((o) => o !== '')) {
    if (entry.includes('*')) {
      return `WEB_ORIGINS must list exact origins; '*' is not allowed (got '${entry}')`;
    }
    if (!ORIGIN.test(entry)) {
      return `WEB_ORIGINS entries must be scheme://host[:port] with no path or trailing slash (got '${entry}')`;
    }
  }
  return null;
};

export const parseWebOrigins = (raw: string | undefined, nodeEnv: string): string[] => {
  if (raw === undefined || raw.trim() === '') {
    return nodeEnv === 'development' ? [...DEV_WEB_ORIGINS] : [];
  }
  const error = webOriginsError(raw);
  if (error) {
    throw new Error(error);
  }
  return [...new Set(raw.split(',').map((o) => o.trim()).filter((o) => o !== ''))];
};
