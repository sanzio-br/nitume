import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Track tab: map, runner info, timeline, actions.
class TrackTab extends StatelessWidget {
  const TrackTab({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          automaticallyImplyLeading: false,
          pinned: true,
          backgroundColor: NitumeColors.slate,
          surfaceTintColor: NitumeColors.slate,
          title: const Text(
            'Track task',
            style: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w700,
            ),
          ),
          actions: [
            IconButton(
              icon: Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: NitumeColors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: NitumeColors.slateLine),
                    ),
                    child: Icon(
                      Icons.notifications_none,
                      color: NitumeColors.blue,
                      size: 20,
                    ),
                  ),
                  Positioned(
                    right: 4,
                    top: 4,
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: NitumeColors.red,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: NitumeColors.white,
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              onPressed: () {
                // TODO: Navigate to notifications
              },
            ),
          ],
        ),
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Map box with ETA
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Container(
                  height: 220,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    backgroundBlendMode: BlendMode.overlay,
                    image: const DecorationImage(
                      image: AssetImage('assets/map_placeholder.png'),
                      fit: BoxFit.cover,
                      opacity: 0.1,
                    ),
                    color: const Color(0xFFEAEEF4),
                  ),
                  child: Stack(
                    children: [
                      // Grid pattern background
                      CustomPaint(
                        size: const Size(double.infinity, 220),
                        painter: _MapGridPainter(),
                      ),
                      // ETA chip
                      Positioned(
                        top: 14,
                        left: 14,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 7,
                          ),
                          decoration: BoxDecoration(
                            color: NitumeColors.white,
                            borderRadius: BorderRadius.circular(999),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.15),
                                blurRadius: 16,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: Text(
                            'ETA 12 min',
                            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                  fontFamily: 'FiraCode',
                                  fontWeight: FontWeight.w700,
                                  fontSize: 11.5,
                                ),
                          ),
                        ),
                      ),
                      // Route line (dashed)
                      Positioned(
                        left: 40,
                        top: 160,
                        child: Transform.rotate(
                          angle: -0.42, // ~-24 deg
                          child: Container(
                            width: 220,
                            height: 2,
                            child: CustomPaint(
                              painter: _DashedLinePainter(),
                            ),
                          ),
                        ),
                      ),
                      // Pins
                      Positioned(
                        left: 34,
                        top: 154,
                        child: Transform.rotate(
                          angle: -0.785, // -45 deg
                          child: Container(
                            width: 14,
                            height: 14,
                            decoration: BoxDecoration(
                              color: NitumeColors.blue,
                              borderRadius: const BorderRadius.only(
                                topLeft: Radius.circular(7),
                                topRight: Radius.circular(7),
                                bottomLeft: Radius.circular(7),
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 250,
                        top: 68,
                        child: Transform.rotate(
                          angle: -0.785,
                          child: Container(
                            width: 14,
                            height: 14,
                            decoration: BoxDecoration(
                              color: NitumeColors.green,
                              borderRadius: const BorderRadius.only(
                                topLeft: Radius.circular(7),
                                topRight: Radius.circular(7),
                                bottomLeft: Radius.circular(7),
                              ),
                            ),
                          ),
                        ),
                      ),
                      // Runner dot with animation
                      const Positioned(
                        left: 120,
                        top: 120,
                        child: _RunnerDot(),
                      ),
                    ],
                  ),
                ),
              ),
              // Runner info card
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                child: Container(
                  padding: const EdgeInsets.all(15),
                  decoration: BoxDecoration(
                    color: NitumeColors.white,
                    border: Border.all(color: NitumeColors.slateLine),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      const CircleAvatar(
                        radius: 20,
                        backgroundColor: NitumeColors.blue,
                        child: Text(
                          'BK',
                          style: TextStyle(
                            color: NitumeColors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Brian K.',
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13.5,
                                  ),
                            ),
                            Text(
                              'Verified · 4.9',
                              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                    color: NitumeColors.slate600,
                                    fontFamily: 'FiraCode',
                                    fontSize: 11,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: NitumeColors.amber050,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          'En route',
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                color: NitumeColors.amber,
                                fontWeight: FontWeight.w700,
                                fontSize: 10.5,
                              ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              // Track actions
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          // TODO: Navigate to price auth
                        },
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 11),
                          side: BorderSide(color: NitumeColors.slateLine),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          textStyle: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                        child: const Text('⚠️ Price change'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          // TODO: Navigate to evidence
                        },
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 11),
                          side: BorderSide(color: NitumeColors.slateLine),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          textStyle: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                        child: const Text('📋 Review evidence'),
                      ),
                    ),
                  ],
                ),
              ),
              // Timeline
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
                child: Text(
                  'Timeline',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                        letterSpacing: 0.05,
                        color: NitumeColors.slate600,
                      ),
              ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: const [
                    _TimelineItem(
                      title: 'Task accepted',
                      time: '10:03 AM',
                      completed: true,
                    ),
                    _TimelineItem(
                      title: 'Runner en route',
                      time: '10:12 AM',
                      completed: true,
                    ),
                    _TimelineItem(
                      title: 'Arrival at location',
                      time: 'Expected 10:28 AM',
                      completed: false,
                    ),
                    _TimelineItem(
                      title: 'Evidence upload',
                      time: 'Pending',
                      completed: false,
                      isLast: true,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 100),
            ],
          ),
        ),
      ],
    );
  }
}

class _MapGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF0B2545).withValues(alpha: 0.05)
      ..strokeWidth = 1;

    const spacing = 24.0;
    for (double x = 0; x < size.width; x += spacing) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += spacing) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _DashedLinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = NitumeColors.blue
      ..strokeWidth = 2;

    const dashWidth = 8.0;
    const dashSpace = 6.0;
    double x = 0;
    while (x < size.width) {
      canvas.drawLine(
        Offset(x, size.height / 2),
        Offset(x + dashWidth, size.height / 2),
        paint,
      );
      x += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RunnerDot extends StatefulWidget {
  const _RunnerDot();

  @override
  State<_RunnerDot> createState() => _RunnerDotState();
}

class _RunnerDotState extends State<_RunnerDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<Offset> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 3),
      vsync: this,
    )..repeat(reverse: true);

    _animation = Tween<Offset>(
      begin: Offset.zero,
      end: const Offset(10, -8),
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    ));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Transform.translate(
          offset: _animation.value,
          child: Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              color: NitumeColors.green,
              shape: BoxShape.circle,
              border: Border.all(color: NitumeColors.white, width: 3),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.2),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _TimelineItem extends StatelessWidget {
  final String title;
  final String time;
  final bool completed;
  final bool isLast;

  const _TimelineItem({
    required this.title,
    required this.time,
    required this.completed,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 22, bottom: isLast ? 0 : 18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Dot and line
          SizedBox(
            width: 22,
            child: Column(
              children: [
                Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    color: completed ? NitumeColors.green : NitumeColors.slate400,
                    shape: BoxShape.circle,
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1,
                      color: NitumeColors.slateLine,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontSize: 12.5,
                        fontWeight: completed ? FontWeight.w500 : FontWeight.w400,
                        color: completed ? NitumeColors.blue : NitumeColors.slate600,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  time,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: NitumeColors.slate600,
                        fontFamily: 'FiraCode',
                        fontSize: 11,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}