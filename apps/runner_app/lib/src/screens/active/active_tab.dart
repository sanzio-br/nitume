import 'package:flutter/material.dart';

import '../../widgets/root_tab_placeholder.dart';

/// `v-active` root tab. Body pending its spec build
/// (`docs/specs/runner/v-active.md`).
class ActiveTab extends StatelessWidget {
  const ActiveTab({super.key});

  @override
  Widget build(BuildContext context) =>
      const RootTabPlaceholder(title: 'Active');
}
