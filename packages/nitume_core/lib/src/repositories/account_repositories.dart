import '../api/nitume_api_client.dart';
import '../models/app_notification.dart';
import '../models/customer_profile.dart';
import '../models/json_utils.dart';
import '../models/runner.dart';

/// A page of the in-app feed plus the unread total (`GET /notifications`).
class NotificationsPage {
  const NotificationsPage({required this.items, required this.unread});

  final List<AppNotification> items;
  final int unread;
}

/// In-app notifications (`/notifications`).
class NotificationsRepository {
  NotificationsRepository(this._api);

  final NitumeApiClient _api;

  /// Newest first; the API caps [limit] at 100 (default 30).
  Future<NotificationsPage> list({int? limit}) async {
    final data = await _api.getMap(
      '/notifications',
      query: {'limit': ?limit},
    );
    return NotificationsPage(
      items: asJsonList(data['items']).map(AppNotification.fromJson).toList(),
      unread: (data['unread'] as num?)?.toInt() ?? 0,
    );
  }

  Future<int> unreadCount() async {
    final data = await _api.getMap('/notifications/unread-count');
    return (data['unread'] as num?)?.toInt() ?? 0;
  }

  Future<AppNotification> markRead(String id) =>
      _api.patchMap('/notifications/$id/read').then(AppNotification.fromJson);

  /// Returns the number of rows updated.
  Future<int> markAllRead() async {
    final data = await _api.patchMap('/notifications/read-all');
    return (data['updated'] as num?)?.toInt() ?? 0;
  }
}

/// The customer's profile, saved addresses and payment methods
/// (`/customers/me`).
///
/// There is no display name (A-15 / Q-NAME, owner decision).
class CustomerAccountRepository {
  CustomerAccountRepository(this._api);

  final NitumeApiClient _api;

  Future<CustomerProfile> profile() =>
      _api.getMap('/customers/me').then(CustomerProfile.fromJson);

  Future<CustomerProfile> updateDefaultAddressText(String? text) => _api
      .patchMap('/customers/me', data: {'defaultAddressText': text})
      .then(CustomerProfile.fromJson);

  // ---- addresses ----------------------------------------------------------

  Future<List<SavedAddress>> addresses() async => asJsonList(
        await _api.getList('/customers/me/addresses'),
      ).map(SavedAddress.fromJson).toList();

  Future<SavedAddress> addAddress({
    required String label,
    required String addressText,
    double? lat,
    double? lon,
    bool? isDefault,
  }) =>
      _api.postMap('/customers/me/addresses', data: {
        'label': label,
        'addressText': addressText,
        'lat': ?lat,
        'lon': ?lon,
        'isDefault': ?isDefault,
      }).then(SavedAddress.fromJson);

  Future<SavedAddress> updateAddress(
    String id, {
    String? label,
    String? addressText,
    double? lat,
    double? lon,
  }) =>
      _api.patchMap('/customers/me/addresses/$id', data: {
        'label': ?label,
        'addressText': ?addressText,
        'lat': ?lat,
        'lon': ?lon,
      }).then(SavedAddress.fromJson);

  Future<SavedAddress> setDefaultAddress(String id) => _api
      .postMap('/customers/me/addresses/$id/default')
      .then(SavedAddress.fromJson);

  Future<void> removeAddress(String id) async {
    await _api.delete('/customers/me/addresses/$id');
  }

  // ---- payment methods ----------------------------------------------------

  Future<List<PaymentMethod>> paymentMethods() async => asJsonList(
        await _api.getList('/customers/me/payment-methods'),
      ).map(PaymentMethod.fromJson).toList();

  /// [detail] must already be masked (`+254 712 ••• 678`). Card payments are
  /// an open scope question (Q10).
  Future<PaymentMethod> addPaymentMethod({
    required PaymentMethodType type,
    required String label,
    required String detail,
    String? phoneNumber,
    bool? isDefault,
  }) =>
      _api.postMap('/customers/me/payment-methods', data: {
        'type': type.wire,
        'label': label,
        'detail': detail,
        'phoneNumber': ?phoneNumber,
        'isDefault': ?isDefault,
      }).then(PaymentMethod.fromJson);

  Future<PaymentMethod> updatePaymentMethod(
    String id, {
    String? label,
    String? detail,
    bool? isDefault,
  }) =>
      _api.patchMap('/customers/me/payment-methods/$id', data: {
        'label': ?label,
        'detail': ?detail,
        'isDefault': ?isDefault,
      }).then(PaymentMethod.fromJson);

  Future<void> removePaymentMethod(String id) async {
    await _api.delete('/customers/me/payment-methods/$id');
  }
}

/// Public runner data (`GET /runners/:id/profile`, no auth).
class RunnersRepository {
  RunnersRepository(this._api);

  final NitumeApiClient _api;

  Future<RunnerPublicProfile> publicProfile(String runnerProfileId) => _api
      .getMap('/runners/$runnerProfileId/profile')
      .then(RunnerPublicProfile.fromJson);
}
