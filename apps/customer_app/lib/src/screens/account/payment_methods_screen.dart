import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import 'addresses_screen.dart' show DefaultTag;

/// `v-payment-methods`: M-Pesa numbers only (OA-10). Manage mode edits;
/// select mode (checkout "Change") returns the tapped method.
class PaymentMethodsScreen extends StatefulWidget {
  const PaymentMethodsScreen({
    super.key,
    this.selectMode = false,
    this.selectedId,
  });

  final bool selectMode;
  final String? selectedId;

  @override
  State<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends State<PaymentMethodsScreen> {
  late Future<List<PaymentMethod>> _future = context.services.account
      .paymentMethods();

  void _reload() {
    final f = context.services.account.paymentMethods();
    setState(() {
      _future = f;
    });
  }

  Future<void> _edit([PaymentMethod? method]) async {
    final message = await Nav.toPaymentMethodForm(context, method: method);
    if (!mounted) return;
    if (message != null) showSnack(context, message);
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final phone = AppScope.of(context).session.user?.phone;
    return PushedScaffold(
      title: 'Payment methods',
      body: AsyncBody<List<PaymentMethod>>(
        future: _future,
        loading: const SkeletonList(count: 2),
        errorMessage: "Couldn't load your payment methods.",
        onRetry: _reload,
        builder: (context, methods) => ListView(
          children: [
            if (methods.isEmpty)
              MutedLine(
                phone == null
                    ? 'No M-Pesa numbers saved.'
                    : "No M-Pesa numbers saved. We'll charge your sign-in "
                          'number, ${maskPhone(phone)}.',
              ),
            for (final m in methods)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: Semantics(
                  selected: widget.selectMode && m.id == widget.selectedId,
                  inMutuallyExclusiveGroup: widget.selectMode,
                  child: PaymentMethodCard(
                    label: m.label,
                    detail: m.detail,
                    trailing: _trailing(m),
                    onTap: widget.selectMode
                        ? () => Navigator.of(context).pop(m)
                        : () => _edit(m),
                  ),
                ),
              ),
            if (!widget.selectMode)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                child: NitumeButton.outline(
                  label: '+ Add payment method',
                  onPressed: () => _edit(),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget? _trailing(PaymentMethod m) {
    final tag = m.isDefault ? const DefaultTag() : null;
    if (!widget.selectMode) return tag;
    final selected = m.id == widget.selectedId;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ?tag,
        if (tag != null) const SizedBox(width: 8),
        IgnorePointer(
          child: NitumeCheckbox(
            value: selected,
            onChanged: null,
            semanticLabel: selected ? 'Selected' : 'Not selected',
          ),
        ),
      ],
    );
  }
}
