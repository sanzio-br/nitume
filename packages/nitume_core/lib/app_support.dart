/// App-level helpers shared by the customer and runner apps: auth screen
/// frame, inline errors, generic error copy, snackbars, the session
/// controller and push-token registration.
///
/// A separate library from `nitume_core.dart` on purpose: the customer app
/// still has its own copies under the same names, so exporting these from
/// the main barrel would make its imports ambiguous. Import both:
///
/// ```dart
/// import 'package:nitume_core/nitume_core.dart';
/// import 'package:nitume_core/app_support.dart';
/// ```
///
/// Once the customer app switches to these, they move into the barrel.
library;

export 'src/app_support/auth_frame.dart';
export 'src/app_support/display.dart';
export 'src/app_support/push_registrar.dart';
export 'src/app_support/session.dart';
