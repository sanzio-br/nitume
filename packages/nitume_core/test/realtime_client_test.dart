import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _FakeTransport implements RealtimeTransport {
  _FakeTransport(this.token);

  final String token;
  void Function()? _connect;
  void Function(String?)? _disconnect;
  void Function(Object?)? _error;
  final handlers = <String, void Function(Object?)>{};
  final emitted = <String>[];
  final pendingAcks = <String, void Function(Object?)>{};
  bool connectCalled = false;
  bool disposed = false;

  /// Answer every errand:join with this ack (null = never answer).
  Object? Function(String errandId)? autoAck = (_) => {'ok': true};

  @override
  void onConnect(void Function() handler) => _connect = handler;
  @override
  void onDisconnect(void Function(String?) handler) => _disconnect = handler;
  @override
  void onConnectError(void Function(Object?) handler) => _error = handler;
  @override
  void on(String event, void Function(Object?) handler) =>
      handlers[event] = handler;
  @override
  void emit(String event, Object? data) =>
      emitted.add('$event ${(data as Map?)?['errandId']}');
  @override
  void emitWithAck(String event, Object? data, void Function(Object?) ack) {
    emitted.add('$event ${(data as Map?)?['errandId']}');
    final id = (data as Map)['errandId'] as String;
    final answer = autoAck?.call(id);
    if (answer != null) {
      scheduleMicrotask(() => ack(answer));
    } else {
      pendingAcks[id] = ack;
    }
  }

  @override
  void connect() => connectCalled = true;
  @override
  void dispose() => disposed = true;

  void serverConnects() => _connect!();
  void serverDrops([String reason = 'transport close']) => _disconnect!(reason);
  void connectFails() => _error!(Exception('refused'));
  void serverSends(String event, Object? data) => handlers[event]!(data);
}

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  late List<_FakeTransport> transports;
  late SocketIoRealtimeClient client;
  late List<RealtimeConnectionState> states;
  var nextToken = 'fresh';

  setUp(() {
    transports = [];
    states = [];
    nextToken = 'fresh';
    client = SocketIoRealtimeClient(
      url: Uri.parse('https://api.test'),
      tokenProvider: () async => nextToken,
      backoff: (_) => Duration.zero,
      ackTimeout: const Duration(milliseconds: 50),
      transportFactory: (url, {required token}) {
        final t = _FakeTransport(token);
        transports.add(t);
        return t;
      },
    );
    client.connectionState.listen(states.add);
  });

  tearDown(() => client.dispose());

  test('originFor drops the REST prefix', () {
    expect(
      SocketIoRealtimeClient.originFor('https://api.nitume.test/api/v1'),
      Uri.parse('https://api.nitume.test'),
    );
    expect(
      SocketIoRealtimeClient.originFor('http://10.0.2.2:3000/api/v1'),
      Uri.parse('http://10.0.2.2:3000'),
    );
  });

  test('backoff doubles from 1 s and caps at 30 s', () {
    Duration at(int n) => SocketIoRealtimeClient.defaultBackoff(n);
    expect(at(1).inMilliseconds, inInclusiveRange(800, 1200));
    expect(at(3).inMilliseconds, inInclusiveRange(3200, 4800));
    expect(at(20).inMilliseconds, inInclusiveRange(24000, 36000));
  });

  test('connects with the token and reports state', () async {
    await client.connect(accessToken: 'tok');
    expect(transports.single.token, 'tok');
    expect(transports.single.connectCalled, isTrue);
    expect(client.currentState, RealtimeConnectionState.connecting);

    transports.single.serverConnects();
    await _settle();
    expect(client.currentState, RealtimeConnectionState.connected);
    expect(states, [
      RealtimeConnectionState.connecting,
      RealtimeConnectionState.connected,
    ]);
  });

  test('join emits errand:join and resolves with the ack ok', () async {
    await client.connect(accessToken: 'tok');
    final t = transports.single..serverConnects();

    expect(await client.joinErrand('e1'), isTrue);
    expect(t.emitted.last, 'errand:join e1');

    t.autoAck = (_) => {'ok': false, 'error': 'forbidden'};
    expect(await client.joinErrand('e2'), isFalse);
    expect(client.joinedErrands, {'e1'});

    t.autoAck = null;
    expect(await client.joinErrand('e3'), isFalse, reason: 'ack timeout');

    await client.leaveErrand('e1');
    expect(t.emitted.last, 'errand:leave e1');
    expect(client.joinedErrands, isEmpty);
  });

  test(
    'reconnects with a fresh token and re-joins rooms after a drop',
    () async {
      await client.connect(accessToken: 'tok');
      transports.single.serverConnects();
      await client.joinErrand('e1');

      transports.single.serverDrops();
      expect(client.currentState, RealtimeConnectionState.reconnecting);
      expect(transports.single.disposed, isTrue);
      await _settle();
      await _settle();

      expect(transports, hasLength(2));
      final second = transports.last;
      expect(second.token, 'fresh');
      second.serverConnects();
      await _settle();
      expect(client.currentState, RealtimeConnectionState.connected);
      expect(second.emitted, contains('errand:join e1'));
    },
  );

  test('a refused handshake retries; signed out stops retrying', () async {
    await client.connect(accessToken: 'tok');
    transports.single.connectFails();
    expect(client.currentState, RealtimeConnectionState.reconnecting);

    nextToken = '';
    await _settle();
    await _settle();
    expect(transports, hasLength(1));
    expect(client.currentState, RealtimeConnectionState.disconnected);
  });

  test('disconnect stops retries and forgets rooms', () async {
    await client.connect(accessToken: 'tok');
    transports.single.serverConnects();
    await client.joinErrand('e1');

    await client.disconnect();
    expect(client.currentState, RealtimeConnectionState.disconnected);
    expect(client.joinedErrands, isEmpty);
    await _settle();
    expect(transports, hasLength(1));
  });

  test('parses the four server events and drops malformed payloads', () async {
    await client.connect(accessToken: 'tok');
    final t = transports.single..serverConnects();

    final locations = <LocationUpdate>[];
    final statuses = <ErrandStatusChanged>[];
    final evidence = <EvidenceUploaded>[];
    final prices = <PriceChangeRequested>[];
    client.locationUpdates.listen(locations.add);
    client.statusChanges.listen(statuses.add);
    client.evidenceUploads.listen(evidence.add);
    client.priceChangeRequests.listen(prices.add);

    t.serverSends('location:update', {
      'errandId': 'e1',
      'lat': -1.29,
      'lng': 36.82,
      'eta': 300,
      'ts': '2026-10-08T10:00:00.000Z',
    });
    t.serverSends('location:update', {'errandId': 'e1'});
    t.serverSends('location:update', 'nonsense');
    t.serverSends('errand:status_changed', {
      'errandId': 'e1',
      'status': 'IN_PROGRESS',
      'from': 'ARRIVED',
      'at': '2026-10-08T10:00:00.000Z',
    });
    t.serverSends('evidence:uploaded', {
      'errandId': 'e1',
      'evidenceId': 'ev1',
      'type': 'photo',
      'capturedAt': '2026-10-08T10:00:00.000Z',
    });
    t.serverSends('price_change:requested', {
      'errandId': 'e1',
      'requestId': 'pc1',
      'fromPrice': '1000.00',
      'toPrice': '1300.00',
      'reason': null,
      'createdAt': '2026-10-08T10:00:00.000Z',
    });
    await _settle();

    expect(locations.single.eta, const Duration(minutes: 5));
    expect(statuses.single.status, ErrandStatus.inProgress);
    expect(evidence.single.evidenceId, 'ev1');
    expect(prices.single.toPrice, '1300.00');
  });

  test('forwards quote:reissued and merchant_details:updated', () async {
    await client.connect(accessToken: 'tok');
    final t = transports.single..serverConnects();
    final quotes = <QuoteReissued>[];
    final merchants = <MerchantDetailsUpdated>[];
    client.quoteReissues.listen(quotes.add);
    client.merchantDetailsUpdates.listen(merchants.add);

    t.serverSends('quote:reissued', {
      'errandId': 'e1',
      'quoteId': 'q2',
      'total': '2500.00',
      'currency': 'KES',
      'expiresAt': '2026-10-09T12:00:00.000Z',
      'status': 'ACCEPTED',
      'acceptanceRequired': true,
    });
    t.serverSends('quote:reissued', {'errandId': 'e1'});
    t.serverSends('merchant_details:updated', {
      'errandId': 'e1',
      'merchantName': 'Carrefour Westgate',
      'tillNumber': '123456',
      'paybillNumber': null,
      'accountReference': null,
    });
    await pumpEventQueue();

    final q = quotes.single;
    expect(q.quoteId, 'q2');
    expect(q.total, '2500.00');
    expect(q.status, ErrandStatus.accepted);
    expect(q.acceptanceRequired, isTrue);
    expect(q.expiresAt, DateTime.utc(2026, 10, 9, 12));
    final m = merchants.single;
    expect(m.merchantName, 'Carrefour Westgate');
    expect(m.hasMerchantDetails, isTrue);
    expect(m.paybillNumber, isNull);
  });

  test('round-3 notification types', () {
    expect(
      NotificationEventType.tryFromWire('quote.reissued'),
      NotificationEventType.quoteReissued,
    );
    expect(
      NotificationEventType.tryFromWire('merchant_details.added'),
      NotificationEventType.merchantDetailsAdded,
    );
    expect(NotificationEventType.quoteReissued.status, isNull);
    expect(
      PushMessage.fromData({'eventType': 'quote.reissued'}).event,
      NotificationEventType.quoteReissued,
    );
  });
}
