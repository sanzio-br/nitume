import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FcmPushSender } from './fcm-push-sender';
import { NoopPushSender } from './noop-push-sender';
import { PUSH_SENDER, PushSender } from './push-sender';

/** FCM when FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY are all set, else a no-op. */
export const pushSenderProvider = {
  provide: PUSH_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): PushSender => {
    const projectId = config.get<string | null>('push.fcm.projectId') ?? null;
    const clientEmail = config.get<string | null>('push.fcm.clientEmail') ?? null;
    const privateKey = config.get<string | null>('push.fcm.privateKey') ?? null;
    if (projectId && clientEmail && privateKey) {
      return new FcmPushSender({ projectId, clientEmail, privateKey });
    }
    new Logger('PushSender').log('FCM credentials not set: push notifications are a no-op');
    return new NoopPushSender();
  },
};
