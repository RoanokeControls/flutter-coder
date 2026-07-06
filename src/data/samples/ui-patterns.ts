// UI-patterns category: overlays, custom layout delegates, gesture
// recognizers, and theme-extension design systems.
//
// Every `code` field is a complete, standalone Dart file verified with
// `flutter analyze` (zero issues) on Flutter 3.38.5 / Dart 3.10.4.

import type { FlutterSample } from "./types.js";

export const uiPatternSamples: readonly FlutterSample[] = [
  {
    id: "overlay-portal-dropdown",
    title: "Anchored Dropdown with OverlayPortal + LayerLink",
    category: "ui-patterns",
    difficulty: "advanced",
    description:
      "A select-style dropdown whose menu floats in the overlay yet stays glued to its button through scrolling, keyboard insets, and resizes: OverlayPortal owns the overlay child's lifecycle declaratively, CompositedTransformTarget/Follower (LayerLink) pin it at paint time, TapRegion with a shared groupId handles tap-outside dismissal, and a FocusScope + Escape shortcut make it keyboard-complete. The blueprint for autocomplete panels, rich tooltips, and any anchored popup.",
    tags: ["overlayportal", "overlay", "dropdown", "compositedtransformfollower", "layerlink", "tapregion", "anchored", "popup", "focus", "keyboard", "dismissal"],
    minFlutter: "3.24",
    packages: [],
    code: `// Anchored dropdown with OverlayPortal + CompositedTransformTarget/Follower.
//
// Why not a plain Overlay + Positioned? A Positioned overlay is placed once,
// with coordinates computed at open time — it goes stale the moment the
// anchor moves (keyboard insets, rotation, scrolling). LayerLink pins the
// follower to the target at PAINT time, so the menu tracks the button with
// zero per-frame Dart work. OverlayPortal keeps the overlay child in the
// same element tree, so it inherits Theme/Directionality and is disposed
// with the field automatically (the classic leaked-OverlayEntry bug is
// structurally impossible).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class DropdownFieldDemo extends StatelessWidget {
  const DropdownFieldDemo({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('OverlayPortal dropdown')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 320),
          child: const AnchoredDropdown(
            items: ['Design', 'Engineering', 'Research', 'Operations'],
          ),
        ),
      ),
    );
  }
}

class AnchoredDropdown extends StatefulWidget {
  const AnchoredDropdown({super.key, required this.items});

  final List<String> items;

  @override
  State<AnchoredDropdown> createState() => _AnchoredDropdownState();
}

class _AnchoredDropdownState extends State<AnchoredDropdown> {
  final OverlayPortalController _portal = OverlayPortalController();
  final LayerLink _link = LayerLink();
  final FocusNode _buttonFocus = FocusNode(debugLabel: 'dropdown-button');
  // One groupId for button + menu: TapRegion treats them as a single region,
  // so clicking the button while open doesn't fire onTapOutside AND toggle —
  // the double-event race that makes naive dropdowns reopen instantly.
  final Object _tapGroup = Object();

  String? _selected;
  double _buttonWidth = 0;

  @override
  void dispose() {
    _buttonFocus.dispose();
    super.dispose();
  }

  void _toggle() {
    _portal.toggle();
    setState(() {}); // reflect open/closed chevron
  }

  void _select(String value) {
    setState(() => _selected = value);
    _portal.hide();
    // Hand focus back to the anchor so keyboard users aren't dropped into
    // the void when the menu's FocusScope disappears.
    _buttonFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _link,
      child: OverlayPortal(
        controller: _portal,
        overlayChildBuilder: (BuildContext overlayContext) {
          // The overlay child fills the Overlay's coordinate space; the
          // Follower — not Positioned — does the actual placement.
          return Align(
            alignment: AlignmentDirectional.topStart,
            child: CompositedTransformFollower(
              link: _link,
              targetAnchor: Alignment.bottomLeft,
              followerAnchor: Alignment.topLeft,
              offset: const Offset(0, 4),
              // Followers do NOT hit-test where they paint unless the target
              // still exists; showWhenUnlinked:false also prevents painting
              // at (0,0) if the field scrolls out of the tree while open.
              showWhenUnlinked: false,
              child: TapRegion(
                groupId: _tapGroup,
                onTapOutside: (_) => _portal.hide(),
                child: _DropdownMenu(
                  width: _buttonWidth,
                  items: widget.items,
                  onSelect: _select,
                  onDismiss: () {
                    _portal.hide();
                    _buttonFocus.requestFocus();
                  },
                ),
              ),
            ),
          );
        },
        child: LayoutBuilder(
          builder: (context, constraints) {
            // Follower gives position, not size: capture the anchor's width
            // here so the menu can match it. Reading it in the overlay
            // builder is too late — it runs in the Overlay's constraints.
            _buttonWidth = constraints.maxWidth;
            return TapRegion(
              groupId: _tapGroup,
              child: OutlinedButton(
                focusNode: _buttonFocus,
                onPressed: _toggle,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(_selected ?? 'Choose a team'),
                    const Icon(Icons.arrow_drop_down),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _DropdownMenu extends StatelessWidget {
  const _DropdownMenu({
    required this.width,
    required this.items,
    required this.onSelect,
    required this.onDismiss,
  });

  final double width;
  final List<String> items;
  final ValueChanged<String> onSelect;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    // FocusScope fences arrow-key traversal inside the menu; without it,
    // pressing Down walks focus into widgets *under* the overlay.
    return FocusScope(
      autofocus: true,
      child: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.escape): onDismiss,
        },
        child: SizedBox(
          width: width,
          // Material is required: the menu floats above everything, so it
          // has no ancestor Material to give InkWell its ink or elevation.
          child: Material(
            elevation: 6,
            borderRadius: BorderRadius.circular(8),
            clipBehavior: Clip.antiAlias,
            child: ListView(
              shrinkWrap: true, // size to content, not the whole overlay
              padding: EdgeInsets.zero,
              children: [
                for (final item in items)
                  ListTile(
                    dense: true,
                    title: Text(item),
                    // ListTile is focusable, so arrow keys + Enter work via
                    // the default activation action — no manual key handling.
                    onTap: () => onSelect(item),
                  ),
              ],
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
      theme: ThemeData(colorSchemeSeed: Colors.blueGrey),
      home: const DropdownFieldDemo(),
    ),
  );
}`,
    notes:
      "Give the anchor button and the menu the SAME TapRegion groupId — otherwise clicking the button while open fires onTapOutside (hide) AND onPressed (show) in one tap and the menu reopens instantly. LayerLink transfers position only, never size: capture the anchor's width from a LayoutBuilder around the button; measuring inside overlayChildBuilder is too late because it runs under the Overlay's constraints. Set showWhenUnlinked:false or the menu paints at the origin if the field leaves the tree while open. The overlay child has no Material ancestor — provide one for elevation and ink. FocusScope fences arrow-key traversal so Down doesn't walk into widgets underneath the overlay, and returning focus to the anchor on close keeps keyboard users oriented. OverlayPortal disposes its overlay child with the widget, eliminating the leaked-OverlayEntry bug of the imperative API.",
  },
  {
    id: "custom-multichild-layout",
    title: "Responsive Dashboard via CustomMultiChildLayout",
    category: "ui-patterns",
    difficulty: "expert",
    description:
      "A dashboard shell that Row/Column nesting can't express: a MultiChildLayoutDelegate places sidebar, header, content, and an optional detail panel where the sidebar's width feeds the header's width, the detail panel exists only past a breakpoint, and on narrow screens the sidebar relocates to the bottom as a nav bar. Demonstrates the delegate's constraints discipline — layoutChild exactly once, positionChild after layout, tight constraints from the delegate, shouldRelayout comparing inputs. Reach for it when slot positions are interdependent functions of the incoming size.",
    tags: ["custommultichildlayout", "multichildlayoutdelegate", "layoutid", "layoutchild", "positionchild", "responsive", "dashboard", "breakpoint", "custom-layout", "constraints"],
    minFlutter: "3.24",
    packages: [],
    code: `// CustomMultiChildLayout for a responsive dashboard shell that Row/Column
// genuinely cannot express: the sidebar's measured width feeds into the
// header's width, the detail panel appears only past a breakpoint, and on
// narrow screens the sidebar teleports to the bottom as a nav bar.
//
// Delegate contract (asserted in debug builds, silent corruption in release):
//   1. layoutChild EXACTLY ONCE per child id present in the tree;
//   2. positionChild only AFTER that child's layoutChild;
//   3. never read a child's size except from layoutChild's return value.
import 'package:flutter/material.dart';

enum _Slot { header, sidebar, content, detail }

class DashboardLayoutDelegate extends MultiChildLayoutDelegate {
  DashboardLayoutDelegate({required this.wide});

  final bool wide;

  static const double _sidebarWidth = 220;
  static const double _bottomNavHeight = 64;
  static const double _headerHeight = 72;
  static const double _detailWidth = 280;

  @override
  void performLayout(Size size) {
    // hasChild guards every optional slot: calling layoutChild for an id
    // that isn't in the children list throws immediately.
    final bool hasDetail = hasChild(_Slot.detail);

    if (wide) {
      // Sidebar first — full height, fixed width. Tight constraints
      // (w==min==max) are deliberate: the delegate owns geometry; letting
      // the child choose its own width here reintroduces the coupling
      // CustomMultiChildLayout exists to remove.
      layoutChild(_Slot.sidebar,
          BoxConstraints.tightFor(width: _sidebarWidth, height: size.height));
      positionChild(_Slot.sidebar, Offset.zero);

      final double detailW = hasDetail ? _detailWidth : 0;
      final double mainW = size.width - _sidebarWidth - detailW;

      layoutChild(_Slot.header,
          BoxConstraints.tightFor(width: mainW, height: _headerHeight));
      positionChild(_Slot.header, const Offset(_sidebarWidth, 0));

      layoutChild(
          _Slot.content,
          BoxConstraints.tightFor(
              width: mainW, height: size.height - _headerHeight));
      positionChild(_Slot.content, const Offset(_sidebarWidth, _headerHeight));

      if (hasDetail) {
        layoutChild(_Slot.detail,
            BoxConstraints.tightFor(width: _detailWidth, height: size.height));
        positionChild(_Slot.detail, Offset(size.width - _detailWidth, 0));
      }
    } else {
      // Narrow: header on top, content fills, sidebar becomes a bottom bar.
      layoutChild(_Slot.header,
          BoxConstraints.tightFor(width: size.width, height: _headerHeight));
      positionChild(_Slot.header, Offset.zero);

      layoutChild(
          _Slot.content,
          BoxConstraints.tightFor(
              width: size.width,
              height: size.height - _headerHeight - _bottomNavHeight));
      positionChild(_Slot.content, const Offset(0, _headerHeight));

      layoutChild(_Slot.sidebar,
          BoxConstraints.tightFor(width: size.width, height: _bottomNavHeight));
      positionChild(_Slot.sidebar, Offset(0, size.height - _bottomNavHeight));

      // The detail child must NOT be in the children list on narrow screens:
      // every child present must be laid out exactly once, so "hide it by
      // skipping layout" is an error. Hiding is a build-time decision.
      assert(!hasDetail, 'detail slot must be omitted from children when narrow');
    }
  }

  // Relayout only when inputs change. Returning true unconditionally forces
  // a full relayout on every build — the most common delegate perf bug.
  @override
  bool shouldRelayout(DashboardLayoutDelegate oldDelegate) => oldDelegate.wide != wide;
}

class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        // LayoutBuilder, not MediaQuery: the breakpoint must respond to the
        // constraints THIS widget actually gets (split view, embedded), not
        // the physical window.
        child: LayoutBuilder(
          builder: (context, constraints) {
            final bool wide = constraints.maxWidth >= 720;
            final bool showDetail = constraints.maxWidth >= 1000;
            return CustomMultiChildLayout(
              delegate: DashboardLayoutDelegate(wide: wide),
              children: [
                // LayoutId is the only legal way to address children from
                // the delegate; order in this list is paint order (detail
                // last paints on top if panels ever overlap).
                LayoutId(
                  id: _Slot.sidebar,
                  child: _Pane(
                    color: scheme.surfaceContainerHighest,
                    label: wide ? 'Sidebar' : 'Bottom nav',
                    child: wide
                        ? Column(
                            children: _navItems(),
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: _navItems(),
                          ),
                  ),
                ),
                LayoutId(
                  id: _Slot.header,
                  child: _Pane(color: scheme.primaryContainer, label: 'Header'),
                ),
                LayoutId(
                  id: _Slot.content,
                  child: _Pane(color: scheme.surface, label: 'Content'),
                ),
                if (wide && showDetail)
                  LayoutId(
                    id: _Slot.detail,
                    child:
                        _Pane(color: scheme.secondaryContainer, label: 'Detail'),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  static List<Widget> _navItems() => const [
        IconButton(onPressed: _noop, icon: Icon(Icons.home)),
        IconButton(onPressed: _noop, icon: Icon(Icons.insights)),
        IconButton(onPressed: _noop, icon: Icon(Icons.settings)),
      ];

  static void _noop() {}
}

class _Pane extends StatelessWidget {
  const _Pane({required this.color, required this.label, this.child});

  final Color color;
  final String label;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    // Children receive TIGHT constraints from the delegate, so they fill
    // their slot regardless of intrinsic size — no Expanded/Flexible needed.
    return ColoredBox(
      color: color,
      child: child ??
          Center(child: Text(label, style: Theme.of(context).textTheme.titleMedium)),
    );
  }
}

void main() {
  runApp(
    MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.cyan),
      home: const DashboardPage(),
    ),
  );
}`,
    notes:
      "Every child present in the children list must be laid out EXACTLY once — 'hide by skipping layoutChild' is a debug-mode error (and silent corruption in release), so visibility is a build-time decision: conditionally include the LayoutId, and guard delegate code with hasChild. positionChild before layoutChild also asserts. shouldRelayout must compare fields; returning true unconditionally forces relayout every build. Hand children TIGHT constraints (BoxConstraints.tightFor) — the delegate owns geometry, and loose constraints reintroduce the child-size coupling this widget exists to remove; a child's size may only be read from layoutChild's return value. Use LayoutBuilder rather than MediaQuery for the breakpoint so the shell responds to the constraints it actually receives (split view, embedding). Children paint in list order — order the list so overlapping panels stack correctly.",
  },
  {
    id: "raw-gesture-custom-recognizer",
    title: "Custom Two-Finger Swipe Recognizer with RawGestureDetector",
    category: "ui-patterns",
    difficulty: "expert",
    description:
      "A custom OneSequenceGestureRecognizer detecting a two-finger horizontal swipe, mounted over a scrolling ListView via RawGestureDetector so both gestures coexist: one finger scrolls, two fingers moving horizontally cycle the app theme, live centroid deltas drive UI during the gesture. The comments walk through gesture-arena mechanics — tracking pointers, declaring intent past touch slop, resolve(accepted/rejected), and why a Listener-based approach cannot negotiate with other recognizers.",
    tags: ["gesture", "gesturerecognizer", "onesequencegesturerecognizer", "rawgesturedetector", "gesture-arena", "multitouch", "two-finger", "touch-slop", "pointer", "custom-gesture"],
    minFlutter: "3.24",
    packages: [],
    code: `// Custom gesture recognizer: a two-finger horizontal swipe that coexists
// with a scrolling list, wired up through RawGestureDetector.
//
// Why a recognizer instead of Listener? Listener sees raw pointer events but
// cannot NEGOTIATE. Flutter routes every pointer through a gesture arena:
// all interested recognizers get the events, and exactly one may accept.
// A Listener-based "recognizer" fights the ListView instead of beating it —
// both react to the same drag. A real GestureRecognizer wins cleanly: when
// we accept, the scroll recognizer is told it lost and the list stays put.
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

class TwoFingerSwipeRecognizer extends OneSequenceGestureRecognizer {
  TwoFingerSwipeRecognizer({super.debugOwner});

  ValueChanged<double>? onUpdate; // horizontal delta since last event
  ValueChanged<int>? onEnd; // -1 swiped left, +1 swiped right

  final Map<int, Offset> _positions = <int, Offset>{};
  Offset _lastCentroid = Offset.zero;
  double _totalDx = 0;
  bool _accepted = false;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    // Tracking a pointer enters us into ITS arena. Each finger has its own
    // arena; OneSequenceGestureRecognizer resolves all of them together.
    startTrackingPointer(event.pointer, event.transform);
    _positions[event.pointer] = event.position;
    if (_positions.length > 2) {
      // Third finger disqualifies the gesture. Resolving rejected tells the
      // arenas we're out, letting scale/scroll recognizers claim the fingers.
      resolve(GestureDisposition.rejected);
    }
  }

  @override
  void handleEvent(PointerEvent event) {
    if (event is PointerMoveEvent) {
      _positions[event.pointer] = event.position;
      final Offset centroid = _centroid();

      if (!_accepted && _positions.length == 2) {
        final double dx = (centroid - _startCentroid).dx.abs();
        final double dy = (centroid - _startCentroid).dy.abs();
        // Declare intent only past touch slop, and only if horizontal
        // motion dominates. Accepting on the first move steals every
        // two-finger touch, including pinches meant for a zoom recognizer.
        if (dx > kTouchSlop && dx > dy) {
          _accepted = true;
          _lastCentroid = centroid;
          // THE arena moment: claim every tracked pointer. Competing
          // recognizers (the ListView's VerticalDragGestureRecognizer)
          // receive rejectGesture and cancel.
          resolve(GestureDisposition.accepted);
        }
      } else if (_accepted) {
        final double dx = (centroid - _lastCentroid).dx;
        _totalDx += dx;
        _lastCentroid = centroid;
        onUpdate?.call(dx);
      }
    } else if (event is PointerUpEvent || event is PointerCancelEvent) {
      _positions.remove(event.pointer);
      // Always stop tracking, or the recognizer leaks arena entries and the
      // NEXT gesture on this region deadlocks waiting for resolution.
      stopTrackingPointer(event.pointer);
    }
  }

  Offset _startCentroid = Offset.zero;

  Offset _centroid() {
    Offset sum = Offset.zero;
    for (final Offset p in _positions.values) {
      sum += p;
    }
    final Offset c = _positions.isEmpty ? Offset.zero : sum / _positions.length.toDouble();
    if (_positions.length == 2 && _startCentroid == Offset.zero) {
      _startCentroid = c;
    }
    return c;
  }

  @override
  void didStopTrackingLastPointer(int pointer) {
    // Called once the last finger lifts. If we never accepted, we must
    // formally reject — an unresolved arena holds *every* recognizer's
    // gesture hostage (the sweep only saves you on pointer-up for taps).
    if (_accepted) {
      onEnd?.call(_totalDx < 0 ? -1 : 1);
    } else {
      resolve(GestureDisposition.rejected);
    }
    _accepted = false;
    _totalDx = 0;
    _startCentroid = Offset.zero;
    _positions.clear();
  }

  @override
  String get debugDescription => 'two-finger horizontal swipe';
}

class TwoFingerSwipePage extends StatefulWidget {
  const TwoFingerSwipePage({super.key});

  @override
  State<TwoFingerSwipePage> createState() => _TwoFingerSwipePageState();
}

class _TwoFingerSwipePageState extends State<TwoFingerSwipePage> {
  static const List<Color> _seeds = [Colors.indigo, Colors.teal, Colors.amber];
  int _theme = 0;
  double _liveDx = 0;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorSchemeSeed: _seeds[_theme]),
      home: Builder(
        builder: (context) => Scaffold(
          appBar: AppBar(title: const Text('Two-finger swipe recognizer')),
          // RawGestureDetector owns recognizer lifecycle: it creates them via
          // the factory constructor and DISPOSES them when unmounted. Never
          // cache a recognizer in State and also hand it to a detector —
          // double-dispose.
          body: RawGestureDetector(
            behavior: HitTestBehavior.opaque,
            gestures: <Type, GestureRecognizerFactory>{
              TwoFingerSwipeRecognizer:
                  GestureRecognizerFactoryWithHandlers<TwoFingerSwipeRecognizer>(
                () => TwoFingerSwipeRecognizer(debugOwner: this),
                (TwoFingerSwipeRecognizer instance) {
                  // The initializer runs on EVERY build against the SAME
                  // instance — update callbacks here, don't recreate.
                  // (No cascades with lambda assignments: \`..\` binds to the
                  // lambda's body expression, not to \`instance\`.)
                  instance.onUpdate = (dx) => setState(() => _liveDx += dx);
                  instance.onEnd = (direction) {
                    setState(() {
                      _liveDx = 0;
                      _theme = (_theme + direction) % _seeds.length;
                    });
                  };
                },
              ),
            },
            // The child list keeps its own vertical drag recognizer. One
            // finger: list wins (we never pass slop with one origin). Two
            // fingers moving horizontally: we accept first and the list's
            // drag is cancelled mid-gesture.
            child: ListView.builder(
              itemCount: 40,
              itemBuilder: (context, i) => ListTile(
                leading: Transform.translate(
                  offset: Offset(_liveDx * 0.2, 0),
                  child: const Icon(Icons.swipe),
                ),
                title: Text('Row $i — one finger scrolls'),
                subtitle: const Text('Two-finger horizontal swipe cycles the theme'),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

void main() {
  runApp(const TwoFingerSwipePage());
}`,
    notes:
      "Arena discipline: every tracked pointer enters an arena, and an arena left unresolved holds ALL member recognizers hostage — if the gesture never accepts, resolve(GestureDisposition.rejected) in didStopTrackingLastPointer is mandatory. Always stopTrackingPointer on up/cancel or arena entries leak and the next gesture deadlocks. Accept only after passing kTouchSlop AND when horizontal motion dominates, so pinch-zoom and vertical scroll recognizers can still win their arenas. In GestureRecognizerFactoryWithHandlers, the initializer runs on EVERY build against the SAME recognizer instance — reassign callbacks there, and never cache a recognizer you also hand to RawGestureDetector (it disposes its recognizers; caching double-disposes). Dart parse trap in the initializer: `instance..onUpdate = (dx) => f() ..onEnd = ...` attaches the second cascade to the lambda body's result, not to instance — use plain assignment statements.",
  },
  {
    id: "theme-extension-design-system",
    title: "Design Tokens with ThemeExtension (M3, Light/Dark, Lerp)",
    category: "ui-patterns",
    difficulty: "advanced",
    description:
      "A Material 3 design-token layer built on ThemeExtension<T>: BrandColors (role-based success/warning pairs with on-colors, per-brightness variants) and BrandSpacing (numeric scale), registered in ThemeData.extensions for light and dark, exposed through context.brandColors / context.spacing extension getters, with real lerp implementations so custom-colored surfaces animate in step with Material ones when the theme changes. The standard pattern for shipping brand tokens that Material's ColorScheme doesn't cover.",
    tags: ["themeextension", "design-system", "tokens", "material3", "dark-mode", "lerp", "colorscheme", "theming", "context-extension", "brand-colors"],
    minFlutter: "3.24",
    packages: [],
    code: `// Design tokens as ThemeExtension<T>: brand colors and a spacing scale that
// travel with ThemeData, switch with light/dark, and LERP during theme
// animations.
//
// Why not constants or an InheritedWidget? Constants can't differ per
// brightness; a hand-rolled InheritedWidget doesn't participate in
// AnimatedTheme, so custom-colored surfaces SNAP while Material surfaces
// fade when the user toggles dark mode. ThemeExtension gets both for free —
// but only if lerp() is implemented for real (the default codegen habit of
// \`return other\` reintroduces the snap).
import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';

@immutable
class BrandColors extends ThemeExtension<BrandColors> {
  const BrandColors({
    required this.success,
    required this.onSuccess,
    required this.warning,
    required this.onWarning,
    required this.subtleBorder,
  });

  final Color success;
  final Color onSuccess;
  final Color warning;
  final Color onWarning;
  final Color subtleBorder;

  // Role-based light/dark pairs, mirroring ColorScheme's on-color pattern:
  // consumers never check brightness, they just use the role.
  static const light = BrandColors(
    success: Color(0xFF1B873F),
    onSuccess: Color(0xFFFFFFFF),
    warning: Color(0xFFB25E00),
    onWarning: Color(0xFFFFFFFF),
    subtleBorder: Color(0x1F000000),
  );

  static const dark = BrandColors(
    success: Color(0xFF4CC38A),
    onSuccess: Color(0xFF06301C),
    warning: Color(0xFFF5A623),
    onWarning: Color(0xFF3A2500),
    subtleBorder: Color(0x29FFFFFF),
  );

  @override
  BrandColors copyWith({
    Color? success,
    Color? onSuccess,
    Color? warning,
    Color? onWarning,
    Color? subtleBorder,
  }) {
    return BrandColors(
      success: success ?? this.success,
      onSuccess: onSuccess ?? this.onSuccess,
      warning: warning ?? this.warning,
      onWarning: onWarning ?? this.onWarning,
      subtleBorder: subtleBorder ?? this.subtleBorder,
    );
  }

  // Called by ThemeData.lerp on every frame of a theme animation. \`other\` is
  // typed as the base class and can be null — both checks are part of the
  // contract, not defensive noise.
  @override
  BrandColors lerp(ThemeExtension<BrandColors>? other, double t) {
    if (other is! BrandColors) return this;
    return BrandColors(
      success: Color.lerp(success, other.success, t)!,
      onSuccess: Color.lerp(onSuccess, other.onSuccess, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      onWarning: Color.lerp(onWarning, other.onWarning, t)!,
      subtleBorder: Color.lerp(subtleBorder, other.subtleBorder, t)!,
    );
  }
}

@immutable
class BrandSpacing extends ThemeExtension<BrandSpacing> {
  const BrandSpacing({required this.card, required this.gutter, required this.section});
  final double card;
  final double gutter;
  final double section;

  static const regular = BrandSpacing(card: 16, gutter: 12, section: 32);
  static const compact = BrandSpacing(card: 10, gutter: 8, section: 20);

  @override
  BrandSpacing copyWith({double? card, double? gutter, double? section}) {
    return BrandSpacing(
      card: card ?? this.card,
      gutter: gutter ?? this.gutter,
      section: section ?? this.section,
    );
  }

  // Numeric tokens lerp too — density changes then animate instead of
  // jumping, exactly like the color roles.
  @override
  BrandSpacing lerp(ThemeExtension<BrandSpacing>? other, double t) {
    if (other is! BrandSpacing) return this;
    return BrandSpacing(
      card: lerpDouble(card, other.card, t)!,
      gutter: lerpDouble(gutter, other.gutter, t)!,
      section: lerpDouble(section, other.section, t)!,
    );
  }
}

// The ergonomic layer. Theme.of(context).extension<T>() returns null when
// the extension was never registered — resolving that with a fallback HERE
// (not at every call site) turns a misconfigured ThemeData into a visible
// default instead of a scattered null-check chore.
extension DesignSystemContext on BuildContext {
  BrandColors get brandColors =>
      Theme.of(this).extension<BrandColors>() ?? BrandColors.light;
  BrandSpacing get spacing =>
      Theme.of(this).extension<BrandSpacing>() ?? BrandSpacing.regular;
}

ThemeData _buildTheme(Brightness brightness) {
  return ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF3E63DD),
      brightness: brightness,
    ),
    // Registration point. An extension type you forget to list here is
    // exactly why the context getters above keep a fallback.
    extensions: <ThemeExtension<dynamic>>[
      brightness == Brightness.light ? BrandColors.light : BrandColors.dark,
      BrandSpacing.regular,
    ],
  );
}

class TokensDemo extends StatefulWidget {
  const TokensDemo({super.key});

  @override
  State<TokensDemo> createState() => _TokensDemoState();
}

class _TokensDemoState extends State<TokensDemo> {
  ThemeMode _mode = ThemeMode.light;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
      themeMode: _mode,
      home: Scaffold(
        appBar: AppBar(
          title: const Text('ThemeExtension tokens'),
          actions: [
            IconButton(
              icon: const Icon(Icons.brightness_6),
              onPressed: () => setState(() => _mode =
                  _mode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light),
            ),
          ],
        ),
        // Builder: token reads must happen BELOW MaterialApp, where Theme is
        // in scope. Reading this.context here would silently hit fallbacks.
        body: Builder(
          builder: (context) {
            final BrandColors brand = context.brandColors;
            final BrandSpacing space = context.spacing;
            return Padding(
              padding: EdgeInsets.all(space.section),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _StatusCard(
                    background: brand.success,
                    foreground: brand.onSuccess,
                    icon: Icons.check_circle,
                    message: 'Deploy succeeded — lerps on theme toggle',
                  ),
                  SizedBox(height: space.gutter),
                  _StatusCard(
                    background: brand.warning,
                    foreground: brand.onWarning,
                    icon: Icons.warning_amber,
                    message: 'Disk usage at 82%',
                  ),
                  SizedBox(height: space.gutter),
                  Container(
                    padding: EdgeInsets.all(space.card),
                    decoration: BoxDecoration(
                      border: Border.all(color: brand.subtleBorder),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'subtleBorder token: alpha-based so it works over any '
                      'surface without per-brightness branching.',
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.background,
    required this.foreground,
    required this.icon,
    required this.message,
  });

  final Color background;
  final Color foreground;
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    final BrandSpacing space = context.spacing;
    return Container(
      padding: EdgeInsets.all(space.card),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: foreground),
          SizedBox(width: space.gutter),
          Expanded(
            child: Text(message, style: TextStyle(color: foreground)),
          ),
        ],
      ),
    );
  }
}

void main() {
  runApp(const TokensDemo());
}`,
    notes:
      "Implement lerp for real: ThemeData.lerp calls it every frame of a theme animation, and the lazy `return other` makes custom-colored surfaces SNAP while Material surfaces fade — the exact artifact that betrays a bolted-on token system. lerp receives the base ThemeExtension type and may get null or a foreign type, so the `is!` check is part of the contract. Theme.of(context).extension<T>() returns null when the extension isn't registered; centralize the fallback in one context-extension getter instead of null-checking at every call site. Register the brightness-matched instance per theme (light extension in theme:, dark in darkTheme:). Tokens must be read from a context BELOW MaterialApp (hence the Builder) or the lookups silently hit fallbacks. Mirror ColorScheme's on-color pairing so consumers never branch on brightness.",
  },
];
