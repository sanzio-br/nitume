import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';

/// `v-rate`: 1–5 stars and an optional comment. Changes no errand state
/// (OA-7: COMPLETED is terminal for the customer). Skippable via back.
class RateScreen extends StatefulWidget {
  const RateScreen({super.key, required this.errandId});

  final String errandId;

  @override
  State<RateScreen> createState() => _RateScreenState();
}

class _RateScreenState extends State<RateScreen> {
  static const _maxComment = 1000;
  late final AppServices _services = context.services;
  final _comment = TextEditingController();
  late Future<Errand> _future;
  int _score = 0;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<Errand> _load() async {
    final results = await Future.wait<Object?>([
      _services.errands.get(widget.errandId),
      _services.ratings
          .get(widget.errandId)
          .then<Object?>((v) => v, onError: (_) => null),
    ]);
    if (results[1] != null) _alreadyRated();
    return results[0]! as Errand;
  }

  void _alreadyRated() {
    if (!mounted) return;
    showSnack(context, "You've already rated this task.");
    Nav.resetTo(context, ShellTab.home);
  }

  Future<void> _submit() async {
    setState(() => _sending = true);
    try {
      final comment = _comment.text.trim();
      await _services.ratings.rate(
        widget.errandId,
        score: _score,
        comment: comment.isEmpty ? null : comment,
      );
      if (!mounted) return;
      showSnack(context, 'Thanks for your rating.');
      Nav.resetTo(context, ShellTab.home);
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      if (e.statusCode == 409) {
        _alreadyRated();
      } else {
        showSnack(context, "Couldn't send your rating. Try again.");
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final remaining = _maxComment - _comment.text.length;
    return PushedScaffold(
      title: 'Rate this task',
      body: AsyncBody<Errand>(
        future: _future,
        errorMessage: "Couldn't load this task.",
        onRetry: () {
          final f = _load();
          setState(() {
            _future = f;
          });
        },
        builder: (context, errand) {
          final name = runnerShortName(errand.runner);
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
            children: [
              const SizedBox(height: 10),
              Center(
                child: InitialsAvatar.fromName(
                  errand.runner?.displayName,
                  size: InitialsAvatarSize.medium,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                name == null ? 'How was your runner?' : 'How was $name?',
                textAlign: TextAlign.center,
                style: NitumeTextStyles.cardTitle.copyWith(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                errandTitle(errand),
                textAlign: TextAlign.center,
                style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
              ),
              const SizedBox(height: 16),
              Center(
                child: StarRatingInput(
                  value: _score,
                  onChanged: _sending
                      ? null
                      : (v) => setState(() => _score = v),
                ),
              ),
              const SizedBox(height: 20),
              NitumeField.multiline(
                controller: _comment,
                hint: 'Add a comment (optional)',
                enabled: !_sending,
                onChanged: (_) =>
                    setState(() => clampText(_comment, _maxComment)),
              ),
              if (remaining <= 20)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      formatCounter(_comment.text.length, _maxComment),
                      style: NitumeTextStyles.meta,
                    ),
                  ),
                ),
            ],
          );
        },
      ),
      cta: FixedCta(
        child: NitumeButton.primary(
          label: 'Submit rating',
          expand: true,
          loading: _sending,
          onPressed: _score == 0 ? null : _submit,
        ),
      ),
    );
  }
}
