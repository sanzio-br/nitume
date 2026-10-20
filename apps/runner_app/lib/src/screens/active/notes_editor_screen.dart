import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';

/// Notes editor copy (pushed screen, proposed, `v-active.md`).
abstract final class NotesCopy {
  static const title = 'Notes for the customer';
  static const hint = 'The customer reads this with your photos.';
  static const save = 'Save';
  static const discardTitle = 'Discard your changes?';
  static const discardBody = 'What you wrote will be lost.';
  static const discard = 'Discard';
  static const keepEditing = 'Keep editing';
}

/// `Notes for the customer` (C-10, C-17 multiline, `NitumeFixedCta`):
/// `PATCH /errands/:id/runner-notes`, at most 2000 characters, queued when
/// offline (R-21). Pops `true` once saved or queued.
class NotesEditorScreen extends StatefulWidget {
  const NotesEditorScreen({super.key, required this.errandId});

  static const maxLength = 2000;

  final String errandId;

  @override
  State<NotesEditorScreen> createState() => _NotesEditorScreenState();
}

class _NotesEditorScreenState extends State<NotesEditorScreen> {
  late final TextEditingController _text;
  late final String _initial;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final active = AppScope.read(context).active;
    final job = active.byId(widget.errandId);
    _initial = (job == null ? null : active.notesOf(job)) ?? '';
    _text = TextEditingController(text: _initial)
      ..addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  bool get _dirty => _text.text != _initial;

  Future<void> _save() async {
    final active = AppScope.read(context).active;
    final job = active.byId(widget.errandId);
    if (job == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final trimmed = _text.text.trim();
    final r = await active.saveNotes(job, trimmed.isEmpty ? null : trimmed);
    if (!mounted) return;
    if (r.ok) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _saving = false;
      _error = r.error;
    });
  }

  Future<void> _leave() async {
    if (!_dirty) {
      Navigator.of(context).pop();
      return;
    }
    final discard = await showNitumeConfirmDialog(
      context,
      title: NotesCopy.discardTitle,
      body: NotesCopy.discardBody,
      confirmLabel: NotesCopy.discard,
      cancelLabel: NotesCopy.keepEditing,
    );
    if (discard && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final error = _error;
    return PopScope(
      canPop: !_dirty || _saving,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: Scaffold(
        backgroundColor: NitumeColors.slate,
        appBar: NitumePushedHeader(title: NotesCopy.title, onBack: _leave),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          children: [
            if (error != null) ...[
              NitumeNotice(message: error, tone: NitumeNoticeTone.danger),
              const SizedBox(height: 12),
            ],
            NitumeField(
              controller: _text,
              minLines: 6,
              maxLines: 12,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              textCapitalization: TextCapitalization.sentences,
              inputFormatters: [
                LengthLimitingTextInputFormatter(NotesEditorScreen.maxLength),
              ],
            ),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                formatCounter(_text.text.length, NotesEditorScreen.maxLength),
                key: const ValueKey('notes-counter'),
                style: NitumeTextStyles.meta,
              ),
            ),
            const SizedBox(height: 4),
            Text(NotesCopy.hint, style: NitumeTextStyles.mutedSmall),
          ],
        ),
        bottomNavigationBar: NitumeFixedCta(
          child: NitumeButton.primary(
            label: NotesCopy.save,
            expand: true,
            loading: _saving,
            onPressed: _dirty ? _save : null,
          ),
        ),
      ),
    );
  }
}
