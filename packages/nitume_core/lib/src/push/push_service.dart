import 'dart:async';

import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb;
import 'package:flutter/widgets.dart' show TargetPlatform;

import '../api/api_exception.dart';
import '../models/enums.dart';
import '../repositories/errand_activity_repositories.dart';

/// A push notification as the app needs it. The API sends
/// `data: {eventType, errandId, notificationId}`; [title] / [body] are the
/// visible text when the OS shows one.
class PushMessage {
  const PushMessage({
    this.eventType,
    this.errandId,
    this.notificationId,
    this.title,
    this.body,
  });

  /// Raw `eventType`, e.g. `errand.QUOTED` or `refund.approved`.
  final String? eventType;
  final String? errandId;
  final String? notificationId;
  final String? title;
  final String? body;

  /// [eventType] as a known type; `null` when absent or unknown (open
  /// Notifications instead of a deep link).
  NotificationEventType? get event =>
      eventType == null ? null : NotificationEventType.tryFromWire(eventType!);

  /// Builds from a push `data` map; blank values become `null`.
  factory PushMessage.fromData(
    Map<String, dynamic> data, {
    String? title,
    String? body,
  }) {
    String? read(String key) {
      final v = data[key];
      return v is String && v.trim().isNotEmpty ? v : null;
    }

    return PushMessage(
      eventType: read('eventType'),
      errandId: read('errandId'),
      notificationId: read('notificationId'),
      title: title,
      body: body,
    );
  }
}

/// Push notifications (FCM, BOARD row 31). `FcmPushService` is the real
/// implementation; [NoopPushService] stands in when Firebase is not
/// configured (dev builds, tests) so callers never branch on availability.
abstract interface class PushService {
  /// False for the no-op service.
  bool get isAvailable;

  /// Shows the OS permission prompt (iOS, Android 13+). Ask once after
  /// sign-in; refusing changes nothing else (`_shared.md` §10). `true`
  /// when notifications may be shown.
  Future<bool> requestPermission();

  /// This install's push token, or `null` when unavailable.
  Future<String?> getToken();

  /// New tokens after a rotation; re-register each one.
  Stream<String> get tokenRefreshes;

  /// Invalidates the token (on log out, after removing the device).
  Future<void> deleteToken();

  /// The tap that launched the app from a terminated state, once.
  Future<PushMessage?> initialMessage();

  /// Taps on a notification while the app was in the background.
  Stream<PushMessage> get openedMessages;

  /// Messages that arrive while the app is in the foreground (the OS shows
  /// no banner; the app may refresh its badge or list).
  Stream<PushMessage> get foregroundMessages;
}

/// [PushService] that does nothing: no token, empty streams.
class NoopPushService implements PushService {
  const NoopPushService();

  @override
  bool get isAvailable => false;

  @override
  Future<bool> requestPermission() async => false;

  @override
  Future<String?> getToken() async => null;

  @override
  Stream<String> get tokenRefreshes => const Stream.empty();

  @override
  Future<void> deleteToken() async {}

  @override
  Future<PushMessage?> initialMessage() async => null;

  @override
  Stream<PushMessage> get openedMessages => const Stream.empty();

  @override
  Stream<PushMessage> get foregroundMessages => const Stream.empty();
}

/// Keeps this install's push token registered with the API
/// (`POST /users/me/devices`, `DELETE /users/me/devices/:id`; row 31).
///
/// * [register] after every successful sign-in, after `x-name-capture`
///   when it runs, and on app start while signed in (the upsert is
///   idempotent and returns the device id needed for [unregister]). It asks
///   for permission only when [askPermission] is true, then follows token
///   rotations until [unregister].
/// * [unregister] on log out (and on `account_suspended`), **before** the
///   session tokens are cleared: best effort, never throws.
class PushRegistration {
  PushRegistration({
    required this.push,
    required this.devices,
    DevicePlatform? platform,
  }) : platform = platform ?? currentDevicePlatform();

  final PushService push;
  final DevicesRepository devices;

  /// Sent as `platform`; defaults to the running OS.
  final DevicePlatform platform;

  String? _deviceId;
  StreamSubscription<String>? _refreshes;

  /// The registered device id, once [register] succeeded.
  String? get deviceId => _deviceId;

  /// Registers the current token. Returns `false` when push is unavailable,
  /// there is no token, or the API call failed (try again next start).
  Future<bool> register({bool askPermission = false}) async {
    if (!push.isAvailable) return false;
    try {
      if (askPermission) await push.requestPermission();
      final token = await push.getToken();
      _refreshes ??= push.tokenRefreshes.listen(_send);
      if (token == null) return false;
      return await _send(token);
    } on Object {
      return false;
    }
  }

  Future<bool> _send(String token) async {
    try {
      final device = await devices.register(
        platform: platform,
        pushToken: token,
      );
      _deviceId = device.id;
      return true;
    } on NitumeApiException {
      return false;
    }
  }

  /// Removes the device and invalidates the token. Never throws.
  Future<void> unregister() async {
    await _refreshes?.cancel();
    _refreshes = null;
    final id = _deviceId;
    _deviceId = null;
    if (id != null) {
      try {
        await devices.remove(id);
      } on Object {
        // Best effort: the API deactivates stale tokens on send failures.
      }
    }
    try {
      await push.deleteToken();
    } on Object {
      // Best effort.
    }
  }
}

/// [DevicePlatform] of the running app (Android for anything that is not
/// iOS or web).
DevicePlatform currentDevicePlatform() {
  if (kIsWeb) return DevicePlatform.web;
  return switch (defaultTargetPlatform) {
    TargetPlatform.iOS || TargetPlatform.macOS => DevicePlatform.ios,
    _ => DevicePlatform.android,
  };
}
