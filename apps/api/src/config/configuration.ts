export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  apiPrefix: string;
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
    senderTransport: 'console' | 'africas_talking';
  };
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const configuration = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: int(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
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
    ttlSeconds: int(process.env.OTP_TTL_SECONDS, 600),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: int(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),
    rateLimitWindowSeconds: int(process.env.OTP_RATE_LIMIT_WINDOW_SECONDS, 900),
    rateLimitPerPhone: int(process.env.OTP_RATE_LIMIT_PER_PHONE, 5),
    senderTransport:
      (process.env.OTP_SENDER_TRANSPORT as AppConfig['otp']['senderTransport']) ??
      'console',
  },
});