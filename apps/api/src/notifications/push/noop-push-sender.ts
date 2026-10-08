import { PushMessage, PushSender, PushTokenResult } from './push-sender';

/** Used when FCM credentials are absent: push is skipped, nothing fails. */
export class NoopPushSender extends PushSender {
  readonly name = 'noop';
  readonly enabled = false;

  send(_message: PushMessage): Promise<PushTokenResult[]> {
    return Promise.resolve([]);
  }
}
