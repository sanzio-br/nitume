import 'enums.dart';

/// Public user shape returned by the API (`PublicUser` in `users.service.ts`).
class AppUser {
  const AppUser({
    required this.id,
    required this.phone,
    required this.role,
    required this.status,
    this.email,
    this.createdAt,
  });

  final String id;
  final String phone;
  final String? email;
  final UserRole role;
  final UserStatus status;
  final DateTime? createdAt;

  bool get isCustomer => role == UserRole.customer;
  bool get isActive => status == UserStatus.active;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as String,
      phone: json['phone'] as String,
      email: json['email'] as String?,
      role: UserRole.fromWire(json['role'] as String),
      status: UserStatus.fromWire(json['status'] as String),
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.tryParse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'phone': phone,
        'email': email,
        'role': role.wire,
        'status': status.wire,
        'createdAt': createdAt?.toIso8601String(),
      };
}
