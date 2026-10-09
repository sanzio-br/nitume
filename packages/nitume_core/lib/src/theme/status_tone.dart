import 'package:flutter/widgets.dart';

import 'nitume_colors.dart';
import 'nitume_design_choices.dart';

/// The four design-system chip variants (`.chip-success`, `.chip-info`,
/// `.chip-pending`, `.chip-danger`).
///
/// There is deliberately no "neutral" tone: the design system defines none.
enum StatusTone { success, info, pending, danger }

/// Background / foreground pair for a [StatusTone].
@immutable
class StatusToneColors {
  const StatusToneColors({required this.background, required this.foreground});

  final Color background;
  final Color foreground;

  /// Colours for [tone], exactly as in `nitume_design_system.html`:
  ///
  /// | tone    | bg          | text      |
  /// |---------|-------------|-----------|
  /// | success | green-050   | green-700 |
  /// | info    | blue-050    | blue      |
  /// | pending | amber-050   | amber     |
  /// | danger  | red-050     | red       |
  ///
  /// When [NitumeDesignChoices.chipHighContrastText] is on, the text of the
  /// success / pending / danger chips switches to blue (the dot keeps the
  /// tone colour) so 12px chip text reaches WCAG AA 4.5:1 (decided, BOARD
  /// row 33).
  static StatusToneColors of(StatusTone tone) {
    final (bg, fg) = switch (tone) {
      StatusTone.success => (NitumeColors.green050, NitumeColors.green700),
      StatusTone.info => (NitumeColors.blue050, NitumeColors.blue),
      StatusTone.pending => (NitumeColors.amber050, NitumeColors.amber),
      StatusTone.danger => (NitumeColors.red050, NitumeColors.red),
    };
    return StatusToneColors(background: bg, foreground: fg);
  }

  /// Text colour for chip labels (see [NitumeDesignChoices.chipHighContrastText]).
  Color get label =>
      NitumeDesignChoices.chipHighContrastText ? NitumeColors.blue : foreground;

  /// Colour of the 6px `.chip-dot` (`currentColor` in the design system).
  Color get dot => foreground;
}
