import '../api/api_exception.dart';
import '../api/nitume_api_client.dart';
import '../models/enums.dart';
import '../models/errand.dart';
import '../models/errand_details.dart';
import '../models/json_utils.dart';

/// Errands for the signed-in user (`/errands`).
class ErrandRepository {
  ErrandRepository(this._api);

  final NitumeApiClient _api;

  /// States shown in the Home "In progress" card and on Track.
  static const activeStatuses = {
    ErrandStatus.requested,
    ErrandStatus.quoted,
    ErrandStatus.accepted,
    ErrandStatus.paymentConfirmed,
    ErrandStatus.runnerAssigned,
    ErrandStatus.runnerEnRoute,
    ErrandStatus.arrived,
    ErrandStatus.inProgress,
    ErrandStatus.awaitingCustomer,
  };

  /// Finished states shown in Home "Recent" and History.
  static const finishedStatuses = {
    ErrandStatus.completed,
    ErrandStatus.confirmed,
    ErrandStatus.settled,
    ErrandStatus.cancelled,
    ErrandStatus.failed,
    ErrandStatus.expired,
    ErrandStatus.disputed,
  };

  /// Creates a DRAFT errand (`POST /errands`).
  Future<ErrandTransitionResult> create(CreateErrandRequest request) async =>
      ErrandTransitionResult.fromJson(
        await _api.postMap('/errands', data: request.toJson()),
      );

  /// DRAFT → REQUESTED (`POST /errands/:id/submit`).
  Future<ErrandTransitionResult> submit(String errandId) async =>
      ErrandTransitionResult.fromJson(
        await _api.postMap('/errands/$errandId/submit'),
      );

  /// Customer-actor transition (`PATCH /errands/:id/status`). The state
  /// machine on the API enforces which transitions are allowed.
  Future<ErrandTransitionResult> transition(
    String errandId,
    ErrandStatus to, {
    String? note,
  }) async =>
      ErrandTransitionResult.fromJson(
        await _api.patchMap(
          '/errands/$errandId/status',
          data: {'to': to.wire, 'note': ?note},
        ),
      );

  /// Newest first, cursor-paginated (`GET /errands?status=A,B`). Customers
  /// never see their own drafts in this list.
  Future<ErrandPage> list({
    Set<ErrandStatus>? statuses,
    int? limit,
    String? cursor,
  }) async =>
      ErrandPage.fromJson(
        await _api.getMap('/errands', query: {
          if (statuses != null && statuses.isNotEmpty)
            'status': statuses.map((s) => s.wire).join(','),
          'limit': ?limit,
          'cursor': ?cursor,
        }),
      );

  /// Number of errands visible to the caller (`GET /errands/count`).
  Future<int> count({Set<ErrandStatus>? statuses}) async {
    final data = await _api.getMap('/errands/count', query: {
      if (statuses != null && statuses.isNotEmpty)
        'status': statuses.map((s) => s.wire).join(','),
    });
    return (data['count'] as num?)?.toInt() ?? 0;
  }

  /// One errand with its assignment (`GET /errands/:id`).
  Future<Errand> get(String errandId) async =>
      Errand.fromJson(await _api.getMap('/errands/$errandId'));

  /// Status history, oldest first (`GET /errands/:id/history`).
  Future<List<StatusHistoryEntry>> history(String errandId) async {
    final data = await _api.getList('/errands/$errandId/history');
    return asJsonList(data).map(StatusHistoryEntry.fromJson).toList();
  }

  /// Quote breakdown (`GET /errands/:id/quote`); `null` while not quoted.
  Future<Quote?> quote(String errandId) async {
    try {
      return Quote.fromJson(await _api.getMap('/errands/$errandId/quote'));
    } on NitumeApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  /// Initial tracking snapshot (`GET /errands/:id/tracking`).
  Future<TrackingSnapshot> tracking(String errandId) async =>
      TrackingSnapshot.fromJson(
        await _api.getMap('/errands/$errandId/tracking'),
      );
}
