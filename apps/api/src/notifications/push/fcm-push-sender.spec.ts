import { describe, expect, it, vi } from 'vitest';
import { FcmPushSender } from './fcm-push-sender';

describe('FcmPushSender', () => {
  it('maps per-token results and flags dead tokens as stale', async () => {
    const messaging = {
      sendEachForMulticast: vi.fn(() =>
        Promise.resolve({
          successCount: 1,
          failureCount: 1,
          responses: [
            { success: true, messageId: 'm-1' },
            { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          ],
        }),
      ),
    };
    const sender = new FcmPushSender(
      { projectId: 'p', clientEmail: 'e', privateKey: 'k' },
      messaging as never,
    );
    const out = await sender.send({ tokens: ['a', 'b'], title: 't', body: 'b', data: { x: '1' } });
    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['a', 'b'],
      notification: { title: 't', body: 'b' },
      data: { x: '1' },
    });
    expect(out).toEqual([
      { token: 'a', ok: true, errorCode: null, stale: false, messageId: 'm-1' },
      {
        token: 'b',
        ok: false,
        errorCode: 'messaging/registration-token-not-registered',
        stale: true,
        messageId: null,
      },
    ]);
  });
});
