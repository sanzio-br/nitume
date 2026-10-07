import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'nitume_colors.dart';

/// Typography layer from `docs/design/nitume_design_system.html`:
///
/// * **Fira Sans** for all UI text, labels, descriptions, buttons — via
///   `Theme.of(context).textTheme` or [NitumeTextStyles].
/// * **Fira Code** exclusively for numeric data — timestamps, due dates,
///   prices, counters like `3/5`, ratings, ETAs — via [numeric] or `NumText`.
///
/// Both families are bundled as package assets (no runtime fetching). Never
/// write `fontFamily: 'FiraCode'` in an app: the registered family names are
/// [uiFamily] and [numericFamily].
abstract final class NitumeTypography {
  /// Registered family for Fira Sans (bundled in `nitume_core`).
  static const uiFamily = 'packages/nitume_core/FiraSans';

  /// Registered family for Fira Code (bundled in `nitume_core`).
  static const numericFamily = 'packages/nitume_core/FiraCode';

  /// Builds the app [TextTheme] in Fira Sans. [base] is accepted for
  /// backwards compatibility and only contributes its non-font properties.
  ///
  /// Role mapping (design system + `_shared.md` §3 mobile scale):
  ///
  /// | role           | size / weight | use                          |
  /// |----------------|---------------|------------------------------|
  /// | displayLarge   | 34 / 700      | design-system H1             |
  /// | headlineLarge  | 24 / 600      | design-system H2             |
  /// | headlineMedium | 22 / 700      | auth heading                 |
  /// | headlineSmall  | 21 / 700      | root top-bar title           |
  /// | titleLarge     | 18 / 700      | pushed header title          |
  /// | titleMedium    | 15.5 / 600    | card title (H3 on mobile)    |
  /// | titleSmall     | 13.5 / 600    | row title                    |
  /// | bodyLarge      | 15 / 400      | design-system body           |
  /// | bodyMedium     | 13.5 / 400    | mobile body                  |
  /// | bodySmall      | 12.5 / 400    | muted (slate-600)            |
  /// | labelLarge     | 14.5 / 600    | buttons                      |
  /// | labelMedium    | 12 / 600      | chips                        |
  /// | labelSmall     | 10 / 700      | tab labels                   |
  static TextTheme textTheme([TextTheme? base]) {
    final t = TextTheme(
      displayLarge: _sans(34, FontWeight.w700),
      displayMedium: _sans(30, FontWeight.w700),
      displaySmall: _sans(26, FontWeight.w700),
      headlineLarge: _sans(24, FontWeight.w600),
      headlineMedium: _sans(22, FontWeight.w700),
      headlineSmall: _sans(21, FontWeight.w700),
      titleLarge: _sans(18, FontWeight.w700),
      titleMedium: _sans(15.5, FontWeight.w600),
      titleSmall: _sans(13.5, FontWeight.w600),
      bodyLarge: _sans(15, FontWeight.w400),
      bodyMedium: _sans(13.5, FontWeight.w400),
      bodySmall: _sans(12.5, FontWeight.w400, NitumeColors.slate600),
      labelLarge: _sans(14.5, FontWeight.w600),
      labelMedium: _sans(12, FontWeight.w600),
      labelSmall: _sans(10, FontWeight.w700),
    );
    return base == null ? t : base.merge(t);
  }

  /// Numeric text style (Fira Code). Use for every price, ETA, date, time,
  /// counter, rating and coordinate shown to a user.
  static TextStyle numeric({
    double fontSize = 14,
    FontWeight fontWeight = FontWeight.w500,
    Color color = NitumeColors.blue,
    double? letterSpacing,
    double? height,
  }) {
    return TextStyle(
      fontFamily: numericFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing ?? 0,
      height: height,
    );
  }

  static TextStyle _sans(double size, FontWeight weight, [Color? color]) =>
      TextStyle(
        fontFamily: uiFamily,
        fontSize: size,
        fontWeight: weight,
        color: color ?? NitumeColors.blue,
        letterSpacing: 0,
      );
}

/// Named text styles for the mobile type scale (`_shared.md` §3) that do not
/// map cleanly onto a Material [TextTheme] role. Screens use these (or the
/// theme) instead of inline `TextStyle(fontSize: …)`.
abstract final class NitumeTextStyles {
  // ---- Fira Sans -----------------------------------------------------------

  /// Root top-bar title, 21/700.
  static final topBarTitle = NitumeTypography._sans(21, FontWeight.w700);

  /// Pushed header title, 18/700.
  static final pushedTitle = NitumeTypography._sans(18, FontWeight.w700);

  /// Auth heading, 22/700.
  static final authHeading = NitumeTypography._sans(22, FontWeight.w700);

  /// Dialog title (design-system `.t-h3`), 17/600.
  static final dialogTitle = NitumeTypography._sans(17, FontWeight.w600);

  /// Card title, 15.5/600.
  static final cardTitle = NitumeTypography._sans(15.5, FontWeight.w600);

  /// Row title, 13.5/600.
  static final rowTitle = NitumeTypography._sans(13.5, FontWeight.w600);

  /// Body, 13.5/400.
  static final body = NitumeTypography._sans(13.5, FontWeight.w400);

  /// Muted body, 13/400 slate-600.
  static final muted =
      NitumeTypography._sans(13, FontWeight.w400, NitumeColors.slate600);

  /// Small muted line, 11.5/400 slate-600 (addresses, notification body).
  static final mutedSmall =
      NitumeTypography._sans(11.5, FontWeight.w400, NitumeColors.slate600);

  /// Section label (`.sec-label`), 11.5/700 slate-600, letter-spacing .05em.
  /// Render the text upper-cased (see `SectionLabel`).
  static final sectionLabel = NitumeTypography._sans(
    11.5,
    FontWeight.w700,
    NitumeColors.slate600,
  ).copyWith(letterSpacing: 11.5 * 0.05);

  /// Form-card label (`.form-label`), 11/700 slate-600, letter-spacing .04em,
  /// upper-cased. Q12: design-system `.field-label` is [fieldLabel].
  static final cardLabel = NitumeTypography._sans(
    11,
    FontWeight.w700,
    NitumeColors.slate600,
  ).copyWith(letterSpacing: 11 * 0.04);

  /// Design-system `.field-label`, 12.5/600 slate-600.
  static final fieldLabel =
      NitumeTypography._sans(12.5, FontWeight.w600, NitumeColors.slate600);

  /// Design-system `.field-input` text, 14.5/400.
  static final fieldInput = NitumeTypography._sans(14.5, FontWeight.w400);

  /// Chip text, 12/600.
  static final chip = NitumeTypography._sans(12, FontWeight.w600);

  /// Small tag (`.addr-tag`), 10/700.
  static final tag = NitumeTypography._sans(10, FontWeight.w700);

  /// Button text, 14.5/600 (`.btn`).
  static final button = NitumeTypography._sans(14.5, FontWeight.w600);

  /// Small button text, 12.5/700 (`.track-btn`, `.btn-sm`).
  static final buttonSmall = NitumeTypography._sans(12.5, FontWeight.w700);

  /// Tab label, 10/700.
  static final tabLabel = NitumeTypography._sans(10, FontWeight.w700);

  // ---- Fira Code -----------------------------------------------------------

  /// Design-system `.t-num`: 20/600.
  static final amount =
      NitumeTypography.numeric(fontSize: 20, fontWeight: FontWeight.w600);

  /// Large amount (payment screen), 30/600.
  static final amountLarge =
      NitumeTypography.numeric(fontSize: 30, fontWeight: FontWeight.w600);

  /// Design-system `.t-num-sm`: 13/400 slate-600.
  static final numericSmall = NitumeTypography.numeric(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: NitumeColors.slate600,
  );

  /// Meta line (`.li-meta`, `.hist-row .s`), 11/400 slate-600. Whole meta
  /// lines that mix words and numbers use this.
  static final meta = NitumeTypography.numeric(
    fontSize: 11,
    fontWeight: FontWeight.w400,
    color: NitumeColors.slate600,
  );

  /// Larger meta (design-system `.li-meta`), 12/400 slate-600.
  static final metaLarge = NitumeTypography.numeric(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: NitumeColors.slate600,
  );
}

/// Registers the bundled font licences with Flutter's [LicenseRegistry] so
/// they appear on the licences page. Call once from `main()`.
abstract final class NitumeFonts {
  static bool _registered = false;

  static void registerLicenses() {
    if (_registered) return;
    _registered = true;
    LicenseRegistry.addLicense(() async* {
      yield LicenseEntryWithLineBreaks(
        const ['Fira Sans'],
        await rootBundle.loadString(
          'packages/nitume_core/fonts/OFL-FiraSans.txt',
        ),
      );
      yield LicenseEntryWithLineBreaks(
        const ['Fira Code'],
        await rootBundle.loadString(
          'packages/nitume_core/fonts/OFL-FiraCode.txt',
        ),
      );
    });
  }
}
