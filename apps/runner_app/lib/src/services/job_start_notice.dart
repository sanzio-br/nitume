import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

import 'app_services.dart';

/// After a successful accept: the one-time job-start location notice
/// (`v-active` "Location during a job", rows 245 / 246), once per install.
///
/// Call it after the accept has already moved the runner on (the job is
/// RUNNER_EN_ROUTE); it is never awaited, so it never blocks or delays the
/// job. It opens on [navigator] (capture it before popping the screen that
/// accepted). Informational only: no OS prompt, no permission request.
void showJobStartNotice(NavigatorState navigator, AppServices services) {
  unawaited(
    JobStartLocationNotice.showOnce(
      navigator.context,
      shown: services.jobStartNoticeShown,
    ).catchError((Object _) => false),
  );
}
