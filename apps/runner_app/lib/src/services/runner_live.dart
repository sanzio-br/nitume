import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:nitume_core/nitume_core.dart';

/// The one Socket.IO connection of the session (`_shared.md` §10, rows 23,
/// 29), as the runner screens need it: errand rooms for held jobs, the
/// runner's own room (joined by the server, row 139) and `location:ping`.
///
/// [client] and [runner] are the same `SocketIoRealtimeClient` in the app;
/// tests pass fakes. Without a client every screen stays on polling.
class RunnerLive {
  RunnerLive({this.client, this.runner, this._accessToken}) {
    final c = client;
    if (c != null) {
      state.value = c.currentState;
      _stateSub = c.connectionState.listen((s) => state.value = s);
    }
  }

  final RealtimeClient? client;
  final RunnerRealtimeClient? runner;
  final Future<String?> Function()? _accessToken;
  StreamSubscription<RealtimeConnectionState>? _stateSub;
  final _rooms = <String>{};

  /// Connection state; `disconnected` without a client.
  final ValueNotifier<RealtimeConnectionState> state = ValueNotifier(
    RealtimeConnectionState.disconnected,
  );

  bool get isConnected => state.value.isConnected;

  /// Connects after sign-in. Best effort: polling covers a failure.
  Future<void> start() async {
    final c = client;
    if (c == null) return;
    try {
      final token = await _accessToken?.call();
      if (token == null) return;
      await c.connect(accessToken: token);
    } on Object {
      // The client retries by itself.
    }
  }

  /// Disconnects and forgets every room (log out).
  Future<void> stop() async {
    _rooms.clear();
    try {
      await client?.disconnect();
    } on Object {
      // The session is ending anyway.
    }
  }

  /// Keeps exactly [errandIds] joined (one `errand:{id}` room per held
  /// job). The client re-joins them after a reconnect.
  void syncRooms(Iterable<String> errandIds) {
    final want = errandIds.toSet();
    final c = client;
    for (final id in _rooms.difference(want)) {
      c?.leaveErrand(id).catchError((Object _) {});
    }
    for (final id in want.difference(_rooms)) {
      c?.joinErrand(id).catchError((Object _) => false);
    }
    _rooms
      ..clear()
      ..addAll(want);
  }

  Stream<ErrandStatusChanged> get statusChanges =>
      client?.statusChanges ?? const Stream.empty();
  Stream<EvidenceUploaded> get evidenceUploads =>
      client?.evidenceUploads ?? const Stream.empty();
  Stream<ErrandAccessRevoked> get accessRevocations =>
      client?.accessRevocations ?? const Stream.empty();
  Stream<JobOffered> get jobOffers => runner?.jobOffers ?? const Stream.empty();
  Stream<JobOfferWithdrawn> get jobOfferWithdrawals =>
      runner?.jobOfferWithdrawals ?? const Stream.empty();
  Stream<PriceChangeDecided> get priceChangeDecisions =>
      runner?.priceChangeDecisions ?? const Stream.empty();

  /// `price_change:difference_paid` (row 248): reload that job.
  Stream<PriceDifferencePaid> get priceDifferencePayments =>
      runner?.priceDifferencePayments ?? const Stream.empty();

  /// `location:ping` with its ack; not sent without a runner client.
  Future<LocationPingAck> sendLocationPing(LocationPing ping) async {
    final r = runner;
    if (r == null) return const LocationPingAck.notSent();
    try {
      return await r.sendLocationPing(ping);
    } on Object {
      return const LocationPingAck.notSent();
    }
  }

  void dispose() {
    _stateSub?.cancel();
    state.dispose();
  }
}
