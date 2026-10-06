import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:nitume_core/nitume_core.dart';

import 'screens/auth/otp_login_screen.dart';
import 'screens/home_shell.dart';

/// The root widget — shows OTP login on first run / session expiry,
/// and the authenticated shell once the user is signed in.
class NitumeCustomerApp extends StatefulWidget {
  const NitumeCustomerApp({super.key});

  @override
  State<NitumeCustomerApp> createState() => _NitumeCustomerAppState();
}

class _NitumeCustomerAppState extends State<NitumeCustomerApp> {
  bool _isSignedIn = false;

  @override
  void initState() {
    super.initState();
    // TODO: check for persisted session on launch
    _isSignedIn = false;
  }

  void signIn() {
    setState(() => _isSignedIn = true);
  }

  void signOut() {
    setState(() => _isSignedIn = false);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nitume',
      debugShowCheckedModeBanner: false,
      theme: NitumeTheme.light(),
      home: _isSignedIn ? HomeShell() : const OtpLoginScreen(),
    );
  }
}

/// Authentication state enum
enum AuthStatus {
  unauthenticated,
  authenticated,
}

/// Wire up auth repository and session state
String resolveApiBaseUrl() {
  const override = String.fromEnvironment('NITUME_API_BASE_URL');
  if (override.isNotEmpty) return override;
  final isAndroid = Platform.isAndroid;
  return isAndroid ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1';
}