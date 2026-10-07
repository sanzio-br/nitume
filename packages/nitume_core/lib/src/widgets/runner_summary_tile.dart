import 'package:flutter/material.dart';

import '../theme/nitume_typography.dart';
import 'initials_avatar.dart';

/// C-21. Runner summary (design-system runner card / `.track-info`): 36px
/// initials avatar, name 13.5/600, Fira Code 11 slate-600 meta
/// (`Verified · 4.9 · 137 tasks`), optional trailing widget (usually a
/// status chip). Place inside a `NitumeCard`.
class RunnerSummaryTile extends StatelessWidget {
  const RunnerSummaryTile({
    super.key,
    required this.name,
    this.meta,
    this.initials,
    this.trailing,
  });

  /// Display name. Pending Q-NAME: the API has no name field yet.
  final String name;
  final String? meta;

  /// Defaults to initials derived from [name].
  final String? initials;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        InitialsAvatar(
          initials: initials ?? InitialsAvatar.initialsFor(name),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(name, style: NitumeTextStyles.rowTitle),
              if (meta != null) ...[
                const SizedBox(height: 2),
                Text(meta!, style: NitumeTextStyles.meta),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 8), trailing!],
      ],
    );
  }
}
