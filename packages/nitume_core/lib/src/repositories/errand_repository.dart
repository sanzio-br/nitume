import '../api/api_exception.dart';
import '../api/nitume_api_client.dart';
import '../models/customer_refund.dart';
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
  }) async => ErrandTransitionResult.fromJson(
    await _api.patchMap(
      '/errands/$errandId/status',
      data: {'to': to.wire, 'note': ?note},
    ),
  );

  /// Sets or clears (`null`) the optional title (`PATCH /errands/:id`,
  /// 3–120 characters after trimming). Returns the updated errand.
  Future<Errand> updateTitle(String errandId, String? title) async =>
      Errand.fromJson(
        await _api.patchMap('/errands/$errandId', data: {'title': title}),
      );

  /// Partial edit (`PATCH /errands/:id` `{ title?, deadlineAt? }`): sends
  /// only the fields set on [update]. Returns the updated errand. See
  /// [ErrandUpdate] for the rules and error codes.
  Future<Errand> update(String errandId, ErrandUpdate update) async =>
      Errand.fromJson(
        await _api.patchMap('/errands/$errandId', data: update.toJson()),
      );

  /// Customer sets a new deadline before payment, or `null` to switch back
  /// to `Flexible` (`PATCH /errands/:id` `{ deadlineAt }`, rows 237, 243,
  /// 244). This is how the customer answers
  /// [ApiErrorCodes.deadlinePassedBeforePayment]. Throws
  /// [NitumeApiException] with [ApiErrorCodes.deadlineInPast],
  /// [ApiErrorCodes.deadlineNotEditable] or
  /// [ApiErrorCodes.deadlineCustomerOnly] (read it with
  /// [NitumeApiException.deadlineProblem]).
  Future<Errand> setDeadline(String errandId, DateTime? deadlineAt) =>
      update(errandId, const ErrandUpdate().withDeadline(deadlineAt));

  /// Newest first, cursor-paginated (`GET /errands?status=A,B`). Customers
  /// never see their own drafts in this list.
  Future<ErrandPage> list({
    Set<ErrandStatus>? statuses,
    int? limit,
    String? cursor,
  }) async => ErrandPage.fromJson(
    await _api.getMap(
      '/errands',
      query: {
        if (statuses != null && statuses.isNotEmpty)
          'status': statuses.map((s) => s.wire).join(','),
        'limit': ?limit,
        'cursor': ?cursor,
      },
    ),
  );

  /// Number of errands visible to the caller (`GET /errands/count`).
  Future<int> count({Set<ErrandStatus>? statuses}) async {
    final data = await _api.getMap(
      '/errands/count',
      query: {
        if (statuses != null && statuses.isNotEmpty)
          'status': statuses.map((s) => s.wire).join(','),
      },
    );
    return (data['count'] as num?)?.toInt() ?? 0;
  }

  /// Task defaults (`GET /errands/defaults`, row 221):
  /// `{ defaultDeadlineHours }` for the customer `Flexible` deadline caption
  /// (`v-new-details`). Any signed-in role may read it.
  Future<ErrandDefaults> defaults() async =>
      ErrandDefaults.fromJson(await _api.getMap('/errands/defaults'));

  /// One errand with its assignment (`GET /errands/:id`).
  Future<Errand> get(String errandId) async =>
      Errand.fromJson(await _api.getMap('/errands/$errandId'));

  /// Status history, oldest first (`GET /errands/:id/history`).
  Future<List<StatusHistoryEntry>> history(String errandId) async {
    final data = await _api.getList('/errands/$errandId/history');
    return asJsonList(data).map(StatusHistoryEntry.fromJson).toList();
  }

  /// Accepts the errand's newest quote (`POST /errands/:id/quote/accept`,
  /// row 72): on QUOTED it is the QUOTED → ACCEPTED step; on ACCEPTED it
  /// accepts an admin re-quote ([Errand.quoteAcceptanceRequired]), which
  /// payment needs. Idempotent on the API.
  ///
  /// Fails with `quote_expired` (request a new quote) or
  /// `quote_not_acceptable` (the task left QUOTED / ACCEPTED; reload).
  ///
  /// [fallbackToTransition]: against an API without the endpoint (an
  /// uncoded 404), a QUOTED errand moves with `transition(..., accepted)`
  /// and an ACCEPTED one needs nothing, as the app's
  /// `TransitionQuoteAcceptance` does. [QuoteAcceptanceResult.quote] is `null`
  /// then.
  Future<QuoteAcceptanceResult> acceptQuote(
    String errandId, {
    bool fallbackToTransition = false,
  }) async {
    try {
      return QuoteAcceptanceResult.fromJson(
        await _api.postMap('/errands/$errandId/quote/accept'),
      );
    } on NitumeApiException catch (e) {
      if (!fallbackToTransition || e.statusCode != 404 || e.code != null) {
        rethrow;
      }
      final current = await get(errandId);
      if (current.status == ErrandStatus.quoted) {
        final moved = await transition(errandId, ErrandStatus.accepted);
        return QuoteAcceptanceResult(errand: moved.errand);
      }
      return QuoteAcceptanceResult(errand: current);
    }
  }

  /// "Request a new quote" after the quote expired
  /// (`POST /errands/:id/quote/request`, row 68). Records the request (no
  /// state change) and returns the errand, whose [Errand.quoteRequestedAt]
  /// is then set.
  ///
  /// Idempotent for the screen: when a request is already open (409
  /// `quote_request_pending`) the errand is re-read and returned as on
  /// success. Other failures rethrow: `quote_still_valid` (reload and show
  /// checkout) and `quote_request_not_allowed` (reload the task).
  Future<Errand> requestNewQuote(String errandId) async {
    try {
      return Errand.fromJson(
        await _api.postMap('/errands/$errandId/quote/request'),
      );
    } on NitumeApiException catch (e) {
      if (e.code != ApiErrorCodes.quoteRequestPending) rethrow;
      return get(errandId);
    }
  }

  /// Every refund review of the errand, newest first
  /// (`GET /errands/:id/refunds`, row 71): the cancellation review and any
  /// price-decrease reviews. Empty when there are none; unreadable entries
  /// are skipped.
  Future<List<CustomerRefund>> refunds(String errandId) async {
    final data = await _api.getMap('/errands/$errandId/refunds');
    final items = data['items'];
    if (items is! List) return const [];
    return [for (final item in items) ?CustomerRefund.tryParse(item)];
  }

  /// Customer-readable refund review of the errand
  /// (`GET /errands/:id/refund`, `_shared.md` §11); `null` when there is
  /// none (404 `refund_not_found`), so the refund group stays hidden.
  Future<CustomerRefund?> refund(String errandId) async {
    try {
      return CustomerRefund.tryParse(
        await _api.getMap('/errands/$errandId/refund'),
      );
    } on NitumeApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
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
