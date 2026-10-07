import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Pushed screen frame (`_shared.md` §1, §5): slate canvas, C-10 header,
/// scrollable [body], optional fixed bottom CTA above the safe area.
class PushedScaffold extends StatelessWidget {
  const PushedScaffold({
    super.key,
    this.title,
    required this.body,
    this.cta,
    this.step,
    this.onBack,
    this.showBack = true,
  });

  final String? title;
  final Widget body;

  /// Fixed bottom CTA (usually a [FixedCta]).
  final Widget? cta;

  /// Wizard step (1–3) for the `Step n of 3` counter.
  final int? step;
  final VoidCallback? onBack;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: NitumeColors.slate,
      appBar: NitumePushedHeader(
        title: title,
        step: step,
        totalSteps: step == null ? null : 3,
        onBack: onBack,
        showBack: showBack,
      ),
      body: body,
      bottomNavigationBar: cta,
    );
  }
}

/// Fixed primary CTA (`.cta-fixed`): full width minus 40, margin
/// `auto 20 6`, above the bottom safe area and the keyboard.
class FixedCta extends StatelessWidget {
  const FixedCta({super.key, required this.child, this.above});

  final Widget child;

  /// Optional widget above the button (e.g. an expired-quote notice).
  final Widget? above;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (above != null) ...[above!, const SizedBox(height: 10)],
              child,
            ],
          ),
        ),
      ),
    );
  }
}

/// Initials avatar from a display name; the person glyph when there is no
/// name (`_shared.md` C-12). TODO(core-ui): move the glyph fallback into
/// `InitialsAvatar`.
class NameAvatar extends StatelessWidget {
  const NameAvatar({
    super.key,
    required this.name,
    this.size = InitialsAvatarSize.small,
    this.onTap,
    this.semanticLabel,
  });

  final String? name;
  final InitialsAvatarSize size;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final n = name?.trim() ?? '';
    if (n.isNotEmpty) {
      return InitialsAvatar.fromName(
        n,
        size: size,
        onTap: onTap,
        semanticLabel: semanticLabel,
      );
    }
    final glyph = Container(
      width: size.diameter,
      height: size.diameter,
      decoration: const BoxDecoration(
        color: NitumeColors.blue,
        shape: BoxShape.circle,
      ),
      child: Icon(
        Icons.person_outline_rounded,
        color: NitumeColors.white,
        size: size.diameter * 0.5,
      ),
    );
    if (onTap == null) {
      return Semantics(label: semanticLabel, child: glyph);
    }
    final hit = size.diameter < NitumeSpacing.minTapTarget
        ? NitumeSpacing.minTapTarget
        : size.diameter;
    return Semantics(
      button: true,
      label: semanticLabel,
      child: InkResponse(
        onTap: onTap,
        radius: hit / 2,
        child: SizedBox.square(
          dimension: hit,
          child: Center(child: glyph),
        ),
      ),
    );
  }
}

/// Loading / error / data switch over a [Future] (`_shared.md` C-33).
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({
    super.key,
    required this.future,
    required this.builder,
    required this.errorMessage,
    required this.onRetry,
    this.loading,
  });

  final Future<T>? future;
  final Widget Function(BuildContext context, T data) builder;
  final String errorMessage;
  final VoidCallback onRetry;

  /// Defaults to [SkeletonList].
  final Widget? loading;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return loading ?? const SkeletonList();
        }
        if (snap.hasError) {
          return NitumeErrorState(message: errorMessage, onRetry: onRetry);
        }
        return builder(context, snap.data as T);
      },
    );
  }
}

/// [count] skeleton cards, padding `0 20`, gap 10.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 3, this.height = 72});

  final int count;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: NitumeSpacing.screen),
      child: Column(
        children: [
          for (var i = 0; i < count; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            SkeletonCard(height: height),
          ],
        ],
      ),
    );
  }
}

/// A muted 13 slate-600 line (`Not paid yet.`, `No saved addresses yet.`).
class MutedLine extends StatelessWidget {
  const MutedLine(
    this.text, {
    super.key,
    this.padding = const EdgeInsets.fromLTRB(20, 0, 20, 14),
    this.textAlign,
  });

  final String text;
  final EdgeInsetsGeometry padding;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Text(text, style: NitumeTextStyles.muted, textAlign: textAlign),
    );
  }
}

/// Periodic refresh while the screen is visible (polling fallback until the
/// Socket.IO client is approved, row 29). Ticks are skipped while
/// [isVisible] returns false; nothing runs when polling is disabled.
class Poller {
  Poller({
    required this.interval,
    required this.onTick,
    required this.isVisible,
    bool enabled = true,
  }) {
    if (enabled) _timer = Timer.periodic(interval, (_) => _tick());
  }

  final Duration interval;
  final Future<void> Function() onTick;
  final bool Function() isVisible;
  Timer? _timer;
  bool _busy = false;

  Future<void> _tick() async {
    if (_busy || !isVisible()) return;
    _busy = true;
    try {
      await onTick();
    } on Object {
      // Keep the last good data; the next tick retries.
    } finally {
      _busy = false;
    }
  }

  void dispose() => _timer?.cancel();
}

/// Shows a snackbar through the nearest messenger.
void showSnack(BuildContext context, String message) {
  ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Card body text 13.5 blue (runner notes, report reason).
class BodyCard extends StatelessWidget {
  const BodyCard({super.key, required this.text, this.meta});

  final String text;
  final String? meta;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: NitumeCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(text, style: NitumeTextStyles.body),
            if (meta != null) ...[
              const SizedBox(height: 6),
              Text(meta!, style: NitumeTextStyles.meta),
            ],
          ],
        ),
      ),
    );
  }
}

/// Calls [onReturn] when a pushed screen above this one is popped, so lists
/// reload after an edit (root tabs, Addresses, Payment methods).
mixin ReloadOnReturn<T extends StatefulWidget> on State<T>
    implements RouteAware {
  RouteObserver<ModalRoute<void>>? _observer;

  /// The observer registered on the navigator (`AppServices.routeObserver`).
  RouteObserver<ModalRoute<void>> get routeObserver;

  void onReturn();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != null && _observer == null) {
      _observer = routeObserver..subscribe(this, route);
    }
  }

  @override
  void dispose() {
    _observer?.unsubscribe(this);
    super.dispose();
  }

  @override
  void didPopNext() => onReturn();

  @override
  void didPush() {}

  @override
  void didPop() {}

  @override
  void didPushNext() {}
}

/// True while [context]'s route is the top route (pause polling otherwise).
bool isRouteVisible(BuildContext context) =>
    ModalRoute.of(context)?.isCurrent ?? true;
