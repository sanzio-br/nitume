import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Transport implements RealtimeTransport {
  void Function()? _connect;
  final handlers = <String, void Function(Object?)>{};
  final sent = <(String, Object?)>[];

  /// Ack for each emitWithAck; `null` never answers.
  Object? Function(String event, Object? data)? ack;

  @override
  void onConnect(void Function() handler) => _connect = handler;
  @override
  void onDisconnect(void Function(String?) handler) {}
  @override
  void onConnectError(void Function(Object?) handler) {}
  @override
  void on(String event, void Function(Object?) handler) =>
      handlers[event] = handler;
  @override
  void emit(String event, Object? data) => sent.add((event, data));
  @override
  void emitWithAck(String event, Object? data, void Function(Object?) cb) {
    sent.add((event, data));
    final answer = ack?.call(event, data);
    if (answer != null) scheduleMicrotask(() => cb(answer));
  }

  @override
  void connect() {}
  @override
  void dispose() {}

  void serverConnects() => _connect!();
  void serverSends(String event, Object? data) => handlers[event]!(data);
}

void main() {
  late _Transport t;
  late SocketIoRealtimeClient client;

  setUp(() {
    t = _Transport();
    client = SocketIoRealtimeClient(
      url: Uri.parse('https://api.test'),
      ackTimeout: const Duration(milliseconds: 50),
      transportFactory: (url, {required token}) => t,
    );
  });

  tearDown(() => client.dispose());

  Future<void> connected() async {
    await client.connect(accessToken: 'tok');
    t.serverConnects();
  }

  test('event names', () {
    expect(RealtimeEvents.jobOffered, 'job:offered');
    expect(RealtimeEvents.jobOfferWithdrawn, 'job:offer_withdrawn');
    expect(RealtimeEvents.priceChangeDecided, 'price_change:decided');
    expect(RealtimeEvents.locationPing, 'location:ping');
    expect(RealtimeEvents.runnerRoom('rp1'), 'runner:rp1:status');
  });

  test('the client never joins the runner room', () async {
    await connected();
    await Future<void>.delayed(Duration.zero);
    expect(t.sent, isEmpty);
  });

  test('job:offered', () async {
    await connected();
    final got = client.jobOffers.first;
    t.serverSends('job:offered', {
      'errandId': 'e1',
      'assignmentId': 'a1',
      'offerExpiresAt': '2026-10-19T08:10:00.000Z',
      'offeredAt': '2026-10-19T08:05:00.000Z',
    });
    final o = await got;
    expect(o.errandId, 'e1');
    expect(o.assignmentId, 'a1');
    expect(o.offerExpiresAt, DateTime.utc(2026, 10, 19, 8, 10));
    expect(o.offeredAt, DateTime.utc(2026, 10, 19, 8, 5));
  });

  test('job:offered with a null offerExpiresAt (row 156)', () {
    final o = JobOffered.fromJson({
      'errandId': 'e1',
      'assignmentId': 'a1',
      'offerExpiresAt': null,
      'offeredAt': '2026-10-19T08:05:00.000Z',
    });
    expect(o.offerExpiresAt, isNull);
  });

  test('job:offer_withdrawn, unknown reason tolerated', () async {
    await connected();
    final got = client.jobOfferWithdrawals.take(2).toList();
    t
      ..serverSends('job:offer_withdrawn', {
        'errandId': 'e1',
        'assignmentId': 'a1',
        'reason': 'declined',
        'at': '2026-10-19T08:06:00.000Z',
      })
      ..serverSends('job:offer_withdrawn', {
        'errandId': 'e2',
        'assignmentId': 'a2',
        'reason': 'teleported',
        'at': '2026-10-19T08:06:00.000Z',
      });
    final w = await got;
    expect(w[0].reason, OfferWithdrawnReason.declined);
    expect(w[0].at, DateTime.utc(2026, 10, 19, 8, 6));
    expect(w[1].reason, isNull);
  });

  test('price_change:decided', () async {
    await connected();
    final got = client.priceChangeDecisions.take(3).toList();
    Map<String, Object?> body(String status, String outcome) => {
      'errandId': 'e1',
      'requestId': 'p1',
      'status': status,
      'outcome': outcome,
      'fromPrice': '1000.00',
      'toPrice': '1200.00',
      'decidedAt': '2026-10-19T09:00:00.000Z',
    };
    t
      ..serverSends('price_change:decided', body('approved', 'approved'))
      ..serverSends('price_change:decided', body('rejected', 'cancelled'))
      ..serverSends('price_change:decided', body('weird', 'weird'));
    final d = await got;
    expect(d[0].status, PriceChangeStatus.approved);
    expect(d[0].outcome, PriceDecisionOutcome.approved);
    expect(d[0].fromPrice, '1000.00');
    expect(d[0].toPrice, '1200.00');
    expect(d[0].decidedAt, DateTime.utc(2026, 10, 19, 9));
    expect(d[1].status, PriceChangeStatus.rejected);
    expect(d[1].outcome, PriceDecisionOutcome.cancelled);
    expect(d[2].status, isNull);
    expect(d[2].outcome, isNull);
  });

  test('malformed runner payloads are dropped', () async {
    await connected();
    final got = client.jobOffers.first;
    t
      ..serverSends('job:offered', {'errandId': 'e1'})
      ..serverSends('job:offered', {'errandId': 'e2', 'assignmentId': 'a2'});
    expect((await got).errandId, 'e2');
  });

  group('location:ping', () {
    final ping = LocationPing(
      position: DevicePosition(
        lat: -4.04,
        lng: 39.7,
        accuracy: 8,
        timestamp: DateTime.utc(2026, 10, 19, 8),
      ),
      errandId: 'e1',
    );

    test('not connected: not sent', () async {
      final ack = await client.sendLocationPing(ping);
      expect(ack.sent, isFalse);
      expect(ack.ok, isFalse);
      expect(ack.stopJobPings, isFalse);
    });

    test('sends the payload and reads an ok ack with the job state', () async {
      await connected();
      t.ack = (_, _) => {'ok': true, 'status': 'ARRIVED'};
      final ack = await client.sendLocationPing(ping);
      expect(t.sent.single.$1, 'location:ping');
      expect(t.sent.single.$2, {
        'lat': -4.04,
        'lng': 39.7,
        'errandId': 'e1',
        'accuracy': 8.0,
        'ts': '2026-10-19T08:00:00.000Z',
      });
      expect(ack.ok, isTrue);
      expect(ack.sent, isTrue);
      expect(ack.error, isNull);
      expect(ack.status, ErrandStatus.arrived);
    });

    test('not_live and forbidden stop job pings; others do not', () async {
      await connected();
      for (final (code, error, stop) in [
        ('not_live', LocationPingError.notLive, true),
        ('forbidden', LocationPingError.forbidden, true),
        ('unauthenticated', LocationPingError.unauthenticated, false),
        ('not_runner', LocationPingError.notRunner, false),
        ('invalid_payload', LocationPingError.invalidPayload, false),
        ('rate_limited', LocationPingError.rateLimited, false),
        ('stale_ping', LocationPingError.stalePing, false),
        ('runner_offline', LocationPingError.runnerOffline, false),
        ('unavailable', LocationPingError.unavailable, false),
        ('something_new', LocationPingError.unknown, false),
      ]) {
        t.ack = (_, _) => {
          'ok': false,
          'error': code,
          if (code == 'not_live') 'status': 'AWAITING_CUSTOMER',
        };
        final ack = await client.sendLocationPing(ping);
        expect(ack.ok, isFalse, reason: code);
        expect(ack.error, error, reason: code);
        expect(ack.stopJobPings, stop, reason: code);
        if (code == 'not_live') {
          expect(ack.status, ErrandStatus.awaitingCustomer);
        }
      }
    });

    test('no ack in time: not sent', () async {
      await connected();
      t.ack = null;
      final ack = await client.sendLocationPing(ping);
      expect(ack.sent, isFalse);
    });

    test('idle ping without errandId', () async {
      await connected();
      t.ack = (_, _) => {'ok': true};
      final idle = LocationPing(position: ping.position);
      final ack = await client.sendLocationPing(idle);
      expect((t.sent.single.$2! as Map).containsKey('errandId'), isFalse);
      expect(ack.ok, isTrue);
      expect(ack.status, isNull);
    });
  });
}
