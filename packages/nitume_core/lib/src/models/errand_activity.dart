import 'customer_refund.dart';
import 'enums.dart';
import 'errand_location.dart';
import 'json_utils.dart';
import 'payment.dart';

/// Evidence item, `GET /errands/:errandId/evidence`.
///
/// [url] is a short-lived signed link (row 25) or `null`; show the
/// placeholder tile when `null`. Re-fetch the list once [urlExpiresAt]
/// passes or a load fails ([isUrlExpired]).
class Evidence {
  const Evidence({
    required this.id,
    required this.errandId,
    required this.type,
    this.url,
    this.urlExpiresAt,
    this.capturedAt,
    this.capturedAtLocation,
    this.uploadedBy,
    this.createdAt,
  });

  final String id;
  final String errandId;
  final EvidenceType type;
  final String? url;

  /// When the signed [url] stops working; `null` when unknown.
  final DateTime? urlExpiresAt;
  final DateTime? capturedAt;
  final GeoPoint? capturedAtLocation;
  final String? uploadedBy;
  final DateTime? createdAt;

  bool get isVideo => type == EvidenceType.video;

  /// True once [urlExpiresAt] has passed (at [now], default now).
  bool isUrlExpired([DateTime? now]) {
    final at = urlExpiresAt;
    return at != null && !(now ?? DateTime.now()).isBefore(at);
  }

  factory Evidence.fromJson(Map<String, dynamic> json) {
    final geo = parseGeoPoint(json['capturedAtLocation']);
    return Evidence(
      id: json['id'] as String,
      errandId: json['errandId'] as String,
      type: EvidenceType.fromWire(json['type'] as String),
      url: parseOptionalString(json['url']),
      urlExpiresAt: parseDate(json['urlExpiresAt']),
      capturedAt: parseDate(json['capturedAt']),
      capturedAtLocation: geo == null
          ? null
          : GeoPoint(lat: geo.lat, lng: geo.lng),
      uploadedBy: json['uploadedBy'] as String?,
      createdAt: parseDate(json['createdAt']),
    );
  }
}

/// Rating of an errand, `GET/POST /errands/:errandId/rating`.
class Rating {
  const Rating({
    required this.id,
    required this.errandId,
    required this.raterUserId,
    required this.rateeUserId,
    required this.score,
    this.comment,
    this.createdAt,
  });

  final String id;
  final String errandId;
  final String raterUserId;
  final String rateeUserId;

  /// 1–5.
  final int score;
  final String? comment;
  final DateTime? createdAt;

  factory Rating.fromJson(Map<String, dynamic> json) => Rating(
    id: json['id'] as String,
    errandId: json['errandId'] as String,
    raterUserId: json['raterUserId'] as String,
    rateeUserId: json['rateeUserId'] as String,
    score: (json['score'] as num).toInt(),
    comment: json['comment'] as String?,
    createdAt: parseDate(json['createdAt']),
  );
}

/// A runner's request to change the price
/// (`/errands/:errandId/price-change`).
class PriceChangeRequest {
  const PriceChangeRequest({
    required this.id,
    required this.errandId,
    required this.requestedByUserId,
    required this.fromPrice,
    required this.toPrice,
    required this.status,
    this.reason,
    this.decidedByUserId,
    this.decidedAt,
    this.createdAt,
  });

  final String id;
  final String errandId;
  final String requestedByUserId;
  final String fromPrice;
  final String toPrice;
  final PriceChangeStatus status;
  final String? reason;
  final String? decidedByUserId;
  final DateTime? decidedAt;
  final DateTime? createdAt;

  bool get isPending => status == PriceChangeStatus.requested;

  factory PriceChangeRequest.fromJson(Map<String, dynamic> json) =>
      PriceChangeRequest(
        id: json['id'] as String,
        errandId: json['errandId'] as String,
        requestedByUserId: json['requestedByUserId'] as String,
        fromPrice: parseDecimalOrZero(json['fromPrice']),
        toPrice: parseDecimalOrZero(json['toPrice']),
        status: PriceChangeStatus.fromWire(json['status'] as String),
        reason: json['reason'] as String?,
        decidedByUserId: json['decidedByUserId'] as String?,
        decidedAt: parseDate(json['decidedAt']),
        createdAt: parseDate(json['createdAt']),
      );
}

/// Result of approving or rejecting a price change
/// (`POST /errands/:errandId/price-change/:requestId/approve | reject`).
///
/// [differencePayment] is set when an approved increase on an already paid
/// task was recorded: the extra item amount and how to pay it
/// (`x-merchant-payment`). A customer reject also cancels the task.
class PriceChangeDecision {
  const PriceChangeDecision({
    required this.request,
    this.differencePayment,
    this.refundReview,
  });

  final PriceChangeRequest request;

  /// Set when an approved increase on a paid task was recorded: an STK
  /// charge to Nitume (`send_to_runner`, with `stkStatus`) or the
  /// Till/Paybill amount (`merchant_direct`).
  final PriceChangeDifference? differencePayment;

  /// Set when the decision opened an admin refund review (§11). The API
  /// does not return it yet: decreases are not built (schema row 62 open)
  /// and a reject's review is read with `ErrandRepository.refund`. Parsed
  /// tolerantly; `null` until the API sends `refundReview`.
  final CustomerRefund? refundReview;

  factory PriceChangeDecision.fromJson(Map<String, dynamic> json) =>
      PriceChangeDecision(
        request: PriceChangeRequest.fromJson(json),
        differencePayment: json['differencePayment'] is Map
            ? PriceChangeDifference.fromJson(
                asJsonMap(json['differencePayment']),
              )
            : null,
        refundReview: CustomerRefund.tryParse(json['refundReview']),
      );
}

/// The payment recorded for an approved price difference: no service or
/// runner fee, only the extra merchant / item amount.
class PriceChangeDifference extends ItemPayment {
  const PriceChangeDifference({
    required super.payment,
    super.transactions,
    super.stkStatus,
    super.checkoutRequestId,
    super.merchantPayment,
    super.failureReason,
  });

  factory PriceChangeDifference.fromJson(Map<String, dynamic> json) {
    final base = ItemPayment.fromJson(json);
    return PriceChangeDifference(
      payment: base.payment,
      transactions: base.transactions,
      stkStatus: base.stkStatus,
      checkoutRequestId: base.checkoutRequestId,
      merchantPayment: base.merchantPayment,
      failureReason: base.failureReason,
    );
  }
}

/// One event in a dispute's audit trail.
class DisputeEvent {
  const DisputeEvent({
    required this.id,
    required this.eventType,
    this.actorId,
    this.payload,
    this.createdAt,
  });

  final String id;
  final DisputeEventType eventType;
  final String? actorId;
  final Map<String, dynamic>? payload;
  final DateTime? createdAt;

  factory DisputeEvent.fromJson(Map<String, dynamic> json) => DisputeEvent(
    id: json['id'] as String,
    eventType: DisputeEventType.fromWire(json['eventType'] as String),
    actorId: json['actorId'] as String?,
    payload: asJsonMapOrNull(json['payload']),
    createdAt: parseDate(json['createdAt']),
  );
}

/// A dispute (`POST /disputes`, `GET /disputes/:id`).
///
/// Once resolved (row 79) it carries the [verdict], [resolvedAt] and the
/// admin's [resolution] note, which customer and runner both see. For them
/// [resolvedBy] is always `null` (the API hides the admin) and internal
/// `comment` events are left out.
class Dispute {
  const Dispute({
    required this.id,
    required this.errandId,
    required this.openedBy,
    required this.reason,
    required this.status,
    this.resolution,
    this.resolvedBy,
    this.verdict,
    this.resolvedAt,
    this.createdAt,
    this.updatedAt,
    this.events = const [],
  });

  final String id;
  final String errandId;
  final String openedBy;
  final String reason;
  final DisputeStatus status;

  /// The admin's resolution note; `null` while open.
  final String? resolution;

  /// Admin who resolved it; `null` for customer and runner viewers.
  final String? resolvedBy;

  /// Verdict of the resolution; `null` while open or when unknown.
  final DisputeVerdict? verdict;

  /// When the dispute was resolved; `null` while open.
  final DateTime? resolvedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<DisputeEvent> events;

  factory Dispute.fromJson(Map<String, dynamic> json) => Dispute(
    id: json['id'] as String,
    errandId: json['errandId'] as String,
    openedBy: json['openedBy'] as String,
    reason: json['reason'] as String,
    status: DisputeStatus.fromWire(json['status'] as String),
    resolution: parseOptionalString(json['resolution']),
    resolvedBy: parseOptionalString(json['resolvedBy']),
    verdict: DisputeVerdict.tryFromWire(json['verdict']),
    resolvedAt: parseDate(json['resolvedAt']),
    createdAt: parseDate(json['createdAt']),
    updatedAt: parseDate(json['updatedAt']),
    events: asJsonList(json['events']).map(DisputeEvent.fromJson).toList(),
  );
}

/// A registered push device (`POST /users/me/devices`).
class Device {
  const Device({
    required this.id,
    required this.platform,
    this.pushToken,
    this.lastSeenAt,
    this.createdAt,
  });

  final String id;
  final DevicePlatform platform;
  final String? pushToken;
  final DateTime? lastSeenAt;
  final DateTime? createdAt;

  factory Device.fromJson(Map<String, dynamic> json) => Device(
    id: json['id'] as String,
    platform: DevicePlatform.fromWire(json['platform'] as String),
    pushToken: json['pushToken'] as String?,
    lastSeenAt: parseDate(json['lastSeenAt']),
    createdAt: parseDate(json['createdAt']),
  );
}
