import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  test('a cleared queue refuses new work until the next load', () async {
    final store = InMemoryQueueStore();
    final q = OfflineActionQueue(
      store: store,
      runner: (_) async => ReplayOutcome.done,
    );
    expect(q.isClosed, isFalse);
    await q.enqueue(
      QueuedActionKind.runnerNotes,
      errandId: 'e1',
      payload: RunnerQueuedActions.runnerNotes('a'),
    );
    await q.clear();
    expect(q.isClosed, isTrue);
    expect(
      () => q.enqueue(
        QueuedActionKind.runnerNotes,
        errandId: 'e1',
        payload: RunnerQueuedActions.runnerNotes('b'),
      ),
      throwsStateError,
    );
    expect(await store.read(), isEmpty);
    await q.load();
    expect(q.isClosed, isFalse);
    await q.enqueue(
      QueuedActionKind.runnerNotes,
      errandId: 'e1',
      payload: RunnerQueuedActions.runnerNotes('c'),
    );
    expect(q.pending, hasLength(1));
  });
}
