// Animation category: staggered choreography, physics simulations, custom
// implicit animations, hero flights, and scroll-driven effects.
//
// Every `code` field is a complete, standalone Dart file verified with
// `flutter analyze` (zero issues) on Flutter 3.38.5 / Dart 3.10.4.

import type { FlutterSample } from "./types.js";

export const animationSamples: readonly FlutterSample[] = [
  {
    id: "staggered-entrance-animation",
    title: "Staggered Entrance with One AnimationController",
    category: "animation",
    difficulty: "advanced",
    description:
      "Choreographs a header, banner, and list items entering with overlapping fade+slide, all driven by a single AnimationController sliced with Interval curves. Reach for this whenever multiple elements must animate as one sequence: one timeline means one dispose call, trivial replay/reverse, and a single place to honor reduced-motion (MediaQuery.disableAnimations jumps the controller to 1.0).",
    tags: ["staggered", "interval", "animationcontroller", "entrance", "curvedanimation", "reduced-motion", "accessibility", "fadetransition", "slidetransition", "ticker"],
    minFlutter: "3.24",
    packages: [],
    code: `// Staggered entrance animation: ONE AnimationController drives every element.
//
// The classic mistake is one controller per list item — that allocates a
// Ticker per item, makes the choreography impossible to reason about, and
// leaks tickers when items are removed mid-flight. A single controller with
// Interval curves keeps the whole sequence on one timeline: scrubbing,
// reversing, and disposal are all one call.
import 'package:flutter/material.dart';

class StaggeredEntrancePage extends StatefulWidget {
  const StaggeredEntrancePage({super.key});

  @override
  State<StaggeredEntrancePage> createState() => _StaggeredEntrancePageState();
}

// SingleTickerProviderStateMixin, not TickerProviderStateMixin: this State
// owns exactly one Ticker. The single variant asserts if a second ticker is
// requested, which catches the "accidentally created two controllers" bug at
// its source instead of as a mystery jank report.
class _StaggeredEntrancePageState extends State<StaggeredEntrancePage>
    with SingleTickerProviderStateMixin {
  static const int _itemCount = 5;

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  bool _startedOnce = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // MediaQuery is not available in initState, so the reduced-motion check
    // must live here. Run it once: didChangeDependencies re-fires on every
    // inherited-widget change and must not restart the entrance.
    if (_startedOnce) return;
    _startedOnce = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      // Accessibility: jump straight to the settled layout. Setting value
      // instead of duration keeps every derived Interval consistent.
      _controller.value = 1.0;
    } else {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    // Dispose before super.dispose(): the mixin's dispose asserts the ticker
    // is no longer active, so a still-running controller throws here.
    _controller.dispose();
    super.dispose();
  }

  // Each element gets a slice of the shared timeline. Intervals overlap
  // (each starts before the previous ends) — strictly sequential intervals
  // read as laggy, not choreographed.
  Animation<double> _slice(double start, double end, {Curve curve = Curves.easeOutCubic}) {
    return CurvedAnimation(
      parent: _controller,
      curve: Interval(start, end, curve: curve),
    );
  }

  @override
  Widget build(BuildContext context) {
    final Animation<double> header = _slice(0.0, 0.35);
    final Animation<double> banner = _slice(0.15, 0.55);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Staggered entrance'),
        actions: [
          IconButton(
            icon: const Icon(Icons.replay),
            onPressed: () => _controller.forward(from: 0),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _FadeSlide(
            animation: header,
            child: Text('Good morning', style: Theme.of(context).textTheme.headlineMedium),
          ),
          const SizedBox(height: 12),
          _FadeSlide(
            animation: banner,
            child: Container(
              height: 120,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(16),
              ),
              alignment: Alignment.center,
              child: const Text('Featured banner'),
            ),
          ),
          const SizedBox(height: 12),
          for (int i = 0; i < _itemCount; i++)
            _FadeSlide(
              // Stagger arithmetic: keep end <= 1.0 or Interval asserts.
              // Derive the step from the item count instead of hardcoding it
              // so adding items can never push an Interval past the timeline.
              animation: _slice(0.35 + i * (0.5 / _itemCount), 0.6 + i * (0.4 / _itemCount)),
              child: Card(
                child: ListTile(
                  leading: CircleAvatar(child: Text('\${i + 1}')),
                  title: Text('List item \${i + 1}'),
                  subtitle: const Text('Arrives on the shared timeline'),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// Fade + slide driven by one Animation<double>. FadeTransition/SlideTransition
// repaint without rebuilding the child subtree — an AnimatedBuilder that
// returns Opacity(...) here would rebuild the Card 60+ times a second.
class _FadeSlide extends StatelessWidget {
  const _FadeSlide({required this.animation, required this.child});

  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: animation,
      child: SlideTransition(
        // Small offsets only: 0.15 of the child's own height. Big slide
        // distances force large repaint regions and read as motion sickness
        // fuel on reduced-motion-adjacent users.
        position: Tween<Offset>(begin: const Offset(0, 0.15), end: Offset.zero)
            .animate(animation),
        child: child,
      ),
    );
  }
}

void main() {
  runApp(
    MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.teal),
      home: const StaggeredEntrancePage(),
    ),
  );
}`,
    notes:
      "MediaQuery cannot be read in initState — the reduced-motion check lives in didChangeDependencies behind a run-once flag, because didChangeDependencies re-fires on inherited-widget changes and would otherwise restart the entrance. Interval asserts end <= 1.0, so derive stagger steps from the item count instead of hardcoding. Dispose the controller BEFORE super.dispose(): the ticker mixin asserts no ticker is still active. Use SingleTickerProviderStateMixin (not TickerProviderStateMixin) when the State owns one controller — it asserts on accidental second tickers. Prefer FadeTransition/SlideTransition over AnimatedBuilder+Opacity: the transitions repaint without rebuilding the child subtree every frame.",
  },
  {
    id: "spring-physics-draggable-card",
    title: "Spring-Physics Draggable Card (Snap Back or Fling Away)",
    category: "animation",
    difficulty: "advanced",
    description:
      "A pan-draggable card that, on release, either springs back to its slot or flings off screen along the throw direction — decided by escape-velocity and displacement thresholds from DragEndDetails. Shows the canonical physics-animation pattern: AnimationController.unbounded running a SpringSimulation in abstract 0..1 units, with a Tween<Offset> mapping the scalar onto pixels. Reach for it for swipe-to-dismiss stacks, bottom-sheet snapping, or any release-with-momentum interaction.",
    tags: ["spring", "springsimulation", "physics", "draggable", "fling", "velocity", "animatewith", "gesture", "dismiss", "unbounded"],
    minFlutter: "3.24",
    packages: [],
    code: `// Spring-physics draggable card: drag it around, release, and it either
// springs home or flings off screen — decided by real release velocity.
//
// The core idea: an unbounded AnimationController runs a SpringSimulation in
// abstract 0..1 units, and a Tween<Offset> maps that scalar onto pixels.
// Feeding the controller raw pixel velocity is the classic bug — simulation
// velocity must be normalized by the travel distance or the spring explodes.
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';

class SpringCardPage extends StatefulWidget {
  const SpringCardPage({super.key});

  @override
  State<SpringCardPage> createState() => _SpringCardPageState();
}

class _SpringCardPageState extends State<SpringCardPage>
    with SingleTickerProviderStateMixin {
  // .unbounded is mandatory: springs overshoot their target, and a default
  // (0..1 clamped) controller silently flattens the overshoot into a hard
  // stop — the animation "works" but feels dead.
  late final AnimationController _controller = AnimationController.unbounded(vsync: this);

  // Card displacement from its resting slot, in pixels.
  Offset _offset = Offset.zero;
  Animation<Offset>? _flight;
  int _dismissals = 0;

  // Escape thresholds. Velocity is checked before displacement so a quick
  // flick from near the center still dismisses (matching Dismissible's feel).
  static const double _escapeVelocity = 1200; // px/s
  static const double _escapeDistance = 140; // px

  static final SpringDescription _snapBack = SpringDescription.withDampingRatio(
    mass: 1,
    stiffness: 500,
    ratio: 0.75, // underdamped: one visible overshoot reads as "springy"
  );
  static final SpringDescription _flingAway = SpringDescription.withDampingRatio(
    mass: 1,
    stiffness: 120,
    ratio: 1.1, // overdamped: no oscillation on the way off screen
  );

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      // The controller's scalar is meaningless by itself; the tween built at
      // release time maps it to pixels.
      setState(() => _offset = _flight!.value);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onPanStart(DragStartDetails details) {
    // Grabbing a card mid-flight must kill the simulation, or the listener
    // fights the user's finger for _offset.
    _controller.stop();
  }

  void _onPanUpdate(DragUpdateDetails details) {
    setState(() => _offset += details.delta);
  }

  void _onPanEnd(DragEndDetails details, Size screen) {
    final Offset pxVelocity = details.velocity.pixelsPerSecond;
    final bool escaped = pxVelocity.distance > _escapeVelocity ||
        _offset.distance > _escapeDistance;

    final Offset target;
    if (escaped) {
      // Exit along the throw direction; fall back to the drag direction for
      // a slow drag past the distance threshold (velocity ~ 0 has no
      // direction to project onto).
      final Offset dir =
          pxVelocity.distance > 1 ? pxVelocity / pxVelocity.distance : _offset / _offset.distance;
      target = _offset + dir * (screen.longestSide * 1.2);
    } else {
      target = Offset.zero;
    }

    _flight = _controller.drive(Tween<Offset>(begin: _offset, end: target));

    // Normalize: the simulation runs 0 -> 1 over \`travel\` pixels, so initial
    // simulation velocity = pixel velocity projected on the travel direction,
    // divided by travel. Sign matters: a throw *toward* home must enter the
    // snap-back spring as positive velocity.
    final double travel = (target - _offset).distance;
    final double unitVelocity = travel < 1
        ? 0
        : (pxVelocity.dx * (target.dx - _offset.dx) + pxVelocity.dy * (target.dy - _offset.dy)) /
            (travel * travel);

    final SpringDescription spring = escaped ? _flingAway : _snapBack;
    _controller
        .animateWith(SpringSimulation(spring, 0, 1, unitVelocity))
        .whenComplete(() {
      if (escaped && mounted) {
        // Recycle the card: snap home invisibly, then re-enter.
        setState(() {
          _dismissals++;
          _offset = Offset.zero;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final Size screen = MediaQuery.sizeOf(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Spring physics card')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Dismissed: $_dismissals'),
            const SizedBox(height: 24),
            Transform.translate(
              offset: _offset,
              child: GestureDetector(
                onPanStart: _onPanStart,
                onPanUpdate: _onPanUpdate,
                onPanEnd: (d) => _onPanEnd(d, screen),
                child: Card(
                  elevation: 8,
                  child: SizedBox(
                    width: 260,
                    height: 160,
                    child: Center(
                      child: Text(
                        'Drag me\\n(flick hard to dismiss)',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void main() {
  runApp(
    MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.deepOrange),
      home: const SpringCardPage(),
    ),
  );
}`,
    notes:
      "AnimationController.unbounded is mandatory: springs overshoot their target, and a default 0..1-clamped controller flattens the overshoot into a dead stop. Never feed raw pixel velocity into SpringSimulation — normalize it: project the pixel velocity onto the travel vector and divide by travel distance (v_sim = v_px·dir / travel), or the spring launches into orbit. Call controller.stop() in onPanStart so grabbing a card mid-flight doesn't leave the listener fighting the finger. Check velocity BEFORE displacement so a fast flick from the center still dismisses. Guard the zero-travel and zero-velocity division cases, and check mounted in whenComplete before setState.",
  },
  {
    id: "custom-implicit-animated-widget",
    title: "Custom ImplicitlyAnimatedWidget with a Custom Tween",
    category: "animation",
    difficulty: "expert",
    description:
      "Builds AnimatedDashedBorder — an AnimatedContainer-style widget for a property Flutter has no tween for: a dashed-border spec (color, stroke, dash/gap lengths, corner radius). Demonstrates the full recipe: an immutable spec class with value equality, a Tween subclass that lerps it, ImplicitlyAnimatedWidget + AnimatedWidgetBaseState with the forEachTween visitor, and a PathMetrics-based CustomPainter. Reach for this to give any design-system primitive a declarative, retargetable animation API.",
    tags: ["implicitlyanimatedwidget", "animatedwidgetbasestate", "foreachtween", "tween", "visitor", "custom-tween", "dashed-border", "pathmetrics", "custompainter", "implicit-animation"],
    minFlutter: "3.24",
    packages: [],
    code: `// Custom implicitly animated widget: an AnimatedContainer-style API for a
// property Flutter has no tween for — here, a dashed-border spec.
//
// The machinery: ImplicitlyAnimatedWidget owns the controller lifecycle;
// AnimatedWidgetBaseState diffs old vs new widget config in forEachTween and
// retargets tweens. You only supply (1) an immutable spec with value
// equality, (2) a Tween that can lerp it, (3) the visitor wiring.
import 'dart:ui' show PathMetric, lerpDouble;

import 'package:flutter/material.dart';

/// Immutable description of the border. Correct == / hashCode are not
/// optional: the base state compares specs with != to decide whether to
/// animate at all. With identity equality every rebuild restarts the
/// animation from scratch.
@immutable
class DashedBorderSpec {
  const DashedBorderSpec({
    required this.color,
    required this.strokeWidth,
    required this.dashLength,
    required this.gapLength,
    required this.cornerRadius,
  });

  final Color color;
  final double strokeWidth;
  final double dashLength;
  final double gapLength;
  final double cornerRadius;

  static DashedBorderSpec lerp(DashedBorderSpec a, DashedBorderSpec b, double t) {
    return DashedBorderSpec(
      color: Color.lerp(a.color, b.color, t)!,
      strokeWidth: lerpDouble(a.strokeWidth, b.strokeWidth, t)!,
      dashLength: lerpDouble(a.dashLength, b.dashLength, t)!,
      // Clamp: an unlucky curve overshoot (easeOutBack etc.) can drive the
      // gap negative, and PathMetrics loops forever on a zero-advance dash.
      gapLength: lerpDouble(a.gapLength, b.gapLength, t)!.clamp(0.5, double.infinity),
      cornerRadius: lerpDouble(a.cornerRadius, b.cornerRadius, t)!,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is DashedBorderSpec &&
        other.color == color &&
        other.strokeWidth == strokeWidth &&
        other.dashLength == dashLength &&
        other.gapLength == gapLength &&
        other.cornerRadius == cornerRadius;
  }

  @override
  int get hashCode => Object.hash(color, strokeWidth, dashLength, gapLength, cornerRadius);
}

class DashedBorderSpecTween extends Tween<DashedBorderSpec> {
  DashedBorderSpecTween({super.begin, super.end});

  @override
  DashedBorderSpec lerp(double t) => DashedBorderSpec.lerp(begin!, end!, t);
}

class AnimatedDashedBorder extends ImplicitlyAnimatedWidget {
  const AnimatedDashedBorder({
    super.key,
    required this.spec,
    required this.child,
    super.duration = const Duration(milliseconds: 450),
    super.curve = Curves.easeInOut,
  });

  final DashedBorderSpec spec;
  final Widget child;

  @override
  AnimatedWidgetBaseState<AnimatedDashedBorder> createState() =>
      _AnimatedDashedBorderState();
}

class _AnimatedDashedBorderState extends AnimatedWidgetBaseState<AnimatedDashedBorder> {
  DashedBorderSpecTween? _spec;

  @override
  void forEachTween(TweenVisitor<dynamic> visitor) {
    // Visitor contract: pass the CURRENT tween, the TARGET value, and a
    // constructor for a fresh tween. The framework retargets begin/end so an
    // in-flight animation redirects smoothly instead of jumping. Never build
    // the tween yourself here — that discards the in-flight begin value.
    _spec = visitor(
      _spec,
      widget.spec,
      (dynamic value) => DashedBorderSpecTween(begin: value as DashedBorderSpec),
    ) as DashedBorderSpecTween?;
  }

  @override
  Widget build(BuildContext context) {
    // \`animation\` is owned by the base state; evaluate lazily in build (the
    // base state already listens and rebuilds on each tick).
    final DashedBorderSpec spec = _spec!.evaluate(animation);
    return CustomPaint(
      painter: _DashedBorderPainter(spec),
      child: Padding(
        padding: EdgeInsets.all(spec.strokeWidth + 12),
        child: widget.child,
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter(this.spec);

  final DashedBorderSpec spec;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = spec.color
      ..style = PaintingStyle.stroke
      ..strokeWidth = spec.strokeWidth
      ..strokeCap = StrokeCap.round;

    // Inset by half the stroke so the dash centerline stays inside bounds —
    // otherwise the border clips against the RepaintBoundary edge.
    final RRect rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(spec.cornerRadius),
    ).deflate(spec.strokeWidth / 2);

    final Path source = Path()..addRRect(rrect);
    final Path dashed = Path();
    for (final PathMetric metric in source.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        dashed.addPath(
          metric.extractPath(distance, distance + spec.dashLength),
          Offset.zero,
        );
        distance += spec.dashLength + spec.gapLength;
      }
    }
    canvas.drawPath(dashed, paint);
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) => oldDelegate.spec != spec;
}

class ImplicitDashDemo extends StatefulWidget {
  const ImplicitDashDemo({super.key});

  @override
  State<ImplicitDashDemo> createState() => _ImplicitDashDemoState();
}

class _ImplicitDashDemoState extends State<ImplicitDashDemo> {
  bool _active = false;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final DashedBorderSpec spec = _active
        ? DashedBorderSpec(
            color: scheme.primary,
            strokeWidth: 4,
            dashLength: 18,
            gapLength: 4,
            cornerRadius: 28,
          )
        : DashedBorderSpec(
            color: scheme.outline,
            strokeWidth: 1.5,
            dashLength: 6,
            gapLength: 6,
            cornerRadius: 8,
          );

    return Scaffold(
      appBar: AppBar(title: const Text('Custom implicit animation')),
      body: Center(
        child: GestureDetector(
          onTap: () => setState(() => _active = !_active),
          // Declarative call site — exactly like AnimatedContainer. All the
          // controller bookkeeping lives inside the widget, not here.
          child: AnimatedDashedBorder(
            spec: spec,
            child: const SizedBox(
              width: 220,
              height: 120,
              child: Center(child: Text('Tap to retarget mid-flight')),
            ),
          ),
        ),
      ),
    );
  }
}

void main() {
  runApp(
    MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.indigo),
      home: const ImplicitDashDemo(),
    ),
  );
}`,
    notes:
      "The spec class MUST implement == and hashCode: the base state compares old and new values with != to decide whether to animate — with identity equality every rebuild restarts the animation from zero. Inside forEachTween, only call the visitor; never construct or mutate the tween yourself, because the framework retargets begin from the CURRENT animated value so an in-flight animation redirects smoothly. The visitor's `dynamic` signature makes the `as` casts unavoidable. Clamp lerped dash/gap values: curve overshoot (easeOutBack) can drive the gap negative and a zero-advance dash loop in PathMetrics never terminates. Deflate the RRect by half the stroke width or the border clips at the widget bounds.",
  },
  {
    id: "hero-flight-customization",
    title: "Hero Flight: Shuttle, Arc Rect Tween, and Placeholder",
    category: "animation",
    difficulty: "expert",
    description:
      "Customizes every extension point of a Hero flight: a flightShuttleBuilder that lerps TextStyle, avatar size, color, and elevation continuously during flight (instead of the default destination-widget pop-in), MaterialRectArcTween via createRectTween for spec-compliant curved motion, and placeholderBuilder to hold the source layout while the hero is airborne. Reach for this whenever the two hero endpoints differ in text scale or styling — the default shuttle makes that transition visibly jump.",
    tags: ["hero", "flightshuttlebuilder", "createrecttween", "materialrectarctween", "placeholderbuilder", "shared-element", "transition", "navigator", "textstyle-lerp"],
    minFlutter: "3.24",
    packages: [],
    code: `// Hero flight customization: flightShuttleBuilder, createRectTween, and
// placeholderBuilder working together.
//
// Default Hero behavior ships the *destination* widget on the flight and
// linearly tweens its rect. That breaks visibly when the two ends differ in
// text style: the big style pops in at frame one. The fix is a shuttle that
// lerps the style itself, plus an arc rect tween so the motion follows the
// Material spec instead of cutting straight across the screen.
import 'package:flutter/material.dart';

const String _tag = 'profile-hero';

class HeroSourcePage extends StatelessWidget {
  const HeroSourcePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Hero flight')),
      body: Align(
        alignment: Alignment.topLeft,
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Hero(
            tag: _tag,
            // MaterialRectArcTween moves the rect along a curved arc (radial
            // motion per the Material spec). The default linear RectTween
            // makes diagonal flights look like a PowerPoint slide.
            createRectTween: (begin, end) => MaterialRectArcTween(begin: begin, end: end),
            // Without a placeholder the source position collapses the moment
            // the flight starts and siblings reflow mid-transition. Reserving
            // the size keeps the departed page stable under the fading route.
            placeholderBuilder: (context, heroSize, child) =>
                SizedBox.fromSize(size: heroSize),
            flightShuttleBuilder: _buildFlightShuttle,
            child: const _ProfileChip(big: false),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        label: const Text('Open detail'),
        onPressed: () {
          Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const HeroDetailPage()),
          );
        },
      ),
    );
  }
}

class HeroDetailPage extends StatelessWidget {
  const HeroDetailPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Detail')),
      body: Center(
        child: Hero(
          tag: _tag,
          // Both ends must supply the same createRectTween/shuttle: on pop
          // the flight is negotiated again, and only the configuration on
          // the *destination* Hero of that flight wins if they disagree.
          createRectTween: (begin, end) => MaterialRectArcTween(begin: begin, end: end),
          placeholderBuilder: (context, heroSize, child) =>
              SizedBox.fromSize(size: heroSize),
          flightShuttleBuilder: _buildFlightShuttle,
          child: const _ProfileChip(big: true),
        ),
      ),
    );
  }
}

// One shuttle serves both directions. Contract worth memorizing: the
// animation runs 0 -> 1 on push and 1 -> 0 on pop, so "value 0 == small end,
// value 1 == big end" holds in both directions — lerp by value and pops come
// out right for free. Branching on flightDirection here is almost always a
// sign the math is about to be done twice.
Widget _buildFlightShuttle(
  BuildContext flightContext,
  Animation<double> animation,
  HeroFlightDirection flightDirection,
  BuildContext fromHeroContext,
  BuildContext toHeroContext,
) {
  final Animation<double> curved =
      CurvedAnimation(parent: animation, curve: Curves.easeInOut);
  return AnimatedBuilder(
    animation: curved,
    builder: (context, _) => _ProfileChip.lerped(curved.value),
  );
}

class _ProfileChip extends StatelessWidget {
  const _ProfileChip({required this.big}) : t = big ? 1.0 : 0.0;

  // The shuttle renders intermediate states, so the chip itself must be
  // parameterized by a continuous t — a bool-only widget can't fly.
  const _ProfileChip.lerped(this.t) : big = false;

  final bool big;
  final double t;

  @override
  Widget build(BuildContext context) {
    final double scale = big ? 1.0 : t;
    final double avatarRadius = 20 + 20 * scale;
    // Lerp the TextStyle rather than scaling a Text with Transform: glyph
    // hinting at the target size only happens if the style really changes.
    final TextStyle style = TextStyle.lerp(
      const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -0.5),
      scale,
    )!;

    // The shuttle lives in the overlay, above both routes, with NO Material
    // ancestor: bare Text up there renders double-underlined red. Material
    // here is load-bearing, not decoration.
    return Material(
      color: Color.lerp(
        Theme.of(context).colorScheme.surfaceContainerHighest,
        Theme.of(context).colorScheme.primaryContainer,
        scale,
      ),
      borderRadius: BorderRadius.circular(16 + 12 * scale),
      elevation: 6 * scale,
      child: Padding(
        padding: EdgeInsets.all(12 + 12 * scale),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(radius: avatarRadius, child: const Icon(Icons.person)),
            SizedBox(width: 8 + 8 * scale),
            // DefaultTextStyle keeps the flight text from inheriting the
            // overlay's (nonexistent) style mid-flight.
            DefaultTextStyle(
              style: style.copyWith(color: Theme.of(context).colorScheme.onSurface),
              child: const Text('Ada Lovelace'),
            ),
          ],
        ),
      ),
    );
  }
}

void main() {
  runApp(
    MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.purple),
      home: const HeroSourcePage(),
    ),
  );
}`,
    notes:
      "The shuttle animation runs 0->1 on push but 1->0 on pop, so 'value 0 = small end, value 1 = big end' holds in BOTH directions — lerp by animation.value and pops work for free; branching on flightDirection usually means doing the math twice. The shuttle is built into the navigator's overlay with NO Material ancestor: bare Text renders with the double-underline error style, so the shuttle must carry its own Material and DefaultTextStyle. Lerp the TextStyle itself rather than wrapping Text in Transform.scale — scaled glyphs blur because hinting happens at layout size. Configure createRectTween/shuttle on BOTH Hero ends: pop flights renegotiate, and the destination hero of each flight wins when configs disagree. The widget flown must be parameterized by a continuous t; a bool-configured widget cannot render intermediate frames.",
  },
  {
    id: "scroll-driven-animations",
    title: "Scroll-Driven Parallax and Collapsing Header (No Slivers)",
    category: "animation",
    difficulty: "advanced",
    description:
      "A collapsing header with parallax background, fading scrim, and migrating/scaling title, plus per-item parallax thumbnails — all computed from a single ScrollController with AnimatedBuilder, no SliverAppBar and no setState on scroll. Reach for this when SliverAppBar's fixed collapsing model doesn't fit (custom title choreography, effects outside the app bar, plain ListView pages) or when you need scroll-linked effects on individual list items.",
    tags: ["scroll", "parallax", "scrollcontroller", "collapsing-header", "animatedbuilder", "clamping", "itemextent", "overflowbox", "scroll-linked", "performance"],
    minFlutter: "3.27",
    packages: [],
    code: `// Scroll-driven animation without slivers: a collapsing parallax header and
// per-item parallax thumbnails, all derived from one ScrollController.
//
// A ScrollController is a Listenable that notifies on every scroll tick, so
// AnimatedBuilder can bind paint-only effects to it directly — no setState,
// no NotificationListener rebuild of the whole page. Everything below is
// pure math on controller.offset; the list itself never rebuilds on scroll.
import 'package:flutter/material.dart';

class ScrollDrivenPage extends StatefulWidget {
  const ScrollDrivenPage({super.key});

  @override
  State<ScrollDrivenPage> createState() => _ScrollDrivenPageState();
}

class _ScrollDrivenPageState extends State<ScrollDrivenPage> {
  static const double _headerMax = 240;
  static const double _headerMin = 88;
  static const double _itemExtent = 96;

  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  // 0.0 = fully expanded, 1.0 = fully collapsed. Two clamps are load-bearing:
  // offset can be NEGATIVE during iOS bounce and can exceed the collapse
  // range for the rest of the scroll. Feed unclamped values into opacity and
  // Flutter throws an assertion mid-flick.
  double get _collapseT {
    if (!_scroll.hasClients) return 0; // first frame: controller not attached
    return (_scroll.offset / (_headerMax - _headerMin)).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Stack(
        children: [
          ListView.builder(
            controller: _scroll,
            // The header floats in a Stack, so the list reserves its expanded
            // height with padding instead of an in-list header widget — that
            // keeps item scroll math independent of the header's animation.
            padding: EdgeInsets.only(top: _headerMax + 8, bottom: 24),
            // Fixed itemExtent makes each item's position a pure function of
            // its index — the parallax below needs that determinism (and it
            // lets the list skip layout of offscreen children).
            itemExtent: _itemExtent,
            itemCount: 30,
            itemBuilder: (context, index) => _ParallaxTile(
              index: index,
              scroll: _scroll,
              itemTop: _headerMax + 8 + index * _itemExtent,
            ),
          ),
          // Collapsing header. Only this AnimatedBuilder subtree rebuilds on
          // scroll ticks.
          AnimatedBuilder(
            animation: _scroll,
            builder: (context, _) {
              final double t = _collapseT;
              final double height = _headerMax - (_headerMax - _headerMin) * t;
              return SizedBox(
                height: height + MediaQuery.paddingOf(context).top,
                width: double.infinity,
                child: ClipRect(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // Parallax: background moves at half scroll speed. Use
                      // the raw (unclamped-at-top) offset so the bounce
                      // stretch still parallaxes naturally.
                      Transform.translate(
                        offset: Offset(
                            0, -(_scroll.hasClients ? _scroll.offset : 0) * 0.5),
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [scheme.primary, scheme.tertiary],
                            ),
                          ),
                        ),
                      ),
                      // Scrim fades in as the header collapses so the title
                      // keeps contrast against the parallax layer.
                      ColoredBox(
                        color: scheme.surface.withValues(alpha: 0.6 * t),
                      ),
                      SafeArea(
                        bottom: false,
                        child: Align(
                          // Title migrates bottom-left -> center-left while
                          // scaling down; lerping Alignment avoids manual
                          // pixel math against the shrinking height.
                          alignment: Alignment.lerp(
                            Alignment.bottomLeft,
                            Alignment.centerLeft,
                            t,
                          )!,
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Transform.scale(
                              scale: 1.0 - 0.35 * t,
                              alignment: Alignment.centerLeft,
                              child: Text(
                                'Expeditions',
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineLarge
                                    ?.copyWith(
                                      color: Color.lerp(scheme.onPrimary,
                                          scheme.onSurface, t),
                                      fontWeight: FontWeight.w700,
                                    ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ParallaxTile extends StatelessWidget {
  const _ParallaxTile({
    required this.index,
    required this.scroll,
    required this.itemTop,
  });

  final int index;
  final ScrollController scroll;
  final double itemTop; // content-space top, valid because itemExtent is fixed

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final double viewport = MediaQuery.sizeOf(context).height;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Card(
        clipBehavior: Clip.antiAlias,
        margin: EdgeInsets.zero,
        child: Row(
          children: [
            SizedBox(
              width: 120,
              height: double.infinity,
              child: AnimatedBuilder(
                animation: scroll,
                builder: (context, _) {
                  // Where is this tile in the viewport, 0 (top) .. 1 (bottom)?
                  // Clamp because items build slightly outside the viewport
                  // (cacheExtent) and Alignment past ±1 would show the edge
                  // of the "window" onto the oversized child.
                  final double offset = scroll.hasClients ? scroll.offset : 0;
                  final double t =
                      ((itemTop - offset) / viewport).clamp(0.0, 1.0);
                  // Alignment drives the parallax: the child is taller than
                  // the 84px window (via OverflowBox), and alignment slides
                  // which band of it is visible as the tile crosses the
                  // screen.
                  return OverflowBox(
                    maxHeight: 160,
                    alignment: Alignment(0, 2 * t - 1),
                    child: Container(
                      height: 160,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            scheme.primaryContainer,
                            scheme.tertiaryContainer,
                          ],
                        ),
                      ),
                      child: Icon(Icons.terrain,
                          size: 48, color: scheme.onPrimaryContainer),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text('Trail \${index + 1}',
                  style: Theme.of(context).textTheme.titleMedium),
            ),
          ],
        ),
      ),
    );
  }
}

void main() {
  runApp(
    MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.green),
      home: const ScrollDrivenPage(),
    ),
  );
}`,
    notes:
      "ScrollController is a Listenable — binding AnimatedBuilder to it repaints only the header/thumbnail subtrees per scroll tick; calling setState in a scroll listener rebuilds the whole page and is the number-one cause of scroll jank in this pattern. Clamp derived values: offset goes NEGATIVE during iOS overscroll bounce and exceeds the collapse range afterwards, and unclamped values assert inside opacity. Guard controller.offset with hasClients — the first build runs before attachment. Fixed itemExtent is what makes each item's position a pure function of its index, so per-item parallax needs no RenderObject queries; items also build in the cacheExtent outside the viewport, so clamp the per-item progress to 0..1. minFlutter 3.27 because of Color.withValues.",
  },
];
