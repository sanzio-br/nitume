import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/jobs/job_detail_screen.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/services/job_pings.dart';
import 'package:runner_app/src/services/runner_live.dart';
import 'package:runner_app/src/services/shell_controller.dart';

import 'support/fakes.dart';

/// `v-active` "Location during a job" (owner rows 245, 246): the one-time
/// job-start notice, job-ping modes and the foreground-start rule.

Finder _card(String id) => find.byKey(ValueKey('offer-$id'));

Finder _inCard(String id, String text) =>
    find.descendant(of: _card(id), matching: find.text(text));

Future<void> _pumpShell(WidgetTester t, TestBackend b) =>
    b.pumpScreen(t, const RunnerShell());

/// Records what the pinger asks of the device.
class _RecordingSource implements PositionSource {
  final streams = <bool>[];
  int cancelled = 0;
  int requests = 0;

  @override
  Future<LocationAccess> access() async => LocationAccess.whileInUse;

  @override
  Future<LocationAccess> requestAccess() async {
    requests++;
    return LocationAccess.whileInUse;
  }

  @override
  Future<DevicePosition?> current() async =>
      DevicePosition(lat: -4.03, lng: 39.709, timestamp: testNow);

  @override
  Stream<DevicePosition> positions({
    required Duration interval,
    double distanceFilterMeters = 0,
    bool background = false,
  }) {
    streams.add(background);
    late final StreamController<DevicePosition> c;
    c = StreamController<DevicePosition>(onCancel: () => cancelled++);
    return c.stream;
  }
}

class _ThrowingQueueStore implements QueueStore {
  @override
  Future<List<String>> read() async => throw const FileSystemError();

  @override
  Future<void> write(List<String> entries) async {}
}

class FileSystemError implements Exception {
  const FileSystemError();
}

void main() {
  group('job-start location notice (row 246)', () {
    testWidgets('after the first accept, once per install', (t) async {
      final b = TestBackend();
      b.jobs.holdOnAccept = true;
      b.jobs.offerList = [offer(), offer(id: 'e2')];
      await _pumpShell(t, b);

      await t.tap(_inCard('e1', 'Accept'));
      await t.pump();
      // The accept moved on before the notice opened.
      expect(b.services.shell.tab, RunnerTab.active);
      expect(b.services.pings.mode, const PingActiveJob('e1'));
      await t.pumpAndSettle();

      expect(find.text(RunnerLocationCopy.jobStartNoticeTitle), findsOneWidget);
      expect(find.text(RunnerLocationCopy.jobStartNoticeBody), findsOneWidget);
      expect(await b.services.jobStartNoticeShown.isSet(), isTrue);
      await t.tap(find.text(RunnerLocationCopy.jobStartNoticeOk));
      await t.pumpAndSettle();
      expect(find.byType(JobStartLocationNotice), findsNothing);

      // A later accept: no notice.
      b.services.shell.select(RunnerTab.jobs);
      await t.pumpAndSettle();
      await t.tap(_inCard('e2', 'Accept'));
      await t.pumpAndSettle();
      expect(b.jobs.accepted, ['e1', 'e2']);
      expect(find.byType(JobStartLocationNotice), findsNothing);
      // Informational only: never an OS prompt.
      expect(b.location.requests, 0);
    });

    testWidgets('already shown on this install: no notice', (t) async {
      final b = TestBackend(noticeShown: MemoryOneTimeFlag(true));
      b.jobs.offerList = [offer()];
      await _pumpShell(t, b);
      await t.tap(_inCard('e1', 'Accept'));
      await t.pumpAndSettle();
      expect(b.jobs.accepted, ['e1']);
      expect(find.byType(JobStartLocationNotice), findsNothing);
    });

    testWidgets('a refused accept shows no notice', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [offer()];
      b.jobs.acceptError = apiError(ApiErrorCodes.runnerBusy);
      await _pumpShell(t, b);
      await t.tap(_inCard('e1', 'Accept'));
      await t.pumpAndSettle();
      expect(find.byType(JobStartLocationNotice), findsNothing);
      expect(await b.services.jobStartNoticeShown.isSet(), isFalse);
      expect(b.services.pings.mode, isNot(isA<PingActiveJob>()));
    });

    testWidgets('accept from v-job-detail: notice over the shell', (t) async {
      final b = TestBackend();
      b.jobs.holdOnAccept = true;
      b.jobs.offerList = [offer()];
      await _pumpShell(t, b);
      await t.tap(_inCard('e1', 'Check apartment — Nyali'));
      await t.pumpAndSettle();
      await t.tap(find.text('Accept job'));
      await t.pumpAndSettle();

      expect(find.byType(JobDetailScreen), findsNothing);
      expect(b.services.shell.tab, RunnerTab.active);
      expect(find.text(RunnerLocationCopy.jobStartNoticeTitle), findsOneWidget);
      await t.tap(find.text(RunnerLocationCopy.jobStartNoticeOk));
      await t.pumpAndSettle();
      expect(find.byType(JobStartLocationNotice), findsNothing);
      expect(b.services.pings.mode, const PingActiveJob('e1'));
    });
  });

  group('job ping modes (row 245)', () {
    test('accept → job pings; AWAITING_CUSTOMER → idle; offline', () async {
      final b = TestBackend();
      b.services.pings.setOnline(true);
      b.jobs.heldList = [heldJob(id: 'e1')];
      b.services.active.accepted('e1');
      expect(b.services.pings.mode, const PingActiveJob('e1'));
      await b.services.active.load();

      await b.services.active.transition(
        b.services.active.byId('e1')!,
        ErrandStatus.arrived,
      );
      expect(b.services.pings.mode, const PingActiveJob('e1'));
      await b.services.active.transition(
        b.services.active.byId('e1')!,
        ErrandStatus.inProgress,
      );
      await b.services.active.transition(
        b.services.active.byId('e1')!,
        ErrandStatus.awaitingCustomer,
      );
      expect(b.services.pings.mode, const PingIdle());

      b.services.pings.setOnline(false);
      expect(b.services.pings.mode, const PingOffline());
      expect(b.location.requests, 0);
    });

    test('job ended (CANCELLED) or reassigned: no job pings', () async {
      final b = TestBackend();
      b.services.pings.setOnline(true);
      b.jobs.heldList = [heldJob(id: 'e1'), heldJob(id: 'e2')];
      await b.services.active.load();
      expect(b.services.pings.mode, isA<PingActiveJob>());

      b.jobs.setStatus('e1', ErrandStatus.cancelled);
      b.jobs.setStatus('e2', ErrandStatus.cancelled);
      await b.services.active.load();
      expect(b.services.pings.mode, const PingIdle());

      b.jobs.heldList = [heldJob(id: 'e3')];
      await b.services.active.load();
      expect(b.services.pings.mode, const PingActiveJob('e3'));
      await b.services.live.start();
      b.realtime.revoked.add(const ErrandAccessRevoked(errandId: 'e3'));
      await Future<void>.delayed(Duration.zero);
      expect(b.services.pings.mode, const PingIdle());
    });

    test('a read started before the accept does not stop its pings', () async {
      final b = TestBackend();
      final slow = Completer<void>();
      final fresh = Completer<void>();
      b.jobs.heldGates.addAll([slow, fresh]);
      // Read before the accept: the server does not list e1 yet.
      final before = b.services.active.load();
      b.jobs.heldList = [heldJob(id: 'e1')];
      b.services.active.accepted('e1');

      slow.complete();
      await before;
      expect(b.services.pings.mode, const PingActiveJob('e1'));

      fresh.complete();
      await Future<void>.delayed(Duration.zero);
      expect(b.services.active.working?.id, 'e1');
      expect(b.services.pings.mode, const PingActiveJob('e1'));
    });

    testWidgets('job pings start only in the foreground, then keep going', (
      t,
    ) async {
      final binding = t.binding;
      binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final source = _RecordingSource();
      final realtime = FakeRealtime();
      final pings = JobPings(
        source: source,
        live: RunnerLive(
          client: realtime,
          runner: realtime,
          accessToken: () async => 'a',
        ),
      );
      addTearDown(pings.dispose);
      expect(pings.pinger.appInForeground, isFalse);

      // App opened by the system in the background with a working job.
      pings.setWorkingJob('e1');
      expect(pings.pinger.waitingForForeground, isTrue);
      expect(source.streams, isEmpty);

      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      expect(source.streams, [true]);
      expect(pings.pinger.waitingForForeground, isFalse);

      // Switching apps / locking the phone keeps the job stream.
      binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      expect(source.cancelled, 0);
      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      expect(source.streams, [true]);

      // Job finished, runner offline: everything stops.
      pings.setWorkingJob(null);
      expect(source.cancelled, 1);
      expect(pings.pinger.collecting, isFalse);
      expect(source.requests, 0);
    });
  });

  group('startSession (round 17 review)', () {
    test('a queue store read failure never stops the socket', () async {
      final b = TestBackend(queueStore: _ThrowingQueueStore());
      b.evidenceStore.kept.add('kept/old.jpg');
      await b.services.startSession();
      expect(b.services.live.isConnected, isTrue);
      // The unread queue may still need its photos: nothing deleted.
      expect(b.evidenceStore.discarded, isEmpty);
    });

    test('a good read still cleans up photos no action needs', () async {
      final b = TestBackend();
      b.evidenceStore.kept.add('kept/old.jpg');
      await b.services.startSession();
      expect(b.services.live.isConnected, isTrue);
      expect(b.evidenceStore.discarded, ['kept/old.jpg']);
    });
  });
}
