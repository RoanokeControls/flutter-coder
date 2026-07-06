// Verified advanced rendering samples: CustomPainter, custom RenderObjects
// (leaf, multi-child, sliver), and runtime fragment shaders.
// Every `code` field was verified on Flutter 3.38.5 / Dart 3.10.4:
// `flutter analyze` clean (zero errors/warnings/infos) and exercised by
// widget smoke tests (hit-testing, scroll geometry, shader load).

import type { FlutterSample } from "./types.js";

export const renderingSamples: readonly FlutterSample[] = [
  {
    id: "custom-painter-interactive-chart",
    title: "Interactive Line/Area Chart with CustomPainter",
    category: "rendering",
    difficulty: "advanced",
    description:
      "A tappable line/area chart drawn entirely with CustomPainter: tap-to-select hit-testing that shares the painter's projection math, axis and callout labels via TextPainter, a shouldRepaint that is cheap and correct, and RepaintBoundary isolation. Reach for this when a charting package is overkill or you need pixel-level control over how a data visualization draws and responds to touch.",
    tags: ["custompainter", "canvas", "chart", "textpainter", "gestures", "hit-testing", "shouldrepaint", "repaintboundary", "path", "gradient"],
    minFlutter: "3.27",
    packages: [],
    code: `// Interactive line/area chart on CustomPainter: tap hit-testing that shares
// the painter's projection math, TextPainter labels, a shouldRepaint that is
// cheap AND correct, and RepaintBoundary isolation.
import 'dart:math' as math;

import 'package:flutter/material.dart';

void main() => runApp(const ChartDemoApp());

class ChartDemoApp extends StatelessWidget {
  const ChartDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.indigo, brightness: Brightness.dark),
      home: Scaffold(
        appBar: AppBar(title: const Text('Tap a point to inspect it')),
        body: const Padding(
          padding: EdgeInsets.all(16),
          child: SizedBox(
            height: 280,
            child: InteractiveLineChart(
              values: [12.0, 18.5, 9.2, 22.4, 17.8, 28.1, 24.6, 31.3, 26.0, 35.2],
            ),
          ),
        ),
      ),
    );
  }
}

class InteractiveLineChart extends StatefulWidget {
  const InteractiveLineChart({super.key, required this.values});

  /// Immutable by contract: pass a NEW list instance to change the data.
  final List<double> values;

  @override
  State<InteractiveLineChart> createState() => _InteractiveLineChartState();
}

class _InteractiveLineChartState extends State<InteractiveLineChart> {
  int? _selected;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    // LayoutBuilder hands the tap handler the same Size the painter paints
    // at, so both sides construct an IDENTICAL projection: duplicated
    // transform math is how taps end up selecting the wrong point.
    return LayoutBuilder(builder: (context, constraints) {
      final Size size = Size(constraints.maxWidth, constraints.maxHeight);
      final _ChartProjection projection = _ChartProjection(size, widget.values);
      return GestureDetector(
        // Without opaque, taps over empty plot regions miss RenderCustomPaint.
        behavior: HitTestBehavior.opaque,
        onTapUp: (details) {
          final int? hit = projection.nearestIndex(details.localPosition);
          setState(() => _selected = hit == _selected ? null : hit);
        },
        // RepaintBoundary: selecting a point re-rasterizes only this painter,
        // and animated ancestors never force the chart to re-paint.
        child: RepaintBoundary(
          child: CustomPaint(
            size: size,
            painter: _LineChartPainter(
              values: widget.values,
              selected: _selected,
              lineColor: scheme.primary,
              gridColor: scheme.onSurface.withValues(alpha: 0.12),
              labelStyle: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
              calloutColor: scheme.inverseSurface,
              calloutTextColor: scheme.onInverseSurface,
            ),
          ),
        ),
      );
    });
  }
}

/// Shared data-space <-> pixel-space mapping: the single source of truth.
class _ChartProjection {
  factory _ChartProjection(Size size, List<double> values) {
    final double lo = values.reduce(math.min);
    final double hi = values.reduce(math.max);
    // Pad so the line never hugs the edge; max() guards a flat (zero) range.
    final double pad = math.max((hi - lo) * 0.08, 1e-3);
    return _ChartProjection._(size, values, lo - pad, hi + pad);
  }

  _ChartProjection._(this.size, this.values, this.minY, this.maxY);

  final Size size;
  final List<double> values;
  final double minY;
  final double maxY;

  // Gutters reserve room for the y-axis labels on the left.
  static const EdgeInsets _inset = EdgeInsets.fromLTRB(44, 16, 16, 20);

  Rect get plotRect => Rect.fromLTRB(_inset.left, _inset.top,
      size.width - _inset.right, size.height - _inset.bottom);

  Offset toPixel(int index) {
    final Rect rect = plotRect;
    final double fraction =
        values.length == 1 ? 0.5 : index / (values.length - 1);
    final double dy =
        rect.bottom - rect.height * (values[index] - minY) / (maxY - minY);
    return Offset(rect.left + rect.width * fraction, dy);
  }

  /// Nearest point within [maxDistance] logical pixels (else null).
  int? nearestIndex(Offset position, {double maxDistance = 32}) {
    int? best;
    double bestDistance = maxDistance;
    for (int i = 0; i < values.length; i++) {
      final double d = (toPixel(i) - position).distance;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  }
}

class _LineChartPainter extends CustomPainter {
  _LineChartPainter({
    required this.values,
    required this.selected,
    required this.lineColor,
    required this.gridColor,
    required this.labelStyle,
    required this.calloutColor,
    required this.calloutTextColor,
  });

  final List<double> values;
  final int? selected;
  final Color lineColor;
  final Color gridColor;
  final TextStyle labelStyle;
  final Color calloutColor;
  final Color calloutTextColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final _ChartProjection projection = _ChartProjection(size, values);
    final Rect plot = projection.plotRect;

    _paintGridAndLabels(canvas, projection);
    final Path line = Path()
      ..moveTo(projection.toPixel(0).dx, projection.toPixel(0).dy);
    for (int i = 1; i < values.length; i++) {
      final Offset p = projection.toPixel(i);
      line.lineTo(p.dx, p.dy);
    }
    // Area fill: clone the line path and close it along the plot floor.
    final Path area = Path.from(line)
      ..lineTo(projection.toPixel(values.length - 1).dx, plot.bottom)
      ..lineTo(projection.toPixel(0).dx, plot.bottom)
      ..close();
    final Paint areaPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: <Color>[
          lineColor.withValues(alpha: 0.28),
          lineColor.withValues(alpha: 0.0),
        ],
      ).createShader(plot);
    canvas.drawPath(area, areaPaint);
    final Paint stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = lineColor;
    canvas.drawPath(line, stroke);

    final int? i = selected;
    if (i != null && i >= 0 && i < values.length) {
      _paintSelection(canvas, projection, i);
    }
  }

  void _paintGridAndLabels(Canvas canvas, _ChartProjection projection) {
    final Rect plot = projection.plotRect;
    final Paint grid = Paint()
      ..color = gridColor
      ..strokeWidth = 1;
    for (int i = 0; i <= 4; i++) {
      final double y = plot.bottom - plot.height * i / 4;
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), grid);
      final double value =
          projection.minY + (projection.maxY - projection.minY) * i / 4;
      final TextPainter tp = TextPainter(
        text: TextSpan(text: value.toStringAsFixed(0), style: labelStyle),
        textDirection: TextDirection.ltr, // required or layout() asserts
      )..layout();
      tp.paint(canvas, Offset(plot.left - tp.width - 8, y - tp.height / 2));
      tp.dispose(); // TextPainter owns native objects; leak_tracker flags this
    }
  }

  void _paintSelection(Canvas canvas, _ChartProjection projection, int i) {
    final Offset point = projection.toPixel(i);
    final Rect plot = projection.plotRect;
    canvas.drawLine(Offset(point.dx, plot.top), Offset(point.dx, plot.bottom),
        Paint()..color = gridColor);
    canvas.drawCircle(point, 5, Paint()..color = lineColor);
    final TextPainter tp = TextPainter(
      text: TextSpan(
        text: values[i].toStringAsFixed(1),
        style: labelStyle.copyWith(
            color: calloutTextColor, fontWeight: FontWeight.w600),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    const EdgeInsets pad = EdgeInsets.symmetric(horizontal: 8, vertical: 4);
    final Size bubble = Size(tp.width + pad.horizontal, tp.height + pad.vertical);
    // Clamp so the callout stays inside the plot even for edge points.
    final double left = (point.dx - bubble.width / 2)
        .clamp(plot.left, plot.right - bubble.width);
    final double top = math.max(plot.top, point.dy - bubble.height - 12);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(left, top, bubble.width, bubble.height),
          const Radius.circular(6)),
      Paint()..color = calloutColor,
    );
    tp.paint(canvas, Offset(left + pad.left, top + pad.top));
    tp.dispose();
  }

  @override
  bool shouldRepaint(_LineChartPainter oldDelegate) {
    // Identity (not deep) comparison on values: shouldRepaint runs every
    // frame and must stay cheap. Data changes arrive as NEW list instances.
    return !identical(oldDelegate.values, values) ||
        oldDelegate.selected != selected ||
        oldDelegate.lineColor != lineColor ||
        oldDelegate.gridColor != gridColor ||
        oldDelegate.labelStyle != labelStyle ||
        oldDelegate.calloutColor != calloutColor ||
        oldDelegate.calloutTextColor != calloutTextColor;
  }
}
`,
    notes:
      "The painter and the tap handler MUST share one projection object built from the same Size (via LayoutBuilder) \u2014 duplicating the data-to-pixel math in the gesture handler is the classic way taps select the wrong point. shouldRepaint compares the values list by identity, so mutating the list in place silently skips repaints: the widget contract is that data changes arrive as new list instances. TextPainter requires textDirection before layout() (asserts otherwise) and should be dispose()d \u2014 leak_tracker flags undisposed TextPainters in widget tests. GestureDetector needs HitTestBehavior.opaque because a childless RenderCustomPaint is not hit-testable over empty plot regions. The parent must give the chart bounded constraints; CustomPaint's size parameter only wins where constraints are loose. minFlutter 3.27 for Color.withValues.",
  },
  {
    id: "custom-render-object-leaf",
    title: "Leaf RenderObject from Scratch: Progress Ring",
    category: "rendering",
    difficulty: "expert",
    description:
      "A LeafRenderObjectWidget backed by a hand-written RenderBox progress ring. Demonstrates sizing through sizedByParent + computeDryLayout with honest constraint handling, intrinsic sizes, hitTestSelf restricted to the painted band so taps in the hole fall through, and property setters that choose between markNeedsPaint and markNeedsLayout. Reach for this when CustomPainter is not enough \u2014 you need real layout participation, intrinsics, or precise hit-test geometry.",
    tags: ["renderobject", "renderbox", "leafrenderobjectwidget", "sizedbyparent", "computedrylayout", "intrinsics", "hittestself", "markneedspaint", "markneedslayout", "updaterenderobject"],
    minFlutter: "3.22",
    packages: [],
    code: `// A LeafRenderObjectWidget + RenderBox written from scratch: a progress ring.
// Covers the discipline CustomPainter hides: sizedByParent + computeDryLayout
// constraint handling, intrinsic sizes, hitTestSelf limited to the painted
// band (taps in the hole fall through), and setters that choose between
// markNeedsPaint and markNeedsLayout while updateRenderObject stays dumb.
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

void main() => runApp(const RingDemoApp());

class ProgressRing extends LeafRenderObjectWidget {
  const ProgressRing({
    super.key,
    required this.progress,
    this.diameter = 120,
    this.strokeWidth = 12,
    required this.color,
    required this.trackColor,
  }) : assert(progress >= 0 && progress <= 1);

  final double progress;
  final double diameter;
  final double strokeWidth;
  final Color color;
  final Color trackColor;

  @override
  RenderProgressRing createRenderObject(BuildContext context) {
    return RenderProgressRing(
      progress: progress,
      diameter: diameter,
      strokeWidth: strokeWidth,
      color: color,
      trackColor: trackColor,
    );
  }

  @override
  void updateRenderObject(BuildContext context, RenderProgressRing renderObject) {
    // The render object's setters decide what to invalidate; the widget must
    // not call markNeeds* itself. Doing it here fires on every rebuild even
    // when nothing changed, defeating the pipeline's dirty tracking.
    renderObject
      ..progress = progress
      ..diameter = diameter
      ..strokeWidth = strokeWidth
      ..color = color
      ..trackColor = trackColor;
  }
}

class RenderProgressRing extends RenderBox {
  RenderProgressRing({
    required double progress,
    required double diameter,
    required double strokeWidth,
    required Color color,
    required Color trackColor,
  })  : _progress = progress,
        _diameter = diameter,
        _strokeWidth = strokeWidth,
        _color = color,
        _trackColor = trackColor;

  double _progress;
  set progress(double value) {
    if (_progress == value) {
      return;
    }
    _progress = value;
    markNeedsPaint(); // geometry unchanged: relayout would be wasted work
  }

  double _diameter;
  set diameter(double value) {
    if (_diameter == value) {
      return;
    }
    _diameter = value;
    markNeedsLayout(); // affects our size, and therefore the parent's layout
  }

  double _strokeWidth;
  set strokeWidth(double value) {
    if (_strokeWidth == value) {
      return;
    }
    _strokeWidth = value;
    markNeedsPaint(); // drawn inside the box; the box itself stays _diameter
  }

  Color _color;
  set color(Color value) {
    if (_color == value) {
      return;
    }
    _color = value;
    markNeedsPaint();
  }

  Color _trackColor;
  set trackColor(Color value) {
    if (_trackColor == value) {
      return;
    }
    _trackColor = value;
    markNeedsPaint();
  }

  // Our size depends only on incoming constraints (plus _diameter), never on
  // content. Declaring sizedByParent moves sizing to the performResize path
  // and makes this box a relayout boundary under tight constraints, so a
  // markNeedsLayout here never propagates to ancestors unnecessarily.
  @override
  bool get sizedByParent => true;

  @override
  Size computeDryLayout(covariant BoxConstraints constraints) {
    // constrain() is the honest move: in an unbounded context we get our
    // preferred diameter, in a tight one we obey the parent. Returning an
    // unclamped Size.square trips debug asserts inside tight parents.
    return constraints.constrain(Size.square(_diameter));
  }

  // Leaf boxes that skip intrinsics silently report 0 and collapse inside
  // IntrinsicWidth/IntrinsicHeight, Table, and similar measuring parents.
  @override
  double computeMinIntrinsicWidth(double height) => _diameter;
  @override
  double computeMaxIntrinsicWidth(double height) => _diameter;
  @override
  double computeMinIntrinsicHeight(double width) => _diameter;
  @override
  double computeMaxIntrinsicHeight(double width) => _diameter;

  @override
  bool hitTestSelf(Offset position) {
    // Only the painted band is interactive. RenderBox.hitTest has already
    // culled positions outside the box; here we carve the band out of it.
    final Offset center = size.center(Offset.zero);
    final double outer = math.min(size.width, size.height) / 2;
    final double distance = (position - center).distance;
    return distance <= outer && distance >= outer - _strokeWidth;
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    final Canvas canvas = context.canvas;
    final double radius = math.min(size.width, size.height) / 2 - _strokeWidth / 2;
    if (radius <= 0) {
      return; // box smaller than the stroke: nothing sensible to draw
    }
    // Paint in parent coordinates: everything must be shifted by offset.
    // Forgetting it "works" until the box is placed anywhere but the origin.
    final Offset center = offset + size.center(Offset.zero);

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth
        ..color = _trackColor,
    );
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2, // start at 12 o'clock
      2 * math.pi * _progress.clamp(0.0, 1.0),
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth
        ..strokeCap = StrokeCap.round
        ..color = _color,
    );
  }

  @override
  void debugFillProperties(DiagnosticPropertiesBuilder properties) {
    super.debugFillProperties(properties);
    properties
      ..add(DoubleProperty('progress', _progress))
      ..add(DoubleProperty('diameter', _diameter))
      ..add(ColorProperty('color', _color));
  }
}

class RingDemoApp extends StatelessWidget {
  const RingDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.teal),
      home: const RingDemoPage(),
    );
  }
}

class RingDemoPage extends StatefulWidget {
  const RingDemoPage({super.key});

  @override
  State<RingDemoPage> createState() => _RingDemoPageState();
}

class _RingDemoPageState extends State<RingDemoPage> {
  double _progress = 0.66;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('RenderBox from scratch')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            GestureDetector(
              // Default deferToChild behavior + hitTestSelf above: only the
              // painted band triggers this, taps in the hole fall through.
              onTap: () => ScaffoldMessenger.of(context)
                ..hideCurrentSnackBar()
                ..showSnackBar(const SnackBar(
                  content: Text('Ring band tapped'),
                  duration: Duration(milliseconds: 600),
                )),
              child: ProgressRing(
                progress: _progress,
                color: scheme.primary,
                trackColor: scheme.surfaceContainerHighest,
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: 240,
              child: Slider(
                value: _progress,
                onChanged: (double value) => setState(() => _progress = value),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
`,
    notes:
      "Because size depends only on constraints, sizedByParent is declared and sizing lives in computeDryLayout (performResize calls it); this makes the box a relayout boundary under tight constraints, so markNeedsLayout never propagates further than needed \u2014 the sample deliberately has no performLayout, which is the correct shape for constraint-only sizing. Always constraints.constrain() the preferred size: returning an unclamped Size trips debug asserts inside tight parents. Setters must early-return on equality and pick the cheapest invalidation (progress/colors -> markNeedsPaint, diameter -> markNeedsLayout); calling markNeeds* from updateRenderObject defeats dirty tracking because it fires on every rebuild. paint() must offset everything by the incoming offset \u2014 drawing in local coordinates works only while the box happens to sit at the parent's origin. Skipping the four intrinsic overrides makes the ring collapse to zero inside IntrinsicWidth/Height and Table. hitTestSelf receives box-local coordinates already culled to the box; the band-only test is why GestureDetector's default deferToChild behavior ignores taps in the hole. minFlutter 3.22 for ColorScheme.surfaceContainerHighest used in the demo harness.",
  },
  {
    id: "custom-multichild-render-object",
    title: "MultiChild RenderObject: Overlapping Avatar Stack",
    category: "rendering",
    difficulty: "expert",
    description:
      "A MultiChildRenderObjectWidget + ContainerRenderObjectMixin avatar stack where children overlap and the first child paints on top. Covers parentData setup, per-child layout with tight constraints, a custom back-to-front paint order, and the hit-test order that must mirror it. Reach for this when a custom layout also needs custom paint order or per-child hit-test semantics that Stack/Flow cannot express.",
    tags: ["multichildrenderobjectwidget", "containerrenderobjectmixin", "parentdata", "paint-order", "hit-testing", "avatar-stack", "custom-layout", "performlayout", "renderbox"],
    minFlutter: "3.13",
    packages: [],
    code: `// MultiChildRenderObjectWidget + ContainerRenderObjectMixin: an overlapping
// avatar stack where the FIRST child paints on top (like design mockups).
//
// The expert points:
//  * parentData setup: check the type before replacing, or reparenting
//    between container render objects corrupts sibling links,
//  * custom paint order (back-to-front) and the invariant it creates:
//    hit-test order MUST be its exact reverse or taps in the overlap
//    region select the avatar that is visually underneath,
//  * dry layout + intrinsics computed without touching children.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

void main() => runApp(const AvatarStackDemoApp());

class AvatarStack extends MultiChildRenderObjectWidget {
  const AvatarStack({
    super.key,
    this.avatarSize = 56,
    this.overlap = 0.35,
    super.children,
  }) : assert(overlap >= 0 && overlap < 1);

  final double avatarSize;

  /// Fraction of each avatar hidden beneath its left-hand neighbour.
  final double overlap;

  @override
  RenderAvatarStack createRenderObject(BuildContext context) =>
      RenderAvatarStack(avatarSize: avatarSize, overlap: overlap);

  @override
  void updateRenderObject(BuildContext context, RenderAvatarStack renderObject) {
    renderObject
      ..avatarSize = avatarSize
      ..overlap = overlap;
  }
}

/// ContainerBoxParentData already provides the paint offset and the
/// prev/next sibling links the container mixin maintains. Extend it (even
/// when adding nothing) so the type check in setupParentData is precise.
class _AvatarStackParentData extends ContainerBoxParentData<RenderBox> {}

class RenderAvatarStack extends RenderBox
    with
        ContainerRenderObjectMixin<RenderBox, _AvatarStackParentData>,
        RenderBoxContainerDefaultsMixin<RenderBox, _AvatarStackParentData> {
  RenderAvatarStack({required double avatarSize, required double overlap})
      : _avatarSize = avatarSize,
        _overlap = overlap;

  double _avatarSize;
  set avatarSize(double value) {
    if (_avatarSize == value) {
      return;
    }
    _avatarSize = value;
    markNeedsLayout();
  }

  double _overlap;
  set overlap(double value) {
    if (_overlap == value) {
      return;
    }
    _overlap = value;
    markNeedsLayout();
  }

  double get _step => _avatarSize * (1 - _overlap);

  @override
  void setupParentData(RenderBox child) {
    // Only replace foreign parentData. Unconditionally assigning would wipe
    // the sibling links the mixin has already threaded through this child.
    if (child.parentData is! _AvatarStackParentData) {
      child.parentData = _AvatarStackParentData();
    }
  }

  Size _computeSize() {
    if (childCount == 0) {
      return Size.zero;
    }
    return Size(_avatarSize + (childCount - 1) * _step, _avatarSize);
  }

  // Dry layout must not call child.layout(); our size is a pure function of
  // childCount, so this stays legal inside IntrinsicWidth and dry-layout
  // passes (e.g. the new baseline APIs).
  @override
  Size computeDryLayout(covariant BoxConstraints constraints) =>
      constraints.constrain(_computeSize());

  @override
  double computeMinIntrinsicWidth(double height) => _computeSize().width;
  @override
  double computeMaxIntrinsicWidth(double height) => _computeSize().width;
  @override
  double computeMinIntrinsicHeight(double width) => _computeSize().height;
  @override
  double computeMaxIntrinsicHeight(double width) => _computeSize().height;

  @override
  void performLayout() {
    final BoxConstraints childConstraints =
        BoxConstraints.tight(Size.square(_avatarSize));
    RenderBox? child = firstChild;
    int index = 0;
    while (child != null) {
      // Tight constraints mean the child cannot surprise us with its size,
      // so parentUsesSize stays false and each child becomes its own
      // relayout boundary: a child relayout never re-runs this method.
      child.layout(childConstraints);
      final _AvatarStackParentData parentData =
          child.parentData! as _AvatarStackParentData;
      parentData.offset = Offset(index * _step, 0);
      index += 1;
      child = parentData.nextSibling;
    }
    size = constraints.constrain(_computeSize());
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    // Back-to-front: last sibling first, so the FIRST child ends up on top.
    // (The default defaultPaint walks first-to-last, putting the last child
    // on top, which is the opposite of how avatar stacks are designed.)
    RenderBox? child = lastChild;
    while (child != null) {
      final _AvatarStackParentData parentData =
          child.parentData! as _AvatarStackParentData;
      context.paintChild(child, parentData.offset + offset);
      child = parentData.previousSibling;
    }
  }

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) {
    // Must walk in reverse paint order (topmost first). We cannot use
    // defaultHitTestChildren(): it walks last-to-first, which mirrors
    // defaultPaint — but we flipped painting, so we flip hit testing too.
    RenderBox? child = firstChild;
    while (child != null) {
      final _AvatarStackParentData parentData =
          child.parentData! as _AvatarStackParentData;
      final RenderBox current = child;
      final bool isHit = result.addWithPaintOffset(
        offset: parentData.offset,
        position: position,
        // addWithPaintOffset (not a bare position subtraction) records the
        // transform so PointerEvent.localPosition is correct in the child.
        hitTest: (BoxHitTestResult result, Offset transformed) =>
            current.hitTest(result, position: transformed),
      );
      if (isHit) {
        return true;
      }
      child = parentData.nextSibling;
    }
    return false;
  }
}

class AvatarStackDemoApp extends StatelessWidget {
  const AvatarStackDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.indigo),
      home: const AvatarStackDemoPage(),
    );
  }
}

class AvatarStackDemoPage extends StatelessWidget {
  const AvatarStackDemoPage({super.key});

  static const List<Color> _colors = <Color>[
    Color(0xFF3F51B5),
    Color(0xFF00897B),
    Color(0xFFF4511E),
    Color(0xFFD81B60),
    Color(0xFF43A047),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('MultiChildRenderObjectWidget')),
      body: Center(
        child: AvatarStack(
          avatarSize: 72,
          overlap: 0.4,
          children: <Widget>[
            for (int i = 0; i < _colors.length; i++)
              _TappableAvatar(index: i, color: _colors[i]),
          ],
        ),
      ),
    );
  }
}

class _TappableAvatar extends StatelessWidget {
  const _TappableAvatar({required this.index, required this.color});

  final int index;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      // Tap the overlap seam: the avatar painted on top wins, proving the
      // hit-test order mirrors the custom paint order.
      onTap: () => ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('Avatar $index tapped'),
          duration: const Duration(milliseconds: 700),
        )),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
        ),
        child: Center(
          child: Text(
            '$index',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
          ),
        ),
      ),
    );
  }
}
`,
    notes:
      "setupParentData must type-check before replacing: unconditionally assigning fresh parentData wipes the sibling links ContainerRenderObjectMixin threads through children. The core invariant: hit-test order must be the exact reverse of paint order \u2014 this sample paints last-to-first (first child visually on top), so hitTestChildren walks first-to-last and stops at the first hit; using defaultHitTestChildren here would deliver overlap-region taps to the avatar underneath. Use result.addWithPaintOffset (never a bare position subtraction) so the transform is recorded and PointerEvent.localPosition is correct inside children. Tight child constraints let child.layout run with parentUsesSize: false, making each child its own relayout boundary. computeDryLayout must not call child.layout(); here size is a pure function of childCount so dry layout and intrinsics stay legal. minFlutter 3.13 for the const MultiChildRenderObjectWidget constructor.",
  },
  {
    id: "fragment-shader-effect",
    title: "Runtime Fragment Shader Shimmer (FragmentProgram)",
    category: "rendering",
    difficulty: "advanced",
    description:
      "An animated shimmer panel driven by a runtime GLSL fragment shader: FragmentProgram.fromAsset with a process-wide cached Future, one FragmentShader instance per widget, uniforms fed by an AnimationController through CustomPainter's repaint listenable (no setState per frame). The GLSL source ships in the top-of-file comment. Reach for this for GPU effects \u2014 shimmer, ripple, dissolve, procedural gradients \u2014 that would be expensive or impossible with Canvas primitives.",
    tags: ["fragment-shader", "fragmentprogram", "glsl", "runtime-effect", "shader", "shimmer", "animationcontroller", "impeller", "uniforms", "gpu"],
    minFlutter: "3.10",
    packages: [],
    code: `/*
Runtime fragment shader driven by an AnimationController: a shimmer sweep.

GLSL source — save as shaders/shimmer.frag and register it in pubspec.yaml:

  flutter:
    shaders:
      - shaders/shimmer.frag

--- shaders/shimmer.frag ----------------------------------------------------
#version 460 core
#include <flutter/runtime_effect.glsl>

precision mediump float;

uniform vec2 uSize;
uniform float uTime;

out vec4 fragColor;

void main() {
  vec2 uv = FlutterFragCoord().xy / uSize;

  // Sweep a soft diagonal band across the panel once per uTime cycle.
  // The band travels from -0.5 to 1.5 so it fully enters and exits.
  float sweep = fract(uTime) * 2.0 - 0.5;
  float d = dot(uv, vec2(0.8, 0.2)) - sweep;
  float glow = smoothstep(0.25, 0.0, abs(d));

  vec3 base = mix(vec3(0.13, 0.16, 0.23), vec3(0.21, 0.27, 0.40), uv.y);
  vec3 color = base + glow * vec3(0.35, 0.42, 0.60);

  // Flutter expects PREMULTIPLIED alpha. Alpha is 1.0 here so straight ==
  // premultiplied, but translucent effects must multiply rgb by a.
  fragColor = vec4(color, 1.0);
}
-----------------------------------------------------------------------------
*/
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

void main() => runApp(const ShimmerDemoApp());

/// Process-wide program cache. FragmentProgram.fromAsset performs the
/// SPIR-V -> backend compile; doing that per widget instance stutters.
/// Caching the Future (not the value) lets concurrent loaders share one
/// in-flight compilation instead of racing.
class ShimmerProgram {
  static Future<ui.FragmentProgram>? _future;

  static Future<ui.FragmentProgram> load() =>
      _future ??= ui.FragmentProgram.fromAsset('shaders/shimmer.frag');
}

class ShimmerDemoApp extends StatelessWidget {
  const ShimmerDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.indigo, brightness: Brightness.dark),
      home: Scaffold(
        appBar: AppBar(title: const Text('FragmentProgram shimmer')),
        body: Center(
          child: SizedBox(
            width: 320,
            height: 180,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: const ShimmerPanel(),
            ),
          ),
        ),
      ),
    );
  }
}

class ShimmerPanel extends StatefulWidget {
  const ShimmerPanel({super.key});

  @override
  State<ShimmerPanel> createState() => _ShimmerPanelState();
}

class _ShimmerPanelState extends State<ShimmerPanel>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat();

  // The program is shared; the FragmentShader instance is NOT. Uniform
  // state lives on the shader, so two widgets sharing one shader instance
  // would overwrite each other's uniforms mid-frame.
  ui.FragmentShader? _shader;

  @override
  void initState() {
    super.initState();
    ShimmerProgram.load().then((ui.FragmentProgram program) {
      if (!mounted) {
        return; // the Future can complete after dispose
      }
      setState(() => _shader = program.fragmentShader());
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _shader?.dispose(); // shaders hold GPU-side objects; dispose explicitly
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ui.FragmentShader? shader = _shader;
    if (shader == null) {
      // First-frame placeholder in the shader's base color: avoids a white
      // flash while the asset loads and compiles.
      return const ColoredBox(color: Color(0xFF262E42));
    }
    return CustomPaint(
      painter: _ShimmerPainter(shader: shader, time: _controller),
      size: Size.infinite,
    );
  }
}

class _ShimmerPainter extends CustomPainter {
  // Passing the controller to super(repaint:) repaints at the layer level on
  // every tick — no setState, no widget rebuild, no new painter instance.
  _ShimmerPainter({required this.shader, required this.time})
      : super(repaint: time);

  final ui.FragmentShader shader;
  final Animation<double> time;

  @override
  void paint(Canvas canvas, Size size) {
    // Uniforms are addressed by FLAT FLOAT INDEX in declaration order:
    // vec2 uSize occupies slots 0 and 1, so uTime lands in slot 2.
    // Reordering the GLSL uniforms silently breaks these indices.
    shader
      ..setFloat(0, size.width)
      ..setFloat(1, size.height)
      ..setFloat(2, time.value);
    canvas.drawRect(Offset.zero & size, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(_ShimmerPainter oldDelegate) {
    // Animation frames arrive via the repaint listenable; this only answers
    // "is the new delegate configured differently".
    return oldDelegate.shader != shader || oldDelegate.time != time;
  }
}
`,
    notes:
      "Register the shader in pubspec.yaml under the flutter: section as shaders: [shaders/shimmer.frag] \u2014 NOT under assets:; the shaders stanza routes the file through impellerc at build time, so a malformed .frag fails the build rather than the frame. Uniforms are set by FLAT FLOAT INDEX in GLSL declaration order: vec2 uSize occupies slots 0-1 and uTime is slot 2; reordering uniform declarations silently corrupts every setFloat call (samplers are indexed separately via setImageSampler). Always use FlutterFragCoord() from flutter/runtime_effect.glsl, not gl_FragCoord, whose Y origin differs per backend. fragColor must be PREMULTIPLIED alpha \u2014 for translucency multiply rgb by a or edges ring. Cache the Future of FragmentProgram.fromAsset (compilation is expensive; caching the Future dedupes concurrent loads) but never share a FragmentShader between widgets: uniform state lives on the shader instance. Dispose the shader; it holds GPU resources. Passing the controller to super(repaint:) repaints at the layer level with zero rebuilds. Verified on Flutter 3.38.5 including a flutter build bundle shader-compile pass.",
  },
  {
    id: "custom-sliver-render-object",
    title: "Custom RenderSliver: Pin-then-Scale Header",
    category: "rendering",
    difficulty: "expert",
    description:
      "A real RenderSliver \u2014 a RenderSliverSingleBoxAdapter subclass, not a SliverPersistentHeaderDelegate \u2014 whose child pins at the viewport's leading edge and scales down about its top-center as it is scrolled past. Shows the SliverGeometry math (scrollExtent vs paintExtent vs layoutExtent), child layout via constraints.asBoxConstraints(), transformed painting with a reused TransformLayer, and hit testing that inverts the paint matrix. Reach for this when scroll effects cannot be expressed with the stock sliver widgets.",
    tags: ["sliver", "rendersliver", "slivergeometry", "rendersliversingleboxadapter", "pinned-header", "scroll-effects", "customscrollview", "paintextent", "layoutextent", "hit-testing", "transformlayer"],
    minFlutter: "3.10",
    packages: [],
    code: `// A real RenderSliver: a header that PINS at the top of the viewport and
// SCALES down (about its top-center) as it is scrolled past — implemented as
// a RenderSliverSingleBoxAdapter subclass, not a SliverPersistentHeader.
//
// The geometry invariants that make or break custom slivers:
//  * scrollExtent is how much scroll distance we consume (constant here),
//  * paintExtent is how much viewport we occupy visually THIS frame,
//  * layoutExtent (<= paintExtent) is where the NEXT sliver starts; letting
//    it shrink to 0 while paintExtent stays > 0 is what makes content slide
//    underneath a pinned header,
//  * paint offset, hit testing, and applyPaintTransform must all agree on
//    the same transform or taps/semantics land in the wrong place.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

void main() => runApp(const SliverDemoApp());

class PinnedScaleSliver extends SingleChildRenderObjectWidget {
  const PinnedScaleSliver({
    super.key,
    this.minScale = 0.6,
    required Widget super.child,
  }) : assert(minScale > 0 && minScale <= 1);

  /// Scale reached once the child's full extent has been scrolled past.
  final double minScale;

  @override
  RenderPinnedScaleSliver createRenderObject(BuildContext context) =>
      RenderPinnedScaleSliver(minScale: minScale);

  @override
  void updateRenderObject(
      BuildContext context, RenderPinnedScaleSliver renderObject) {
    renderObject.minScale = minScale;
  }
}

class RenderPinnedScaleSliver extends RenderSliverSingleBoxAdapter {
  RenderPinnedScaleSliver({required double minScale}) : _minScale = minScale;

  double _minScale;
  set minScale(double value) {
    if (_minScale == value) {
      return;
    }
    _minScale = value;
    // The scale feeds paintExtent, which is geometry — layout, not paint.
    markNeedsLayout();
  }

  double _childExtent = 0;
  double _scale = 1;

  @override
  void performLayout() {
    assert(
      constraints.axis == Axis.vertical &&
          constraints.growthDirection == GrowthDirection.forward,
      'PinnedScaleSliver only implements the vertical, forward-growing case; '
      'other axis directions need their own main-axis math.',
    );
    final RenderBox? child = this.child;
    if (child == null) {
      geometry = SliverGeometry.zero;
      return;
    }
    // asBoxConstraints() gives the child a tight cross axis (the viewport
    // width) and an unbounded main axis: the child picks its own height.
    child.layout(constraints.asBoxConstraints(), parentUsesSize: true);
    _childExtent = child.size.height;

    final double t = _childExtent == 0
        ? 0
        : (constraints.scrollOffset / _childExtent).clamp(0.0, 1.0);
    _scale = 1.0 - (1.0 - _minScale) * t;
    final double displayExtent = _childExtent * _scale;

    // paintExtent may never exceed remainingPaintExtent, and layoutExtent
    // may never exceed paintExtent — both are debug-asserted by the viewport.
    final double paintExtent =
        math.min(displayExtent, constraints.remainingPaintExtent);
    final double layoutExtent =
        (_childExtent - constraints.scrollOffset).clamp(0.0, paintExtent);

    geometry = SliverGeometry(
      scrollExtent: _childExtent,
      // Tuck under any overscroll stretch from a preceding sliver.
      paintOrigin: math.min(constraints.overlap, 0.0),
      paintExtent: paintExtent,
      layoutExtent: layoutExtent,
      maxPaintExtent: _childExtent,
      // What we permanently steal from the viewport once fully pinned;
      // scrollbars and shrink-wrapping viewports rely on this.
      maxScrollObstructionExtent: _childExtent * _minScale,
      hasVisualOverflow: true, // following content passes beneath us
    );

    // The base adapter's setChildParentData would put the child at
    // -scrollOffset (i.e. scrolling away). We pin, so the paint offset must
    // stay zero; the shrink happens in the paint transform instead.
    final SliverPhysicalParentData childParentData =
        child.parentData! as SliverPhysicalParentData;
    childParentData.paintOffset = Offset.zero;
  }

  /// Scale about the top-center of the sliver so the header shrinks in
  /// place instead of sliding toward the left edge.
  Matrix4 _effectiveTransform() {
    final double pivotX = constraints.crossAxisExtent / 2;
    final Matrix4 transform = Matrix4.translationValues(pivotX, 0, 0);
    transform.multiply(Matrix4.diagonal3Values(_scale, _scale, 1));
    transform.multiply(Matrix4.translationValues(-pivotX, 0, 0));
    return transform;
  }

  final LayerHandle<TransformLayer> _transformLayer =
      LayerHandle<TransformLayer>();

  @override
  void paint(PaintingContext context, Offset offset) {
    final RenderBox? child = this.child;
    if (child == null || !geometry!.visible) {
      return;
    }
    // Reusing the layer via oldLayer keeps the engine from re-uploading a
    // fresh TransformLayer every frame while scrolling.
    _transformLayer.layer = context.pushTransform(
      needsCompositing,
      offset,
      _effectiveTransform(),
      (PaintingContext context, Offset offset) =>
          context.paintChild(child, offset),
      oldLayer: _transformLayer.layer,
    );
  }

  @override
  void dispose() {
    _transformLayer.layer = null; // release the retained engine layer
    super.dispose();
  }

  // The child sits at the sliver's leading edge no matter the scroll offset
  // (that is what "pinned" means). The default returns -scrollOffset.
  @override
  double childMainAxisPosition(RenderBox child) => 0.0;

  @override
  void applyPaintTransform(RenderObject child, Matrix4 transform) {
    // localToGlobal, semantics rects, and ink effects derive positions from
    // this — it must match paint() exactly, not the base class's paintOffset.
    transform.multiply(_effectiveTransform());
  }

  @override
  bool hitTestChildren(SliverHitTestResult result,
      {required double mainAxisPosition, required double crossAxisPosition}) {
    final RenderBox? child = this.child;
    if (child == null || _scale <= 0) {
      return false;
    }
    // Sliver hit coordinates: main axis from the paint origin, cross axis
    // from the left edge — for a vertical sliver that is (cross, main) in
    // box space. addWithPaintTransform inverts the paint matrix for us and
    // records it so PointerEvent.localPosition is correct in the child.
    return BoxHitTestResult.wrap(result).addWithPaintTransform(
      transform: _effectiveTransform(),
      position: Offset(crossAxisPosition, mainAxisPosition),
      hitTest: (BoxHitTestResult result, Offset position) =>
          child.hitTest(result, position: position),
    );
  }
}

class SliverDemoApp extends StatelessWidget {
  const SliverDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.deepPurple),
      home: const SliverDemoPage(),
    );
  }
}

class SliverDemoPage extends StatelessWidget {
  const SliverDemoPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: <Widget>[
          const PinnedScaleSliver(minScale: 0.55, child: _DemoHeader()),
          SliverList.builder(
            itemCount: 40,
            itemBuilder: (BuildContext context, int index) =>
                ListTile(title: Text('Row $index')),
          ),
        ],
      ),
    );
  }
}

class _DemoHeader extends StatelessWidget {
  const _DemoHeader();

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      // Tapping the SHRUNKEN header still works because hitTestChildren
      // inverts the same matrix the painter applies.
      onTap: () => ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
          content: Text('Header tapped'),
          duration: Duration(milliseconds: 700),
        )),
      child: Container(
        height: 160,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: <Color>[Color(0xFF5E35B1), Color(0xFF3949AB)],
          ),
        ),
        alignment: Alignment.center,
        child: const Text(
          'Pins, then scales',
          style: TextStyle(color: Colors.white, fontSize: 24),
        ),
      ),
    );
  }
}
`,
    notes:
      "The pinning trick is the layoutExtent/paintExtent split: layoutExtent (where the next sliver starts) shrinks toward 0 while paintExtent stays at the scaled child extent, so content slides underneath; the viewport debug-asserts layoutExtent <= paintExtent and paintExtent <= remainingPaintExtent, hence both clamps. Pinning also requires overriding childMainAxisPosition to 0 and zeroing the SliverPhysicalParentData.paintOffset the base adapter would set to -scrollOffset. One matrix, three consumers: paint(), applyPaintTransform() (localToGlobal/semantics), and hitTestChildren() must all use the same transform \u2014 hitTestChildren wraps the result in BoxHitTestResult and uses addWithPaintTransform, which inverts the matrix and records it so PointerEvent.localPosition is correct in the scaled child. The TransformLayer is retained through a LayerHandle with oldLayer reuse and released in dispose(). minScale affects paintExtent, so its setter calls markNeedsLayout, not markNeedsPaint. Only the vertical forward-growing case is implemented (asserted in performLayout); other axis directions need their own main-axis math. Verified with a widget test: after 300px of scroll the header stays at top, paints at exactly minScale, and remains tappable.",
  },
];
