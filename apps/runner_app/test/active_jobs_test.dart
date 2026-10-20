import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/services/active_jobs.dart';

import 'support/fakes.dart';

void main() {
  group('ActiveJobs', () {
    test(
      'load: rooms, working job pings, uploads kept for held jobs',
      () async {
        final b = TestBackend();
        b.jobs.heldList = [
          heldJob(id: 'w1'),
          heldJob(id: 'a1', status: ErrandStatus.awaitingCustomer),
        ];
        await b.services.live.start();
        b.services.uploads.forJob('gone');
        await b.services.active.load();

        expect(b.services.active.working?.id, 'w1');
        expect(b.realtime.joined, {'w1', 'a1'});
        expect(b.services.pings.workingJob, 'w1');
        expect(b.services.pings.mode, const PingActiveJob('w1'));
        expect(b.services.uploads.jobIds, isEmpty);
      },
    );

    test('AWAITING_CUSTOMER and DISPUTED get no job pings', () async {
      final b = TestBackend();
      b.jobs.heldList = [
        heldJob(id: 'a1', status: ErrandStatus.awaitingCustomer),
        heldJob(id: 'd1', status: ErrandStatus.disputed),
      ];
      b.services.pings.setOnline(true);
      await b.services.active.load();
      expect(b.services.pings.workingJob, isNull);
      expect(b.services.pings.mode, const PingIdle());
      b.services.pings.setOnline(false);
      expect(b.services.pings.mode, const PingOffline());
    });

    test('a refused job ping stops job pings and reloads', () async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob(id: 'w1')];
      await b.services.active.load();
      b.realtime.ack = const LocationPingAck(
        ok: false,
        error: LocationPingError.notLive,
      );
      await b.services.live.start();
      // The runner finished on another device.
      b.jobs.setStatus('w1', ErrandStatus.awaitingCustomer);
      final before = b.jobs.heldCalls;
      // What LocationPinger would send.
      await b.services.pings.send(
        LocationPing(
          position: DevicePosition(lat: 0, lng: 0, timestamp: testNow),
          errandId: 'w1',
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(b.services.pings.workingJob, isNull);
      expect(b.jobs.heldCalls, greaterThan(before));
    });

    test(
      'offline transition is queued and shown as the target state',
      () async {
        final b = TestBackend();
        b.jobs.heldList = [heldJob(id: 'w1')];
        await b.services.active.load();
        b.jobs.transitionErrors.add(networkError);
        final job = b.services.active.held.single;

        final r = await b.services.active.transition(job, ErrandStatus.arrived);
        expect(r.queued, isTrue);
        expect(b.services.active.statusOf(job), ErrandStatus.arrived);
        expect(b.services.active.hasQueued('w1'), isTrue);

        await b.services.queue.replay();
        await b.services.active.load();
        expect(b.services.active.hasQueued('w1'), isFalse);
        expect(
          b.services.active.statusOf(b.services.active.held.single),
          ErrandStatus.arrived,
        );
      },
    );

    test('illegal_transition reloads with one message', () async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob(id: 'w1')];
      await b.services.active.load();
      b.jobs.transitionErrors.add(apiError(ApiErrorCodes.illegalTransition));
      final r = await b.services.active.transition(
        b.services.active.held.single,
        ErrandStatus.arrived,
      );
      expect(r.error, ActiveJobsCopy.changed);
    });

    test(
      'session start keeps only queued photos; log out deletes all',
      () async {
        final b = TestBackend();
        b.evidenceStore.kept.addAll(['kept/orphan.jpg', 'kept/queued.jpg']);
        await b.services.queue.enqueue(
          QueuedActionKind.evidenceUpload,
          errandId: 'w1',
          payload: RunnerQueuedActions.evidence(
            path: 'kept/queued.jpg',
            type: EvidenceType.photo,
            contentType: 'image/jpeg',
          ),
        );
        // Pretend the app was killed: the queue reloads from its store.
        b.jobs.heldList = [heldJob(id: 'w1')];
        b.jobs.evidenceErrors.add(networkError);
        await b.services.startSession();
        expect(b.evidenceStore.discarded, contains('kept/orphan.jpg'));
        expect(b.evidenceStore.kept, contains('kept/queued.jpg'));

        await b.services.endSession();
        expect(b.evidenceStore.kept, isEmpty);
      },
    );

    test('access revoked drops the job and stops its pings', () async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob(id: 'w1')];
      await b.services.live.start();
      await b.services.active.load();
      b.realtime.revoked.add(const ErrandAccessRevoked(errandId: 'w1'));
      await Future<void>.delayed(Duration.zero);
      expect(b.services.active.held, isEmpty);
      expect(b.services.pings.workingJob, isNull);
      expect(b.services.active.takeNotice(), ActiveJobsCopy.revoked);
    });
  });
}
