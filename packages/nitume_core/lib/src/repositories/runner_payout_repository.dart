import '../api/api_exception.dart';
import '../api/nitume_api_client.dart';
import '../models/runner_payouts.dart';
import '../storage/idempotency_key_store.dart';

/// The runner's payout ledger and payout requests (`/runners/me/payout-*`,
/// rows 107, 117, 118, 146, 153). No wallet: everything here is a view of
/// the ledger lines (OA-6). No payout time is promised (row 143).
///
/// [keys] persists the payout request's `Idempotency-Key`; in the app pass
/// `PaymentAttemptKeys(SecureIdempotencyKeyStore())` and clear the store on
/// sign-out (`IdempotencyKeyStore.clear`).
class RunnerPayoutRepository {
  RunnerPayoutRepository(this._api, {required PaymentAttemptKeys keys})
    // A named parameter cannot be private, so no initializing formal.
    // ignore: prefer_initializing_formals
    : _keys = keys;

  final NitumeApiClient _api;
  final PaymentAttemptKeys _keys;

  /// [IdempotencyKeyStore] scope of the payout request attempt. One runner
  /// has at most one request in flight, so one scope is enough.
  static const idempotencyScope = 'runner-payout-request';

  /// `GET /runners/me/payout-requests/summary`: minimum, available amount
  /// and the open request.
  Future<PayoutRequestSummary> summary() => _api
      .getMap('/runners/me/payout-requests/summary')
      .then(PayoutRequestSummary.fromJson);

  /// `GET /runners/me/payout-requests`, newest first. Pass the previous
  /// page's `nextCursor` as [cursor]; [limit] is 1–100 (API default 25).
  Future<PayoutRequestPage> requests({String? cursor, int? limit}) => _api
      .getMap(
        '/runners/me/payout-requests',
        query: {'cursor': ?cursor, 'limit': ?limit},
      )
      .then(PayoutRequestPage.fromJson);

  /// `POST /runners/me/payout-requests` `{ amount }` with a persistent
  /// `Idempotency-Key` (stored under [idempotencyScope], so a retry after a
  /// network error or an app restart replays the same request instead of
  /// making a second one).
  ///
  /// The key is kept after a network error or a 5xx and dropped after any
  /// other answer (success or a 4xx refusal, which created nothing), so the
  /// next request gets a fresh key. The destination is the sign-in phone,
  /// set by the server (row 118).
  ///
  /// Errors (`NitumeApiException.code`): `payout_below_minimum`
  /// (`minimumAmount`), `payout_exceeds_available` (`availableAmount`),
  /// `payout_request_open` (`requestId`), `payout_destination_missing`.
  Future<RunnerPayoutRequest> requestPayout(num amount) async {
    if (amount <= 0) {
      throw ArgumentError.value(amount, 'amount', 'must be above zero');
    }
    final key = await _keys.keyFor(idempotencyScope);
    try {
      final request = RunnerPayoutRequest.fromJson(
        await _api.postMap(
          '/runners/me/payout-requests',
          headers: {'Idempotency-Key': key},
          data: {'amount': num.parse(amount.toStringAsFixed(2))},
        ),
      );
      await _keys.newAttempt(idempotencyScope);
      return request;
    } on NitumeApiException catch (e) {
      final status = e.statusCode;
      if (!e.isNetworkError && status != null && status < 500) {
        await _keys.newAttempt(idempotencyScope);
      }
      rethrow;
    }
  }

  /// `GET /runners/me/payout-lines`, newest first: runner fee and item
  /// reimbursement lines, derived payout entries and adjustments.
  /// [kinds] filters (e.g. `{PayoutFeedKind.payout,
  /// PayoutFeedKind.resentPayout}` for payout history); [errandId] limits
  /// it to one task (RA-16).
  Future<PayoutFeedPage> payoutLines({
    Set<PayoutFeedKind>? kinds,
    String? errandId,
    String? cursor,
    int? limit,
  }) => _api
      .getMap(
        '/runners/me/payout-lines',
        query: {
          if (kinds != null && kinds.isNotEmpty)
            'kind': [for (final k in kinds) k.wire].join(','),
          'errandId': ?errandId,
          'cursor': ?cursor,
          'limit': ?limit,
        },
      )
      .then(PayoutFeedPage.fromJson);
}
