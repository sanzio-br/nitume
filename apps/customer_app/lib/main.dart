import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:nitume_core/nitume_core.dart';

import 'src/app.dart';
import 'src/config/api_base_url.dart';
import 'src/services/app_services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  NitumeFonts.registerLicenses();
  try {
    await dotenv.load(fileName: '.env');
  } on Object {
    // An empty or missing .env falls back to --dart-define / the default.
  }
  final services = AppServices.create(baseUrl: resolveApiBaseUrl());
  runApp(NitumeCustomerApp(services: services));
}
