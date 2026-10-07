import '../models/enums.dart';
import '../models/errand_location.dart';

/// Socket.IO contract names (path `/socket.io`, handshake `auth: {token}`).
///
/// Only the room format and `location:update` are named by the system
/// design (§4.2). Every other name is **proposed by api-contract and pending
/// owner approval**; change them here only.
abstract final class RealtimeEvents {
  static const path = '/socket.io';

  /// Room for one errand (`errand:{id}`), §4.2.
  static String errandRoom(String errandId) => 'errand:$errandId';

  // client → server (pending owner approval)
  static const errandJoin = 'errand:join';
  static const errandLeave = 'errand:leave';

  // server → client
  /// §4.2.
  static const locationUpdate = 'location:update';

  /// Pending owner approval.
  static const errandStatusChanged = 'errand:status_changed';

  /// Pending owner approval.
  static const evidenceUploaded = 'evidence:uploaded';

  /// Pending owner approval.
  static const priceChangeRequested = 'price_change:requested';
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

/// Connection state of a [RealtimeClient].
enum RealtimeConnectionState { disconnected, connecting, connected }

/// Live errand updates over Socket.IO.
///
/// This is an interface only: no Socket.IO client package is a dependency
/// of `nitume_core` (adding one, e.g. `socket_io_client`, is an open owner
/// question under AGENT_BUILD_INSTRUCTIONS §3). An implementation parses
/// payloads with the `fromJson` factories above and uses the names in
/// [RealtimeEvents].
abstract interface class RealtimeClient {
  /// Connects with the current access token (`auth: {token}`).
  Future<void> connect({required String accessToken});

  Future<void> disconnect();

  Stream<RealtimeConnectionState> get connectionState;

  /// Emits `errand:join`; resolves with the ack's `ok`.
  Future<bool> joinErrand(String errandId);

  /// Emits `errand:leave`.
  Future<void> leaveErrand(String errandId);

  Stream<LocationUpdate> get locationUpdates;
  Stream<ErrandStatusChanged> get statusChanges;
  Stream<EvidenceUploaded> get evidenceUploads;
  Stream<PriceChangeRequested> get priceChangeRequests;
}
