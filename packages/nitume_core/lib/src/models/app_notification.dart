import 'enums.dart';

/// In-app feed item (`notifications`), returned by `GET /notifications`.
///
/// Distinct from `notification_log` on the API side, which is the outbound
/// delivery audit trail.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.eventType,
    required this.title,
    required this.isRead,
    this.errandId,
    this.body,
    this.readAt,
    this.createdAt,
  });

  final String id;
  final String eventType;

  /// Typed [eventType]; `null` for values this client does not know.
  NotificationEventType? get event =>
      NotificationEventType.tryFromWire(eventType);

  /// True for [NotificationEventType.outsideServiceAreaWire] (rows 236,
  /// 241): open `x-awaiting-quote` for [errandId]. [event] is `null` for it.
  bool get isOutsideServiceArea =>
      eventType == NotificationEventType.outsideServiceAreaWire;

  /// The errand state an `errand.<STATUS>` notification announces, read
  /// tolerantly from [eventType]: covers every typed [event] with a status
  /// and also states without an enum value yet, such as `errand.EXPIRED`
  /// ([NotificationEventType.errandExpiredWire] → [ErrandStatus.expired]).
  /// `null` for other events and unknown states.
  ErrandStatus? get announcedStatus {
    final typed = event?.status;
    if (typed != null) return typed;
    const prefix = 'errand.';
    if (!eventType.startsWith(prefix)) return null;
    return ErrandStatus.tryFromWire(eventType.substring(prefix.length));
  }

  final String title;
  final String? body;
  final String? errandId;
  final bool isRead;
  final DateTime? readAt;
  final DateTime? createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as String,
      eventType: json['eventType'] as String,
      title: json['title'] as String,
      body: json['body'] as String?,
      errandId: json['errandId'] as String?,
      isRead: json['readAt'] != null,
      readAt: json['readAt'] == null
          ? null
          : DateTime.tryParse(json['readAt'] as String),
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.tryParse(json['createdAt'] as String),
    );
  }
}
