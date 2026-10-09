import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// Avatar sizes from the mockup.
enum InitialsAvatarSize {
  /// `.avatar-sm`: 36px, 13/700.
  small(36, 13),

  /// `.rate-avatar`: 60px, 20/700.
  medium(60, 20),

  /// `.profile-avatar-lg`: 70px, 24/700.
  large(70, 24);

  const InitialsAvatarSize(this.diameter, this.fontSize);

  final double diameter;
  final double fontSize;
}

/// C-12. Blue circle with white 700 initials, or a white person glyph when
/// there are no initials (no display name yet).
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({
    super.key,
    required this.initials,
    this.size = InitialsAvatarSize.small,
    this.onTap,
    this.semanticLabel,
  });

  /// Builds initials from a display name (`Brian K.` → `BK`). A `null` or
  /// blank [name] shows the person glyph.
  InitialsAvatar.fromName(
    String? name, {
    super.key,
    this.size = InitialsAvatarSize.small,
    this.onTap,
    this.semanticLabel,
  }) : initials = initialsFor(name ?? '');

  /// Up to two letters. Empty shows the person glyph.
  final String initials;
  final InitialsAvatarSize size;
  final VoidCallback? onTap;
  final String? semanticLabel;

  /// Up to two upper-case initials from the first two words of [name].
  static String initialsFor(String name) {
    final words = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .take(2);
    return words.map((w) => w.characters.first.toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    final circle = Container(
      width: size.diameter,
      height: size.diameter,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: NitumeColors.blue,
        shape: BoxShape.circle,
      ),
      child: initials.trim().isEmpty
          ? Icon(
              Icons.person_outline_rounded,
              key: const ValueKey('initials-avatar-glyph'),
              color: NitumeColors.white,
              size: size.diameter * 0.5,
            )
          : Text(
              initials,
              style: NitumeTextStyles.rowTitle.copyWith(
                fontSize: size.fontSize,
                fontWeight: FontWeight.w700,
                color: NitumeColors.white,
              ),
            ),
    );
    if (onTap == null) {
      return Semantics(
        label: semanticLabel,
        excludeSemantics: semanticLabel != null,
        child: circle,
      );
    }
    final hit = size.diameter < NitumeSpacing.minTapTarget
        ? NitumeSpacing.minTapTarget
        : size.diameter;
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: InkResponse(
        onTap: onTap,
        radius: hit / 2,
        child: SizedBox.square(dimension: hit, child: Center(child: circle)),
      ),
    );
  }
}
