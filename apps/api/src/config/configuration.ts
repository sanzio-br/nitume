import { ServiceArea, parseServiceAreas } from '../runners/service-areas';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  apiPrefix: string;
  /** Express `trust proxy` hop count so per-IP limits see the client IP. */
  trustProxyHops: number;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
    /** Prefix on every app key (throttle, idempotency, caches); '' in dev/prod, `nitume_test:` in e2e (row 224). */
    keyPrefix: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  otp: {
    ttlSeconds: number;
    maxAttempts: number;
    resendCooldownSeconds: number;
    rateLimitWindowSeconds: number;
    rateLimitPerPhone: number;
    /** Per-IP limits on OTP request / verify routes (row 53). */
    ipRequestLimit: number;
    ipRequestWindowSeconds: number;
    ipVerifyLimit: number;
    ipVerifyWindowSeconds: number;
    senderTransport: 'console' | 'africas_talking';
  };
  mail: {
    host: string | null;
    port: number;
    secure: boolean;
    username: string | null;
    password: string | null;
    fromAddress: string | null;
    fromName: string | null;
  };
  security: {
    bcryptRounds: number;
  };
  pricing: {
    serviceFeeRate: number;
    runnerFeeRate: number;
  };
  quotes: {
    /** Expiry applied when the admin quotes without `expiresAt` (row 83). */
    defaultTtlHours: number;
  };
  errands: {
    urgentWithinHours: number;
    scheduledAfterHours: number;
    disputeWindowHours: number;
    /** Rows 221, 235: a Flexible task (no customer deadline) gets payment confirmation + this many hours. */
    defaultDeadlineHours: number;
  };
  runnerVerification: {
    /** console | cloudinary (defaults to the evidence driver: same provider, own folder). */
    storageDriver: 'console' | 'cloudinary';
    cloudinaryFolder: string;
    /** Admin signed-URL lifetime, capped at 300 s (row 154). */
    signedUrlTtlSeconds: number;
    /**
     * Days kept after the runner's last retention event (rows 154, 161, 171):
     * a new/replacement ID or selfie, a verification started, the decision on
     * an ID/selfie, or an audited re-review. Views never count.
     */
    retentionDays: number;
    /** Largest accepted image upload, bytes. */
    maxUploadBytes: number;
    /** Daily purge schedule (cron, Africa/Nairobi). */
    purgeCron: string;
    /**
     * Row 162: the restricted Cloudinary credential used only for ID/selfie
     * images (CLOUDINARY_ID_*). Outside production it falls back to the
     * evidence credential; production refuses to start without it.
     */
    cloudinary: {
      cloudName: string | null;
      apiKey: string | null;
      apiSecret: string | null;
    };
  };
  runnerPayouts: {
    /** Smallest payout a runner may request, KES (row 159: KES 500, MIN_RUNNER_PAYOUT_REQUEST). */
    minimumRequestAmount: number;
  };
  matching: {
    /** Acceptance window of an admin-made offer (rows 114, 141). */
    adminOfferWindowSeconds: number;
  };
  runners: {
    /** Ops-configured service areas (row 116), RUNNER_SERVICE_AREAS JSON. */
    serviceAreas: ServiceArea[];
  };
  payments: {
    /** Active M-Pesa provider (row 73): console | payhero | daraja. */
    provider: 'console' | 'payhero' | 'daraja';
    /** @deprecated alias of `provider` (PAYMENTS_MPESA_TRANSPORT). */
    mpesaTransport: string;
    stkTimeoutSeconds: number;
    /** Minimum gap between two STK Queries for the same payment. */
    stkQueryIntervalSeconds: number;
    payhero: {
      baseUrl: string;
      authToken: string | null;
      channelId: number | null;
      callbackUrl: string | null;
      timeoutMs: number;
    };
    daraja: {
      baseUrl: string;
      consumerKey: string | null;
      consumerSecret: string | null;
      shortCode: string | null;
      passkey: string | null;
      callbackUrl: string | null;
    };
  };
  evidence: {
    storageDriver: 'console' | 'cloudinary';
    /** Lifetime of signed evidence view URLs (row 25). */
    signedUrlTtlSeconds: number;
    cloudinary: {
      cloudName: string | null;
      apiKey: string | null;
      apiSecret: string | null;
    };
  };
  queue: {
    prefix: string;
    attempts: number;
    disputeSweepIntervalSeconds: number;
    stkReconcileIntervalSeconds: number;
    offerExpirySweepIntervalSeconds: number;
  };
  push: {
    fcm: {
      projectId: string | null;
      clientEmail: string | null;
      privateKey: string | null;
    };
  };
  atsms: {
    apiKey: string | null;
    username: string | null;
    senderId: string | null;
  };
}

/**
 * Row 162: ID images use their own restricted Cloudinary credential
 * (CLOUDINARY_ID_API_KEY / CLOUDINARY_ID_API_SECRET; CLOUDINARY_ID_CLOUD_NAME
 * defaults to CLOUDINARY_CLOUD_NAME). Only outside production does it fall
 * back to the ordinary media credential, so dev setups keep working; in
 * production there is no fallback (validateEnv refuses to start).
 */
export const resolveIdCloudinary = (
  env: Record<string, string | undefined>,
): { cloudName: string | null; apiKey: string | null; apiSecret: string | null } => {
  const production = (env.NODE_ENV ?? 'development') === 'production';
  const pick = (own: string | undefined, shared: string | undefined): string | null =>
    own || (production ? null : shared || null);
  return {
    cloudName: env.CLOUDINARY_ID_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME || null,
    apiKey: pick(env.CLOUDINARY_ID_API_KEY, env.CLOUDINARY_API_KEY),
    apiSecret: pick(env.CLOUDINARY_ID_API_SECRET, env.CLOUDINARY_API_SECRET),
  };
};

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const configuration = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: int(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  trustProxyHops: int(process.env.TRUST_PROXY_HOPS, 0),
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: int(process.env.DATABASE_PORT, 5432),
    name: process.env.DATABASE_NAME ?? 'nitume_dev',
    user: process.env.DATABASE_USER ?? 'nitume',
    password: process.env.DATABASE_PASSWORD ?? 'nitume_dev_password',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
    // Row 224: e2e runs set REDIS_KEY_PREFIX=nitume_test: so their throttle
    // and idempotency keys never share names with a dev server's.
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? '',
  },
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ?? 'dev-only-access-secret-change-me',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'dev-only-refresh-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  otp: {
    ttlSeconds: int(process.env.OTP_TTL_SECONDS, 300),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: int(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),
    rateLimitWindowSeconds: int(process.env.OTP_RATE_LIMIT_WINDOW_SECONDS, 3600),
    rateLimitPerPhone: int(process.env.OTP_RATE_LIMIT_PER_PHONE, 5),
    // Per-IP throttling (row 53). Generous by default because many mobile
    // users share one carrier NAT address; tune per deployment.
    ipRequestLimit: int(process.env.OTP_IP_REQUEST_LIMIT, 30),
    ipRequestWindowSeconds: int(process.env.OTP_IP_REQUEST_WINDOW_SECONDS, 3600),
    ipVerifyLimit: int(process.env.OTP_IP_VERIFY_LIMIT, 60),
    ipVerifyWindowSeconds: int(process.env.OTP_IP_VERIFY_WINDOW_SECONDS, 3600),
    senderTransport:
      (process.env.OTP_SENDER_TRANSPORT as AppConfig['otp']['senderTransport']) ??
      'console',
  },
  security: {
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
  },
  // SMTP creds for email OTP delivery. When MAIL_HOST is unset the mailer
  // degrades to a console log so dev flows still work without a mail server.
  mail: {
    host: process.env.MAIL_HOST || null,
    port: int(process.env.MAIL_PORT, 465),
    secure: (process.env.MAIL_PORT ?? '465').trim() === '465',
    username: process.env.MAIL_USERNAME || null,
    password: process.env.MAIL_PASSWORD || null,
    fromAddress: process.env.MAIL_FROM_ADDRESS || null,
    fromName: process.env.MAIL_FROM_NAME || 'Nitume',
  },
  // PENDING OWNER DECISION: exact commission/runner-fee rates. Placeholders
  // from the business plan's indicative 20-25% range; production values must
  // be set by the project owner before launch.
  pricing: {
    serviceFeeRate: Number.parseFloat(process.env.PRICING_SERVICE_FEE_RATE ?? '0.2'),
    runnerFeeRate: Number.parseFloat(process.env.PRICING_RUNNER_FEE_RATE ?? '0.3'),
  },
  payments: {
    provider: (process.env.PAYMENTS_PROVIDER ||
      process.env.PAYMENTS_MPESA_TRANSPORT ||
      'console') as AppConfig['payments']['provider'],
    mpesaTransport: process.env.PAYMENTS_PROVIDER || process.env.PAYMENTS_MPESA_TRANSPORT || 'console',
    // After this long without a provider result an STK push reads TIMEOUT
    // (not FAILED); a late callback still settles it.
    stkTimeoutSeconds: int(process.env.PAYMENTS_STK_TIMEOUT_SECONDS, 120),
    // A TIMEOUT payment is resolved by Daraja STK Query (row 52) at most
    // once per interval, from GET /payments/:errandId or the reconcile job.
    stkQueryIntervalSeconds: int(process.env.PAYMENTS_STK_QUERY_INTERVAL_SECONDS, 30),
    // PayHero (row 73), used with PAYMENTS_PROVIDER=payhero. Token, channel
    // id and callback URL come from the owner's PayHero account; never commit
    // real values. The base URL default must be confirmed by the owner.
    payhero: {
      baseUrl: process.env.PAYHERO_BASE_URL || 'https://backend.payhero.co.ke/api/v2',
      authToken: process.env.PAYHERO_AUTH_TOKEN || null,
      channelId: process.env.PAYHERO_CHANNEL_ID ? int(process.env.PAYHERO_CHANNEL_ID, 0) : null,
      callbackUrl: process.env.PAYHERO_CALLBACK_URL || null,
      timeoutMs: int(process.env.PAYHERO_TIMEOUT_MS, 15000),
    },
    // Future provider (row 73), PAYMENTS_PROVIDER=daraja; every value must be set
    // (owner-approved Daraja account). Never commit real values.
    daraja: {
      baseUrl: process.env.PAYMENTS_MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke',
      consumerKey: process.env.PAYMENTS_MPESA_CONSUMER_KEY || null,
      consumerSecret: process.env.PAYMENTS_MPESA_CONSUMER_SECRET || null,
      shortCode: process.env.PAYMENTS_MPESA_SHORTCODE || null,
      passkey: process.env.PAYMENTS_MPESA_PASSKEY || null,
      callbackUrl: process.env.PAYMENTS_MPESA_CALLBACK_URL || null,
    },
  },
  // Every quote expires (row 83); 24h unless the admin sets expiresAt.
  quotes: {
    defaultTtlHours: Number.parseFloat(process.env.QUOTES_DEFAULT_TTL_HOURS ?? '24'),
  },
  // TODO(owner): urgency thresholds are placeholders. Urgency is derived from
  // deadlineAt (owner decision Q19) but no thresholds are defined anywhere.
  errands: {
    urgentWithinHours: Number.parseFloat(process.env.ERRANDS_URGENT_WITHIN_HOURS ?? '4'),
    scheduledAfterHours: Number.parseFloat(process.env.ERRANDS_SCHEDULED_AFTER_HOURS ?? '72'),
    // Rows 221, 235, 239 (owner, 2026-10-19): a task without a customer
    // deadline gets payment confirmation + 24 h. Read by clients through
    // GET /errands/defaults, never hard-coded in an app.
    defaultDeadlineHours: Number.parseFloat(process.env.ERRANDS_DEFAULT_DEADLINE_HOURS ?? '24'),
    // TODO(owner): dispute window length is not defined anywhere. After it,
    // the system moves COMPLETED -> CONFIRMED (payout eligibility).
    disputeWindowHours: Number.parseFloat(process.env.ERRANDS_DISPUTE_WINDOW_HOURS ?? '24'),
  },
  // Rows 125, 144, 154, 161: runner ID/selfie images in restricted storage,
  // kept for a configurable period after the runner's last retention event,
  // then deleted by a daily job. Initial retention: 12 months (365 days).
  runnerVerification: {
    storageDriver: ((process.env.RUNNER_ID_STORAGE_DRIVER || process.env.EVIDENCE_STORAGE_DRIVER || 'console') as
      AppConfig['runnerVerification']['storageDriver']),
    cloudinaryFolder: process.env.RUNNER_ID_CLOUDINARY_FOLDER || 'nitume/runner-verification',
    signedUrlTtlSeconds: Math.min(int(process.env.RUNNER_ID_SIGNED_URL_TTL_SECONDS, 300), 300),
    retentionDays: int(process.env.RUNNER_ID_RETENTION_DAYS, 365),
    // Row 163: 10 MB per image; read by the runners module's multer options only.
    maxUploadBytes: int(process.env.RUNNER_ID_MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
    purgeCron: process.env.RUNNER_ID_PURGE_CRON || '0 3 * * *',
    cloudinary: resolveIdCloudinary(process.env),
  },
  // Rows 117, 159 (owner, 2026-10-16): runners request payouts of at least
  // KES 500, server-side config, no admin UI. MIN_RUNNER_PAYOUT_REQUEST
  // replaces the round-8 RUNNER_PAYOUT_REQUEST_MINIMUM_KES (not read any more).
  runnerPayouts: {
    minimumRequestAmount: Number.parseFloat(process.env.MIN_RUNNER_PAYOUT_REQUEST ?? '500'),
  },
  // Row 114 (owner, 2026-10-13): admin-created offers stay open 10 minutes.
  // Row 157: an offer not accepted by then expires; the task stays
  // RUNNER_ASSIGNED for the admin to offer it to another runner.
  matching: {
    adminOfferWindowSeconds: int(process.env.MATCHING_ADMIN_OFFER_WINDOW_SECONDS, 600),
  },
  // Row 116 (owner, 2026-10-13): service areas are an ops-configured list.
  // No admin screen yet (RA-24): JSON in RUNNER_SERVICE_AREAS, checked at start-up.
  runners: {
    serviceAreas: parseServiceAreas(process.env.RUNNER_SERVICE_AREAS),
  },
  // Evidence storage. `console` (dev default) logs uploads without storing;
  // `cloudinary` uploads to Cloudinary (needs CLOUDINARY_CLOUD_NAME/API_KEY/
  // API_SECRET). The transport resolves through the evidence storage provider.
  evidence: {
    storageDriver:
      (process.env.EVIDENCE_STORAGE_DRIVER as AppConfig['evidence']['storageDriver']) ??
      'console',
    signedUrlTtlSeconds: int(process.env.EVIDENCE_SIGNED_URL_TTL_SECONDS, 900),
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? null,
      apiKey: process.env.CLOUDINARY_API_KEY ?? null,
      apiSecret: process.env.CLOUDINARY_API_SECRET ?? null,
    },
  },
  // BullMQ (rows 26, 50). Workers run unless QUEUE_WORKERS_ENABLED=false.
  queue: {
    prefix: process.env.QUEUE_PREFIX || 'nitume',
    attempts: int(process.env.QUEUE_JOB_ATTEMPTS, 5),
    // How often the dispute-window job runs (COMPLETED -> CONFIRMED -> SETTLED).
    disputeSweepIntervalSeconds: int(process.env.ERRANDS_DISPUTE_SWEEP_INTERVAL_SECONDS, 300),
    // How often TIMEOUT STK payments are resolved by STK Query.
    stkReconcileIntervalSeconds: int(process.env.PAYMENTS_STK_RECONCILE_INTERVAL_SECONDS, 60),
    // How often lapsed offers are marked expired (task stays RUNNER_ASSIGNED, row 157).
    offerExpirySweepIntervalSeconds: int(process.env.MATCHING_OFFER_EXPIRY_SWEEP_INTERVAL_SECONDS, 30),
  },
  // FCM push (row 31). All three set -> firebase-admin; otherwise a no-op.
  // The private key may use literal \n sequences (single-line env value).
  push: {
    fcm: {
      projectId: process.env.FCM_PROJECT_ID || null,
      clientEmail: process.env.FCM_CLIENT_EMAIL || null,
      privateKey: process.env.FCM_PRIVATE_KEY
        ? process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n')
        : null,
    },
  },
  atsms: {
    apiKey: process.env.ATSMS_API_KEY ?? null,
    username: process.env.ATSMS_USERNAME ?? null,
    senderId: process.env.ATSMS_SENDER_ID ?? null,
  },
});