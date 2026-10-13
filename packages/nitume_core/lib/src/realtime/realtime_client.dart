import '../models/enums.dart';
import '../models/errand_location.dart';

/// Socket.IO contract names (path `/socket.io`, handshake `auth: {token}`).
///
/// The room format and `location:update` come from the system design
/// (§4.2); the other names were approved by the owner (BOARD row 23). Use
/// these constants only; never type an event name in a screen.
abstract final class RealtimeEvents {
  static const path = '/socket.io';

  /// Room for one errand (`errand:{id}`), §4.2.
  static String errandRoom(String errandId) => 'errand:$errandId';

  // client → server (row 23)
  static const errandJoin = 'errand:join';
  static const errandLeave = 'errand:leave';

  /// Runner position (§4.2, `LocationPing`). The API intake is RA-4 (not
  /// built yet).
  static const locationPing = 'location:ping';

  // server → client
  /// §4.2.
  static const locationUpdate = 'location:update';

  /// Row 23.
  static const errandStatusChanged = 'errand:status_changed';

  /// Row 23.
  static const evidenceUploaded = 'evidence:uploaded';

  /// Row 23.
  static const priceChangeRequested = 'price_change:requested';

  /// An admin re-quoted the task (row 72).
  static const quoteReissued = 'quote:reissued';

  /// The merchant's Till/Paybill details were set or changed (row 43).
  static const merchantDetailsUpdated = 'merchant_details:updated';

  /// The Till/Paybill changed after the customer's merchant-direct payment
  /// started (row 80).
  static const merchantDetailsChanged = 'merchant_details:changed';

  /// The server removed this socket from `errand:{id}` because the user can
  /// no longer view the errand (e.g. runner reassigned).
  static const errandAccessRevoked = 'errand:access_revoked';

  /// A customer asked for a new quote (row 68); sent to admins and the
  /// errand room.
  static const quoteRequested = 'quote:requested';
}

/// `location:update {errandId, lat, lng, eta, ts}`.
class LocationUpdate {
  const LocationUpdate({
    required this.errandId,
    required this.point,
    this.eta,
    this.timestamp,
  });

  final String errandId;
  final GeoPoint point;

  /// `eta` arrives in seconds; `null` when unknown.
  final Duration? eta;
  final DateTime? timestamp;

  factory LocationUpdate.fromJson(Map<String, dynamic> json) {
    final eta = json['eta'] as num?;
    return LocationUpdate(
      errandId: json['errandId'] as String,
      point: GeoPoint(
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
      ),
      eta: eta == null ? null : Duration(seconds: eta.round()),
      timestamp: json['ts'] is String ? DateTime.tryParse(json['ts']) : null,
    );
  }
}

/// `errand:status_changed {errandId, status, from, at}`.
class ErrandStatusChanged {
  const ErrandStatusChanged({
    required this.errandId,
    required this.status,
    this.from,
    this.at,
  });

  final String errandId;
  final ErrandStatus status;
  final ErrandStatus? from;
  final DateTime? at;

  factory ErrandStatusChanged.fromJson(Map<String, dynamic> json) =>
      ErrandStatusChanged(
        errandId: json['errandId'] as String,
        status: ErrandStatus.fromWire(json['status'] as String),
        from: json['from'] == null
            ? null
            : ErrandStatus.fromWire(json['from'] as String),
        at: json['at'] is String ? DateTime.tryParse(json['at']) : null,
      );
}

/// `evidence:uploaded {errandId, evidenceId, type, capturedAt}`.
class EvidenceUploaded {
  const EvidenceUploaded({
    required this.errandId,
    required this.evidenceId,
    required this.type,
    this.capturedAt,
  });

  final String errandId;
  final String evidenceId;
  final EvidenceType type;
  final DateTime? capturedAt;

  factory EvidenceUploaded.fromJson(Map<String, dynamic> json) =>
      EvidenceUploaded(
        errandId: json['errandId'] as String,
        evidenceId: json['evidenceId'] as String,
        type: EvidenceType.fromWire(json['type'] as String),
        capturedAt: json['capturedAt'] is String
            ? DateTime.tryParse(json['capturedAt'])
            : null,
      );
}

/// `price_change:requested {errandId, requestId, fromPrice, toPrice, reason,
/// createdAt}`. Prices are decimal strings.
class PriceChangeRequested {
  const PriceChangeRequested({
    required this.errandId,
    required this.requestId,
    required this.fromPrice,
    required this.toPrice,
    this.reason,
    this.createdAt,
  });

  final String errandId;
  final String requestId;
  final String fromPrice;
  final String toPrice;
  final String? reason;
  final DateTime? createdAt;

  factory PriceChangeRequested.fromJson(Map<String, dynamic> json) =>
      PriceChangeRequested(
        errandId: json['errandId'] as String,
        requestId: json['requestId'] as String,
        fromPrice: '${json['fromPrice']}',
        toPrice: '${json['toPrice']}',
        reason: json['reason'] as String?,
        createdAt: json['createdAt'] is String
            ? DateTime.tryParse(json['createdAt'])
            : null,
      );
}

/// `quote:reissued {errandId, quoteId, total, currency, expiresAt, status,
/// acceptanceRequired}` (row 72). [total] is a decimal string.
class QuoteReissued {
  const QuoteReissued({
    required this.errandId,
    required this.quoteId,
    required this.total,
    this.currency = 'KES',
    this.expiresAt,
    this.status,
    this.acceptanceRequired = false,
  });

  final String errandId;
  final String quoteId;
  final String total;
  final String currency;
  final DateTime? expiresAt;

  /// The errand's state (QUOTED or ACCEPTED); `null` when unknown.
  final ErrandStatus? status;

  /// True on an ACCEPTED errand: the customer must accept the new quote
  /// before paying (`ErrandRepository.acceptQuote`).
  final bool acceptanceRequired;

  factory QuoteReissued.fromJson(Map<String, dynamic> json) {
    final status = json['status'];
    return QuoteReissued(
      errandId: json['errandId'] as String,
      quoteId: json['quoteId'] as String,
      total: '${json['total']}',
      currency: json['currency'] is String ? json['currency'] as String : 'KES',
      expiresAt: json['expiresAt'] is String
          ? DateTime.tryParse(json['expiresAt'])
          : null,
      status: status is String ? _tryStatus(status) : null,
      acceptanceRequired: json['acceptanceRequired'] == true,
    );
  }
}

ErrandStatus? _tryStatus(String wire) {
  for (final s in ErrandStatus.values) {
    if (s.wire == wire) return s;
  }
  return null;
}

/// `merchant_details:updated {errandId, merchantName, tillNumber,
/// paybillNumber, accountReference}` (row 43). Screens refetch the payment
/// summary; the Till/Paybill is still shown only on `x-merchant-payment`.
class MerchantDetailsUpdated {
  const MerchantDetailsUpdated({
    required this.errandId,
    this.merchantName,
    this.tillNumber,
    this.paybillNumber,
    this.accountReference,
  });

  final String errandId;
  final String? merchantName;
  final String? tillNumber;
  final String? paybillNumber;
  final String? accountReference;

  /// True when a Till or Paybill number is set.
  bool get hasMerchantDetails => tillNumber != null || paybillNumber != null;

  factory MerchantDetailsUpdated.fromJson(Map<String, dynamic> json) {
    String? read(String key) {
      final v = json[key];
      return v is String && v.trim().isNotEmpty ? v : null;
    }

    return MerchantDetailsUpdated(
      errandId: json['errandId'] as String,
      merchantName: read('merchantName'),
      tillNumber: read('tillNumber'),
      paybillNumber: read('paybillNumber'),
      accountReference: read('accountReference'),
    );
  }
}

/// `merchant_details:changed {errandId, merchantName, tillNumber,
/// paybillNumber, accountReference, merchantDetailsUpdatedAt}` (row 80): the
/// details changed after the customer's merchant-direct payment started.
/// Screens refetch the payment summary and show the "Details changed"
/// notice on `x-merchant-payment`; the old number is never shown.
class MerchantDetailsChanged {
  const MerchantDetailsChanged({
    required this.errandId,
    this.merchantName,
    this.tillNumber,
    this.paybillNumber,
    this.accountReference,
    this.merchantDetailsUpdatedAt,
  });

  final String errandId;
  final String? merchantName;
  final String? tillNumber;
  final String? paybillNumber;
  final String? accountReference;

  /// When the change was saved; `null` when absent or malformed.
  final DateTime? merchantDetailsUpdatedAt;

  factory MerchantDetailsChanged.fromJson(Map<String, dynamic> json) {
    final updated = MerchantDetailsUpdated.fromJson(json);
    final at = json['merchantDetailsUpdatedAt'];
    return MerchantDetailsChanged(
      errandId: updated.errandId,
      merchantName: updated.merchantName,
      tillNumber: updated.tillNumber,
      paybillNumber: updated.paybillNumber,
      accountReference: updated.accountReference,
      merchantDetailsUpdatedAt: at is String ? DateTime.tryParse(at) : null,
    );
  }
}

/// `errand:access_revoked {errandId}`: the server removed this socket from
/// the errand's room because the user can no longer view it. Stop showing
/// live data for that errand (its stream ends; the client does not re-join
/// it on reconnect).
class ErrandAccessRevoked {
  const ErrandAccessRevoked({required this.errandId});

  final String errandId;

  factory ErrandAccessRevoked.fromJson(Map<String, dynamic> json) =>
      ErrandAccessRevoked(errandId: json['errandId'] as String);
}

/// `quote:requested {errandId, reference, quoteId, status,
/// quoteRequestedAt}` (row 68): a new quote was requested on the errand
/// (also from another device). Screens show the "New quote requested"
/// waiting state.
class QuoteRequested {
  const QuoteRequested({
    required this.errandId,
    this.reference,
    this.quoteId,
    this.status,
    this.quoteRequestedAt,
  });

  final String errandId;
  final String? reference;

  /// The expired quote the customer wants replaced.
  final String? quoteId;

  /// QUOTED or ACCEPTED; `null` when unknown.
  final ErrandStatus? status;
  final DateTime? quoteRequestedAt;

  factory QuoteRequested.fromJson(Map<String, dynamic> json) {
    final status = json['status'];
    final at = json['quoteRequestedAt'];
    return QuoteRequested(
      errandId: json['errandId'] as String,
      reference: json['reference'] is String
          ? json['reference'] as String
          : null,
      quoteId: json['quoteId'] is String ? json['quoteId'] as String : null,
      status: status is String ? _tryStatus(status) : null,
      quoteRequestedAt: at is String ? DateTime.tryParse(at) : null,
    );
  }
}

/// Connection state of a [RealtimeClient].
///
/// Screens poll their REST snapshot only while the state is not
/// [connected] and show `Reconnecting…` for [reconnecting] where specced
/// (`_shared.md` §10).
enum RealtimeConnectionState {
  /// Not connected and not trying (before `connect` or after `disconnect`).
  disconnected,

  /// First connection attempt in progress.
  connecting,

  /// Connected and authenticated; joined rooms are live.
  connected,

  /// The connection dropped or was refused; retrying with backoff.
  reconnecting;

  bool get isConnected => this == connected;
}

/// Live errand updates over Socket.IO.
///
/// `SocketIoRealtimeClient` is the implementation (row 29); tests use a
/// fake. Implementations parse payloads with the `fromJson` factories above
/// and use the names in [RealtimeEvents].
abstract interface class RealtimeClient {
  /// Connects with the current access token (`auth: {token}`).
  Future<void> connect({required String accessToken});

  Future<void> disconnect();

  /// State changes (broadcast). Read [currentState] for the value now.
  Stream<RealtimeConnectionState> get connectionState;

  /// The state right now.
  RealtimeConnectionState get currentState;

  /// Emits `errand:join`; resolves with the ack's `ok`. Joined rooms are
  /// re-joined after every reconnect until [leaveErrand].
  Future<bool> joinErrand(String errandId);

  /// Emits `errand:leave`.
  Future<void> leaveErrand(String errandId);

  Stream<LocationUpdate> get locationUpdates;
  Stream<ErrandStatusChanged> get statusChanges;
  Stream<EvidenceUploaded> get evidenceUploads;
  Stream<PriceChangeRequested> get priceChangeRequests;

  /// `quote:reissued` (row 72).
  Stream<QuoteReissued> get quoteReissues;

  /// `merchant_details:updated` (row 43).
  Stream<MerchantDetailsUpdated> get merchantDetailsUpdates;

  /// `merchant_details:changed` (row 80).
  Stream<MerchantDetailsChanged> get merchantDetailsChanges;

  /// `quote:requested` (row 68).
  Stream<QuoteRequested> get quoteRequests;

  /// `errand:access_revoked`: stop showing live data for that errand. The
  /// errand is dropped from the rooms re-joined on reconnect.
  Stream<ErrandAccessRevoked> get accessRevocations;
}
