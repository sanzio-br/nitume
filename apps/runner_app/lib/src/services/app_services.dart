import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:nitume_runner_device/nitume_runner_device.dart';

import 'active_jobs.dart';
import 'capture_files.dart';
import 'job_pings.dart';
import 'push.dart';
import 'runner_live.dart';
import 'session.dart';
import 'shell_controller.dart';

/// Everything the screens need, built once per app session: one API client,
/// the core repositories, the session and the shell controller.
///
/// Tests build it with fakes through the default constructor.
class AppServices {
  AppServices({
    required this.session,
    required this.auth,
    required this.account,
    required this.jobs,
    required this.notifications,
    required this.capture,
    required this.location,
    required this.permissions,
    required this.files,
    required this.payouts,
    RunnerLive? live,
    QueueStore? queueStore,
    required this.evidenceFiles,
    OneTimeFlag? jobStartNoticeShown,
    bool collectLocation = true,
    this.appConfig = const AppConfig(),
    this.push = const NoopPushService(),
    DateTime Function()? clock,
    ShellController? shell,
  }) : shell = shell ?? ShellController(),
       clock = clock ?? DateTime.now,
       jobStartNoticeShown = jobStartNoticeShown ?? MemoryOneTimeFlag(),
       live = live ?? RunnerLive() {
    pings = JobPings(
      source: location,
      live: this.live,
      onJobPingsStopped: (_) => active.load(),
      collect: collectLocation,
    );
    queue = OfflineActionQueue(
      store: queueStore ?? InMemoryQueueStore(),
      runner: RunnerQueuedActions.runnerFor(jobs),
      onDropped: (a, r) => active.onQueueDropped(a, r),
      onSettled: RunnerQueuedActions.cleanupFor(evidenceFiles),
    );
    uploads = JobEvidenceUploads(
      (errandId) => EvidenceUploader(
        capture: capture,
        upload: jobs.uploadEvidence,
        files: evidenceFiles,
        positions: location,
        queue: queue,
        readFile: files.read,
        clock: this.clock,
      ),
    );
    active = ActiveJobs(
      jobs: jobs,
      live: this.live,
      pings: pings,
      uploads: uploads,
      queue: () => queue,
    );
    // Replay queued actions whenever the socket comes back (reopening a
    // queue whose store could not be read at sign-in).
    this.live.state.addListener(() {
      if (this.live.isConnected) unawaited(resumeQueue());
    });
  }

  /// Production wiring against [baseUrl] (`_shared.md` §10). The socket
  /// and the location pinger join here once their producers exist (RA-4,
  /// RA-5).
  static Future<AppServices> create({required String baseUrl}) async {
    late final SessionController session;
    final tokenStore = SecureTokenStore();
    final api = NitumeApiClient(
      config: ApiConfig(baseUrl: baseUrl),
      tokenStore: tokenStore,
      // Unregister the push device while the tokens still work.
      beforeSessionCleared: () => session.beforeTokensCleared(),
      onUnauthenticated: () => session.expire(),
      onAccountSuspended: () => session.suspend(),
    );
    final auth = AuthRepository(api: api, tokenStore: tokenStore);
    final push = await FcmPushService.initialize();
    session = SessionController(
      auth: auth,
      push: FcmPushRegistrar(
        PushRegistration(push: push, devices: DevicesRepository(api)),
      ),
    );
    final capture = ImagePickerCaptureSource();
    Future<String?> accessToken() async =>
        (await tokenStore.read())?.accessToken;
    final socket = SocketIoRealtimeClient(
      url: SocketIoRealtimeClient.originFor(baseUrl),
      tokenProvider: accessToken,
    );
    // Captures orphaned when Android killed the app mid-pick (B-1).
    unawaited(capture.discardLostCaptures().catchError((Object _) => 0));
    return AppServices(
      session: session,
      auth: auth,
      account: RunnerAccountRepository(api),
      jobs: RunnerJobsRepository(api),
      notifications: NotificationsRepository(api),
      capture: capture,
      location: const GeolocatorPositionSource(),
      permissions: const PermissionHandlerDevicePermissions(),
      files: const IoCaptureFiles(),
      payouts: RunnerPayoutRepository(
        api,
        keys: PaymentAttemptKeys(SecureIdempotencyKeyStore()),
      ),
      live: RunnerLive(
        client: socket,
        runner: socket,
        accessToken: accessToken,
      ),
      queueStore: SharedPreferencesQueueStore(),
      // Backup exclusion built in (row 255): iOS native, Android manifest.
      evidenceFiles: appSupportEvidenceFileStore(),
      jobStartNoticeShown: SharedPreferencesOneTimeFlag(),
      appConfig: AppConfig.fromEnvironment(onOpenLink: openExternalLink),
      push: push,
    );
  }

  final SessionController session;
  final AuthRepository auth;

  /// R-19: `GET /runners/me`, availability, verifications and uploads.
  final RunnerAccountRepository account;

  /// R-19: offers, the runner job view, accept and decline.
  final RunnerJobsRepository jobs;

  /// Bell unread count.
  final NotificationsRepository notifications;

  /// Camera / gallery capture (`image_picker`, row 124).
  final ImageCaptureSource capture;

  /// Device location (`geolocator`, row 124). Read only while online
  /// (row 123: nothing is collected offline).
  final PositionSource location;

  /// Camera permission and the system-settings shortcut.
  final DevicePermissions permissions;

  /// Reads captured images into memory.
  final CaptureFiles files;

  /// Payout ledger lines and reimbursement claims (`v-job-summary`).
  final RunnerPayoutRepository payouts;

  /// The session's socket (`_shared.md` §10).
  final RunnerLive live;

  /// R-20 cadence from availability and the working job.
  late final JobPings pings;

  /// R-21: runner actions made offline, replayed in order.
  late final OfflineActionQueue queue;

  /// R-22 uploaders per held job (C-V2).
  late final JobEvidenceUploads uploads;

  /// Held jobs, transitions and notes (`v-active`).
  late final ActiveJobs active;

  /// App-private folder where evidence photos wait for upload (row 149;
  /// `appSupportEvidenceFileStore()` on a device).
  final DirectoryEvidenceFileStore evidenceFiles;

  /// Whether the one-time job-start location notice was shown on this
  /// install (row 246; `SharedPreferencesOneTimeFlag` on a device).
  final OneTimeFlag jobStartNoticeShown;

  bool _sessionActive = false;

  /// Starts the signed-in runtime: socket, queue.
  Future<void> startSession() async {
    _sessionActive = true;
    // Open the queue first (a log out closed it), so an offline action made
    // as soon as the shell shows is queued, not refused. A store read
    // failure never stops the socket: the queue then stays closed (it must
    // not write over the unread store), so an offline action fails with a
    // retry instead of queueing, until [resumeQueue] reads it again.
    await _openQueue();
    await live.start();
    unawaited(queue.replay());
  }

  /// App resumed or socket back (signed in): reopen a queue whose store
  /// read failed, then replay. Does nothing after log out (a cleared queue
  /// stays closed until the next sign-in, B-1).
  Future<void> resumeQueue() async {
    if (!_sessionActive) return;
    if (queue.isClosed) await _openQueue();
    if (!_sessionActive) return;
    await queue.replay();
  }

  /// Reads the queue; on a good read, deletes copies left by a killed app
  /// that no queued action needs (B-1). Never throws.
  Future<void> _openQueue() async {
    final loaded = await _quietly(queue.load);
    // Only after a good read: an unread queue may still need its photos.
    if (loaded && _sessionActive) {
      await _quietly(
        () => evidenceFiles.discardExcept(
          RunnerQueuedActions.evidencePaths(queue.pending),
        ),
      );
    }
  }

  /// Log out / expiry: stop pings, drop rooms, uploads and queued actions.
  Future<void> endSession() async {
    _sessionActive = false;
    active.reset();
    await queue.clear();
    // Every kept photo goes at log out (B-1 rule 7).
    await _quietly(evidenceFiles.discardAll);
    await live.stop();
  }

  /// Runs [f]; `false` when it threw (best effort; the next start cleans
  /// up again).
  static Future<bool> _quietly(Future<void> Function() f) async {
    try {
      await f();
      return true;
    } on Object {
      return false;
    }
  }

  /// Wall clock for offer countdowns; tests pin it.
  final DateTime Function() clock;
  final AppConfig appConfig;
  final ShellController shell;

  /// FCM; taps deep-link once the runner screens exist (`_shared.md` §10).
  final PushService push;

  /// Lets root tabs reload when a pushed screen above them closes.
  final RouteObserver<ModalRoute<void>> routeObserver =
      RouteObserver<ModalRoute<void>>();
}

/// Provides [AppServices] to the widget tree.
class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'No AppScope above this context');
    return scope!.services;
  }

  /// Non-listening lookup for callbacks.
  static AppServices read(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'No AppScope above this context');
    return scope!.services;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      !identical(services, oldWidget.services);
}

/// Shorthand: `context.services`.
extension AppServicesContext on BuildContext {
  AppServices get services => AppScope.read(this);
}
