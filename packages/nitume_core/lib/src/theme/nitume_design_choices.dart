import 'package:flutter/widgets.dart';

import 'nitume_colors.dart';
import 'status_tone.dart';

/// Every styling choice that is still an open owner question lives here, so a
/// decision flips one constant instead of N screens.
///
/// Defaults follow `docs/design/nitume_design_system.html` (the design system
/// wins on styling, AGENT_BUILD_INSTRUCTIONS §1). The mockup value is recorded
/// next to each. Question ids refer to `docs/audits/customer-gap-report.md`
/// ("Questions for the owner") and `docs/specs/customer/_shared.md` §8.
///
/// None of these are decided. Do not treat a default as owner-approved.
abstract final class NitumeDesignChoices {
  // ---------------------------------------------------------------- Q11 radius

  /// Q11 / Q-RADIUS. Design system `.btn`: pill (999). Mockup CTAs: 14,
  /// `.track-btn` / `.btn-sm`: 10.
  static const double buttonRadius = NitumeRadii.pill;

  /// Q11. Card / row radius. Design system `.card-demo`: `--r-m` 14. Mockup
  /// rows (`.hist-row`, `.menu-row`, `.addr-card`, `.pm-card`, `.hcard`): 12;
  /// `.active-card` / `.map-box`: 16.
  static const double cardRadius = NitumeRadii.medium;

  /// Q11. Small boxes inside rows (category icon box, notification icon box,
  /// OTP boxes, evidence thumbs). Mockup: 9 / 10. Nearest design-system
  /// radius: `--r-s` 8.
  static const double innerBoxRadius = NitumeRadii.small;

  // ----------------------------------------------------------------- Q12 field

  /// Q12 / Q-FIELD. Design system `.field-input`: white fill. Mockup `.field`:
  /// slate fill.
  static const Color fieldFill = NitumeColors.white;

  /// Q12. Design system: `--r-s` 8. Mockup: 10.
  static const double fieldRadius = NitumeRadii.small;

  // ------------------------------------------------------- Q13 red/amber usage

  /// Q13 / Q-ENROUTE. Tone for runner-progress states (assigned, en route,
  /// arrived, in progress). Design system shows "Assigned" as info; mockup
  /// draws "En route" amber.
  static const StatusTone runnerProgressTone = StatusTone.info;

  /// Q13 / Q-RED. Tone for CANCELLED. Design system reserves red for
  /// disputed / failed, so the default is info. Mockup: red chip.
  static const StatusTone cancelledTone = StatusTone.info;

  /// Q13 / Q20. Tone for EXPIRED (not drawn in the mockup). Spec: pending or
  /// info. Default info (nothing for the customer to act on).
  static const StatusTone expiredTone = StatusTone.info;

  /// Q13 / Q-RED. Text colour of destructive menu rows ("Log out", "Report a
  /// problem with this task"). Design system: red only for disputed/failed
  /// chips, so default blue. Mockup: red.
  static const Color destructiveText = NitumeColors.blue;

  /// Q13 / Q-RED. Unread dot on the notification bell. Design system: no
  /// red outside chips, so default blue. Mockup: red with a white ring.
  static const Color unreadDot = NitumeColors.blue;

  /// Q13 / Q-RED. Inline form error text and error border. Recommended by
  /// the spec as a documented extension; red is the design-system "failed"
  /// accent. Flip to [NitumeColors.blue] if the owner says no red outside
  /// chips.
  static const Color fieldError = NitumeColors.red;

  /// Q13. Price-increase difference on the price-change screen. Mockup: amber
  /// text. Default: a pending chip (amber is chip-only in the design system).
  static const StatusTone priceIncreaseTone = StatusTone.pending;

  // ------------------------------------------- Q14 off-palette mockup colours

  /// Q14. Tag on the blue active-task card. Mockup: `rgba(4,175,77,.2)` bg +
  /// `#5FE092` text (off-palette). Default: chip-info.
  static const StatusTone activeCardTagTone = StatusTone.info;

  /// Q14. Meta line on the blue active-task card. Mockup `#AEB9CC`
  /// (off-palette). Default slate-400 (≈5.2:1 on blue).
  static const Color activeCardMeta = NitumeColors.slate400;

  /// Q14. Floating elements over the map (ETA chip) use a slate-line hairline
  /// instead of the mockup's `rgba(0,0,0,…)` shadow, which is off-palette.
  static const bool overlayUsesHairline = true;

  // ------------------------------------------------------ accessibility (new)

  /// New owner question (raised by core-ui). The design-system chip pairs
  /// measure below WCAG AA 4.5:1 for 12px text: success 4.01, pending 2.95,
  /// danger 4.36 (info 13.1 passes). `false` = design system exactly.
  /// `true` = blue label text on the same tint (13.2–13.9:1), dot keeps the
  /// tone colour. Palette-only either way.
  static const bool chipHighContrastText = false;
}
