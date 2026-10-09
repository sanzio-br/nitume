import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:socket_io_client/socket_io_client.dart' as sio;

import 'realtime_client.dart';

/// Supplies the current access token for a (re)connect; `null` when signed
/// out. Usually `() async => (await tokenStore.read())?.accessToken`.
typedef AccessTokenProvider = Future<String?> Function();

/// One Socket.IO connection attempt. [SocketIoRealtimeClient] makes a new
/// one per attempt so every handshake carries the newest token.
///
/// Seam for tests; the default is backed by `socket_io_client`.
abstract interface class RealtimeTransport {
  void onConnect(void Function() handler);

  /// [reason] is the Socket.IO disconnect reason, e.g.
  /// `io server disconnect` (refused or kicked) or `transport close`.
  void onDisconnect(void Function(String? reason) handler);
  void onConnectError(void Function(Object? error) handler);
  void on(String event, void Function(Object? data) handler);
  void emitWithAck(String event, Object? data, void Function(Object? ack) ack);
  void emit(String event, Object? data);
  void connect();

  /// Closes the connection and drops every handler.
  void dispose();
}

/// Builds a transport for [url] (origin, no path) with `auth: {token}`.
typedef RealtimeTransportFactory = RealtimeTransport Function(
  Uri url, {
  required String token,
});

/// [RealtimeClient] over `socket_io_client` (BOARD rows 23, 29).
///
/// * Handshake `auth: { token }` on [RealtimeEvents.path].
/// * Reconnects on its own with exponential backoff (1 s, 2 s, 4 s … capped
///   at 30 s, ±20% jitter) after a drop, a refused handshake or a server
///   kick, asking [tokenProvider] for a fresh token each time. The state is
///   [RealtimeConnectionState.reconnecting] meanwhile.
/// * Re-joins every errand room joined with [joinErrand] after each
///   reconnect; screens refetch their snapshot once on `connected`.
/// * Malformed payloads are dropped, never thrown.
///
/// Also forwards `quote:reissued` and `merchant_details:updated` (round 3).
///
/// One app-wide instance; call [connect] after sign-in and [disconnect] on
/// log out. [dispose] closes the streams.
class SocketIoRealtimeClient implements RealtimeClient {
  SocketIoRealtimeClient({
    required this.url,
    this.tokenProvider,
    RealtimeTransportFactory? transportFactory,
    Duration Function(int attempt)? backoff,
    this.ackTimeout = const Duration(seconds: 10),
  }) : _transportFactory = transportFactory ?? _socketIoTransport,
       _backoff = backoff ?? defaultBackoff;

  /// Socket origin for an API base URL: same scheme, host and port, no path
  /// (`https://api.nitume.co.ke/api/v1` → `https://api.nitume.co.ke`). The
  /// gateway is not under the REST prefix.
  static Uri originFor(String apiBaseUrl) {
    final api = Uri.parse(apiBaseUrl);
    return Uri(
      scheme: api.scheme,
      host: api.host,
      port: api.hasPort ? api.port : null,
    );
  }

  /// 1 s, 2 s, 4 s … capped at 30 s, with ±20% jitter. [attempt] starts at 1.
  static Duration defaultBackoff(int attempt, [Random? random]) {
    final base = min(30000, 1000 * pow(2, max(0, attempt - 1)).toInt());
    final jitter = 0.8 + (random ?? Random()).nextDouble() * 0.4;
    return Duration(milliseconds: (base * jitter).round());
  }

  /// Socket origin (see [originFor]).
  final Uri url;

  /// Fresh token for reconnects; without it the token given to [connect] is
  /// reused.
  final AccessTokenProvider? tokenProvider;

  /// How long [joinErrand] waits for the server's ack.
  final Duration ackTimeout;

  final RealtimeTransportFactory _transportFactory;
  final Duration Function(int attempt) _backoff;

  final _state = StreamController<RealtimeConnectionState>.broadcast();
  final _locations = StreamController<LocationUpdate>.broadcast();
  final _statuses = StreamController<ErrandStatusChanged>.broadcast();
  final _evidence = StreamController<EvidenceUploaded>.broadcast();
  final _priceChanges = StreamController<PriceChangeRequested>.broadcast();
  final _quotes = StreamController<QuoteReissued>.broadcast();
  final _merchantDetails = StreamController<MerchantDetailsUpdated>.broadcast();

  final _rooms = <String>{};
  RealtimeTransport? _transport;
  Timer? _retryTimer;
  String? _lastToken;
  bool _wanted = false;
  int _attempt = 0;
  RealtimeConnectionState _current = RealtimeConnectionState.disconnected;

  @override
  RealtimeConnectionState get currentState => _current;

  @override
  Stream<RealtimeConnectionState> get connectionState => _state.stream;

  @override
  Stream<LocationUpdate> get locationUpdates => _locations.stream;

  @override
  Stream<ErrandStatusChanged> get statusChanges => _statuses.stream;

  @override
  Stream<EvidenceUploaded> get evidenceUploads => _evidence.stream;

  @override
  Stream<PriceChangeRequested> get priceChangeRequests => _priceChanges.stream;

  @override
  Stream<QuoteReissued> get quoteReissues => _quotes.stream;

  @override
  Stream<MerchantDetailsUpdated> get merchantDetailsUpdates =>
      _merchantDetails.stream;

  /// Rooms that are re-joined on reconnect.
  @visibleForTesting
  Set<String> get joinedErrands => Set.unmodifiable(_rooms);

  @override
  Future<void> connect({required String accessToken}) async {
    _wanted = true;
    _lastToken = accessToken;
    _attempt = 0;
    _retryTimer?.cancel();
    _closeTransport();
    _setState(RealtimeConnectionState.connecting);
    _open(accessToken);
  }

  @override
  Future<void> disconnect() async {
    _wanted = false;
    _retryTimer?.cancel();
    _retryTimer = null;
    _rooms.clear();
    _closeTransport();
    _setState(RealtimeConnectionState.disconnected);
  }

  /// [disconnect] and close every stream. The client is unusable after.
  Future<void> dispose() async {
    await disconnect();
    await Future.wait([
      _state.close(),
      _locations.close(),
      _statuses.close(),
      _evidence.close(),
      _priceChanges.close(),
      _quotes.close(),
      _merchantDetails.close(),
    ]);
  }

  @override
  Future<bool> joinErrand(String errandId) async {
    _rooms.add(errandId);
    if (!_current.isConnected) return false;
    final ok = await _join(errandId);
    if (!ok) _rooms.remove(errandId);
    return ok;
  }

  @override
  Future<void> leaveErrand(String errandId) async {
    _rooms.remove(errandId);
    if (_current.isConnected) {
      _transport?.emit(RealtimeEvents.errandLeave, {'errandId': errandId});
    }
  }

  void _open(String token) {
    final t = _transportFactory(url, token: token);
    _transport = t;
    t.onConnect(() {
      if (!identical(_transport, t)) return;
      _attempt = 0;
      _setState(RealtimeConnectionState.connected);
      for (final id in _rooms.toList()) {
        _join(id).then((ok) {
          if (!ok) _rooms.remove(id);
        });
      }
    });
    t.onDisconnect((_) {
      if (identical(_transport, t)) _scheduleRetry();
    });
    t.onConnectError((_) {
      if (identical(_transport, t)) _scheduleRetry();
    });
    _listen(
      t,
      RealtimeEvents.locationUpdate,
      LocationUpdate.fromJson,
      _locations,
    );
    _listen(
      t,
      RealtimeEvents.errandStatusChanged,
      ErrandStatusChanged.fromJson,
      _statuses,
    );
    _listen(
      t,
      RealtimeEvents.evidenceUploaded,
      EvidenceUploaded.fromJson,
      _evidence,
    );
    _listen(
      t,
      RealtimeEvents.priceChangeRequested,
      PriceChangeRequested.fromJson,
      _priceChanges,
    );
    _listen(t, RealtimeEvents.quoteReissued, QuoteReissued.fromJson, _quotes);
    _listen(
      t,
      RealtimeEvents.merchantDetailsUpdated,
      MerchantDetailsUpdated.fromJson,
      _merchantDetails,
    );
    t.connect();
  }

  void _listen<T>(
    RealtimeTransport t,
    String event,
    T Function(Map<String, dynamic>) parse,
    StreamController<T> sink,
  ) {
    t.on(event, (data) {
      if (!identical(_transport, t) || sink.isClosed || data is! Map) return;
      try {
        sink.add(parse(data.cast<String, dynamic>()));
      } on Object {
        // Malformed payload: drop it.
      }
    });
  }

  Future<bool> _join(String errandId) {
    final t = _transport;
    if (t == null) return Future.value(false);
    final done = Completer<bool>();
    final timer = Timer(ackTimeout, () {
      if (!done.isCompleted) done.complete(false);
    });
    t.emitWithAck(RealtimeEvents.errandJoin, {'errandId': errandId}, (ack) {
      timer.cancel();
      if (!done.isCompleted) {
        done.complete(ack is Map && ack['ok'] == true);
      }
    });
    return done.future;
  }

  void _scheduleRetry() {
    if (!_wanted) return;
    _closeTransport();
    _setState(RealtimeConnectionState.reconnecting);
    if (_retryTimer?.isActive ?? false) return;
    _attempt++;
    _retryTimer = Timer(_backoff(_attempt), () async {
      _retryTimer = null;
      if (!_wanted) return;
      final provided = await tokenProvider?.call();
      if (!_wanted) return;
      final token = provided ?? (tokenProvider == null ? _lastToken : null);
      if (token == null || token.isEmpty) {
        // Signed out meanwhile: stay down until connect() is called again.
        _wanted = false;
        _setState(RealtimeConnectionState.disconnected);
        return;
      }
      _lastToken = token;
      _open(token);
    });
  }

  void _closeTransport() {
    final t = _transport;
    _transport = null;
    t?.dispose();
  }

  void _setState(RealtimeConnectionState next) {
    if (_current == next) return;
    _current = next;
    if (!_state.isClosed) _state.add(next);
  }
}

RealtimeTransport _socketIoTransport(Uri url, {required String token}) =>
    _SocketIoTransport(url, token);

class _SocketIoTransport implements RealtimeTransport {
  _SocketIoTransport(Uri url, String token)
    : _socket = sio.io(
        url.toString(),
        sio.OptionBuilder()
            .setTransports(['websocket'])
            .setPath(RealtimeEvents.path)
            .setAuth({'token': token})
            .disableAutoConnect()
            // SocketIoRealtimeClient owns reconnection (fresh token, backoff).
            .disableReconnection()
            .enableForceNew()
            .build(),
      );

  final sio.Socket _socket;

  @override
  void onConnect(void Function() handler) =>
      _socket.onConnect((_) => handler());

  @override
  void onDisconnect(void Function(String? reason) handler) =>
      _socket.onDisconnect((r) => handler(r is String ? r : null));

  @override
  void onConnectError(void Function(Object? error) handler) =>
      _socket.onConnectError(handler);

  @override
  void on(String event, void Function(Object? data) handler) =>
      _socket.on(event, handler);

  @override
  void emitWithAck(
    String event,
    Object? data,
    void Function(Object? ack) ack,
  ) => _socket.emitWithAck(event, data, ack: ([Object? a]) => ack(a));

  @override
  void emit(String event, Object? data) => _socket.emit(event, data);

  @override
  void connect() => _socket.connect();

  @override
  void dispose() => _socket.dispose();
}
