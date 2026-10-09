import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';
import 'nitume_button.dart';

/// One thumbnail in an [EvidenceGrid].
@immutable
class EvidenceThumbnail {
  const EvidenceThumbnail({
    this.imageUrl,
    this.isVideo = false,
    this.semanticLabel,
  });

  /// `null` when the API has no viewable URL yet (Evidence.url is nullable):
  /// the tile shows the placeholder.
  final String? imageUrl;
  final bool isVideo;
  final String? semanticLabel;
}

/// C-25 tile (`.ev-thumb`): square, placeholder gradient blue-050 →
/// slate-line, image when [EvidenceThumbnail.imageUrl] loads, a broken-image
/// state with `Retry` when it fails.
class EvidenceTile extends StatefulWidget {
  const EvidenceTile({super.key, required this.item, this.onTap});

  final EvidenceThumbnail item;
  final VoidCallback? onTap;

  @override
  State<EvidenceTile> createState() => _EvidenceTileState();
}

class _EvidenceTileState extends State<EvidenceTile> {
  int _attempt = 0;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.innerBoxRadius);
    final url = widget.item.imageUrl;
    final Widget content = url == null
        ? const _Placeholder()
        : Image.network(
            url,
            key: ValueKey('$url#$_attempt'),
            fit: BoxFit.cover,
            loadingBuilder: (context, child, progress) =>
                progress == null ? child : const _Placeholder(),
            errorBuilder: (context, error, stack) => _Broken(
              onRetry: () => setState(() => _attempt++),
            ),
          );

    return Semantics(
      button: widget.onTap != null,
      image: true,
      label: widget.item.semanticLabel ??
          (widget.item.isVideo ? 'Video evidence' : 'Photo evidence'),
      child: AspectRatio(
        aspectRatio: 1,
        child: ClipRRect(
          borderRadius: radius,
          child: Material(
            color: NitumeColors.slate,
            child: InkWell(
              onTap: widget.onTap,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  content,
                  if (widget.item.isVideo)
                    const Center(
                      child: Icon(
                        Icons.play_circle_outline_rounded,
                        size: 28,
                        color: NitumeColors.blue,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      key: ValueKey('evidence-placeholder'),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [NitumeColors.blue050, NitumeColors.slateLine],
        ),
      ),
    );
  }
}

class _Broken extends StatelessWidget {
  const _Broken({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: NitumeColors.slate,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.broken_image_outlined,
            size: 20,
            color: NitumeColors.slate400,
          ),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              minimumSize: const Size(48, 32),
              textStyle: NitumeTextStyles.buttonSmall,
            ),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

/// C-25 grid (`.ev-grid`): 3 columns, gap 8, padding `0 20 14`.
class EvidenceGrid extends StatelessWidget {
  const EvidenceGrid({
    super.key,
    required this.items,
    this.onTap,
    this.padding = const EdgeInsets.fromLTRB(20, 0, 20, 14),
  });

  final List<EvidenceThumbnail> items;

  /// Called with the tapped index (open [EvidenceViewer]).
  final ValueChanged<int>? onTap;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: GridView.count(
        crossAxisCount: 3,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        children: [
          for (var i = 0; i < items.length; i++)
            EvidenceTile(
              item: items[i],
              onTap: onTap == null ? null : () => onTap!(i),
            ),
        ],
      ),
    );
  }
}

/// Full-screen evidence viewer (`x-evidence-viewer`): blue-700 background,
/// white foreground, swipe between items, pinch-zoom photos.
///
/// Top row: white close button (48dp hit) on the left, Fira Code 12.5 white
/// counter `2/4` on the right. [captionBuilder] fills the caption bar at the
/// bottom (e.g. `Photo · 10:41 AM`, built from `NumText`), above the safe
/// area. A photo that fails to load shows `Couldn't load this item.` and an
/// outline `Try again` button; [onLoadError] lets the screen re-fetch an
/// expired link.
///
/// Video playback needs a player package, which is not a dependency (owner
/// question); pass [videoBuilder] to supply one. Without it video items show
/// the placeholder with a play icon.
class EvidenceViewer extends StatefulWidget {
  const EvidenceViewer({
    super.key,
    required this.items,
    this.initialIndex = 0,
    this.videoBuilder,
    this.captionBuilder,
    this.onLoadError,
  });

  final List<EvidenceThumbnail> items;
  final int initialIndex;
  final Widget Function(BuildContext context, EvidenceThumbnail item)?
      videoBuilder;

  /// Caption bar content for the item at the given index; `null` hides the
  /// bar. Text on it must be white (or slate-line for the address line).
  final Widget? Function(BuildContext context, int index)? captionBuilder;

  /// Called with the index of a photo that failed to load.
  final ValueChanged<int>? onLoadError;

  /// Pushes the viewer as a full-screen route.
  static Future<void> show(
    BuildContext context, {
    required List<EvidenceThumbnail> items,
    int initialIndex = 0,
    Widget? Function(BuildContext context, int index)? captionBuilder,
    ValueChanged<int>? onLoadError,
  }) {
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => EvidenceViewer(
          items: items,
          initialIndex: initialIndex,
          captionBuilder: captionBuilder,
          onLoadError: onLoadError,
        ),
      ),
    );
  }

  @override
  State<EvidenceViewer> createState() => _EvidenceViewerState();
}

class _EvidenceViewerState extends State<EvidenceViewer> {
  late final PageController _controller =
      PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;
  final Map<int, int> _attempts = {};
  final Set<String> _reported = {};

  /// Reports a failed photo once per attempt, after the current frame.
  void _reportError(int index, int attempt) {
    final onLoadError = widget.onLoadError;
    if (onLoadError == null || !_reported.add('$index#$attempt')) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) onLoadError(index);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final caption = widget.captionBuilder?.call(context, _index);
    return Scaffold(
      backgroundColor: NitumeColors.blue700,
      appBar: AppBar(
        backgroundColor: NitumeColors.blue700,
        foregroundColor: NitumeColors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        automaticallyImplyLeading: false,
        leading: IconButton(
          tooltip: 'Close',
          constraints: const BoxConstraints(
            minWidth: NitumeSpacing.minTapTarget,
            minHeight: NitumeSpacing.minTapTarget,
          ),
          icon: const Icon(Icons.close_rounded, color: NitumeColors.white),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: NitumeSpacing.screen),
            child: Center(
              child: Semantics(
                label: 'Item ${_index + 1} of ${widget.items.length}',
                excludeSemantics: true,
                child: Text(
                  formatCounter(_index + 1, widget.items.length),
                  key: const ValueKey('evidence-viewer-counter'),
                  style: NitumeTypography.numeric(
                    fontSize: 12.5,
                    color: NitumeColors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: widget.items.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (context, i) {
                final item = widget.items[i];
                if (item.isVideo && widget.videoBuilder != null) {
                  return widget.videoBuilder!(context, item);
                }
                if (item.imageUrl == null || item.isVideo) {
                  return Center(
                    child: SizedBox.square(
                      dimension: 220,
                      child: EvidenceTile(item: item),
                    ),
                  );
                }
                final attempt = _attempts[i] ?? 0;
                return InteractiveViewer(
                  maxScale: 4,
                  child: Center(
                    child: Image.network(
                      item.imageUrl!,
                      key: ValueKey('${item.imageUrl}#$attempt'),
                      fit: BoxFit.contain,
                      semanticLabel: item.semanticLabel,
                      errorBuilder: (context, error, stack) {
                        _reportError(i, attempt);
                        return _ViewerLoadError(
                          onRetry: () =>
                              setState(() => _attempts[i] = attempt + 1),
                        );
                      },
                    ),
                  ),
                );
              },
            ),
          ),
          if (caption != null)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: NitumeSpacing.screen,
                  vertical: 14,
                ),
                child: Align(alignment: Alignment.centerLeft, child: caption),
              ),
            ),
        ],
      ),
    );
  }
}

class _ViewerLoadError extends StatelessWidget {
  const _ViewerLoadError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          "Couldn't load this item.",
          textAlign: TextAlign.center,
          style: NitumeTextStyles.body.copyWith(
            fontSize: 13,
            color: NitumeColors.white,
          ),
        ),
        const SizedBox(height: 12),
        NitumeButton.outline(label: 'Try again', onPressed: onRetry),
      ],
    );
  }
}
