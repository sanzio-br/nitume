import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// C-09. Root-tab top bar (`.topbar`): slate background, 21/700 title, an
/// optional 12px slate-600 greeting above it, and trailing actions (gap 10).
///
/// An empty (or blank) [title] renders no title line and no header
/// semantics node (BOARD Needs row 40), e.g. Home before the name loads.
///
/// It scrolls with the content (not pinned); place it as the first child of
/// the scroll view inside a [SafeArea].
class NitumeTopBar extends StatelessWidget {
  const NitumeTopBar({
    super.key,
    required this.title,
    this.greeting,
    this.actions = const [],
    this.padding = const EdgeInsets.fromLTRB(20, 8, 20, 14),
  });

  /// Title text; empty or blank to omit the title line.
  final String title;
  final String? greeting;
  final List<Widget> actions;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: NitumeColors.slate,
      child: Padding(
        padding: padding,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (greeting != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        greeting!,
                        style: NitumeTextStyles.muted.copyWith(fontSize: 12),
                      ),
                    ),
                  if (title.trim().isNotEmpty)
                    Semantics(
                      header: true,
                      child: Text(
                        title,
                        style: NitumeTextStyles.topBarTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
            for (var i = 0; i < actions.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              actions[i],
            ],
          ],
        ),
      ),
    );
  }
}
