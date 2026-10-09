import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_theme.dart';
import '../theme/nitume_typography.dart';
import 'num_text.dart';

/// Design-system button variants.
enum NitumeButtonVariant {
  /// C-01 `.btn-primary`: green fill, white text.
  primary,

  /// C-02 `.btn-secondary`: blue fill, white text.
  secondary,

  /// C-03 `.btn-outline`: white, slate-line border, blue text.
  outline,

  /// C-04 `.btn-text`: no fill, blue text.
  text,

  /// C-04 link: green-700 700 text (e.g. "Resend code").
  link,
}

/// Button sizes.
enum NitumeButtonSize {
  /// `.btn`: 14.5/600, padding 12/22.
  regular,

  /// `.track-btn` / `.btn-sm`: 12.5/700, padding 9/16 (hit area stays 48).
  small,
}

/// C-01..C-04. The only button screens should use. Pill shape (Q11), white
/// text on every fill, 48dp minimum hit area.
class NitumeButton extends StatelessWidget {
  const NitumeButton({
    super.key,
    required this.label,
    this.richLabel,
    required this.onPressed,
    this.variant = NitumeButtonVariant.primary,
    this.size = NitumeButtonSize.regular,
    this.icon,
    this.expand = false,
    this.loading = false,
    this.destructive = false,
  });

  const NitumeButton.primary({
    super.key,
    required this.label,
    this.richLabel,
    required this.onPressed,
    this.size = NitumeButtonSize.regular,
    this.icon,
    this.expand = false,
    this.loading = false,
  })  : variant = NitumeButtonVariant.primary,
        destructive = false;

  const NitumeButton.secondary({
    super.key,
    required this.label,
    this.richLabel,
    required this.onPressed,
    this.size = NitumeButtonSize.regular,
    this.icon,
    this.expand = false,
    this.loading = false,
  })  : variant = NitumeButtonVariant.secondary,
        destructive = false;

  const NitumeButton.outline({
    super.key,
    required this.label,
    this.richLabel,
    required this.onPressed,
    this.size = NitumeButtonSize.regular,
    this.icon,
    this.expand = false,
    this.loading = false,
    this.destructive = false,
  }) : variant = NitumeButtonVariant.outline;

  const NitumeButton.text({
    super.key,
    required this.label,
    this.richLabel,
    required this.onPressed,
    this.size = NitumeButtonSize.regular,
    this.icon,
    this.expand = false,
    this.loading = false,
    this.destructive = false,
  }) : variant = NitumeButtonVariant.text;

  const NitumeButton.link({
    super.key,
    required this.label,
    this.richLabel,
    required this.onPressed,
    this.icon,
  })  : variant = NitumeButtonVariant.link,
        size = NitumeButtonSize.small,
        expand = false,
        loading = false,
        destructive = false;

  /// Plain-text label. Also the accessible label when [richLabel] is set,
  /// so keep the two identical in wording.
  final String label;

  /// Optional rich version of [label], drawn instead of it. Build numeric
  /// parts with [NumSpan] so amounts and counts render in Fira Code
  /// (`Approve KSh 5,000 increase`, `+3 more in progress`).
  final InlineSpan? richLabel;

  /// `null` disables the button.
  final VoidCallback? onPressed;
  final NitumeButtonVariant variant;
  final NitumeButtonSize size;
  final IconData? icon;

  /// Full width (fixed bottom CTAs).
  final bool expand;

  /// Shows a spinner and disables the button.
  final bool loading;

  /// Destructive action ("Reject & cancel", "Log out", "Delete address"):
  /// label in [NitumeDesignChoices.destructiveText] (red, OA-13). Only the
  /// outline and text variants support it; fills never carry red.
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final isFilled = variant == NitumeButtonVariant.primary ||
        variant == NitumeButtonVariant.secondary;
    final spinnerColor = isFilled
        ? NitumeColors.white
        : destructive
            ? NitumeDesignChoices.destructiveText
            : NitumeColors.blue;

    var style = switch (variant) {
      NitumeButtonVariant.primary => NitumeTheme.primaryButtonStyle(),
      NitumeButtonVariant.secondary => NitumeTheme.secondaryButtonStyle(),
      NitumeButtonVariant.outline => NitumeTheme.outlineButtonStyle(
          color: destructive
              ? NitumeDesignChoices.destructiveText
              : NitumeColors.blue,
        ),
      NitumeButtonVariant.text => NitumeTheme.textButtonStyle(
          color: destructive
              ? NitumeDesignChoices.destructiveText
              : NitumeColors.blue,
        ),
      NitumeButtonVariant.link =>
        NitumeTheme.textButtonStyle(color: NitumeColors.green700),
    };
    if (size == NitumeButtonSize.small) {
      style = style.copyWith(
        textStyle: WidgetStatePropertyAll(NitumeTextStyles.buttonSmall),
        padding: WidgetStatePropertyAll(
          variant == NitumeButtonVariant.link
              ? const EdgeInsets.symmetric(horizontal: 4, vertical: 12)
              : const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        ),
        // Visual height ~34, hit area padded to 48.
        tapTargetSize: MaterialTapTargetSize.padded,
        minimumSize: const WidgetStatePropertyAll(Size(48, 36)),
      );
    }
    if (variant == NitumeButtonVariant.link && size == NitumeButtonSize.small) {
      style = style.copyWith(
        minimumSize: const WidgetStatePropertyAll(
          Size(NitumeSpacing.minTapTarget, NitumeSpacing.minTapTarget),
        ),
      );
    }

    final onTap = loading ? null : onPressed;
    final Widget child = loading
        ? SizedBox.square(
            dimension: size == NitumeButtonSize.small ? 14 : 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: spinnerColor,
            ),
          )
        : richLabel == null
        ? Text(label, textAlign: TextAlign.center)
        : Text.rich(
            richLabel!,
            textAlign: TextAlign.center,
            semanticsLabel: label,
          );
    final iconWidget = icon == null || loading
        ? null
        : Icon(icon, size: size == NitumeButtonSize.small ? 16 : 18);

    final Widget button = switch (variant) {
      NitumeButtonVariant.primary ||
      NitumeButtonVariant.secondary =>
        iconWidget == null
            ? FilledButton(onPressed: onTap, style: style, child: child)
            : FilledButton.icon(
                onPressed: onTap,
                style: style,
                icon: iconWidget,
                label: child,
              ),
      NitumeButtonVariant.outline => iconWidget == null
          ? OutlinedButton(onPressed: onTap, style: style, child: child)
          : OutlinedButton.icon(
              onPressed: onTap,
              style: style,
              icon: iconWidget,
              label: child,
            ),
      NitumeButtonVariant.text ||
      NitumeButtonVariant.link =>
        iconWidget == null
            ? TextButton(onPressed: onTap, style: style, child: child)
            : TextButton.icon(
                onPressed: onTap,
                style: style,
                icon: iconWidget,
                label: child,
              ),
    };

    final semantic = Semantics(
      label: loading ? label : null,
      child: button,
    );
    return expand ? SizedBox(width: double.infinity, child: semantic) : semantic;
  }
}
