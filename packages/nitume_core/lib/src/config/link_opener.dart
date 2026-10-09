import 'package:url_launcher/url_launcher.dart';

/// Opens [uri] outside the app with `url_launcher` (BOARD row 39): the
/// browser for `https:` (including `wa.me`), the dialler for `tel:`, the
/// mail app for `mailto:`. Returns `false` when nothing could open it (the
/// screen shows its snackbar). Never throws.
///
/// Pass it as `AppConfig.fromEnvironment(onOpenLink: openExternalLink)`.
Future<bool> openExternalLink(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } on Object {
    return false;
  }
}
