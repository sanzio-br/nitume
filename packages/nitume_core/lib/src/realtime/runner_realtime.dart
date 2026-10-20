import '../device/location_pinger.dart';
import '../models/enums.dart';
import '../models/json_utils.dart';

/// Why an open offer ended (`job:offer_withdrawn`). For the app's own logic
/// only: **never shown as copy** (the card just goes, with the usual
/// snackbar).
enum OfferWithdrawnReason {
  expired('expired'),
  declined('declined'),
  cancelled('cancelled');

  const OfferWithdrawnReason(this.wire);
  final String wire;

  /// `null` for an absent or unknown value.
  static OfferWithdrawnReason? tryFromWire(Object? v) {
    for (final r in values) {
      if (r.wire == v) return r;
    }
    return null;
  }
}

/// `job:offered {errandId, assignmentId, offerExpiresAt, offeredAt}` (RA-5),
/// sent to this runner's own room. Fetch the card with
/// `RunnerJobsRepository.job(errandId)`.
class JobOffered {
  const JobOffered({
    required this.errandId,
    required this.assignmentId,
    this.offerExpiresAt,
    this.offeredAt,
  });

  final String errandId;
  final String assignmentId;

  /// `null` only on old offers (row 156: no countdown, never removed).
  final DateTime? offerExpiresAt;
  final DateTime? offeredAt;

  factory JobOffered.fromJson(Map<String, dynamic> json) => JobOffered(
    errandId: json['errandId'] as String,
    assignmentId: json['assignmentId'] as String,
    offerExpiresAt: _date(json['offerExpiresAt']),
    offeredAt: _date(json['offeredAt']),
  );
}

/// `job:offer_withdrawn {errandId, assignmentId, reason, at}` (RA-5): an
/// open offer ended; drop its card. [reason] is never shown.
class JobOfferWithdrawn {
  const JobOfferWithdrawn({
    required this.errandId,
    required this.assignmentId,
    this.reason,
    this.at,
  });

  final String errandId;
  final String assignmentId;

  /// `null` for a value this build does not know.
  final OfferWithdrawnReason? reason;
  final DateTime? at;

  factory JobOfferWithdrawn.fromJson(Map<String, dynamic> json) =>
      JobOfferWithdrawn(
        errandId: json['errandId'] as String,
        assignmentId: json['assignmentId'] as String,
        reason: OfferWithdrawnReason.tryFromWire(json['reason']),
        at: _date(json['at']),
      );
}

/// What a decided price change means for the job (`price_change:decided`
/// `outcome`).
enum PriceDecisionOutcome {
  /// The customer approved: the item amount is now `toPrice`.
  approved('approved'),

  /// An admin rejected it: the task continues at `fromPrice` (row 55).
  rejected('rejected'),

  /// The customer rejected it and the task is CANCELLED (row 37).
  cancelled('cancelled');

  const PriceDecisionOutcome(this.wire);
  final String wire;

  /// `null` for an absent or unknown value.
  static PriceDecisionOutcome? tryFromWire(Object? v) {
    for (final o in values) {
      if (o.wire == v) return o;
    }
    return null;
  }
}

/// `price_change:decided {errandId, requestId, status, outcome, fromPrice,
/// toPrice, decidedAt}` (RA-5, A8), to the current runner's room and
/// `errand:{id}`. Prices are decimal strings. Reload the job for the new
/// item amount: an approved increase on `send_to_runner` may still wait
/// for the customer's payment (`RunnerJobView.differenceAwaitingPayment`,
/// row 248) until [PriceDifferencePaid] arrives.
class PriceChangeDecided {
  const PriceChangeDecided({
    required this.errandId,
    required this.requestId,
    required this.fromPrice,
    required this.toPrice,
    this.status,
    this.outcome,
    this.decidedAt,
  });

  final String errandId;
  final String requestId;

  /// The request's status (approved or rejected); `null` when unknown.
  final PriceChangeStatus? status;

  /// What it means for the job; `null` for a value this build does not
  /// know (reload the job).
  final PriceDecisionOutcome? outcome;
  final String fromPrice;
  final String toPrice;
  final DateTime? decidedAt;

  factory PriceChangeDecided.fromJson(Map<String, dynamic> json) {
    final status = json['status'];
    return PriceChangeDecided(
      errandId: json['errandId'] as String,
      requestId: json['requestId'] as String,
      status: status == PriceChangeStatus.approved.wire
          ? PriceChangeStatus.approved
          : status == PriceChangeStatus.rejected.wire
          ? PriceChangeStatus.rejected
          : null,
      outcome: PriceDecisionOutcome.tryFromWire(json['outcome']),
      fromPrice: '${json['fromPrice']}',
      toPrice: '${json['toPrice']}',
      decidedAt: _date(json['decidedAt']),
    );
  }
}

/// `price_change:difference_paid {errandId, requestId, amount, paidAt}`
/// (row 248), to the current runner's room and `errand:{id}`: the customer
/// paid the difference of an approved `send_to_runner` increase, so the
/// runner may now buy at the new amount. Reload the job
/// (`RunnerJobsRepository.job`): `requiredPurchase` is raised and
/// `differenceAwaitingPayment` cleared once every waiting request is paid.
class PriceDifferencePaid {
  const PriceDifferencePaid({
    required this.errandId,
    required this.requestId,
    required this.amount,
    this.paidAt,
  });

  final String errandId;

  /// The price-change request whose difference was paid.
  final String requestId;

  /// The difference paid, a 2-decimal KES string.
  final String amount;
  final DateTime? paidAt;

  factory PriceDifferencePaid.fromJson(Map<String, dynamic> json) =>
      PriceDifferencePaid(
        errandId: json['errandId'] as String,
        requestId: json['requestId'] as String,
        amount: parseDecimalOrZero(json['amount']),
        paidAt: _date(json['paidAt']),
      );
}

/// `error` of a refused `location:ping` ack (RA-4).
enum LocationPingError {
  unauthenticated('unauthenticated'),
  notRunner('not_runner'),
  invalidPayload('invalid_payload'),
  rateLimited('rate_limited'),
  stalePing('stale_ping'),
  runnerOffline('runner_offline'),

  /// Not this runner's accepted job: stop pinging it.
  forbidden('forbidden'),

  /// The job is not RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS: stop pinging
  /// it ([LocationPingAck.status] says where it is).
  notLive('not_live'),

  /// The server could not process it: keep the cadence.
  unavailable('unavailable'),

  /// A code this build does not know.
  unknown('');

  const LocationPingError(this.wire);
  final String wire;

  static LocationPingError fromWire(Object? v) {
    for (final e in values) {
      if (e != unknown && e.wire == v) return e;
    }
    return unknown;
  }
}

/// The server's answer to one `location:ping`
/// ([RunnerRealtimeClient.sendLocationPing]).
class LocationPingAck {
  const LocationPingAck({
    required this.ok,
    this.error,
    this.status,
    this.sent = true,
  });

  /// The ping was not sent or not answered (socket down, ack timeout).
  /// Keep the cadence; nothing to stop.
  const LocationPingAck.notSent() : this(ok: false, sent: false);

  /// Accepted.
  final bool ok;

  /// Why it was refused; `null` when [ok] or not [sent].
  final LocationPingError? error;

  /// Job pings: the job's state now (e.g. AWAITING_CUSTOMER after the
  /// runner finished on another device); `null` when not sent.
  final ErrandStatus? status;

  /// False for [LocationPingAck.notSent].
  final bool sent;

  /// Stop sending pings for that job ([LocationPingError.notLive] or
  /// [LocationPingError.forbidden]); switch the pinger out of
  /// `PingActiveJob`.
  bool get stopJobPings =>
      error == LocationPingError.notLive ||
      error == LocationPingError.forbidden;

  factory LocationPingAck.fromJson(Map<String, dynamic> json) {
    final ok = json['ok'] == true;
    return LocationPingAck(
      ok: ok,
      error: ok ? null : LocationPingError.fromWire(json['error']),
      status: ErrandStatus.tryFromWire(json['status']),
    );
  }
}

/// Runner-only live events and `location:ping` (RA-4, RA-5). The server
/// joins the runner's own room (`runner:{runnerProfileId}:status`) on
/// connect from the authenticated runner; the client never joins it (row
/// 139). `SocketIoRealtimeClient` implements this beside `RealtimeClient`.
abstract interface class RunnerRealtimeClient {
  /// `job:offered`: a new offer for this runner.
  Stream<JobOffered> get jobOffers;

  /// `job:offer_withdrawn`: an open offer ended (expired, declined
  /// elsewhere, cancelled).
  Stream<JobOfferWithdrawn> get jobOfferWithdrawals;

  /// `price_change:decided`.
  Stream<PriceChangeDecided> get priceChangeDecisions;

  /// `price_change:difference_paid` (row 248): reload the job.
  Stream<PriceDifferencePaid> get priceDifferencePayments;

  /// Emits `location:ping` ([LocationPing.toJson]) and resolves with the
  /// ack; [LocationPingAck.notSent] while not connected or when no ack
  /// comes in time. Wire it as `LocationPinger(onPing:)`.
  Future<LocationPingAck> sendLocationPing(LocationPing ping);
}

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
