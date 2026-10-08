import { Logger } from '@nestjs/common';
import { App, cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PushMessage, PushSender, PushTokenResult } from './push-sender';

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Error codes meaning the token will never work again (drop the device). */
const STALE_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

type MessagingLike = Pick<ReturnType<typeof getMessaging>, 'sendEachForMulticast'>;

/** Firebase Cloud Messaging through firebase-admin (row 31, approved). */
export class FcmPushSender extends PushSender {
  readonly name = 'fcm';
  readonly enabled = true;
  private readonly logger = new Logger(FcmPushSender.name);
  private app: App | null = null;

  constructor(
    private readonly credentials: FcmCredentials,
    private messaging: MessagingLike | null = null,
  ) {
    super();
  }

  async send(message: PushMessage): Promise<PushTokenResult[]> {
    if (message.tokens.length === 0) {
      return [];
    }
    const res = await this.client().sendEachForMulticast({
      tokens: message.tokens,
      notification: { title: message.title, body: message.body },
      data: message.data,
    });
    return res.responses.map((r, i) => {
      const errorCode = r.error?.code ?? null;
      return {
        token: message.tokens[i],
        ok: r.success,
        errorCode,
        stale: errorCode !== null && STALE_CODES.has(errorCode),
        messageId: r.messageId ?? null,
      };
    });
  }

  async close(): Promise<void> {
    if (this.app) {
      await deleteApp(this.app);
      this.app = null;
    }
  }

  private client(): MessagingLike {
    if (!this.messaging) {
      this.app = initializeApp(
        {
          credential: cert({
            projectId: this.credentials.projectId,
            clientEmail: this.credentials.clientEmail,
            privateKey: this.credentials.privateKey,
          }),
        },
        `nitume-fcm-${Date.now()}`,
      );
      this.messaging = getMessaging(this.app);
      this.logger.log(`FCM ready for project ${this.credentials.projectId}`);
    }
    return this.messaging;
  }
}
