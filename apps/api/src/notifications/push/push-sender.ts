/** One push message to every device token of a user. */
export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  /** String-only payload for deep links (eventType, errandId, notificationId). */
  data: Record<string, string>;
}

export interface PushTokenResult {
  token: string;
  ok: boolean;
  /** Provider error code, e.g. `messaging/registration-token-not-registered`. */
  errorCode: string | null;
  /** The token is dead and the device should be dropped (never retried). */
  stale: boolean;
  messageId: string | null;
}

export abstract class PushSender {
  abstract readonly name: string;
  /** False when no provider is configured: sends are skipped as no-ops. */
  abstract readonly enabled: boolean;
  abstract send(message: PushMessage): Promise<PushTokenResult[]>;
}

export const PUSH_SENDER = 'PUSH_SENDER';
