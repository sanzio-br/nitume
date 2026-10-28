import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

type CorsRequest = { headers: { origin?: string | string[] } };
type CorsCallback = (err: Error | null, options: CorsOptions) => void;

/**
 * WQ-8: credentialed CORS (`Access-Control-Allow-Credentials: true`) only
 * for the configured website origins (WEB_ORIGINS), never `*` and never a
 * reflected arbitrary origin. Other origins keep the earlier behaviour for
 * bearer-token calls (origin reflected) but without credentials, so a
 * browser never attaches cookies for them.
 */
export const corsOptionsDelegate =
  (webOrigins: string[]) =>
  (req: CorsRequest, callback: CorsCallback): void => {
    const origin = req.headers.origin;
    const trusted = typeof origin === 'string' && webOrigins.includes(origin);
    callback(null, { origin: true, credentials: trusted });
  };
