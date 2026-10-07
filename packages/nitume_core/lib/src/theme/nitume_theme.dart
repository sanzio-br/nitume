import 'package:flutter/material.dart';

import 'nitume_colors.dart';
import 'nitume_design_choices.dart';
import 'nitume_typography.dart';

/// The single source of truth for the Nitume [ThemeData].
///
/// Colours are declared explicitly (no `ColorScheme.fromSeed`) so nothing
/// drifts from the design tokens in `nitume_design_system.html`. Open owner
/// questions (radius, field style, red/amber usage) are read from
/// [NitumeDesignChoices].
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
      error: NitumeDesignChoices.fieldError,
      onError: NitumeColors.white,
      errorContainer: NitumeColors.red050,
      onErrorContainer: NitumeColors.red,
      surface: NitumeColors.white,
      onSurface: NitumeColors.blue,
      surfaceContainerLowest: NitumeColors.white,
      surfaceContainerLow: NitumeColors.white,
      surfaceContainer: NitumeColors.white,
      surfaceContainerHigh: NitumeColors.white,
      surfaceContainerHighest: NitumeColors.slate,
      onSurfaceVariant: NitumeColors.slate600,
      outline: NitumeColors.slateLine,
      outlineVariant: NitumeColors.slateLine,
      shadow: NitumeColors.blue,
      scrim: NitumeColors.blue700,
      inverseSurface: NitumeColors.blue700,
      onInverseSurface: NitumeColors.white,
      surfaceTint: Colors.transparent,
    );

    final textTheme = NitumeTypography.textTheme();

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: NitumeColors.slate,
      canvasColor: NitumeColors.white,
      fontFamily: NitumeTypography.uiFamily,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      splashFactory: InkRipple.splashFactory,
    );

    return base.copyWith(
      dividerTheme: const DividerThemeData(
        color: NitumeColors.slateLine,
        thickness: 1,
        space: 1,
      ),
      // Every mockup top bar sits on slate with blue text.
      appBarTheme: AppBarTheme(
        backgroundColor: NitumeColors.slate,
        foregroundColor: NitumeColors.blue,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
      ),
      cardTheme: CardThemeData(
        color: NitumeColors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NitumeDesignChoices.cardRadius),
          side: const BorderSide(color: NitumeColors.slateLine),
        ),
      ),
      // Design-system `.field-input`: white, r-s 8, padding 11/14, 14.5 text,
      // focus = 2px green ring.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: NitumeDesignChoices.fieldFill,
        isDense: true,
        hintStyle: NitumeTextStyles.fieldInput.copyWith(
          color: NitumeColors.slate400,
        ),
        labelStyle: NitumeTextStyles.fieldLabel,
        floatingLabelBehavior: FloatingLabelBehavior.never,
        errorStyle: textTheme.bodySmall?.copyWith(
          color: NitumeDesignChoices.fieldError,
        ),
        prefixIconColor: NitumeColors.slate400,
        suffixIconColor: NitumeColors.slate400,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        border: _inputBorder(NitumeColors.slateLine),
        enabledBorder: _inputBorder(NitumeColors.slateLine),
        disabledBorder: _inputBorder(NitumeColors.slateLine),
        focusedBorder: _inputBorder(NitumeColors.green, width: 2),
        errorBorder: _inputBorder(NitumeDesignChoices.fieldError),
        focusedErrorBorder: _inputBorder(
          NitumeDesignChoices.fieldError,
          width: 2,
        ),
      ),
      textSelectionTheme: const TextSelectionThemeData(
        cursorColor: NitumeColors.blue,
        selectionColor: NitumeColors.blue050,
        selectionHandleColor: NitumeColors.blue,
      ),
      filledButtonTheme: FilledButtonThemeData(style: primaryButtonStyle()),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: primaryButtonStyle().copyWith(
          elevation: const WidgetStatePropertyAll(0),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(style: outlineButtonStyle()),
      textButtonTheme: TextButtonThemeData(style: textButtonStyle()),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: NitumeColors.slate,
        selectedColor: NitumeColors.blue,
        side: const BorderSide(color: NitumeColors.slateLine),
        labelStyle: NitumeTextStyles.chip,
        secondaryLabelStyle: NitumeTextStyles.chip.copyWith(
          color: NitumeColors.white,
        ),
        showCheckmark: false,
        shape: const StadiumBorder(),
      ),
      checkboxTheme: CheckboxThemeData(
        // Design-system `.check`: 22px, r 6, 2px slate-line; done = green fill.
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        side: const BorderSide(color: NitumeColors.slateLine, width: 2),
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected)
              ? NitumeColors.green
              : NitumeColors.white,
        ),
        checkColor: const WidgetStatePropertyAll(NitumeColors.white),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: const WidgetStatePropertyAll(NitumeColors.white),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected)
              ? NitumeColors.green
              : NitumeColors.slateLine,
        ),
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
      // C-13: white bar, all labels shown, active green-700, inactive
      // slate-400, no tinted indicator.
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: NitumeColors.white,
        surfaceTintColor: Colors.transparent,
        indicatorColor: Colors.transparent,
        elevation: 0,
        height: 64,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (s) => NitumeTextStyles.tabLabel.copyWith(
            color: s.contains(WidgetState.selected)
                ? NitumeColors.green700
                : NitumeColors.slate400,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (s) => IconThemeData(
            size: 21,
            color: s.contains(WidgetState.selected)
                ? NitumeColors.green700
                : NitumeColors.slate400,
          ),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: NitumeColors.white,
        selectedItemColor: NitumeColors.green700,
        unselectedItemColor: NitumeColors.slate400,
        selectedLabelStyle: NitumeTextStyles.tabLabel,
        unselectedLabelStyle: NitumeTextStyles.tabLabel,
        showUnselectedLabels: true,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: NitumeColors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NitumeRadii.large),
        ),
        titleTextStyle: textTheme.titleLarge,
        contentTextStyle: textTheme.bodyMedium,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: NitumeColors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(NitumeRadii.large),
          ),
        ),
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
        linearTrackColor: NitumeColors.slateLine,
      ),
      iconTheme: const IconThemeData(color: NitumeColors.blue),
    );
  }

  /// `.btn-primary`: green fill, white 14.5/600 text, pressed green-700.
  static ButtonStyle primaryButtonStyle() => _filled(
        fill: NitumeColors.green,
        pressed: NitumeColors.green700,
      );

  /// `.btn-secondary`: blue fill, white text, pressed blue-700.
  static ButtonStyle secondaryButtonStyle() => _filled(
        fill: NitumeColors.blue,
        pressed: NitumeColors.blue700,
      );

  /// `.btn-outline`: white, slate-line border (blue when pressed), blue text.
  static ButtonStyle outlineButtonStyle() => ButtonStyle(
        backgroundColor: const WidgetStatePropertyAll(NitumeColors.white),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.disabled)
              ? NitumeColors.slate400
              : NitumeColors.blue,
        ),
        overlayColor: const WidgetStatePropertyAll(NitumeColors.slate),
        side: WidgetStateProperty.resolveWith(
          (s) => BorderSide(
            color: s.contains(WidgetState.pressed) ||
                    s.contains(WidgetState.hovered)
                ? NitumeColors.blue
                : NitumeColors.slateLine,
          ),
        ),
        textStyle: WidgetStatePropertyAll(NitumeTextStyles.button),
        padding: const WidgetStatePropertyAll(_buttonPadding),
        minimumSize: const WidgetStatePropertyAll(_buttonMinSize),
        shape: const WidgetStatePropertyAll(_buttonShape),
        elevation: const WidgetStatePropertyAll(0),
      );

  /// `.btn-text`: no fill, blue text, padding 12/6.
  static ButtonStyle textButtonStyle({Color color = NitumeColors.blue}) =>
      ButtonStyle(
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.disabled) ? NitumeColors.slate400 : color,
        ),
        overlayColor: const WidgetStatePropertyAll(NitumeColors.slate),
        textStyle: WidgetStatePropertyAll(NitumeTextStyles.button),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 6, vertical: 12),
        ),
        minimumSize: const WidgetStatePropertyAll(
          Size(NitumeSpacing.minTapTarget, NitumeSpacing.minTapTarget),
        ),
        shape: const WidgetStatePropertyAll(_buttonShape),
      );

  static const _buttonPadding = EdgeInsets.symmetric(
    horizontal: 22,
    vertical: 12,
  );
  static const _buttonMinSize = Size(64, NitumeSpacing.minTapTarget);
  static const _buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(
      Radius.circular(NitumeDesignChoices.buttonRadius),
    ),
  );

  static ButtonStyle _filled({required Color fill, required Color pressed}) =>
      ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((s) {
          if (s.contains(WidgetState.disabled)) return NitumeColors.slateLine;
          if (s.contains(WidgetState.pressed) ||
              s.contains(WidgetState.hovered)) {
            return pressed;
          }
          return fill;
        }),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.disabled)
              ? NitumeColors.slate400
              : NitumeColors.white,
        ),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        textStyle: WidgetStatePropertyAll(NitumeTextStyles.button),
        padding: const WidgetStatePropertyAll(_buttonPadding),
        minimumSize: const WidgetStatePropertyAll(_buttonMinSize),
        shape: const WidgetStatePropertyAll(_buttonShape),
        elevation: const WidgetStatePropertyAll(0),
      );

  static OutlineInputBorder _inputBorder(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(NitumeDesignChoices.fieldRadius),
      borderSide: BorderSide(color: color, width: width),
    );
  }
}
