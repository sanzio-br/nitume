import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../widgets/common.dart';

/// `v-addresses`: saved places used as shortcuts in the task wizard.
class AddressesScreen extends StatefulWidget {
  const AddressesScreen({super.key});

  @override
  State<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends State<AddressesScreen> {
  late Future<List<SavedAddress>> _future = context.services.account
      .addresses();

  void _reload() {
    final f = context.services.account.addresses();
    setState(() {
      _future = f;
    });
  }

  Future<void> _open([SavedAddress? address]) async {
    final message = await Nav.toAddressForm(context, address: address);
    if (!mounted) return;
    if (message != null) showSnack(context, message);
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    return PushedScaffold(
      title: 'Saved addresses',
      body: AsyncBody<List<SavedAddress>>(
        future: _future,
        errorMessage: "Couldn't load your addresses.",
        onRetry: _reload,
        builder: (context, list) => ListView(
          children: [
            if (list.isEmpty) const MutedLine('No saved addresses yet.'),
            for (final a in list)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: SavedAddressCard(
                  label: a.label,
                  address: a.addressText,
                  trailing: a.isDefault ? const DefaultTag() : null,
                  onTap: () => _open(a),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: NitumeButton.outline(
                label: '+ Add new address',
                onPressed: () => _open(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Default" tag (chip-info, small).
class DefaultTag extends StatelessWidget {
  const DefaultTag({super.key});

  @override
  Widget build(BuildContext context) => const StatusChip(
    label: 'Default',
    tone: StatusTone.info,
    size: StatusChipSize.tag,
  );
}
