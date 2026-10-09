import 'package:flutter/material.dart';

/// Design tokens ported 1:1 from `docs/design/nitume_design_system.html`
/// (Deep Trust Blue / Pure White / Cool Slate / Action Green).
///
/// This file and the rest of `lib/src/theme/` are the only places a hex value
/// may appear. Every surface in the apps references one of these tokens (see
/// AGENT_BUILD_INSTRUCTIONS.md §7). Do not add colours here without the owner's
/// approval: the palette is a §3 stop-and-ask item.
abstract final class NitumeColors {
  /// Deep Trust Blue: text, headers, nav.
  static const blue = Color(0xFF0B2545);

  /// Pure White: canvas, primary cards.
  static const white = Color(0xFFFFFFFF);

  /// Cool Slate: outer background, card separators.
  static const slate = Color(0xFFF4F6F9);

  /// Action Green: primary actions, active toggles, checked/complete states.
  static const green = Color(0xFF04AF4D);

  /// Derived: nav hover / pressed blue.
  static const blue700 = Color(0xFF08192F);

  /// Derived: faint blue chip background.
  static const blue050 = Color(0xFFE9EDF3);

  /// Derived: hairline borders on white/slate.
  static const slateLine = Color(0xFFE2E7EF);

  /// Derived: muted body text (blue, desaturated).
  static const slate600 = Color(0xFF5C6B85);

  /// Derived: placeholder / faint labels.
  static const slate400 = Color(0xFF8C97AC);

  /// Derived: success chip background.
  static const green050 = Color(0xFFE3F8EA);

  /// Derived: green hover / pressed; success chip text.
  static const green700 = Color(0xFF038A3D);

  /// Functional accent: pending / needs-attention text on a chip.
  static const amber = Color(0xFFB8860B);

  /// Functional accent: pending chip background.
  static const amber050 = Color(0xFFFBF3E1);

  /// Functional accent: disputes / failed only.
  static const red = Color(0xFFC1433C);

  /// Functional accent: danger chip background.
  static const red050 = Color(0xFFFBEAE9);
}

/// Corner radii from the design system (`--r-s/m/l`) plus the pill shape used
/// by `.btn` and `.chip` (`border-radius: 999px`).
///
/// The mockup also uses 5, 9, 10, 12 and 16px; those are not design-system
/// values. Components pick one of these through [NitumeDesignChoices] /
/// `NitumeShapes` so an owner decision flips them in one place.
abstract final class NitumeRadii {
  /// `--r-s`: form fields.
  static const small = 8.0;

  /// `--r-m`: cards, list containers.
  static const medium = 14.0;

  /// `--r-l`: large surfaces.
  static const large = 20.0;

  /// Pill (`999px`): buttons and chips.
  static const pill = 999.0;
}

/// Spacing scale used across both apps.
abstract final class NitumeSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;

  /// Horizontal screen padding used by every customer view (`_shared.md` §5).
  static const screen = 20.0;

  /// Minimum interactive hit area (Material / WCAG target size).
  static const minTapTarget = 48.0;
}
