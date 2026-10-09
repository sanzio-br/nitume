import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'push_service.dart';

/// [PushService] on Firebase Cloud Messaging (`firebase_messaging`, BOARD
/// row 31). Create it with [FcmPushService.initialize].
class FcmPushService implements PushService {
  FcmPushService._(this._messaging);

  final FirebaseMessaging _messaging;

  /// Initialises Firebase and returns the FCM service, or a
  /// [NoopPushService] when Firebase is not configured for this build (no
  /// `google-services.json` / `GoogleService-Info.plist` / [options]) or the
  /// platform has no messaging support. Never throws.
  ///
  /// Call once at start-up after `WidgetsFlutterBinding.ensureInitialized()`.
  static Future<PushService> initialize({FirebaseOptions? options}) async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: options);
      }
      final messaging = FirebaseMessaging.instance;
      if (!await messaging.isSupported()) return const NoopPushService();
      return FcmPushService._(messaging);
    } on Object {
      return const NoopPushService();
    }
  }

  @override
  bool get isAvailable => true;

  @override
  Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission();
    return switch (settings.authorizationStatus) {
      AuthorizationStatus.authorized || AuthorizationStatus.provisional => true,
      _ => false,
    };
  }

  @override
  Future<String?> getToken() async {
    try {
      return await _messaging.getToken();
    } on Object {
      // e.g. iOS before the APNs token exists, or no network.
      return null;
    }
  }

  @override
  Stream<String> get tokenRefreshes => _messaging.onTokenRefresh;

  @override
  Future<void> deleteToken() => _messaging.deleteToken();

  @override
  Future<PushMessage?> initialMessage() async {
    final m = await _messaging.getInitialMessage();
    return m == null ? null : _toPush(m);
  }

  @override
  Stream<PushMessage> get openedMessages =>
      FirebaseMessaging.onMessageOpenedApp.map(_toPush);

  @override
  Stream<PushMessage> get foregroundMessages =>
      FirebaseMessaging.onMessage.map(_toPush);

  static PushMessage _toPush(RemoteMessage m) => PushMessage.fromData(
    m.data,
    title: m.notification?.title,
    body: m.notification?.body,
  );
}
