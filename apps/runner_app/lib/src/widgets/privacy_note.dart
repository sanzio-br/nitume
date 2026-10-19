import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../services/app_services.dart';
import 'common.dart';

/// ID and selfie privacy copy (`_shared.md` §9, rows 158, 172, 173).
abstract final class PrivacyCopy {
  /// Short line on the capture screens (approved, row 172).
  static const short =
      'Your ID and selfie are stored privately and only authorised Nitume '
      'personnel can see them.';

  /// The owner's full statement on `v-onboard-pending` (row 158).
  static const full =
      'Your ID and selfie are securely stored in private storage and are '
      'only accessible to authorised Nitume personnel for verification, '
      'security, and compliance purposes. Access is logged and the files are '
      "deleted according to Nitume's retention policy.";

  static const link = 'Privacy Policy';
}

/// Privacy text 11.5 slate-600 with the C-04 `Privacy Policy` link
/// (48 dp hit area) to `AppConfig.privacyLink`, opened externally. Without
/// a configured URL the link is hidden and the text stays (row 173).
///
/// [full] puts the owner's whole statement first and the link on its own
/// line (`v-onboard-pending`); otherwise the short line with the link on
/// the same line (capture screens).
class PrivacyNote extends StatelessWidget {
  const PrivacyNote({super.key, this.full = false});

  final bool full;

  @override
  Widget build(BuildContext context) {
    final config = context.services.appConfig;
    final uri = config.privacyLink;
    final style = NitumeTextStyles.mutedSmall;
    final text = Text(
      full ? PrivacyCopy.full : PrivacyCopy.short,
      style: style,
    );
    if (uri == null) return text;
    final link = NitumeButton.link(
      label: PrivacyCopy.link,
      onPressed: () async {
        final ok = await config.open(uri);
        if (!ok && context.mounted) {
          showSnack(context, "Couldn't open the page. Try again later.");
        }
      },
    );
    if (full) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [text, link],
      );
    }
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text('${PrivacyCopy.short} ', style: style),
        link,
      ],
    );
  }
}
