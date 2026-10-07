import '../api/nitume_api_client.dart';
import '../models/enums.dart';
import '../models/errand_activity.dart';
import '../models/json_utils.dart';

/// Evidence for an errand (`/errands/:errandId/evidence`).
class EvidenceRepository {
  EvidenceRepository(this._api);

  final NitumeApiClient _api;

  Future<List<Evidence>> list(String errandId) async {
    final data = await _api.getList('/errands/$errandId/evidence');
    return asJsonList(data).map(Evidence.fromJson).toList();
  }
}

/// Ratings (`/errands/:errandId/rating`).
class RatingsRepository {
  RatingsRepository(this._api);

  final NitumeApiClient _api;

  /// Rates the errand. A second rating returns 409 (`NitumeApiException`).
  Future<Rating> rate(String errandId, {required int score, String? comment}) {
    assert(score >= 1 && score <= 5);
    return _api.postMap(
      '/errands/$errandId/rating',
      data: {'score': score, if (comment != null && comment.isNotEmpty) 'comment': comment},
    ).then(Rating.fromJson);
  }

  /// The errand's rating, or `null` if none yet.
  Future<Rating?> get(String errandId) async {
    final data = await _api.get('/errands/$errandId/rating');
    if (data == null || (data is String && data.isEmpty)) return null;
    return Rating.fromJson(asJsonMap(data));
  }
}

/// Price-change requests (`/errands/:errandId/price-change`).
///
/// Note A-17: §3.2 names this `POST /payments/:id/authorize-change`; the API
/// path is used here.
class PriceChangeRepository {
  PriceChangeRepository(this._api);

  final NitumeApiClient _api;

  Future<List<PriceChangeRequest>> list(
    String errandId, {
    PriceChangeStatus? status,
  }) async {
    final data = await _api.getList(
      '/errands/$errandId/price-change',
      query: {if (status != null) 'status': status.wire},
    );
    return asJsonList(data).map(PriceChangeRequest.fromJson).toList();
  }

  /// The newest request still awaiting the customer, if any.
  Future<PriceChangeRequest?> pending(String errandId) async {
    final items = await list(errandId, status: PriceChangeStatus.requested);
    if (items.isEmpty) return null;
    items.sort((a, b) => (b.createdAt ?? DateTime(0))
        .compareTo(a.createdAt ?? DateTime(0)));
    return items.first;
  }

  Future<PriceChangeRequest> approve(String errandId, String requestId) =>
      _api
          .postMap('/errands/$errandId/price-change/$requestId/approve')
          .then(PriceChangeRequest.fromJson);

  Future<PriceChangeRequest> reject(String errandId, String requestId) => _api
      .postMap('/errands/$errandId/price-change/$requestId/reject')
      .then(PriceChangeRequest.fromJson);
}

/// Disputes (`/disputes`). 409 on a wrong errand state or a duplicate.
class DisputesRepository {
  DisputesRepository(this._api);

  final NitumeApiClient _api;

  /// [reason]: 5–500 characters.
  Future<Dispute> open({required String errandId, required String reason}) =>
      _api
          .postMap('/disputes', data: {'errandId': errandId, 'reason': reason})
          .then(Dispute.fromJson);

  Future<Dispute> get(String disputeId) =>
      _api.getMap('/disputes/$disputeId').then(Dispute.fromJson);
}

/// Push-device registration (`/users/me/devices`). Obtaining the FCM token
/// needs Firebase, which is not a dependency (owner question); the host app
/// passes the token in.
class DevicesRepository {
  DevicesRepository(this._api);

  final NitumeApiClient _api;

  /// Idempotent upsert of this install's push token.
  Future<Device> register({
    required DevicePlatform platform,
    required String pushToken,
  }) =>
      _api
          .postMap(
            '/users/me/devices',
            data: {'platform': platform.wire, 'pushToken': pushToken},
          )
          .then(Device.fromJson);

  Future<void> remove(String deviceId) async {
    await _api.delete('/users/me/devices/$deviceId');
  }
}
