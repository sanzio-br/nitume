import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  group('PaymentAttemptKeys', () {
    test('reuses the stored key until a new attempt', () async {
      final store = InMemoryIdempotencyKeyStore();
      final keys = PaymentAttemptKeys(store);
      final first = await keys.keyFor('e1');
      expect(PaymentsRepository.idempotencyKeyPattern.hasMatch(first), isTrue);
      expect(await keys.keyFor('e1'), first);
      expect(await keys.keyFor('e2'), isNot(first));

      await keys.newAttempt('e1');
      expect(await keys.keyFor('e1'), isNot(first));
    });

    test('survives a restart: a new instance reads the same key', () async {
      final store = InMemoryIdempotencyKeyStore();
      final first = await PaymentAttemptKeys(store).keyFor('e1');
      expect(await PaymentAttemptKeys(store).keyFor('e1'), first);
    });

    test('replaces an invalid stored value', () async {
      final store = InMemoryIdempotencyKeyStore();
      await store.write('e1', 'bad key!');
      final keys = PaymentAttemptKeys(store, newKey: () => 'fresh-key-123');
      expect(await keys.keyFor('e1'), 'fresh-key-123');
      expect(await store.read('e1'), 'fresh-key-123');
    });
  });

  group('SecureIdempotencyKeyStore', () {
    setUp(
      () => FlutterSecureStorage.setMockInitialValues({
        'nitume.accessToken': 'tok',
      }),
    );

    test('reads, writes and removes per scope', () async {
      final store = SecureIdempotencyKeyStore();
      expect(await store.read('e1'), isNull);
      await store.write('e1', 'key-e1-0001');
      await store.write('e2', 'key-e2-0001');
      expect(await store.read('e1'), 'key-e1-0001');
      await store.remove('e1');
      expect(await store.read('e1'), isNull);
      expect(await store.read('e2'), 'key-e2-0001');
    });

    test('clear removes only idempotency keys', () async {
      final store = SecureIdempotencyKeyStore();
      await store.write('e1', 'key-e1-0001');
      await store.clear();
      expect(await store.read('e1'), isNull);
      expect(
        await const FlutterSecureStorage().read(key: 'nitume.accessToken'),
        'tok',
      );
    });
  });
}
