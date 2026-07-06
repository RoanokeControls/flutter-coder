// Verified advanced testing samples: pump discipline, goldens, Riverpod 3
// AsyncNotifier testing, and integration_test flows. Every `code` field was
// verified on Flutter 3.38.5 / Dart 3.10.4: `flutter analyze` clean (zero
// errors/warnings/infos); the widget, golden, and Riverpod files run green
// under `flutter test` (goldens baselined with --update-goldens first).
// These are complete test files: the first three live in test/, the
// integration flow lives in integration_test/.

import type { FlutterSample } from "./types.js";

export const testingSamples: readonly FlutterSample[] = [
  {
    id: "widget-test-pump-patterns",
    title: "Widget Test Pump Discipline: pump vs pumpAndSettle vs runAsync",
    category: "testing",
    difficulty: "advanced",
    description:
      "Five tests that pin down what each pump variant actually does: pump() to assert on a frozen loading state, pump(duration) to fast-forward fake time past timers, pumpAndSettle demonstrably timing out on an indefinite animation, and tester.runAsync escaping fake time for real async work. Dependencies are hand-rolled fakes (a Completer-driven repository) injected through a constructor and through an InheritedWidget scope \u2014 no mocking package. Reach for this file whenever a widget test hangs, times out, or can't catch a loading state.",
    tags: ["widget-test", "pump", "pumpandsettle", "runasync", "fake-async", "completer", "fake", "test-double", "inheritedwidget", "finder", "futurebuilder", "flutter_test"],
    minFlutter: "3.24",
    packages: [],
    code: `// Widget-test pump discipline: what pump(), pump(duration), pumpAndSettle,
// and runAsync each actually do — plus hand-rolled fakes injected through a
// constructor and an InheritedWidget, no mocking package required.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// --- Production code under test (inlined so the file is self-contained) ---

abstract interface class ProfileRepository {
  Future<String> loadDisplayName();
}

/// The DI seam for deep trees: screens far from the injection point read
/// the repository from context instead of threading it through every
/// constructor. Tests swap the whole subtree's dependency in one place.
class RepositoryScope extends InheritedWidget {
  const RepositoryScope({
    super.key,
    required this.repository,
    required super.child,
  });

  final ProfileRepository repository;

  static ProfileRepository of(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<RepositoryScope>()!
      .repository;

  @override
  bool updateShouldNotify(RepositoryScope oldWidget) =>
      repository != oldWidget.repository;
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.repository});

  final ProfileRepository repository;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final Future<String> _name;

  @override
  void initState() {
    super.initState();
    // Kick off in initState, not build: a Future created in build restarts
    // on every rebuild — a real bug this test structure would catch.
    _name = widget.repository.loadDisplayName();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Center(
        child: FutureBuilder<String>(
          future: _name,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Text('error: \${snapshot.error}', key: const Key('error'));
            }
            if (!snapshot.hasData) {
              return const CircularProgressIndicator();
            }
            return Text(snapshot.data!, key: const Key('name'));
          },
        ),
      ),
    );
  }
}

class HomeShell extends StatelessWidget {
  const HomeShell({super.key});

  @override
  Widget build(BuildContext context) =>
      ProfileScreen(repository: RepositoryScope.of(context));
}

// --- Hand-rolled fakes: full control over timing, zero codegen ---

/// Completes only when the test says so — freezes the UI in its loading
/// state for as long as the test needs to assert on it.
class ManualProfileRepository implements ProfileRepository {
  final Completer<String> _completer = Completer<String>();

  void complete(String name) => _completer.complete(name);

  @override
  Future<String> loadDisplayName() => _completer.future;
}

/// Timer-backed fake — exercises pump(duration) fast-forwarding.
class DelayedProfileRepository implements ProfileRepository {
  const DelayedProfileRepository(this.delay);

  final Duration delay;

  @override
  Future<String> loadDisplayName() =>
      Future<void>.delayed(delay).then((_) => 'Ada Lovelace');
}

void main() {
  testWidgets('pump() renders one frame — the loading state is assertable',
      (tester) async {
    final repo = ManualProfileRepository();
    await tester
        .pumpWidget(MaterialApp(home: ProfileScreen(repository: repo)));

    // First frame: future unresolved, spinner visible. pumpAndSettle here
    // would spin forever — you could never test this state with it.
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    repo.complete('Grace Hopper');
    // Completing the future queues a microtask + rebuild; one pump flushes
    // microtasks and draws exactly the next frame.
    await tester.pump();
    expect(find.byKey(const Key('name')), findsOneWidget);
    expect(find.text('Grace Hopper'), findsOneWidget);
  });

  testWidgets('pump(duration) fast-forwards fake time past timers',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: ProfileScreen(
        repository: DelayedProfileRepository(Duration(seconds: 3)),
      ),
    ));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    // Zero wall-clock wait: the test clock jumps 3s and fires the timer.
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(); // one more frame for the FutureBuilder rebuild
    expect(find.text('Ada Lovelace'), findsOneWidget);
  });

  testWidgets('pumpAndSettle times out on indefinite animations',
      (tester) async {
    final repo = ManualProfileRepository();
    await tester
        .pumpWidget(MaterialApp(home: ProfileScreen(repository: repo)));

    // CircularProgressIndicator animates until the future resolves, so
    // "settled" never happens. pumpAndSettle is only safe when every
    // animation on screen is finite — otherwise it burns its entire
    // timeout and fails the test with a confusing error.
    await expectLater(
      () => tester.pumpAndSettle(
        const Duration(milliseconds: 100),
        EnginePhase.sendSemanticsUpdate,
        const Duration(seconds: 2), // shortened timeout: fail fast
      ),
      throwsFlutterError,
    );

    repo.complete('done'); // resolve before teardown for a clean exit
    await tester.pump();
  });

  testWidgets('runAsync escapes fake time for real async work',
      (tester) async {
    // Inside the fake-async zone, real timers and real I/O never complete
    // (image decoding, compute(), platform channels backed by real work).
    // runAsync runs its body in the real zone, then hands control back.
    final result = await tester.runAsync(
      () => Future<String>.delayed(
        const Duration(milliseconds: 20),
        () => 'real',
      ),
    );
    expect(result, 'real');
  });

  testWidgets('fake injected via InheritedWidget reaches a deep screen',
      (tester) async {
    final repo = ManualProfileRepository()..complete('Grace Hopper');
    await tester.pumpWidget(
      RepositoryScope(
        repository: repo,
        child: const MaterialApp(home: HomeShell()),
      ),
    );
    await tester.pump();

    // Finder discipline: keys for test-critical nodes; descendant() to
    // scope text that could legitimately appear elsewhere (app bars,
    // tooltips); widgetWithText to bind text to its owning widget type.
    expect(find.byKey(const Key('name')), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(Center),
        matching: find.text('Grace Hopper'),
      ),
      findsOneWidget,
    );
    expect(find.widgetWithText(AppBar, 'Profile'), findsOneWidget);
  });
}
`,
    notes:
      "pumpAndSettle is only safe when every on-screen animation is finite: a CircularProgressIndicator (or shimmer) makes it burn its whole timeout and throw \u2014 the test here proves it with a shortened timeout and throwsFlutterError. Inside the fake-async zone real timers never fire, so Future.delayed needs pump(duration) to advance the test clock, and any timer still pending at test end fails the test ('A Timer is still pending') \u2014 resolve your fakes before teardown. tester.runAsync runs its body in the real zone (needed for image decoding, compute(), real I/O) but is much slower; don't call guarded pump APIs from inside its callback. Create futures in initState, not build \u2014 a future created in build restarts on every rebuild, and this test structure catches that bug. Completer-driven fakes beat mock frameworks for timing control: the test decides exactly when the future resolves.",
  },
  {
    id: "golden-test-workflow",
    title: "Golden Tests: Sizes, DPR, Theme Variants, and CI Tags",
    category: "testing",
    difficulty: "advanced",
    description:
      "A golden-test suite done right: a fully deterministic subject widget, one pump helper that owns tester.view.physicalSize/devicePixelRatio and guarantees reset via addTearDown, RepaintBoundary-scoped captures with matchesGoldenFile, baselines at phone/tablet widths, a 3x device-pixel-ratio capture, a dark-theme variant, and a file-level @Tags(['golden']) so CI can split the golden lane from the fast lane. Reach for this when standing up (or fixing) visual regression testing.",
    tags: ["golden-test", "matchesgoldenfile", "update-goldens", "tester.view", "physicalsize", "devicepixelratio", "addteardown", "tags", "repaintboundary", "visual-regression", "deterministic-fonts"],
    minFlutter: "3.24",
    packages: [],
    code: `// Golden tests done right: deterministic subjects, explicit surface sizes
// with guaranteed reset, per-widget capture via RepaintBoundary, and a tag
// so CI can run (or skip) the golden suite separately:
//   flutter test --tags golden --update-goldens   # rebaseline
//   flutter test --exclude-tags golden            # fast lane
@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The subject must be fully deterministic: fixed data, no DateTime.now(),
/// no network images, no Random. flutter_test already forces the
/// deterministic "FlutterTest" font and disables shadows
/// (debugDisableShadows), which is why goldens don't flake on text.
class ScoreCard extends StatelessWidget {
  const ScoreCard({
    super.key,
    required this.player,
    required this.score,
    required this.progress,
  });

  final String player;
  final int score;
  final double progress;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(child: Text(player.substring(0, 1))),
                const SizedBox(width: 12),
                Text(player, style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                Icon(Icons.emoji_events, color: scheme.primary),
              ],
            ),
            const SizedBox(height: 12),
            Text('$score points'),
            const SizedBox(height: 8),
            LinearProgressIndicator(value: progress), // fixed value: static
          ],
        ),
      ),
    );
  }
}

void main() {
  // One pump helper owns surface configuration so no test can forget the
  // reset: leaked physicalSize silently corrupts every later test file.
  Future<void> pumpCard(
    WidgetTester tester, {
    required Size logicalSize,
    double dpr = 1.0,
    Brightness brightness = Brightness.light,
  }) async {
    tester.view.physicalSize = logicalSize * dpr;
    tester.view.devicePixelRatio = dpr;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(
          colorSchemeSeed: Colors.indigo,
          brightness: brightness,
        ),
        home: Scaffold(
          body: Center(
            // The boundary is what gets captured: without it the nearest
            // ancestor boundary is snapshotted instead — usually the whole
            // screen, which makes goldens churn on unrelated changes.
            child: RepaintBoundary(
              child: ScoreCard(player: 'Ada', score: 4200, progress: 0.7),
            ),
          ),
        ),
      ),
    );
  }

  group('ScoreCard goldens', () {
    testWidgets('phone width', (tester) async {
      await pumpCard(tester, logicalSize: const Size(400, 320));
      await expectLater(
        find.byType(ScoreCard),
        matchesGoldenFile('goldens/score_card_phone.png'),
      );
    });

    testWidgets('tablet width', (tester) async {
      await pumpCard(tester, logicalSize: const Size(800, 320));
      await expectLater(
        find.byType(ScoreCard),
        matchesGoldenFile('goldens/score_card_tablet.png'),
      );
    });

    testWidgets('high-density (3x) capture', (tester) async {
      // The golden's pixel dimensions scale with dpr: this baseline is 3×
      // larger than the phone one. Catches density-dependent rendering
      // (hairline borders, image filtering) that 1x goldens miss.
      await pumpCard(tester, logicalSize: const Size(400, 320), dpr: 3.0);
      await expectLater(
        find.byType(ScoreCard),
        matchesGoldenFile('goldens/score_card_phone_3x.png'),
      );
    });

    testWidgets('dark theme', (tester) async {
      await pumpCard(
        tester,
        logicalSize: const Size(400, 320),
        brightness: Brightness.dark,
      );
      await expectLater(
        find.byType(ScoreCard),
        matchesGoldenFile('goldens/score_card_dark.png'),
      );
    });
  });
}
`,
    notes:
      "Goldens are renderer-specific: images generated on macOS will not byte-match Linux CI (anti-aliasing differs), so generate baselines on the OS that compares them \u2014 the golden tag exists precisely so CI can isolate that lane (declare the tag in dart_test.yaml or the runner warns). flutter test already forces the deterministic FlutterTest font and debugDisableShadows=true; if a design needs real fonts, load them with FontLoader in setUp or text renders in the test font. Always reset physicalSize/devicePixelRatio with addTearDown \u2014 a leaked surface size silently corrupts every later test in the file. Capture through a RepaintBoundary wrapped around the subject: matchesGoldenFile snapshots the NEAREST ancestor boundary, so without your own you golden the whole screen and every unrelated change churns the baseline. The golden's pixel dimensions are logical size \u00d7 dpr \u2014 the 3x capture is a 3x-larger PNG and catches density-dependent rendering (hairlines, image filtering). Rebaseline with flutter test --update-goldens, then re-run to confirm the comparison passes.",
  },
  {
    id: "riverpod-notifier-test",
    title: "Testing a Riverpod 3 AsyncNotifier: Container, Transitions, Overrides",
    category: "testing",
    difficulty: "expert",
    description:
      "Unit- and widget-level testing of a Riverpod 3 AsyncNotifier: a ProviderContainer with a fake repository override, container.listen(fireImmediately:) recording every AsyncValue transition (loading -> data, loading-with-previous-value during a mutation, AsyncError on failure), and a widget test swapping the same fake through ProviderScope overrides. Includes the Riverpod 3 retry gotcha and the loading-state carry-over semantics. Reach for this as the template for testing any AsyncNotifier-based feature.",
    tags: ["riverpod", "flutter_riverpod", "asyncnotifier", "providercontainer", "overrides", "asyncvalue", "listen", "fake", "widget-test", "retry", "providerscope", "state-transitions"],
    minFlutter: "3.29",
    packages: [{ name: "flutter_riverpod", version: "^3.3.2" }],
    code: `// Testing a Riverpod 3 AsyncNotifier at both levels: pure ProviderContainer
// unit tests that observe every AsyncValue transition, and a widget test
// that swaps the repository through ProviderScope overrides. No mocking
// package — a hand-rolled fake gives exact control and readable failures.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// --- Production code under test (inlined so the file is self-contained) ---

abstract interface class TodoRepository {
  Future<List<String>> fetchTodos();
  Future<void> addTodo(String title);
}

// Throwing placeholder: production main() and every test MUST override
// this, so a forgotten override fails loudly instead of hitting the network.
final todoRepositoryProvider = Provider<TodoRepository>(
  (ref) => throw UnimplementedError('override todoRepositoryProvider'),
);

class TodoListNotifier extends AsyncNotifier<List<String>> {
  @override
  Future<List<String>> build() => ref.watch(todoRepositoryProvider).fetchTodos();

  Future<void> add(String title) async {
    final repo = ref.read(todoRepositoryProvider);
    // Riverpod 3 carries the previous value into this AsyncLoading
    // automatically (copyWithPrevious is applied internally and is no
    // longer public API) — the old list stays readable during the save.
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await repo.addTodo(title);
      return repo.fetchTodos();
    });
  }
}

final todoListProvider =
    AsyncNotifierProvider<TodoListNotifier, List<String>>(TodoListNotifier.new);

class TodoScreen extends ConsumerWidget {
  const TodoScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todos = ref.watch(todoListProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Todos')),
      // add() puts the provider in a loading-with-previous-value state;
      // skipLoadingOnReload renders it with data() instead of flashing
      // the spinner over a list the user was just reading.
      body: todos.when(
        skipLoadingOnReload: true,
        data: (items) => ListView(
          children: [for (final t in items) ListTile(title: Text(t))],
        ),
        error: (error, stackTrace) => Center(child: Text('failed: $error')),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => ref.read(todoListProvider.notifier).add('walk dog'),
        child: const Icon(Icons.add),
      ),
    );
  }
}

// --- Fake ---

class FakeTodoRepository implements TodoRepository {
  FakeTodoRepository(List<String> seed) : _todos = List.of(seed);

  final List<String> _todos;
  Object? failWith;
  int fetchCount = 0;

  @override
  Future<List<String>> fetchTodos() async {
    fetchCount++;
    final error = failWith;
    if (error != null) throw error;
    return List.unmodifiable(_todos);
  }

  @override
  Future<void> addTodo(String title) async => _todos.add(title);
}

ProviderContainer makeContainer(FakeTodoRepository repo) {
  final container = ProviderContainer(
    overrides: [todoRepositoryProvider.overrideWithValue(repo)],
    // Riverpod 3 RETRIES failed providers with exponential backoff by
    // default. In tests that masks error states AND leaves a pending
    // timer, which fails the test — disable it.
    retry: (retryCount, error) => null,
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('TodoListNotifier (unit, ProviderContainer)', () {
    test('emits loading -> data through the fake repository', () async {
      final repo = FakeTodoRepository(['buy milk']);
      final container = makeContainer(repo);

      // Providers are lazy: listen() (not just read()) keeps the provider
      // alive and records every transition for the assertions below.
      final states = <AsyncValue<List<String>>>[];
      container.listen(
        todoListProvider,
        (previous, next) => states.add(next),
        fireImmediately: true,
      );

      expect(states.single, isA<AsyncLoading<List<String>>>());
      await container.read(todoListProvider.future);

      expect(states, hasLength(2));
      expect(states.last.requireValue, ['buy milk']);
      expect(repo.fetchCount, 1);
    });

    test('add() keeps previous data visible while saving', () async {
      final repo = FakeTodoRepository(['buy milk']);
      final container = makeContainer(repo);
      final states = <AsyncValue<List<String>>>[];
      container.listen(todoListProvider, (previous, next) => states.add(next));

      await container.read(todoListProvider.future);
      states.clear();

      await container.read(todoListProvider.notifier).add('walk dog');

      // Transition 1: loading, but the old list is still exposed —
      // Riverpod's automatic previous-state carry-over at work.
      expect(states.first.isLoading, isTrue);
      expect(states.first.value, ['buy milk']);
      // Transition 2: fresh data including the new item.
      expect(states.last.requireValue, ['buy milk', 'walk dog']);
    });

    test('repository failure surfaces as AsyncError', () async {
      final repo = FakeTodoRepository([])..failWith = StateError('boom');
      final container = makeContainer(repo);

      await expectLater(
        container.read(todoListProvider.future),
        throwsStateError,
      );
      expect(
        container.read(todoListProvider),
        isA<AsyncError<List<String>>>(),
      );
      // With the default retry this would keep incrementing in the
      // background; with retry disabled it stays at exactly one attempt.
      expect(repo.fetchCount, 1);
    });
  });

  group('TodoScreen (widget, ProviderScope overrides)', () {
    testWidgets('spinner -> list -> optimistic add', (tester) async {
      final repo = FakeTodoRepository(['buy milk']);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [todoRepositoryProvider.overrideWithValue(repo)],
          retry: (retryCount, error) => null,
          child: const MaterialApp(home: TodoScreen()),
        ),
      );

      // Frame 1: build() future still pending.
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // The fake completes in microtasks; one pump rebuilds with data.
      await tester.pump();
      expect(find.text('buy milk'), findsOneWidget);

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pump(); // start add(): previous list still visible
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await tester.pump(); // guard() resolves: new item present
      expect(find.text('walk dog'), findsOneWidget);
    });
  });
}
`,
    notes:
      "Riverpod 3 automatically RETRIES failed providers with exponential backoff: in tests this masks error states and leaves a pending retry timer that fails the test \u2014 pass retry: (count, error) => null to ProviderContainer AND ProviderScope wherever errors are exercised. copyWithPrevious is @internal in Riverpod 3; you don't need it \u2014 assigning state = const AsyncLoading() inside a notifier automatically carries the previous value forward, which the add() test asserts (isLoading true AND value still readable). In the UI, when(skipLoadingOnReload: true) is what renders that carried value instead of flashing a spinner during mutations. Providers are lazy and can be disposed between reads: use container.listen (not just read) to keep the provider alive and record transitions. A repository provider whose default body throws UnimplementedError makes a forgotten override fail loudly instead of hitting the network. Always addTearDown(container.dispose) \u2014 leaked containers keep notifiers alive across tests.",
  },
  {
    id: "integration-test-flow",
    title: "End-to-End Flow with package:integration_test",
    category: "testing",
    difficulty: "advanced",
    description:
      "A complete integration_test file driving a checkout journey \u2014 launch, scroll with real viewport physics, add items, navigate to cart, place the order, assert the confirmation \u2014 under IntegrationTestWidgetsFlutterBinding with the fullyLive frame policy. The app under test is inlined so the file is self-contained; real projects call app.main() instead. Reach for integration tests only where widget tests cannot go: plugin/platform-channel behavior, real engine rendering, release-mode timing, and true end-to-end journeys on device.",
    tags: ["integration_test", "integration-test", "e2e", "IntegrationTestWidgetsFlutterBinding", "framepolicy", "scrolluntilvisible", "device-testing", "checkout-flow", "pumpandsettle"],
    minFlutter: "3.24",
    packages: [{ name: "integration_test", version: "sdk: flutter" }],
    code: `// End-to-end flow with package:integration_test. Unlike widget tests, this
// runs against a REAL engine on a device/emulator — real GPU frames, real
// plugins, real platform channels, real scroll physics:
//   flutter test integration_test/app_flow_test.dart -d <device-id>
// This file lives in integration_test/ (not test/): the plain \`flutter
// test\` runner must not pick it up, and tooling looks for it there.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  // Swaps the fake-async test binding for one driving the live engine.
  // Reach for integration tests only where widget tests can't go: plugin
  // behavior, engine rendering, release-mode timing, true e2e journeys.
  // Everything else is 100× faster as a widget test.
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // fullyLive pumps frames continuously like a real app — needed when the
  // flow depends on wall-clock time (implicit animations, streams,
  // debounced search). The default only renders on explicit pumps.
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  group('checkout journey', () {
    testWidgets('browse -> add two items -> cart -> place order',
        (tester) async {
      // Real apps: call \`app.main()\` from package:your_app/main.dart so
      // the production bootstrap (DI, plugins, Firebase) runs for real.
      await tester.pumpWidget(const ShopApp());
      await tester.pumpAndSettle();

      expect(find.text('Gadget 0'), findsOneWidget);

      // Real viewport physics: scrollUntilVisible flings the actual
      // scrollable instead of teleporting the offset.
      await tester.scrollUntilVisible(find.text('Gadget 7'), 200);
      await tester.pumpAndSettle();

      Finder addButtonFor(String name) => find.descendant(
            of: find.widgetWithText(ListTile, name),
            matching: find.byIcon(Icons.add_shopping_cart),
          );

      await tester.tap(addButtonFor('Gadget 7'));
      await tester.pumpAndSettle();
      await tester.tap(addButtonFor('Gadget 6'));
      await tester.pumpAndSettle();

      expect(find.text('2'), findsOneWidget); // cart badge

      await tester.tap(find.byIcon(Icons.shopping_cart));
      await tester.pumpAndSettle();

      expect(find.text('Gadget 7'), findsOneWidget);
      expect(find.text('Gadget 6'), findsOneWidget);

      await tester.tap(find.text('Place order'));
      await tester.pumpAndSettle();

      expect(find.text('Order placed'), findsOneWidget);
    });
  });
}

// --- App under test (inlined; real projects import their app package) ---

class ShopApp extends StatefulWidget {
  const ShopApp({super.key});

  @override
  State<ShopApp> createState() => _ShopAppState();
}

class _ShopAppState extends State<ShopApp> {
  final List<String> _cart = [];

  void _add(String name) => setState(() => _cart.add(name));

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          appBar: AppBar(
            title: const Text('Shop'),
            actions: [
              if (_cart.isNotEmpty)
                Center(child: Text('\${_cart.length}')),
              IconButton(
                icon: const Icon(Icons.shopping_cart),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => CartPage(items: _cart),
                  ),
                ),
              ),
            ],
          ),
          body: ListView.builder(
            itemCount: 12,
            itemExtent: 72,
            itemBuilder: (context, index) {
              final name = 'Gadget $index';
              return ListTile(
                title: Text(name),
                trailing: IconButton(
                  icon: const Icon(Icons.add_shopping_cart),
                  onPressed: () => _add(name),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class CartPage extends StatelessWidget {
  const CartPage({super.key, required this.items});

  final List<String> items;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cart')),
      body: ListView(
        children: [for (final item in items) ListTile(title: Text(item))],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const ConfirmationPage(),
              ),
            ),
            child: const Text('Place order'),
          ),
        ),
      ),
    );
  }
}

class ConfirmationPage extends StatelessWidget {
  const ConfirmationPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: Text('Order placed')),
    );
  }
}
`,
    notes:
      "This file lives in integration_test/ (NOT test/) and runs with 'flutter test integration_test/app_flow_test.dart -d <device-id>' against a real device or emulator; the plain flutter test runner must not pick it up. integration_test is an SDK package: add it as a dev dependency with 'flutter pub add dev:integration_test --sdk=flutter'. framePolicy = fullyLive pumps frames continuously like a real app \u2014 required when flows depend on wall-clock time (implicit animations, debounce); the default only renders on explicit pumps. Because animations really run, pumpAndSettle after every interaction. Everything a widget test CAN cover runs ~100x faster there \u2014 keep integration suites small and journey-shaped. For screenshots use binding.takeScreenshot (Android/iOS, driven via 'flutter drive' with a baseline driver script); for native automation beyond Flutter's reach (permission dialogs, notifications, other apps) look at the patrol package.",
  },
];
