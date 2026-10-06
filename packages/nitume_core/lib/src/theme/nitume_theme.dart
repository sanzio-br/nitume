import 'package:flutter/material.dart';

import 'nitume_colors.dart';
import 'nitume_typography.dart';

/// The single source of truth for the Nitume [ThemeData].
///
/// Colours are declared explicitly (no `ColorScheme.fromSeed`) so nothing drifts
/// from the design tokens in `nitume_design_system.html`.
abstract final class NitumeTheme {
  static ThemeData light() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: NitumeColors.blue,
      onPrimary: NitumeColors.white,
      primaryContainer: NitumeColors.blue050,
      onPrimaryContainer: NitumeColors.blue,
      secondary: NitumeColors.green,
      onSecondary: NitumeColors.white,
      secondaryContainer: NitumeColors.green050,
      onSecondaryContainer: NitumeColors.green700,
      error: NitumeColors.red,
      onError: NitumeColors.white,
      errorContainer: NitumeColors.red050,
      onErrorContainer: NitumeColors.red,
      surface: NitumeColors.white,
      onSurface: NitumeColors.blue,
      surfaceContainerHighest: NitumeColors.slate,
      onSurfaceVariant: NitumeColors.slate600,
      outline: NitumeColors.slateLine,
      outlineVariant: NitumeColors.slateLine,
      shadow: NitumeColors.blue,
      scrim: NitumeColors.blue700,
      inverseSurface: NitumeColors.blue700,
      onInverseSurface: NitumeColors.white,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: NitumeColors.slate,
      canvasColor: NitumeColors.white,
      fontFamily: NitumeTypography.uiFamily,
      splashFactory: InkRipple.splashFactory,
    );

    final textTheme = NitumeTypography.textTheme(base.textTheme);

    return base.copyWith(
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      dividerTheme: const DividerThemeData(
        color: NitumeColors.slateLine,
        thickness: 1,
        space: 1,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: NitumeColors.blue,
        foregroundColor: NitumeColors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          color: NitumeColors.white,
        ),
      ),
      cardTheme: CardThemeData(
        color: NitumeColors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NitumeRadii.medium),
          side: const BorderSide(color: NitumeColors.slateLine),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: NitumeColors.white,
        hintStyle: textTheme.bodyMedium?.copyWith(color: NitumeColors.slate400),
        labelStyle: textTheme.bodyMedium?.copyWith(color: NitumeColors.slate600),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: NitumeSpacing.md,
          vertical: NitumeSpacing.md,
        ),
        border: _inputBorder(NitumeColors.slateLine),
        enabledBorder: _inputBorder(NitumeColors.slateLine),
        focusedBorder: _inputBorder(NitumeColors.blue),
        errorBorder: _inputBorder(NitumeColors.red),
        focusedErrorBorder: _inputBorder(NitumeColors.red),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: NitumeColors.green,
          foregroundColor: NitumeColors.white,
          disabledBackgroundColor: NitumeColors.slateLine,
          disabledForegroundColor: NitumeColors.slate400,
          minimumSize: const Size.fromHeight(52),
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NitumeRadii.medium),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: NitumeColors.blue,
          minimumSize: const Size.fromHeight(52),
          textStyle: textTheme.labelLarge,
          side: const BorderSide(color: NitumeColors.slateLine),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NitumeRadii.medium),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: NitumeColors.blue,
          textStyle: textTheme.labelLarge,
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: NitumeColors.slate,
        side: const BorderSide(color: NitumeColors.slateLine),
        labelStyle: textTheme.labelMedium?.copyWith(color: NitumeColors.slate600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NitumeRadii.small),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: NitumeColors.white,
        indicatorColor: NitumeColors.blue050,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        labelTextStyle: WidgetStatePropertyAll(
          textTheme.labelSmall?.copyWith(color: NitumeColors.blue),
        ),
        iconTheme: const WidgetStatePropertyAll(
          IconThemeData(color: NitumeColors.blue),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: NitumeColors.white,
        selectedItemColor: NitumeColors.blue,
        unselectedItemColor: NitumeColors.slate400,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: NitumeColors.blue700,
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: NitumeColors.white,
        ),
        behavior: SnackBarBehavior.floating,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: NitumeColors.green,
      ),
    );
  }

  static OutlineInputBorder _inputBorder(Color color) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(NitumeRadii.medium),
      borderSide: BorderSide(color: color),
    );
  }
}
