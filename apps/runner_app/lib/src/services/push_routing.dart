import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

import '../navigation/nav.dart';
import 'app_services.dart';

/// Where a push tap goes (`_shared.md` §10 deep links).
enum PushTarget {
  /// A runner job notification (RA-6 `runnerKind`): `v-active` on that job
  /// (its ended state shows there).
  activeJob,

  /// A new offer (`errand.RUNNER_ASSIGNED`): `v-job-detail`.
  offer,

  /// Anything else: stay where the app is.
  none,
}

/// The runner reading of a push message (`AppNotification.runnerKind`).
PushTarget pushTargetFor(PushMessage m) {
  if (m.errandId == null || m.eventType == null) return PushTarget.none;
  final reading = AppNotification(
    id: m.notificationId ?? '',
    eventType: m.eventType!,
    title: m.title ?? '',
    isRead: false,
    errandId: m.errandId,
  );
  if (reading.runnerKind != null) return PushTarget.activeJob;
  if (m.event == NotificationEventType.runnerAssigned) return PushTarget.offer;
  return PushTarget.none;
}

/// Opens [m] from the shell (signed in only).
void routePush(PushMessage m, NavigatorState nav, AppServices s) {
  final id = m.errandId;
  if (id == null) return;
  switch (pushTargetFor(m)) {
    case PushTarget.activeJob:
      nav.popUntil((r) => r.isFirst);
      s.shell.showJob(id);
      s.active.load();
    case PushTarget.offer:
      nav.popUntil((r) => r.isFirst);
      nav.pushNamed(Routes.jobDetail, arguments: JobDetailArgs(errandId: id));
    case PushTarget.none:
      break;
  }
}
