import 'package:flutter/material.dart';

/// Design tokens ported 1:1 from `designs/nitume_design_system.html`
/// (Deep Trust Blue / Pure White / Cool Slate / Action Green).
///
/// Do not introduce ad-hoc colours: every surface in the apps must reference
/// one of these tokens (see AGENT_BUILD_INSTRUCTIONS.md §7).
abstract final class NitumeColors {
  /// text, headers, nav
  static const blue = Color(0xFF0B2545);

  /// canvas, primary cards
  static const white = Color(0xFFFFFFFF);

  /// outer bg, card separators
  static const slate = Color(0xFFF4F6F9);

  /// primary actions, active/success
  static const green = Color(0xFF04AF4D);

  /// nav hover / pressed
  static const blue700 = Color(0xFF08192F);

  /// faint blue chip bg
  static const blue050 = Color(0xFFE9EDF3);

  /// hairline borders on white/slate
  static const slateLine = Color(0xFFE2E7EF);

  /// muted body text (blue, desaturated)
  static const slate600 = Color(0xFF5C6B85);

  /// placeholder / faint labels
  static const slate400 = Color(0xFF8C97AC);

  /// success chip bg
  static const green050 = Color(0xFFE3F8EA);

  /// green hover / pressed
  static const green700 = Color(0xFF038A3D);

  /// pending / needs-attention text on slate chip
  static const amber = Color(0xFFB8860B);
  static const amber050 = Color(0xFFFBF3E1);

  /// disputes / failed only
  static const red = Color(0xFFC1433C);
  static const red050 = Color(0xFFFBEAE9);
}

/// Corner radii from the design system (`--r-s/m/l`).
abstract final class NitumeRadii {
  static const small = 8.0;
  static const medium = 14.0;
  static const large = 20.0;
}

/// Spacing scale used across both apps.
abstract final class NitumeSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
}
