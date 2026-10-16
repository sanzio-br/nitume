import 'package:flutter/material.dart';

import '../../widgets/root_tab_placeholder.dart';

/// `v-jobs` root tab. Body pending its spec build
/// (`docs/specs/runner/v-jobs.md`).
class JobsTab extends StatelessWidget {
  const JobsTab({super.key});

  @override
  Widget build(BuildContext context) => const RootTabPlaceholder(title: 'Jobs');
}
