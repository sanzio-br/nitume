import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';

/// Shared white bordered row surface for C-22 / C-23 / C-24 / C-29 / C-30.
class _RowSurface extends StatelessWidget {
  const _RowSurface({
    required this.child,
    required this.padding,
    this.onTap,
    this.semanticLabel,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    final surface = Material(
      color: NitumeColors.white,
      borderRadius: radius,
      child: InkWell(
        onTap: onTap,
        borderRadius: radius,
        child: DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            borderRadius: radius,
            border: Border.all(color: NitumeColors.slateLine),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: NitumeSpacing.minTapTarget,
            ),
            child: Padding(padding: padding, child: child),
          ),
        ),
      ),
    );
    if (onTap == null) return surface;
    return Semantics(button: true, label: semanticLabel, child: surface);
  }
}

/// C-22. Compact task row (`.hist-row`): title 13/600, Fira Code 11 meta,
/// trailing widget (usually a `StatusChip`).
class TaskRow extends StatelessWidget {
  const TaskRow({
    super.key,
    required this.title,
    this.meta,
    this.trailing,
    this.onTap,
  });

  final String title;
  final String? meta;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return _RowSurface(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: NitumeTextStyles.rowTitle.copyWith(fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (meta != null) Text(meta!, style: NitumeTextStyles.meta),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
        ],
      ),
    );
  }
}

/// C-23. History card (`.hcard`): title 13.5/600 + trailing chip, Fira Code
/// 11 meta, Fira Code 14/600 amount on its own line. Missing values render
/// as an em dash.
class TaskHistoryCard extends StatelessWidget {
  const TaskHistoryCard({
    super.key,
    required this.title,
    required this.status,
    this.meta,
    this.amount,
    this.onTap,
  });

  final String title;

  /// Usually `StatusChip.forStatus(errand.status)`.
  final Widget status;
  final String? meta;

  /// [num] or API decimal string; `null` → `—`.
  final Object? amount;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return _RowSurface(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: NitumeTextStyles.rowTitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 10),
              status,
            ],
          ),
          const SizedBox(height: 4),
          Text(meta ?? kMissingValue, style: NitumeTextStyles.meta),
          const SizedBox(height: 6),
          Text(
            formatKesOrDash(amount),
            style: NitumeTypography.numeric(
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// C-24. Menu row (`.menu-row`): 13.5/500 label, slate-400 chevron. The
/// destructive variant colours the label with
/// [NitumeDesignChoices.destructiveText] (Q13); the chevron stays slate-400.
class MenuRow extends StatelessWidget {
  const MenuRow({
    super.key,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final String label;
  final VoidCallback? onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    return _RowSurface(
      onTap: onTap,
      semanticLabel: label,
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: NitumeTextStyles.body.copyWith(
                fontWeight: FontWeight.w500,
                color: destructive
                    ? NitumeDesignChoices.destructiveText
                    : NitumeColors.blue,
              ),
            ),
          ),
          const Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: NitumeColors.slate400,
          ),
        ],
      ),
    );
  }
}

/// C-29. Saved address card (`.addr-card`): name 13.5/600, address 11.5
/// slate-600, optional trailing tag (pass a `StatusChip` with
/// `StatusChipSize.tag` for "Default") and actions.
class SavedAddressCard extends StatelessWidget {
  const SavedAddressCard({
    super.key,
    required this.label,
    required this.address,
    this.trailing,
    this.onTap,
  });

  final String label;
  final String address;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return _RowSurface(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: NitumeTextStyles.rowTitle),
                const SizedBox(height: 2),
                Text(address, style: NitumeTextStyles.mutedSmall),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
        ],
      ),
    );
  }
}

/// Brand badge colour for [PaymentMethodCard].
enum PaymentBadgeFill { green, blue }

/// C-30. Payment method card (`.pm-card`): 38×26 badge with white 10/700
/// Fira Sans text (brand word, not numeric), label 13.5/600, Fira Code 11
/// slate-600 masked detail, optional trailing tag.
class PaymentMethodCard extends StatelessWidget {
  const PaymentMethodCard({
    super.key,
    required this.badgeText,
    required this.badgeFill,
    required this.label,
    this.detail,
    this.trailing,
    this.onTap,
  });

  /// `M-PESA`, `VISA`, …
  final String badgeText;

  /// Mockup: green for M-Pesa, blue for cards.
  final PaymentBadgeFill badgeFill;
  final String label;
  final String? detail;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return _RowSurface(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: badgeFill == PaymentBadgeFill.green
                  ? NitumeColors.green
                  : NitumeColors.blue,
              borderRadius: BorderRadius.circular(5),
            ),
            child: FittedBox(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Text(
                  badgeText,
                  style: NitumeTextStyles.tag.copyWith(
                    color: NitumeColors.white,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: NitumeTextStyles.rowTitle),
                if (detail != null) Text(detail!, style: NitumeTextStyles.meta),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
        ],
      ),
    );
  }
}
