import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

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

/// Full-screen evidence viewer: swipe between items, pinch-zoom photos.
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
  });

  final List<EvidenceThumbnail> items;
  final int initialIndex;
  final Widget Function(BuildContext context, EvidenceThumbnail item)?
      videoBuilder;

  /// Pushes the viewer as a full-screen route.
  static Future<void> show(
    BuildContext context, {
    required List<EvidenceThumbnail> items,
    int initialIndex = 0,
  }) {
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => EvidenceViewer(items: items, initialIndex: initialIndex),
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

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: NitumeColors.blue700,
      appBar: AppBar(
        backgroundColor: NitumeColors.blue700,
        foregroundColor: NitumeColors.white,
        title: Text(
          '${_index + 1}/${widget.items.length}',
          style: NitumeTypography.numeric(
            fontSize: 13,
            color: NitumeColors.white,
          ),
        ),
      ),
      body: PageView.builder(
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
          return InteractiveViewer(
            maxScale: 4,
            child: Center(
              child: Image.network(
                item.imageUrl!,
                fit: BoxFit.contain,
                semanticLabel: item.semanticLabel,
                errorBuilder: (context, error, stack) => const Icon(
                  Icons.broken_image_outlined,
                  color: NitumeColors.slate400,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
