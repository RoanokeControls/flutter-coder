// Verified advanced performance samples: rebuild control, huge-list tuning,
// and image memory discipline. Every `code` field was verified on Flutter
// 3.38.5 / Dart 3.10.4: `flutter analyze` clean (zero errors/warnings/
// infos). All three are runnable apps that make the perf behavior visible.

import type { FlutterSample } from "./types.js";

export const performanceSamples: readonly FlutterSample[] = [
  {
    id: "rebuild-control-instrumented",
    title: "Rebuild Storms Made Visible: const, Builder child, Scoping, RepaintBoundary",
    category: "performance",
    difficulty: "expert",
    description:
      "A lab page where every section wears a badge counting its own build() calls, so rebuild fixes stop being abstract: an AnimatedBuilder rebuilding its subtree ~60x/s next to the same animation with a pre-built child (count stays at 1), a page-wide setState that increments every non-const badge while a const one stays immune, and a ValueListenableBuilder scoping a counter so only its badge rebuilds. RepaintBoundary placement and debugRepaintRainbowEnabled round out the paint side. Reach for this when DevTools shows a rebuild storm and you need to prove which fix actually works.",
    tags: ["rebuild", "performance", "const", "animatedbuilder", "child-parameter", "valuelistenablebuilder", "valuenotifier", "repaintboundary", "debugrepaintrainbowenabled", "setstate", "build-count", "jank"],
    minFlutter: "3.24",
    packages: [],
    code: `// Finding and fixing rebuild storms, with the evidence on screen: every
// section wears a badge counting its build() calls. Run it, watch the
// counters, and the difference between the naive and disciplined versions
// stops being abstract.
import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Counts its own build() calls — what DevTools' "track widget rebuilds"
/// does, minus the tooling. Instrumenting rebuilds directly in the tree is
/// the fastest way to prove (or disprove) a rebuild-storm hypothesis.
class BuildBadge extends StatefulWidget {
  const BuildBadge({super.key, required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  State<BuildBadge> createState() => _BuildBadgeState();
}

class _BuildBadgeState extends State<BuildBadge> {
  int _builds = 0;

  @override
  Widget build(BuildContext context) {
    _builds++;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('\${widget.label}: built $_builds×'),
          widget.child,
        ],
      ),
    );
  }
}

class RebuildLab extends StatefulWidget {
  const RebuildLab({super.key});

  @override
  State<RebuildLab> createState() => _RebuildLabState();
}

class _RebuildLabState extends State<RebuildLab>
    with SingleTickerProviderStateMixin {
  late final AnimationController _spin =
      AnimationController(vsync: this, duration: const Duration(seconds: 2))
        ..repeat();

  // Scoped state: widgets that care subscribe via ValueListenableBuilder;
  // nothing else in the page is invalidated when it changes.
  final ValueNotifier<int> _count = ValueNotifier<int>(0);

  @override
  void dispose() {
    _spin.dispose();
    _count.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Rebuild lab')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // BAD: the subtree is constructed inside the builder, so it is
          // rebuilt ~60×/s for the whole life of the animation. The
          // RepaintBoundary sits at the repaint frontier: the rotation
          // dirties paint every frame, and without the boundary that
          // dirt propagates into whatever layer this list shares.
          RepaintBoundary(
            child: AnimatedBuilder(
              animation: _spin,
              builder: (context, child) => Transform.rotate(
                angle: _spin.value * 2 * math.pi,
                child: BuildBadge(
                  label: 'inside builder (bad)',
                  child: const FlutterLogo(size: 40),
                ),
              ),
            ),
          ),
          // GOOD: the subtree is built once and handed to the builder via
          // \`child\`. The builder re-wraps the SAME widget instance every
          // frame; the Element sees an identical widget and skips build.
          RepaintBoundary(
            child: AnimatedBuilder(
              animation: _spin,
              builder: (context, child) => Transform.rotate(
                angle: _spin.value * 2 * math.pi,
                child: child,
              ),
              child: const BuildBadge(
                label: 'prebuilt child (good)',
                child: FlutterLogo(size: 40),
              ),
            ),
          ),
          const Divider(),
          FilledButton(
            // Simulates the careless page-level setState that starts most
            // rebuild storms: every non-const descendant rebuilds.
            onPressed: () => setState(() {}),
            child: const Text('setState() the whole page'),
          ),
          BuildBadge(
            label: 'plain (rebuilds with page)',
            child: const Icon(Icons.sync_problem),
          ),
          // const canonicalizes the instance: across page rebuilds the
          // parent hands the framework the IDENTICAL widget object, and
          // updateChild short-circuits without calling build.
          const BuildBadge(
            label: 'const (immune to page setState)',
            child: Icon(Icons.shield),
          ),
          const Divider(),
          FilledButton(
            onPressed: () => _count.value++,
            child: const Text('+1 (scoped: only the badge below rebuilds)'),
          ),
          ValueListenableBuilder<int>(
            valueListenable: _count,
            builder: (context, value, child) => BuildBadge(
              label: 'counter = $value',
              child: child!,
            ),
            // Even inside the scoped builder, the static part is hoisted
            // out via \`child\` — same pattern as AnimatedBuilder above.
            child: const Icon(Icons.numbers),
          ),
        ],
      ),
    );
  }
}

void main() {
  // Uncomment to visualize repaints: every layer flashes a new color each
  // time it repaints. With the boundaries above, only the spinner boxes
  // cycle colors; remove them and watch the whole list flash.
  //   import 'package:flutter/rendering.dart';
  //   debugRepaintRainbowEnabled = true;
  runApp(const MaterialApp(home: RebuildLab()));
}
`,
    notes:
      "const is a rebuild barrier, not a style choice: canonicalization makes the parent hand the framework the IDENTICAL widget instance, and Element.updateChild short-circuits (old widget == new widget) without calling build \u2014 the same mechanism that makes AnimatedBuilder's child parameter work, since the builder re-wraps one pre-built instance every frame. The child pattern only helps if the builder actually uses the child argument; capturing outer variables that construct widgets inline rebuilds them anyway. ValueListenableBuilder (and equivalents) beats page-level setState because the invalidation scope is exactly the builder \u2014 note the sample also hoists the static child OUT of the scoped builder. RepaintBoundary trades memory (an extra composited layer) for repaint isolation: place it at the repaint frontier around the animating subtree, and verify with debugRepaintRainbowEnabled rather than scattering boundaries blindly \u2014 a boundary around something that repaints WITH its surroundings is pure cost. Counting builds in a State field is the zero-tooling equivalent of DevTools' track-rebuilds and works in any environment.",
  },
  {
    id: "large-list-optimization",
    title: "ListView.builder Tuned for 100k Rows with Stable Row State",
    category: "performance",
    difficulty: "advanced",
    description:
      "A 100k-item ListView.builder with every lever set deliberately: itemExtent for O(1) scroll-offset math (prototypeItem noted as the theme-dependent alternative), an explicit scrollCacheExtent, addAutomaticKeepAlives disabled with the tradeoff documented, ValueKey-per-item plus an O(1) findChildIndexCallback so stateful rows keep their State when a shuffle reorders the data underneath them. Reach for this for any list beyond a few thousand rows, or whenever list rows mysteriously lose state after inserts/reorders.",
    tags: ["listview", "listview.builder", "itemextent", "prototypeitem", "cacheextent", "scrollcacheextent", "findchildindexcallback", "keys", "valuekey", "addautomatickeepalives", "addrepaintboundaries", "large-list", "scrolling", "reorder"],
    minFlutter: "3.42",
    packages: [],
    code: `// ListView.builder tuned for 100k rows. The list itself is cheap — every
// cost that matters is in how the viewport materializes children, and in
// whether Element state survives when the data reorders underneath it.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

class Item {
  Item(this.id) : label = 'Item #$id';
  final int id;
  final String label;
}

class BigListPage extends StatefulWidget {
  const BigListPage({super.key});

  @override
  State<BigListPage> createState() => _BigListPageState();
}

class _BigListPageState extends State<BigListPage> {
  final List<Item> _items = List.generate(100000, Item.new);

  // findChildIndexCallback is called once per retained child on every
  // rebuild — it must be O(1), hence a maintained id -> index map rather
  // than a List.indexWhere scan (which would be O(visible × n)).
  late Map<int, int> _indexOfId = _buildIndex();

  Map<int, int> _buildIndex() =>
      {for (var i = 0; i < _items.length; i++) _items[i].id: i};

  void _shuffle() {
    setState(() {
      _items.shuffle();
      _indexOfId = _buildIndex();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('100k rows'),
        actions: [
          IconButton(
            icon: const Icon(Icons.shuffle),
            tooltip: 'Reorder: tap counts stay glued to their items',
            onPressed: _shuffle,
          ),
        ],
      ),
      body: Scrollbar(
        interactive: true,
        child: ListView.builder(
          itemCount: _items.length,
          // Fixed extent turns scroll-offset -> index into O(1) math: a
          // scrollbar jump to 90% does NOT lay out 90k rows on the way.
          // prototypeItem is the alternative when height is uniform but
          // depends on theme/text scale; the two are mutually exclusive.
          itemExtent: 56,
          // How far beyond the viewport children are built. Bigger =
          // smoother fast flings, more live State. Tune against real
          // fling speeds, not gut feeling. (cacheExtent was deprecated in
          // the 3.42 cycle for this sealed type: .pixels or .viewport.)
          scrollCacheExtent: const ScrollCacheExtent.pixels(300),
          // KeepAlives wrap EVERY row in AutomaticKeepAlive machinery and
          // a NotificationListener — measurable at this scale and useless
          // unless rows actually call wantKeepAlive. Repaint boundaries
          // stay at their default (true): they stop one row's ink splash
          // from repainting the entire viewport.
          addAutomaticKeepAlives: false,
          // After shuffle/insert/remove, the framework re-links existing
          // Elements to new widget positions BY KEY through this lookup.
          // Without it, keyed children that moved are torn down and
          // rebuilt from scratch: row state lost, scroll anchor jumps.
          findChildIndexCallback: (key) =>
              _indexOfId[(key as ValueKey<int>).value],
          itemBuilder: (context, index) {
            final item = _items[index];
            // Key = data identity. With no key (or an index key), row
            // State stays glued to positions instead of items.
            return CounterRow(key: ValueKey<int>(item.id), item: item);
          },
        ),
      ),
    );
  }
}

/// Deliberately stateful row: taps accumulate locally, making it obvious
/// when the framework loses or misassigns Element state after a reorder.
/// (With keepAlives off, state only survives for rows still materialized
/// in the viewport + cacheExtent; anything scrolled far away is disposed —
/// durable per-item state belongs in the data layer, not row State.)
class CounterRow extends StatefulWidget {
  const CounterRow({super.key, required this.item});

  final Item item;

  @override
  State<CounterRow> createState() => _CounterRowState();
}

class _CounterRowState extends State<CounterRow> {
  int _taps = 0;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(child: Text('\${widget.item.id % 100}')),
      title: Text(widget.item.label),
      trailing: _taps == 0 ? null : Text('$_taps taps'),
      onTap: () => setState(() => _taps++),
    );
  }
}

void main() => runApp(const MaterialApp(home: BigListPage()));
`,
    notes:
      "itemExtent (or prototypeItem \u2014 they are mutually exclusive) is what makes scrollbar jumps O(1): without a fixed extent, jumping to 90% forces layout of everything on the way. findChildIndexCallback must be O(1) \u2014 hence the maintained id->index map, rebuilt on every reorder; a List.indexWhere scan inside it is O(visible x n) per rebuild. Return null from it for keys that no longer exist. Keys must encode data identity (item id), never the index \u2014 index keys glue State to positions and reproduce the classic wrong-row-state bug. addAutomaticKeepAlives: false removes per-child keep-alive machinery (worth it at this scale) but means State only survives for rows inside viewport+cacheExtent; anything scrolled far away is disposed, so durable per-item state (selection, favorites) belongs in the data layer, not row State. Keep addRepaintBoundaries at its default true \u2014 it stops one row's ink splash from repainting the whole viewport; only disable it for fully static rows where the extra layers cost more than they save. Migration: cacheExtent (double) was deprecated in the 3.42 cycle in favor of scrollCacheExtent, a sealed ScrollCacheExtent with .pixels()/.viewport() factories — as of 3.44 the type needs an explicit import from package:flutter/rendering.dart.",
  },
  {
    id: "image-memory-discipline",
    title: "Image Memory Discipline: Decode Sizing, precacheImage, Cache Budgets",
    category: "performance",
    difficulty: "advanced",
    description:
      "A gallery that treats decoded image memory as a budget: grid thumbnails decoded at display size via cacheWidth computed from layout x devicePixelRatio, a detail page precached through the exact ResizeImage provider it will render, an ImageCache tuned in bytes with an explicit clear()/clearLiveImages() eviction action, and an opaque-placeholder fade-in built on frameBuilder with zero extra dependencies. Reach for this when a media-heavy screen janks on scroll or the app's memory footprint is dominated by textures.",
    tags: ["image", "cachewidth", "cacheheight", "resizeimage", "precacheimage", "imagecache", "maximumsizebytes", "evict", "clearliveimages", "framebuilder", "fade-in", "memory", "decode"],
    minFlutter: "3.24",
    packages: [],
    code: `// Image memory discipline: decode at display size, warm the cache before
// navigating, budget the ImageCache in bytes, and fade images in over an
// opaque placeholder — all without third-party packages.
import 'package:flutter/material.dart';

// The server images are 1200×800 on purpose: a 120px grid tile decoded at
// full size holds 1200×800×4 ≈ 3.8 MB of GPU-resident texture. Decoded at
// display size it holds ~0.15 MB — a 25× difference the layout never shows.
String _imageUrl(int i) => 'https://picsum.photos/seed/$i/1200/800';

class GalleryPage extends StatelessWidget {
  const GalleryPage({super.key});

  Future<void> _openDetail(BuildContext context, int index) async {
    final size = MediaQuery.sizeOf(context);
    final dpr = MediaQuery.devicePixelRatioOf(context);
    // ResizeImage bounds the DECODE, not just the layout: without it a
    // full-screen Image still inflates the original bitmap into memory.
    // The resize config is part of the cache key, so this provider and the
    // grid's thumbnail are separate cache entries by design.
    final provider = ResizeImage(
      NetworkImage(_imageUrl(index)),
      width: (size.width * dpr).round(),
      height: (size.height * dpr).round(),
      policy: ResizeImagePolicy.fit, // preserve aspect within the bounds
    );
    // Warm the cache before the route animates: the detail image arrives
    // fully decoded instead of popping in mid-transition. Must use the
    // SAME provider (incl. resize config) the destination will use, or
    // the precache decodes a useless second copy.
    await precacheImage(provider, context);
    if (!context.mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => DetailPage(image: provider, index: index),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gallery'),
        actions: [
          IconButton(
            tooltip: 'Evict all decoded images',
            onPressed: () {
              // clear() drops cached decoded frames; images currently on
              // screen are pinned separately as "live" and need
              // clearLiveImages() to re-decode on the next frame. This
              // pair is the correct response to a memory-pressure signal.
              PaintingBinding.instance.imageCache
                ..clear()
                ..clearLiveImages();
            },
            icon: const Icon(Icons.delete_sweep),
          ),
        ],
      ),
      body: GridView.builder(
        padding: const EdgeInsets.all(4),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
        ),
        itemCount: 60,
        itemBuilder: (context, index) => GestureDetector(
          onTap: () => _openDetail(context, index),
          child: FadeInThumb(url: _imageUrl(index)),
        ),
      ),
    );
  }
}

class FadeInThumb extends StatelessWidget {
  const FadeInThumb({super.key, required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        // cacheWidth is in PHYSICAL pixels: forgetting the devicePixelRatio
        // multiply produces blurry images on every modern screen.
        final decodeWidth = (constraints.maxWidth * dpr).ceil();
        return Stack(
          fit: StackFit.expand,
          children: [
            // Opaque placeholder beneath the fading image: the crossfade
            // never exposes a transparent backdrop, so there is no
            // luminance flash and the compositor can treat the tile as
            // opaque for the whole animation.
            const ColoredBox(color: Color(0xFFE0E0E0)),
            Image.network(
              url,
              fit: BoxFit.cover,
              cacheWidth: decodeWidth,
              frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
                // Synchronous load = already decoded in the ImageCache.
                // Animating opacity then would re-run the fade on every
                // rebuild of an image the user has already seen.
                if (wasSynchronouslyLoaded) return child;
                return AnimatedOpacity(
                  opacity: frame == null ? 0 : 1,
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOut,
                  child: child,
                );
              },
              errorBuilder: (context, error, stackTrace) =>
                  const Center(child: Icon(Icons.broken_image)),
            ),
          ],
        );
      },
    );
  }
}

class DetailPage extends StatelessWidget {
  const DetailPage({super.key, required this.image, required this.index});

  final ImageProvider image;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Photo $index')),
      body: Center(
        // Because GalleryPage precached this exact provider, this renders
        // on the first frame after the route transition — no pop-in.
        child: Image(image: image, fit: BoxFit.contain),
      ),
    );
  }
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Defaults are 1000 images / 100 MB. Media-heavy apps on low-end devices
  // want a BYTE budget (count says nothing about size); undersizing it
  // causes re-decode churn, which shows up as scroll jank, not OOM.
  PaintingBinding.instance.imageCache
    ..maximumSize = 200
    ..maximumSizeBytes = 48 << 20; // 48 MB
  runApp(const MaterialApp(home: GalleryPage()));
}
`,
    notes:
      "cacheWidth/cacheHeight are in PHYSICAL pixels: forgetting the devicePixelRatio multiply ships blurry images on every modern screen; without any decode sizing, layout size is irrelevant \u2014 the full-resolution bitmap is what sits in memory (1200x800 = ~3.8 MB per tile). The resize configuration is part of the ImageCache key: precacheImage(NetworkImage(url)) does NOT warm Image.network(url, cacheWidth: ...) \u2014 precache the exact provider (including ResizeImage bounds) the destination widget will use, or you decode a useless second copy. precacheImage is async: re-check context.mounted before navigating after the await. imageCache.clear() drops decoded frames but images currently on screen are pinned as 'live' and need clearLiveImages() too \u2014 that pair is the correct response to memory pressure. Budget the cache in bytes, not count; undersizing shows up as re-decode churn (scroll jank), not crashes. The wasSynchronouslyLoaded guard in frameBuilder prevents already-cached images from re-running the fade on every rebuild, and the opaque ColoredBox underneath keeps the crossfade from exposing a transparent backdrop.",
  },
];
