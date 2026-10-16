import 'package:flutter/material.dart';

import '../../widgets/root_tab_placeholder.dart';

/// `v-earnings` root tab. Body pending its spec build
/// (`docs/specs/runner/v-earnings.md`).
class EarningsTab extends StatelessWidget {
  const EarningsTab({super.key});

  @override
  Widget build(BuildContext context) =>
      const RootTabPlaceholder(title: 'Earnings');
}
