import 'package:flutter/material.dart';
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
  // Persistent auth state managed with local setValue
  bool _isSignedIn = false;

  @override
  void initState() {
    super.initState();
    // TODO: check for persisted session on launch
    // For now, start unauthenticated so OTP screen shows first
    setState(() => _isSignedIn = true);
  }

  // Signal sign-in from OTP screen
  void signIn() {
    setState(() => _isSignedIn = true);
  }

  // Signal sign-out
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
