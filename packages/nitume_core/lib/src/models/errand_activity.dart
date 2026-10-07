import 'enums.dart';
import 'errand_location.dart';
import 'json_utils.dart';
import 'payment.dart';

/// Evidence item, `GET /errands/:errandId/evidence`.
///
/// [url] may be `null` (e.g. the console storage driver); show the
/// placeholder tile in that case.
class Evidence {
  const Evidence({
    required this.id,
    required this.errandId,
    required this.type,
    this.url,
    this.capturedAt,
    this.capturedAtLocation,
    this.uploadedBy,
    this.createdAt,
  });

  final String id;
  final String errandId;
  final EvidenceType type;
  final String? url;
  final DateTime? capturedAt;
  final GeoPoint? capturedAtLocation;
  final String? uploadedBy;
  final DateTime? createdAt;

  bool get isVideo => type == EvidenceType.video;

  factory Evidence.fromJson(Map<String, dynamic> json) {
    final geo = parseGeoPoint(json['capturedAtLocation']);
    return Evidence(
      id: json['id'] as String,
      errandId: json['errandId'] as String,
      type: EvidenceType.fromWire(json['type'] as String),
      url: json['url'] as String?,
      capturedAt: parseDate(json['capturedAt']),
      capturedAtLocation:
          geo == null ? null : GeoPoint(lat: geo.lat, lng: geo.lng),
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
  const PriceChangeDecision({required this.request, this.differencePayment});

  final PriceChangeRequest request;
  final PriceChangeDifference? differencePayment;

  factory PriceChangeDecision.fromJson(Map<String, dynamic> json) =>
      PriceChangeDecision(
        request: PriceChangeRequest.fromJson(json),
        differencePayment: json['differencePayment'] is Map
            ? PriceChangeDifference.fromJson(
                asJsonMap(json['differencePayment']),
              )
            : null,
      );
}

/// The payment recorded for an approved price difference: no service or
/// runner fee, only the extra merchant / item amount.
class PriceChangeDifference {
  const PriceChangeDifference({required this.payment, this.merchantPayment});

  final Payment payment;
  final MerchantPayment? merchantPayment;

  factory PriceChangeDifference.fromJson(Map<String, dynamic> json) =>
      PriceChangeDifference(
        payment: Payment.fromJson(asJsonMap(json['payment'])),
        merchantPayment: MerchantPayment.tryParse(json['merchantPayment']),
      );
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
class Dispute {
  const Dispute({
    required this.id,
    required this.errandId,
    required this.openedBy,
    required this.reason,
    required this.status,
    this.resolution,
    this.resolvedBy,
    this.createdAt,
    this.updatedAt,
    this.events = const [],
  });

  final String id;
  final String errandId;
  final String openedBy;
  final String reason;
  final DisputeStatus status;
  final String? resolution;
  final String? resolvedBy;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<DisputeEvent> events;

  factory Dispute.fromJson(Map<String, dynamic> json) => Dispute(
        id: json['id'] as String,
        errandId: json['errandId'] as String,
        openedBy: json['openedBy'] as String,
        reason: json['reason'] as String,
        status: DisputeStatus.fromWire(json['status'] as String),
        resolution: json['resolution'] as String?,
        resolvedBy: json['resolvedBy'] as String?,
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
