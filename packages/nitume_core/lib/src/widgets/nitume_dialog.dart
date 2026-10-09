import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';

/// C-35. Modal card (design-system `.card-demo` + `.btn-*`): white, `--r-l`
/// 20, padding 20, max width 335, centred over
/// [NitumeDesignChoices.modalScrim] (SQ-1, open).
///
/// Top to bottom: [title] 17/600 blue (`.t-h3`), [body] 13.5 slate-600,
/// optional [content] (e.g. the price-change compare row or a skeleton), a
/// full-width stack of [actions] (gap 10), then an optional red 12.5
/// [error] line.
///
/// Open it with [NitumeDialog.show] (never `showDialog` directly, so the
/// scrim and back-button rules stay in one place), or use
/// [showNitumeConfirmDialog] for the two-button confirmations.
class NitumeDialog extends StatelessWidget {
  const NitumeDialog({
    super.key,
    required this.title,
    this.body,
    this.content,
    this.actions = const [],
    this.error,
  });

  final String title;

  /// Explanation under the title, 13.5 slate-600.
  final String? body;

  /// Extra content between [body] and [actions].
  final Widget? content;

  /// Buttons, stacked full width in the given order. Use [NitumeButton].
  final List<Widget> actions;

  /// Inline error under the buttons (red, OA-13), e.g. `Couldn't send your
  /// answer. Try again.`
  final String? error;

  /// Max dialog width (`_shared.md` §4, C-35).
  static const double maxWidth = 335;

  /// Shows [builder]'s dialog over the scrim.
  ///
  /// [barrierDismissible] `false` makes the dialog blocking: tapping the scrim
  /// and the system back button do nothing (the price-change modal, OA-8).
  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
    bool barrierDismissible = true,
  }) {
    return showDialog<T>(
      context: context,
      barrierDismissible: barrierDismissible,
      barrierColor: NitumeDesignChoices.modalScrim,
      builder: (context) =>
          PopScope(canPop: barrierDismissible, child: builder(context)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: NitumeColors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(
        horizontal: NitumeSpacing.screen,
        vertical: NitumeSpacing.lg,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(NitumeRadii.large),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: maxWidth),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(
                header: true,
                namesRoute: true,
                child: Text(title, style: NitumeTextStyles.dialogTitle),
              ),
              if (body != null) ...[
                const SizedBox(height: 8),
                Text(
                  body!,
                  style: NitumeTextStyles.body.copyWith(
                    color: NitumeColors.slate600,
                  ),
                ),
              ],
              if (content != null) ...[const SizedBox(height: 4), content!],
              if (actions.isNotEmpty) ...[
                const SizedBox(height: 16),
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(height: 10),
                  SizedBox(width: double.infinity, child: actions[i]),
                ],
              ],
              if (error != null) ...[
                const SizedBox(height: 10),
                Semantics(
                  liveRegion: true,
                  child: Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: NitumeTextStyles.body.copyWith(
                      fontSize: 12.5,
                      color: NitumeDesignChoices.fieldError,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Two-button confirmation on [NitumeDialog] (log out, delete address,
/// discard draft, cancel task, reject price change).
///
/// Buttons in the specs' order: [confirmLabel] first (outline, red label when
/// [destructive]), then [cancelLabel] as the primary button. Resolves `true`
/// only when the user confirms; scrim tap or back resolve `false`.
Future<bool> showNitumeConfirmDialog(
  BuildContext context, {
  required String title,
  String? body,
  required String confirmLabel,
  required String cancelLabel,
  bool destructive = true,
  bool barrierDismissible = true,
}) async {
  final result = await NitumeDialog.show<bool>(
    context,
    barrierDismissible: barrierDismissible,
    builder: (context) => NitumeDialog(
      title: title,
      body: body,
      actions: [
        NitumeButton.outline(
          label: confirmLabel,
          destructive: destructive,
          onPressed: () => Navigator.of(context).pop(true),
        ),
        NitumeButton.primary(
          label: cancelLabel,
          onPressed: () => Navigator.of(context).pop(false),
        ),
      ],
    ),
  );
  return result ?? false;
}
