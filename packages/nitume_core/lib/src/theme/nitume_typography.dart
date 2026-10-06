import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'nitume_colors.dart';

/// Typography layer from `designs/nitume_design_system.html`:
///
/// * **Fira Sans** for all UI text, labels, descriptions, buttons.
/// * **Fira Code** exclusively for numeric data — timestamps, dates, prices,
///   counters, ratings, ETAs, coordinates.
///
/// This is a real theme layer (not per-widget inline styles): the UI text theme
/// is Fira Sans, and [numeric] must be used for every numeral shown to a user.
abstract final class NitumeTypography {
  static const _uiFamily = 'Fira Sans';
  static const _numFamily = 'Fira Code';

  /// Builds the app [TextTheme] on top of Fira Sans.
  static TextTheme textTheme(TextTheme base) {
    final sans = GoogleFonts.firaSansTextTheme(base);
    return sans.copyWith(
      displayLarge: sans.displayLarge?.copyWith(fontWeight: FontWeight.w700),
      displayMedium: sans.displayMedium?.copyWith(fontWeight: FontWeight.w700),
      displaySmall: sans.displaySmall?.copyWith(fontWeight: FontWeight.w700),
      headlineLarge: sans.headlineLarge?.copyWith(fontWeight: FontWeight.w700),
      headlineMedium: sans.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
      headlineSmall:
          sans.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
      titleLarge: sans.titleLarge?.copyWith(fontWeight: FontWeight.w600),
      titleMedium: sans.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      labelLarge: sans.labelLarge?.copyWith(fontWeight: FontWeight.w600),
    );
  }

  /// Numeric text style (Fira Code). Always use this for prices, ETAs, dates,
  /// counters, ratings and coordinates — never Fira Sans.
  static TextStyle numeric({
    double fontSize = 14,
    FontWeight fontWeight = FontWeight.w500,
    Color color = NitumeColors.blue,
    double? letterSpacing,
    double? height,
  }) {
    return GoogleFonts.firaCode(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
    );
  }

  static String get uiFamily => _uiFamily;
  static String get numericFamily => _numFamily;
}
