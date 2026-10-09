import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter({this.failRegister = false});

  final bool failRegister;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls.add('${options.method} ${options.path} ${jsonEncode(options.data)}');
    if (options.method == 'POST' && failRegister) {
      return ResponseBody.fromString('{"message":"x"}', 500, headers: _json);
    }
    final body = options.method == 'POST'
        ? {
            'id': 'd1',
            'platform': (options.data as Map)['platform'],
            'pushToken': (options.data as Map)['pushToken'],
          }
        : null;
    return ResponseBody.fromString(jsonEncode(body), 200, headers: _json);
  }

  static const _json = {
    'content-type': ['application/json'],
  };

  @override
  void close({bool force = false}) {}
}

class _FakePush implements PushService {
  String? token = 'tok1';
  int permissionAsks = 0;
  bool deleted = false;
  final refresh = StreamController<String>.broadcast();

  @override
  bool get isAvailable => true;
  @override
  Future<bool> requestPermission() async {
    permissionAsks++;
    return true;
  }

  @override
  Future<String?> getToken() async => token;
  @override
  Stream<String> get tokenRefreshes => refresh.stream;
  @override
  Future<void> deleteToken() async => deleted = true;
  @override
  Future<PushMessage?> initialMessage() async => null;
  @override
  Stream<PushMessage> get openedMessages => const Stream.empty();
  @override
  Stream<PushMessage> get foregroundMessages => const Stream.empty();
}

DevicesRepository _devices(_Adapter adapter) => DevicesRepository(
  NitumeApiClient(
    config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
    tokenStore: InMemoryTokenStore(),
    httpClientAdapter: adapter,
  ),
);

void main() {
  test('PushMessage reads the API data shape', () {
    final m = PushMessage.fromData({
      'eventType': 'price_change.requested',
      'errandId': 'e1',
      'notificationId': 'n1',
    }, title: 'Price change');
    expect(m.event, NotificationEventType.priceChangeRequested);
    expect(m.errandId, 'e1');
    expect(m.notificationId, 'n1');
    expect(PushMessage.fromData({'eventType': 'new.thing'}).event, isNull);
    expect(PushMessage.fromData({'errandId': ' '}).errandId, isNull);
  });

  test('FCM without Firebase config falls back to the no-op service', () async {
    final push = await FcmPushService.initialize();
    expect(push, isA<NoopPushService>());
    expect(push.isAvailable, isFalse);
    expect(await push.getToken(), isNull);
  });

  test('register asks permission when told, posts the token, follows '
      'refreshes; unregister removes and deletes', () async {
    final adapter = _Adapter();
    final push = _FakePush();
    final reg = PushRegistration(
      push: push,
      devices: _devices(adapter),
      platform: DevicePlatform.android,
    );

    expect(await reg.register(askPermission: true), isTrue);
    expect(push.permissionAsks, 1);
    expect(reg.deviceId, 'd1');
    expect(adapter.calls.single, contains('POST /users/me/devices'));
    expect(adapter.calls.single, contains('"pushToken":"tok1"'));
    expect(adapter.calls.single, contains('"platform":"android"'));

    expect(await reg.register(), isTrue);
    expect(push.permissionAsks, 1);

    push.refresh.add('tok2');
    await pumpEventQueue();
    expect(adapter.calls.last, contains('"pushToken":"tok2"'));

    await reg.unregister();
    expect(adapter.calls.last, startsWith('DELETE /users/me/devices/d1'));
    expect(push.deleted, isTrue);
    expect(reg.deviceId, isNull);

    final before = adapter.calls.length;
    push.refresh.add('tok3');
    await pumpEventQueue();
    expect(adapter.calls, hasLength(before), reason: 'no refresh after logout');
  });

  test('register reports failure without throwing; no-op is skipped', () async {
    final failing = PushRegistration(
      push: _FakePush(),
      devices: _devices(_Adapter(failRegister: true)),
      platform: DevicePlatform.ios,
    );
    expect(await failing.register(), isFalse);
    await failing.unregister();

    final noToken = _FakePush()..token = null;
    final adapter = _Adapter();
    expect(
      await PushRegistration(
        push: noToken,
        devices: _devices(adapter),
        platform: DevicePlatform.ios,
      ).register(),
      isFalse,
    );
    expect(adapter.calls, isEmpty);

    expect(
      await PushRegistration(
        push: const NoopPushService(),
        devices: _devices(adapter),
      ).register(askPermission: true),
      isFalse,
    );
  });
}
