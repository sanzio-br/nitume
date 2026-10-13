import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  NitumeFonts.registerLicenses();
  runApp(const NitumeRunnerApp());
}

/// Root widget (scaffold only; screens follow).
class NitumeRunnerApp extends StatelessWidget {
  const NitumeRunnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nitume Runner',
      debugShowCheckedModeBanner: false,
      theme: NitumeTheme.light(),
      home: const Scaffold(
        backgroundColor: NitumeColors.slate,
        body: SafeArea(child: Center(child: NitumeWordmark())),
      ),
    );
  }
}
