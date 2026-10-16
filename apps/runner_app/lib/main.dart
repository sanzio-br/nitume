import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import 'src/app.dart';
import 'src/config/api_base_url.dart';
import 'src/services/app_services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  NitumeFonts.registerLicenses();
  final services = await AppServices.create(baseUrl: resolveApiBaseUrl());
  runApp(NitumeRunnerApp(services: services));
}
