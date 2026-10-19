import 'package:nitume_core/nitume_core.dart';

/// Deadline chips on `v-new-details` (OA-19: `deadlineAt` authoritative,
/// urgency derived server-side, so the client never sends `urgency`).
enum DeadlineChoice {
  today('Today'),
  tomorrow('Tomorrow'),
  flexible('Flexible');

  const DeadlineChoice(this.label);
  final String label;

  /// Today / Tomorrow → 23:59 local that day (v-new-details Q2 default);
  /// Flexible → none.
  DateTime? deadlineFrom(DateTime now) => switch (this) {
    DeadlineChoice.today => DateTime(now.year, now.month, now.day, 23, 59),
    DeadlineChoice.tomorrow => DateTime(
      now.year,
      now.month,
      now.day + 1,
      23,
      59,
    ),
    DeadlineChoice.flexible => null,
  };

  /// `Today` is offered only until 23:59 local today (new-deadline sheet,
  /// row 237): after that it would be in the past.
  bool isAvailableAt(DateTime now) =>
      this != DeadlineChoice.today ||
      now.isBefore(DeadlineChoice.today.deadlineFrom(now)!);

  /// The chip a stored deadline reads as: `null` deadline → `Flexible`;
  /// 23:59 local today / tomorrow → `Today` / `Tomorrow`; anything else
  /// (e.g. a passed deadline) → no chip.
  static DeadlineChoice? matching(DateTime? deadlineAt, DateTime now) {
    if (deadlineAt == null) return DeadlineChoice.flexible;
    final local = deadlineAt.toLocal();
    for (final c in const [DeadlineChoice.today, DeadlineChoice.tomorrow]) {
      if (c.deadlineFrom(now) == local) return c;
    }
    return null;
  }
}

/// A chosen place with coordinates (the API requires `lat`/`lon`).
class DraftPlace {
  const DraftPlace({
    required this.addressText,
    required this.lat,
    required this.lng,
    this.placeId,
  });

  final String addressText;
  final double lat;
  final double lng;

  /// Google place id; `null` for saved addresses.
  final String? placeId;

  ErrandLocation toLocation(ErrandPointType type) => ErrandLocation(
    pointType: type,
    lat: lat,
    lng: lng,
    addressText: addressText,
    placeId: placeId,
  );
}

/// Client-side wizard state (steps 1–3). Nothing is posted until step 3.
class TaskDraft {
  TaskDraft({this.category});

  ErrandCategory? category;
  String title = '';
  String description = '';

  /// Task site (Check / Go There / Wait) or pickup / store (Get / Buy).
  DraftPlace? first;

  /// Drop-off (Get It For Me, Buy For Me).
  DraftPlace? dropoff;
  List<ShoppingListItem> items = const [ShoppingListItem()];
  DeadlineChoice deadline = DeadlineChoice.today;

  /// Whole shillings; `null` = empty.
  int? budget;

  /// Set once `POST /errands` created the DRAFT, so a retry only submits.
  String? createdErrandId;
  bool submitted = false;

  /// Row 233: the places the API refused (`location_outside_service_area`)
  /// and the point it checked. Cleared by choosing another place.
  ({DraftPlace? first, DraftPlace? dropoff, ErrandPointType? point})?
  outsideArea;

  /// True while the places the API refused are still the chosen ones:
  /// `Submit task →` stays disabled until a location changes.
  bool get locationRefused {
    final r = outsideArea;
    return r != null &&
        identical(r.first, first) &&
        identical(r.dropoff, dropoff);
  }

  /// True once step 2 holds anything worth a discard confirm.
  bool get hasData =>
      title.trim().isNotEmpty ||
      description.trim().isNotEmpty ||
      first != null ||
      dropoff != null ||
      items.any((i) => i.name.trim().isNotEmpty) ||
      (budget ?? 0) > 0;

  /// Pickup + drop-off categories (OA-19).
  bool get twoPoints =>
      category == ErrandCategory.getItForMe ||
      category == ErrandCategory.buyForMe;

  bool get isBuy => category == ErrandCategory.buyForMe;

  /// Changing the category keeps title and description and clears the
  /// category-specific fields (v-new-category).
  void changeCategory(ErrandCategory next) {
    if (next == category) return;
    final hadTwo = twoPoints;
    category = next;
    if (hadTwo != twoPoints) first = null;
    dropoff = null;
    items = const [ShoppingListItem()];
    // Keep an entered budget only when the new category shows the field.
    if (!hasBudget) budget = null;
  }

  /// Budget only for Buy For Me and Get It For Me (row 45).
  bool get hasBudget => twoPoints;

  List<ShoppingListItem> get namedItems => [
    for (final i in items)
      if (i.name.trim().isNotEmpty) i,
  ];

  /// `CreateErrandDto` body, title included (OA-15).
  CreateErrandRequest toRequest(DateTime now) {
    final locations = twoPoints
        ? [
            first!.toLocation(ErrandPointType.pickup),
            dropoff!.toLocation(ErrandPointType.dropoff),
          ]
        : [first!.toLocation(ErrandPointType.taskSite)];
    final t = title.trim();
    return CreateErrandRequest(
      category: category!,
      title: t.isEmpty ? null : t,
      description: description.trim(),
      budget: hasBudget ? budget ?? 0 : 0,
      locations: locations,
      deadlineAt: deadline.deadlineFrom(now),
      items: isBuy
          ? [
              for (final i in namedItems)
                ErrandItemInput(name: i.name.trim(), quantity: i.quantity),
            ]
          : const [],
    );
  }
}
