import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:nitume_core/nitume_core.dart';

/// App-wide wrapper over the one [RealtimeClient] (`_shared.md` §10, rows
/// 23, 29). Screens watch an errand room; they poll their REST snapshot
/// only while [isConnected] is false and refetch once on reconnect.
///
/// With no client (tests, or a build without a socket origin) every screen
/// stays on polling.
class LiveUpdates {
  LiveUpdates(this.client, {this._accessToken}) {
    final c = client;
    if (c != null) {
      state.value = c.currentState;
      _stateSub = c.connectionState.listen((s) => state.value = s);
    }
  }

  final RealtimeClient? client;
  final Future<String?> Function()? _accessToken;

  /// Watches per room: several screens can watch the same errand, and the
  /// socket leaves the room only when the last one cancels.
  final _roomRefs = <String, int>{};

  void _join(String errandId) {
    final n = _roomRefs[errandId] ?? 0;
    _roomRefs[errandId] = n + 1;
    if (n == 0) client?.joinErrand(errandId).catchError((Object _) => false);
  }

  void _leave(String errandId) {
    final n = (_roomRefs[errandId] ?? 1) - 1;
    if (n > 0) {
      _roomRefs[errandId] = n;
      return;
    }
    _roomRefs.remove(errandId);
    client?.leaveErrand(errandId).catchError((Object _) {});
  }

  StreamSubscription<RealtimeConnectionState>? _stateSub;

  /// Connection state; `disconnected` when there is no client.
  final ValueNotifier<RealtimeConnectionState> state = ValueNotifier(
    RealtimeConnectionState.disconnected,
  );

  bool get isConnected => state.value.isConnected;

  /// True when a client exists and is retrying (`Reconnecting…`).
  bool get isReconnecting =>
      client != null && state.value == RealtimeConnectionState.reconnecting;

  /// Connects after sign-in. Best effort: failures leave polling on.
  Future<void> start() async {
    final c = client;
    if (c == null) return;
    try {
      final token = await _accessToken?.call();
      if (token == null) return;
      await c.connect(accessToken: token);
    } on Object {
      // The client reconnects by itself; screens keep polling meanwhile.
    }
  }

  /// Disconnects on log out.
  Future<void> stop() async {
    try {
      await client?.disconnect();
    } on Object {
      // Ignore: the session is ending anyway.
    }
  }

  /// `price_change:requested` for any joined room (app-level modal).
  Stream<PriceChangeRequested> get priceChangeRequests =>
      client?.priceChangeRequests ?? const Stream.empty();

  /// Joins `errand:{id}` and forwards its events. Cancel to leave.
  ErrandWatch watch(
    String errandId, {
    void Function(ErrandStatusChanged event)? onStatus,
    void Function(LocationUpdate event)? onLocation,
    void Function(EvidenceUploaded event)? onEvidence,
    void Function(PriceChangeRequested event)? onPriceChange,
    void Function(QuoteReissued event)? onQuoteReissued,
    void Function(MerchantDetailsUpdated event)? onMerchantDetails,
    void Function(MerchantDetailsChanged event)? onMerchantDetailsChanged,
    void Function(QuoteRequested event)? onQuoteRequested,
    VoidCallback? onAccessRevoked,
    VoidCallback? onReconnected,
  }) {
    return ErrandWatch._(
      this,
      errandId,
      onStatus: onStatus,
      onLocation: onLocation,
      onEvidence: onEvidence,
      onPriceChange: onPriceChange,
      onQuoteReissued: onQuoteReissued,
      onMerchantDetails: onMerchantDetails,
      onMerchantDetailsChanged: onMerchantDetailsChanged,
      onQuoteRequested: onQuoteRequested,
      onAccessRevoked: onAccessRevoked,
      onReconnected: onReconnected,
    );
  }

  void dispose() {
    _stateSub?.cancel();
    state.dispose();
  }
}

/// One screen's subscription to an errand room.
class ErrandWatch {
  ErrandWatch._(
    this._live,
    this.errandId, {
    void Function(ErrandStatusChanged event)? onStatus,
    void Function(LocationUpdate event)? onLocation,
    void Function(EvidenceUploaded event)? onEvidence,
    void Function(PriceChangeRequested event)? onPriceChange,
    void Function(QuoteReissued event)? onQuoteReissued,
    void Function(MerchantDetailsUpdated event)? onMerchantDetails,
    void Function(MerchantDetailsChanged event)? onMerchantDetailsChanged,
    void Function(QuoteRequested event)? onQuoteRequested,
    VoidCallback? onAccessRevoked,
    VoidCallback? onReconnected,
  }) {
    final c = _live.client;
    if (c == null) return;
    _live._join(errandId);
    bool mine(String id) => id == errandId;
    if (onStatus != null) {
      _subs.add(
        c.statusChanges.where((e) => mine(e.errandId)).listen(onStatus),
      );
    }
    if (onLocation != null) {
      _subs.add(
        c.locationUpdates.where((e) => mine(e.errandId)).listen(onLocation),
      );
    }
    if (onEvidence != null) {
      _subs.add(
        c.evidenceUploads.where((e) => mine(e.errandId)).listen(onEvidence),
      );
    }
    if (onPriceChange != null) {
      _subs.add(
        c.priceChangeRequests
            .where((e) => mine(e.errandId))
            .listen(onPriceChange),
      );
    }
    if (onQuoteReissued != null) {
      _subs.add(
        c.quoteReissues.where((e) => mine(e.errandId)).listen(onQuoteReissued),
      );
    }
    if (onMerchantDetails != null) {
      _subs.add(
        c.merchantDetailsUpdates
            .where((e) => mine(e.errandId))
            .listen(onMerchantDetails),
      );
    }
    if (onMerchantDetailsChanged != null) {
      _subs.add(
        c.merchantDetailsChanges
            .where((e) => mine(e.errandId))
            .listen(onMerchantDetailsChanged),
      );
    }
    if (onQuoteRequested != null) {
      _subs.add(
        c.quoteRequests.where((e) => mine(e.errandId)).listen(onQuoteRequested),
      );
    }
    // errand:access_revoked: this errand is no longer ours to watch (e.g.
    // a reassigned runner's room); stop its live data.
    _subs.add(
      c.accessRevocations.where((e) => mine(e.errandId)).listen((_) {
        cancel();
        onAccessRevoked?.call();
      }),
    );
    if (onReconnected != null) {
      var was = _live.isConnected;
      void listener() {
        final now = _live.isConnected;
        if (now && !was) onReconnected();
        was = now;
      }

      _live.state.addListener(listener);
      _removeListener = () => _live.state.removeListener(listener);
    }
  }

  final LiveUpdates _live;
  final String errandId;
  final _subs = <StreamSubscription<Object?>>[];
  VoidCallback? _removeListener;

  /// Leaves the room and stops forwarding.
  void cancel() {
    if (_live.client != null && !_cancelled) _live._leave(errandId);
    _cancelled = true;
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    _removeListener?.call();
    _removeListener = null;
  }

  bool _cancelled = false;
}
