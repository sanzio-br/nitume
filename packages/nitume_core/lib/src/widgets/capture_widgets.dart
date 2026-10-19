import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';
import 'nitume_card.dart';
import 'status_chip.dart';
import '../theme/status_tone.dart';

/// R-13. Capture drop zone (`.upload-box`): C-07 dashed card (2px
/// slate-line dashes, card radius, white), centred 36px outline [icon] in
/// blue, an optional [title] (13/600 blue, the side being captured:
/// `Front of your ID`) and a [caption] in 12.5 slate-600.
///
/// UI only: tapping calls [onPick]; the screen opens the camera (or a
/// picker sheet). [busy] disables it and shows a spinner while an upload
/// runs. [height]: 220 (ID), 260 (selfie), 240 (evidence).
///
/// Captured state (`v-onboard-selfie`): with an [image] the zone shows the
/// photo (card radius, cover) instead of the dashed card, with the R-15
/// upload state from [captureState] (spinner, green check) and a C-03
/// small `Retake` ([onRetake]) in the bottom-right corner. A failed upload
/// adds `Not uploaded` + `Retry` ([onRetry]) under the zone. Tapping the
/// photo does nothing.
class CaptureDropZone extends StatelessWidget {
  const CaptureDropZone({
    super.key,
    required this.caption,
    required this.onPick,
    this.icon = Icons.photo_camera_outlined,
    this.height = 220,
    this.busy = false,
    this.semanticLabel,
    this.title,
    this.image,
    this.captureState = CaptureState.uploaded,
    this.onRetake,
    this.retakeLabel = 'Retake',
    this.onRetry,
  });

  /// `Tap to take a photo`, `Tap to take a photo or upload`.
  final String caption;
  final VoidCallback? onPick;
  final IconData icon;
  final double height;
  final bool busy;

  /// Button label for screen readers (`Take a photo of your ID front`);
  /// defaults to [title] and [caption].
  final String? semanticLabel;

  /// Line above the caption (`Front of your ID`); `null` for none.
  final String? title;

  /// The captured photo; `null` shows the empty dashed zone.
  final ImageProvider? image;

  /// Upload state of [image] (default uploaded: green check);
  /// [CaptureState.empty] shows no badge.
  final CaptureState captureState;

  /// `Retake` on the captured photo; `null` hides it.
  final VoidCallback? onRetake;
  final String retakeLabel;

  /// `Retry` next to `Not uploaded` when [captureState] is failed.
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final img = image;
    if (img != null) return _captured(img);
    final enabled = onPick != null && !busy;
    final title = this.title;
    return SizedBox(
      height: height,
      child: Semantics(
        button: true,
        enabled: enabled,
        label: semanticLabel ?? [?title, caption].join(', '),
        excludeSemantics: true,
        child: NitumeCard(
          border: NitumeCardBorder.dashed,
          dashedBorderWidth: 2,
          padding: const EdgeInsets.all(16),
          onTap: enabled ? onPick : null,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (busy)
                  const SizedBox.square(
                    dimension: 36,
                    child: Padding(
                      padding: EdgeInsets.all(6),
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: NitumeColors.blue,
                      ),
                    ),
                  )
                else
                  Icon(icon, size: 36, color: NitumeColors.blue),
                const SizedBox(height: 10),
                if (title != null) ...[
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: NitumeTextStyles.rowTitle.copyWith(
                      fontSize: 13,
                      color: NitumeColors.blue,
                    ),
                  ),
                  const SizedBox(height: 4),
                ],
                Text(
                  caption,
                  textAlign: TextAlign.center,
                  style: NitumeTextStyles.mutedSmall.copyWith(fontSize: 12.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _captured(ImageProvider img) {
    final state = captureState;
    final uploading = state == CaptureState.uploading;
    final words = switch (state) {
      CaptureState.uploading => 'uploading',
      CaptureState.uploaded => 'uploaded',
      CaptureState.failed => 'not uploaded',
      CaptureState.empty => null,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: height,
          child: ClipRRect(
            key: const ValueKey('capture-drop-zone-photo'),
            borderRadius: BorderRadius.circular(NitumeDesignChoices.cardRadius),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Semantics(
                  image: true,
                  label: [?semanticLabel ?? title, 'photo', ?words].join(', '),
                  child: Image(image: img, fit: BoxFit.cover),
                ),
                if (uploading)
                  const Center(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: NitumeColors.white,
                        shape: BoxShape.circle,
                      ),
                      child: Padding(
                        padding: EdgeInsets.all(8),
                        child: SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: NitumeColors.blue,
                          ),
                        ),
                      ),
                    ),
                  ),
                if (state == CaptureState.uploaded)
                  const Positioned(
                    left: 10,
                    bottom: 10,
                    child: _UploadedBadge(),
                  ),
                if (onRetake != null)
                  Positioned(
                    right: 10,
                    bottom: 10,
                    child: NitumeButton.outline(
                      label: retakeLabel,
                      size: NitumeButtonSize.small,
                      onPressed: uploading ? null : onRetake,
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (state == CaptureState.failed)
          _ProblemRow(
            label: 'Not uploaded',
            actionLabel: 'Retry',
            onAction: onRetry,
          ),
      ],
    );
  }
}

/// Upload state of a [CaptureThumbnail].
enum CaptureState {
  /// Nothing captured yet: flat blue-050 tile with an outline icon.
  empty,

  /// Captured, upload running: spinner over the photo.
  uploading,

  /// Uploaded: green check badge (a complete state).
  uploaded,

  /// Upload failed: `Not uploaded` danger chip and `Retry` under the tile.
  failed,
}

/// A problem with one capture that the runner fixes by taking it again
/// (R-15, `v-onboard-id.md`). Shown under the tile as a C-05 small danger
/// chip with [CaptureThumbnail.onRetake]'s `Retake`.
enum CaptureIssue {
  /// The reviewer rejected this side (row 209): `Not approved`.
  notApproved('Not approved'),

  /// Above the upload limit, before upload or on a 413 (row 163):
  /// `Too large`.
  tooLarge('Too large');

  const CaptureIssue(this.label);

  /// Chip text (proposed copy, `v-onboard-id.md`).
  final String label;
}

/// R-15. Capture thumbnail (`.doc-thumb`) with its upload state.
///
/// [aspectRatio] 1.4 for ID documents, 1 for evidence; inner-box radius.
/// [image] is the local capture (e.g. `FileImage`), `null` while [state] is
/// [CaptureState.empty]. [label] (`Front`, `Back`) shows on the empty tile
/// in 11/600 slate-600 under [emptyIcon]. Optional [caption] (capture time,
/// `10:31 AM`) renders in Fira Code 11 under the tile.
///
/// [onRemove] adds a 48dp retake / remove icon button in the corner
/// ([removeLabel], default `Retake`). [onRetry] wires the `Retry` link on a
/// failed upload. [onTap] opens the viewer (or selects the side).
///
/// `v-onboard-id` extensions (all off by default):
/// - [selected]: the side the drop zone captures next, a 2px blue outline;
/// - [showLabelOnPhoto]: keeps [label] visible on a captured photo as a
///   bottom-left chip (11/600 white on
///   [NitumeDesignChoices.captureSideLabelFill]); the uploaded check moves
///   to the bottom-right;
/// - [issue]: `Not approved` / `Too large` C-05 small danger chip under the
///   tile, with a `Retake` link when [onRetake] is set. It replaces the
///   `Not uploaded` row.
class CaptureThumbnail extends StatelessWidget {
  const CaptureThumbnail({
    super.key,
    required this.state,
    this.image,
    this.label,
    this.emptyIcon = Icons.badge_outlined,
    this.aspectRatio = 1,
    this.caption,
    this.onTap,
    this.onRemove,
    this.removeLabel = 'Retake',
    this.onRetry,
    this.semanticLabel,
    this.selected = false,
    this.showLabelOnPhoto = false,
    this.issue,
    this.onRetake,
    this.retakeLabel = 'Retake',
  });

  final CaptureState state;
  final ImageProvider? image;
  final String? label;
  final IconData emptyIcon;
  final double aspectRatio;
  final String? caption;
  final VoidCallback? onTap;
  final VoidCallback? onRemove;
  final String removeLabel;
  final VoidCallback? onRetry;

  /// Spoken name (`ID front`, `Photo 2 of 3`); defaults to [label]. The
  /// state, `selected` and the [issue] are appended.
  final String? semanticLabel;

  /// 2px blue outline: the side the drop zone will capture next.
  final bool selected;

  /// Keep [label] on a captured photo (bottom-left chip).
  final bool showLabelOnPhoto;

  /// A problem fixed by retaking; `null` for none.
  final CaptureIssue? issue;

  /// `Retake` link next to the [issue] chip.
  final VoidCallback? onRetake;
  final String retakeLabel;

  static const _stateWords = {
    CaptureState.empty: 'not captured',
    CaptureState.uploading: 'uploading',
    CaptureState.uploaded: 'uploaded',
    CaptureState.failed: 'not uploaded',
  };

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.innerBoxRadius);
    final img = image;
    final captured = state != CaptureState.empty && img != null;
    final Widget body = !captured
        ? ColoredBox(
            color: NitumeColors.blue050,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(emptyIcon, size: 26, color: NitumeColors.blue),
                  if (label != null) ...[
                    const SizedBox(height: 4),
                    // Already in the tile's label; not read twice.
                    ExcludeSemantics(
                      child: Text(
                        label!,
                        style: NitumeTextStyles.chip.copyWith(
                          fontSize: 11,
                          color: NitumeColors.slate600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          )
        : Image(image: img, fit: BoxFit.cover);
    final labelChip = showLabelOnPhoto && captured && label != null;

    final tile = AspectRatio(
      aspectRatio: aspectRatio,
      child: DecoratedBox(
        key: selected ? const ValueKey('capture-selected-outline') : null,
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          borderRadius: radius,
          border: selected
              ? Border.all(color: NitumeColors.blue, width: 2)
              : null,
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Material(
                color: NitumeColors.blue050,
                child: InkWell(onTap: onTap, child: body),
              ),
              if (state == CaptureState.uploading)
                const Center(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: NitumeColors.white,
                      shape: BoxShape.circle,
                    ),
                    child: Padding(
                      padding: EdgeInsets.all(8),
                      child: SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: NitumeColors.blue,
                        ),
                      ),
                    ),
                  ),
                ),
              if (labelChip)
                Positioned(
                  left: 6,
                  bottom: 6,
                  child: ExcludeSemantics(child: _SideLabelChip(label!)),
                ),
              if (state == CaptureState.uploaded)
                Positioned(
                  left: labelChip ? null : 6,
                  right: labelChip ? 6 : null,
                  bottom: 6,
                  child: const _UploadedBadge(),
                ),
              if (onRemove != null && state != CaptureState.empty)
                Positioned(
                  top: 0,
                  right: 0,
                  child: IconButton(
                    onPressed: onRemove,
                    tooltip: removeLabel,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints.tightFor(
                      width: NitumeSpacing.minTapTarget,
                      height: NitumeSpacing.minTapTarget,
                    ),
                    icon: Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        color: NitumeColors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: NitumeColors.slateLine),
                      ),
                      child: const Icon(
                        Icons.refresh_rounded,
                        size: 16,
                        color: NitumeColors.blue,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );

    final name = semanticLabel ?? label;
    final issue = this.issue;
    final failed = state == CaptureState.failed && issue == null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          container: true,
          image: state != CaptureState.empty,
          selected: selected ? true : null,
          label: [
            ?name,
            _stateWords[state]!,
            if (selected) 'selected',
            if (issue != null) issue.label.toLowerCase(),
            ?caption,
          ].join(', '),
          child: tile,
        ),
        if (caption != null &&
            state != CaptureState.failed &&
            issue == null) ...[
          const SizedBox(height: 4),
          ExcludeSemantics(child: Text(caption!, style: NitumeTextStyles.meta)),
        ],
        if (issue != null)
          _ProblemRow(
            chipKey: ValueKey('capture-issue-${issue.name}'),
            label: issue.label,
            actionLabel: retakeLabel,
            onAction: onRetake,
          ),
        if (failed)
          _ProblemRow(
            label: 'Not uploaded',
            actionLabel: 'Retry',
            onAction: onRetry,
          ),
      ],
    );
  }
}

/// C-05 small danger chip with an optional link under a capture.
class _ProblemRow extends StatelessWidget {
  const _ProblemRow({
    this.chipKey,
    required this.label,
    required this.actionLabel,
    required this.onAction,
  });

  final Key? chipKey;
  final String label;
  final String actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 4,
        children: [
          StatusChip(
            key: chipKey,
            label: label,
            tone: StatusTone.danger,
            size: StatusChipSize.compact,
          ),
          if (onAction != null)
            NitumeButton.link(label: actionLabel, onPressed: onAction),
        ],
      ),
    );
  }
}

/// Green check badge of an uploaded capture (a complete state).
class _UploadedBadge extends StatelessWidget {
  const _UploadedBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('capture-uploaded-badge'),
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: NitumeColors.green,
        shape: BoxShape.circle,
        border: Border.all(color: NitumeColors.white, width: 2),
      ),
      child: const Icon(
        Icons.check_rounded,
        size: 12,
        color: NitumeColors.white,
      ),
    );
  }
}

/// Side label kept on a captured ID photo: 11/600 white on the
/// [NitumeDesignChoices.captureSideLabelFill] pill.
class _SideLabelChip extends StatelessWidget {
  const _SideLabelChip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: const ValueKey('capture-side-label'),
      decoration: BoxDecoration(
        color: NitumeDesignChoices.captureSideLabelFill,
        borderRadius: BorderRadius.circular(NitumeRadii.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        child: Text(
          label,
          style: NitumeTextStyles.chip.copyWith(
            fontSize: 11,
            color: NitumeColors.white,
          ),
        ),
      ),
    );
  }
}

/// R-15 row: thumbnails side by side in equal columns with a 10px gap
/// (`.doc-thumb-row`, ID front + back).
class CaptureThumbnailRow extends StatelessWidget {
  const CaptureThumbnailRow({super.key, required this.children});

  final List<CaptureThumbnail> children;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(child: children[i]),
        ],
      ],
    );
  }
}
