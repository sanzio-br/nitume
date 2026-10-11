import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../repositories/payments_repository.dart';

/// Persists the `Idempotency-Key` of each open checkout attempt, so a retry
/// after an app restart reuses the same key and the API never charges twice
/// (BOARD row 62 minor).
///
/// [scope] identifies the attempt, usually the errand id.
abstract interface class IdempotencyKeyStore {
  Future<String?> read(String scope);
  Future<void> write(String scope, String key);
  Future<void> remove(String scope);

  /// Removes every stored key (e.g. on sign-out).
  Future<void> clear();
}

/// Keychain / Keystore-backed [IdempotencyKeyStore] used by the apps (uses
/// the `flutter_secure_storage` dependency the token store already has).
class SecureIdempotencyKeyStore implements IdempotencyKeyStore {
  SecureIdempotencyKeyStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _prefix = 'nitume.idempotencyKey.';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String scope) => _storage.read(key: _prefix + scope);

  @override
  Future<void> write(String scope, String key) =>
      _storage.write(key: _prefix + scope, value: key);

  @override
  Future<void> remove(String scope) => _storage.delete(key: _prefix + scope);

  @override
  Future<void> clear() async {
    final all = await _storage.readAll();
    for (final key in all.keys.toList()) {
      if (key.startsWith(_prefix)) await _storage.delete(key: key);
    }
  }
}

/// Non-persistent [IdempotencyKeyStore] for tests and previews.
class InMemoryIdempotencyKeyStore implements IdempotencyKeyStore {
  final _keys = <String, String>{};

  @override
  Future<String?> read(String scope) async => _keys[scope];

  @override
  Future<void> write(String scope, String key) async => _keys[scope] = key;

  @override
  Future<void> remove(String scope) async => _keys.remove(scope);

  @override
  Future<void> clear() async => _keys.clear();
}

/// One idempotency key per checkout attempt, kept in an
/// [IdempotencyKeyStore] so it survives an app restart.
///
/// Call [keyFor] before every `PaymentsRepository.initiateWith` of the
/// attempt (first push and every retry after TIMEOUT or a network error);
/// call [newAttempt] only after `idempotency_key_reused` or once the
/// attempt is finished (paid, or the customer starts over).
class PaymentAttemptKeys {
  PaymentAttemptKeys(this._store, {String Function()? newKey})
    : _newKey = newKey ?? PaymentsRepository.newIdempotencyKey;

  final IdempotencyKeyStore _store;
  final String Function() _newKey;

  /// The stored key for [errandId], creating and storing one if there is
  /// none or the stored value is not a valid key.
  Future<String> keyFor(String errandId) async {
    final stored = await _store.read(errandId);
    if (stored != null &&
        PaymentsRepository.idempotencyKeyPattern.hasMatch(stored)) {
      return stored;
    }
    final key = _newKey();
    await _store.write(errandId, key);
    return key;
  }

  /// Starts a new attempt: the next [keyFor] returns a fresh key.
  Future<void> newAttempt(String errandId) => _store.remove(errandId);
}
