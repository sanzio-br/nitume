import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import 'auth_frame.dart';

/// `x-name-capture`: collect `displayName` once after the first sign-in
/// (OA-2). No back, no skip.
class NameCaptureScreen extends StatefulWidget {
  const NameCaptureScreen({super.key});

  @override
  State<NameCaptureScreen> createState() => _NameCaptureScreenState();
}

class _NameCaptureScreenState extends State<NameCaptureScreen> {
  final _controller = TextEditingController();
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    final name = _controller.text.trim();
    if (name.length < 2) {
      setState(() => _error = 'Enter your name.');
      return;
    }
    if (name.length > 60) {
      setState(() => _error = 'Keep it under 60 characters.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await context.services.session.saveDisplayName(name);
    } on Object {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = "Couldn't save your name. Try again.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: AuthFrame(
        children: [
          const Align(alignment: Alignment.centerLeft, child: NitumeWordmark()),
          const SizedBox(height: 30),
          const AuthHeading(
            title: 'What should we call you?',
            sub: Text('Your runner sees this name on your tasks.'),
          ),
          NitumeField(
            label: 'Your name',
            hint: 'e.g. Achieng Otieno',
            controller: _controller,
            readOnly: _saving,
            errorText: _error,
            autofillHints: const [AutofillHints.name],
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _save(),
            onChanged: (_) {
              if (_error != null) setState(() => _error = null);
            },
          ),
          const SizedBox(height: 16),
          NitumeButton.primary(
            label: 'Continue',
            expand: true,
            loading: _saving,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}
