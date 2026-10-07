import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import 'addresses_screen.dart' show DefaultTag;

/// `x-payment-method-form`: add or edit an M-Pesa number (OA-10). The API
/// cannot change a saved number, so edit mode shows it read-only.
class PaymentMethodFormScreen extends StatefulWidget {
  const PaymentMethodFormScreen({super.key, this.method});

  /// `null` = add mode.
  final PaymentMethod? method;

  @override
  State<PaymentMethodFormScreen> createState() =>
      _PaymentMethodFormScreenState();
}

class _PaymentMethodFormScreenState extends State<PaymentMethodFormScreen> {
  static const _maxName = 40;
  late final AppServices _services = context.services;
  final _phone = TextEditingController();
  late final _name = TextEditingController(text: _initialName);
  late bool _default = widget.method?.isDefault ?? false;
  String? _phoneError;
  bool _saving = false;

  bool get _edit => widget.method != null;
  bool get _wasDefault => widget.method?.isDefault ?? false;

  String get _initialName {
    final label = widget.method?.label;
    return label == null || label == PaymentMethodType.mpesa.label ? '' : label;
  }

  bool get _dirty =>
      _phone.text.isNotEmpty ||
      _name.text != _initialName ||
      _default != _wasDefault;

  @override
  void dispose() {
    _phone.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final label = name.isEmpty ? PaymentMethodType.mpesa.label : name;
    final account = _services.account;
    String? phone;
    if (!_edit) {
      try {
        phone = KenyanPhone.normalize(_phone.text);
      } on FormatException {
        setState(
          () => _phoneError =
              'Enter a valid Kenyan number, e.g. +254 712 345 678',
        );
        return;
      }
    }
    setState(() {
      _saving = true;
      _phoneError = null;
    });
    try {
      if (_edit) {
        await account.updatePaymentMethod(
          widget.method!.id,
          label: label,
          isDefault: _default && !_wasDefault ? true : null,
        );
      } else {
        await account.addPaymentMethod(
          label: label,
          detail: maskPhone(phone!),
          phoneNumber: phone,
          isDefault: _default,
        );
      }
      if (mounted) Navigator.of(context).pop('Saved.');
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        if (e.statusCode == 409) {
          _phoneError = 'This number is already saved.';
        }
      });
      if (e.statusCode != 409) showSnack(context, "Couldn't save. Try again.");
    }
  }

  Future<void> _remove() async {
    final ok = await showNitumeConfirmDialog(
      context,
      title: 'Remove this number?',
      body: 'You can add it again later.',
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
    );
    if (!ok || !mounted) return;
    setState(() => _saving = true);
    try {
      await _services.account.removePaymentMethod(widget.method!.id);
      if (mounted) Navigator.of(context).pop('Removed.');
    } on Object {
      if (!mounted) return;
      setState(() => _saving = false);
      showSnack(context, "Couldn't save. Try again.");
    }
  }

  Future<void> _back() async {
    if (!_dirty) {
      Navigator.of(context).pop();
      return;
    }
    final discard = await showNitumeConfirmDialog(
      context,
      title: 'Discard your changes?',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    );
    if (discard && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: PushedScaffold(
        title: _edit ? 'Edit M-Pesa number' : 'Add M-Pesa number',
        onBack: _back,
        body: ListView(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: NitumeCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_edit) ...[
                      Text('M-Pesa number', style: NitumeTextStyles.fieldLabel),
                      const SizedBox(height: 6),
                      NumText(
                        widget.method!.detail,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w400,
                        color: NitumeColors.slate600,
                      ),
                    ] else
                      NitumeField.phone(
                        label: 'M-Pesa number',
                        hint: '+254 7XX XXX XXX',
                        controller: _phone,
                        errorText: _phoneError,
                        onChanged: (_) => setState(() => _phoneError = null),
                        onSubmitted: (_) => _save(),
                      ),
                    const SizedBox(height: 12),
                    NitumeField(
                      label: 'Name on this number (optional)',
                      hint: 'e.g. My Safaricom line',
                      controller: _name,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _save(),
                      onChanged: (_) =>
                          setState(() => clampText(_name, _maxName)),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: _wasDefault
                  ? const Align(
                      alignment: Alignment.centerLeft,
                      child: DefaultTag(),
                    )
                  : NitumeCheckbox(
                      value: _default,
                      label: 'Use as my default',
                      onChanged: (v) => setState(() => _default = v),
                    ),
            ),
            if (_edit)
              Center(
                child: NitumeButton.text(
                  label: 'Remove this number',
                  destructive: true,
                  onPressed: _saving ? null : _remove,
                ),
              ),
          ],
        ),
        cta: FixedCta(
          child: NitumeButton.primary(
            label: 'Save',
            expand: true,
            loading: _saving,
            onPressed: _save,
          ),
        ),
      ),
    );
  }
}
