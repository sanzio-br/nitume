@Tags(['golden'])
library;

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
                ReceiptRow(label: 'Total paid', amount: '2200.00', isTotal: true),
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
              richLabel: TextSpan(children: [
                const TextSpan(text: 'Approve '),
                NumSpan.kes(5000),
                const TextSpan(text: ' increase'),
              ]),
              onPressed: () {},
            ),
            NitumeButton.link(
              label: '+3 more in progress',
              richLabel: const TextSpan(children: [
                TextSpan(text: '+'),
                NumSpan('3'),
                TextSpan(text: ' more in progress'),
              ]),
              onPressed: () {},
            ),
            const SectionLabel(
              'Photos & video',
              numericSuffix: '(4)',
              padding: EdgeInsets.symmetric(vertical: 8),
            ),
            NitumeNotice(
              message: 'Pay the item amount: KSh 40,000',
              richMessage: TextSpan(children: [
                const TextSpan(text: 'Pay the item amount: '),
                NumSpan.kes(40000),
              ]),
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
}
