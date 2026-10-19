@Tags(['golden'])
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

/// Goldens are rendered with the bundled Fira fonts (flutter_test_config).
/// They are platform-sensitive; regenerate with
/// `flutter test --update-goldens --tags golden` on the CI platform.
void main() {
  testWidgets('status chips', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        const Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusChip(label: 'Completed', tone: StatusTone.success),
            StatusChip(label: 'Assigned', tone: StatusTone.info),
            StatusChip(label: 'Awaiting review', tone: StatusTone.pending),
            StatusChip(label: 'Disputed', tone: StatusTone.danger),
            StatusChip(
              label: 'Default',
              tone: StatusTone.info,
              size: StatusChipSize.tag,
            ),
          ],
        ),
      ),
      surfaceSize: const Size(420, 140),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/status_chips.png'),
    );
  });

  testWidgets('buttons', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            NitumeButton.primary(label: 'Add errand', onPressed: () {}),
            NitumeButton.secondary(label: 'View details', onPressed: () {}),
            NitumeButton.outline(label: 'Decline', onPressed: () {}),
            NitumeButton.text(label: 'Skip for now', onPressed: () {}),
            NitumeButton.primary(
              label: 'Track live →',
              onPressed: () {},
              size: NitumeButtonSize.small,
            ),
            NitumeButton.link(label: 'Resend code', onPressed: () {}),
            const NitumeButton.primary(label: 'Disabled', onPressed: null),
          ],
        ),
      ),
      surfaceSize: const Size(420, 220),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/buttons.png'),
    );
  });

  testWidgets('tab bar', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        NitumeTabBar(
          currentIndex: 2,
          onTap: (_) {},
          items: const [
            NitumeTabItem(icon: Icons.home_outlined, label: 'Home'),
            NitumeTabItem(icon: Icons.add_circle_outline, label: 'New task'),
            NitumeTabItem(icon: Icons.visibility_outlined, label: 'Track'),
            NitumeTabItem(icon: Icons.history, label: 'History'),
            NitumeTabItem(icon: Icons.person_outline, label: 'Profile'),
          ],
        ),
      ),
      surfaceSize: const Size(390, 110),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/tab_bar.png'),
    );
  });

  testWidgets('cards and rows', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ActiveTaskCard(
              tagLabel: 'Check It For Me',
              reference: '#10482',
              title: 'Apartment check — Nyali',
              meta: 'Brian K. is en route · ETA 12 min',
              actionLabel: 'Track live →',
              onAction: () {},
            ),
            const SizedBox(height: 10),
            TaskRow(
              title: 'Buy shoes — Sarit Centre',
              meta: 'Yesterday, 4:12 PM',
              trailing: StatusChip.forStatus(ErrandStatus.completed),
              onTap: () {},
            ),
            const SizedBox(height: 10),
            const ReceiptCard(
              rows: [
                ReceiptRow(label: 'Service fee', amount: '700.00'),
                ReceiptRow(label: 'Runner fee', amount: '1500.00'),
                ReceiptRow(
                  label: 'Total paid',
                  amount: '2200.00',
                  isTotal: true,
                ),
              ],
            ),
          ],
        ),
      ),
      surfaceSize: const Size(390, 440),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/cards_rows.png'),
    );
  });

  testWidgets('spec widgets', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            NitumeRadioRow(
              label: 'Pay merchant directly (recommended)',
              subtitle: "You'll see the merchant's Till or Paybill number.",
              selected: true,
              onSelected: () {},
            ),
            const SizedBox(height: 8),
            NitumeRadioRow(
              label: 'Send purchase amount to runner',
              subtitle: "You'll get instructions after paying the fees.",
              selected: false,
              onSelected: () {},
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                NitumeCheckbox(value: true, onChanged: (_) {}),
                NitumeCheckbox(
                  value: false,
                  label: 'Set as default',
                  onChanged: (_) {},
                ),
              ],
            ),
            const SizedBox(height: 10),
            const NitumeNotice(message: 'This quote has expired.'),
            const SizedBox(height: 10),
            const ReceiptCard(
              rows: [
                ReceiptRow(label: 'Service fee', amount: 700),
                ReceiptRow(label: 'Runner fee', amount: 1500),
                ReceiptRow(
                  label: 'Total (service + runner fee)',
                  amount: 2200,
                  isTotal: true,
                ),
              ],
              caption: ReceiptCaption('Valid until ', number: '4:30 PM'),
              separate: ReceiptSeparateGroup(
                rows: [ReceiptRow(label: 'Item amount', amount: 40000)],
                note: 'Paid to the merchant directly',
              ),
            ),
          ],
        ),
      ),
      surfaceSize: const Size(390, 560),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/spec_widgets.png'),
    );
  });

  testWidgets('numeric spans, glyph avatar, money prefix', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            NitumeButton.primary(
              label: 'Approve KSh 5,000 increase',
              richLabel: TextSpan(
                children: [
                  const TextSpan(text: 'Approve '),
                  NumSpan.kes(5000),
                  const TextSpan(text: ' increase'),
                ],
              ),
              onPressed: () {},
            ),
            NitumeButton.link(
              label: '+3 more in progress',
              richLabel: const TextSpan(
                children: [
                  TextSpan(text: '+'),
                  NumSpan('3'),
                  TextSpan(text: ' more in progress'),
                ],
              ),
              onPressed: () {},
            ),
            const SectionLabel(
              'Photos & video',
              numericSuffix: '(4)',
              padding: EdgeInsets.symmetric(vertical: 8),
            ),
            NitumeNotice(
              message: 'Pay the item amount: KSh 40,000',
              richMessage: TextSpan(
                children: [
                  const TextSpan(text: 'Pay the item amount: '),
                  NumSpan.kes(40000),
                ],
              ),
            ),
            const SizedBox(height: 10),
            const Row(
              children: [
                InitialsAvatar(initials: ''),
                SizedBox(width: 8),
                InitialsAvatar(initials: '', size: InitialsAvatarSize.medium),
                SizedBox(width: 8),
                InitialsAvatar(initials: 'BK', size: InitialsAvatarSize.medium),
              ],
            ),
            const SizedBox(height: 10),
            NitumeField.money(label: 'Budget', hint: '0'),
          ],
        ),
      ),
      surfaceSize: const Size(390, 440),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/numeric_spans.png'),
    );
  });

  testWidgets('runner widgets', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        SizedBox(
          width: 375,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AvailabilityCard(
                online: true,
                areas: 'Nyali · Bamburi',
                onChanged: (_) {},
              ),
              const SizedBox(height: 10),
              JobOfferCard(
                category: 'Check It For Me',
                payAmount: 1750,
                title: 'Check apartment — Nyali',
                meta: '1.2 km away · Photos required',
                onAccept: () {},
                onDecline: () {},
              ),
              const SizedBox(height: 10),
              NavigationChip(
                destination: 'Links Road, Nyali',
                detail: '1.2 km · 6 min',
                onNavigate: () {},
              ),
              const SizedBox(height: 10),
              ChecklistStepCard(
                title: 'Photos',
                subtitle: 'Required',
                done: false,
                actionLabel: 'Upload',
                onAction: () {},
              ),
              const SizedBox(height: 10),
              BalanceCard(
                amount: 8450,
                subLines: const ['KSh 2,450 pending confirmation'],
                onInfo: () {},
                actions: [
                  (label: 'Request payout', onPressed: () {}),
                  (label: 'Payout history', onPressed: () {}),
                ],
              ),
              const SizedBox(height: 10),
              const WeeklyBarChart(
                amounts: [0, 720, 1750, 500, 0, 0, 0],
                todayIndex: 2,
                total: 2970,
              ),
              const SizedBox(height: 10),
              const LedgerLineRow(
                title: 'Payout to M-Pesa',
                caption: 'Sent',
                captionNumeric: 'Mon, 10:03 AM',
                amount: -6000,
              ),
              const SizedBox(height: 10),
              const StatRow3(
                first: StatTile(value: '137', label: 'Errands'),
                second: StatTile(value: '4.9', label: 'Rating'),
                third: StatTile(value: '98.7%', label: 'Completion'),
              ),
              const SizedBox(height: 10),
              const Wrap(
                spacing: 8,
                children: [NitumeTag('Buy For Me'), NitumeTag('Nyali')],
              ),
              const SizedBox(height: 10),
              CaptureDropZone(
                caption: 'Tap to take a photo',
                height: 120,
                onPick: () {},
              ),
            ],
          ),
        ),
      ),
      surfaceSize: const Size(420, 1400),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/runner_widgets.png'),
    );
  });

  testWidgets('decline reason dialog', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        SizedBox(
          width: 375,
          child: DeclineReasonDialog(
            overPurchaseLimit: true,
            onDecline: (_) async {},
          ),
        ),
      ),
      surfaceSize: const Size(420, 640),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/decline_reason_dialog.png'),
    );
  });

  testWidgets('notice tones (C3)', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        SizedBox(
          width: 375,
          child: Column(
            children: [
              const NitumeNotice(message: 'Go online to accept this offer.'),
              const SizedBox(height: 10),
              NitumeNotice(
                message:
                    'This photo is larger than 10 MB. Take it again or choose '
                    'a smaller photo.',
                richMessage: TextSpan(
                  children: [
                    const TextSpan(text: 'This photo is larger than '),
                    const NumSpan('10 MB'),
                    const TextSpan(
                      text: '. Take it again or choose a smaller photo.',
                    ),
                  ],
                ),
                tone: NitumeNoticeTone.danger,
              ),
            ],
          ),
        ),
      ),
      surfaceSize: const Size(420, 220),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/notice_tones.png'),
    );
  });

  testWidgets('empty state with title (C4)', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(
        const SizedBox(
          width: 375,
          child: NitumeEmptyState(
            title: 'No offers right now',
            message:
                "We'll notify you when a job near you comes in. Keep the app "
                'online.',
          ),
        ),
      ),
      surfaceSize: const Size(420, 220),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/empty_state_title.png'),
    );
  });

  testWidgets('capture states (C1, C2)', (tester) async {
    final photo = MemoryImage(_png);
    await pumpThemed(
      tester,
      goldenFrame(
        SizedBox(
          width: 375,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CaptureThumbnailRow(
                children: [
                  CaptureThumbnail(
                    state: CaptureState.uploaded,
                    image: photo,
                    label: 'Front',
                    aspectRatio: 1.4,
                    showLabelOnPhoto: true,
                    onRemove: () {},
                  ),
                  CaptureThumbnail(
                    state: CaptureState.empty,
                    label: 'Back',
                    aspectRatio: 1.4,
                    selected: true,
                    issue: CaptureIssue.notApproved,
                    onRetake: () {},
                  ),
                ],
              ),
              const SizedBox(height: 10),
              CaptureThumbnailRow(
                children: [
                  CaptureThumbnail(
                    state: CaptureState.empty,
                    label: 'Front',
                    aspectRatio: 1.4,
                    issue: CaptureIssue.tooLarge,
                    onRetake: () {},
                  ),
                  const CaptureThumbnail(
                    state: CaptureState.empty,
                    label: 'Back',
                    aspectRatio: 1.4,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              CaptureDropZone(
                title: 'Back of your ID',
                caption: 'Tap to take a photo or upload',
                height: 160,
                onPick: () {},
              ),
              const SizedBox(height: 10),
              CaptureDropZone(
                caption: 'Center your face in the frame',
                height: 160,
                onPick: () {},
                image: photo,
                onRetake: () {},
              ),
            ],
          ),
        ),
      ),
      surfaceSize: const Size(420, 900),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/capture_states.png'),
    );
  });
}

// 1×1 transparent PNG (the captured photo stand-in).
final _png = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);
