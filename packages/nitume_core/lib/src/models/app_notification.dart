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