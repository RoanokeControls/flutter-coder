// Verified advanced samples: architecture (state management, error
// architecture, offline-first data). Every `code` field compiled clean under
// flutter analyze on Flutter 3.38.5 / Dart 3.10.4; pure-Dart samples were also
// executed. See scripts/ for the re-verification harness.

import type { FlutterSample } from "./types.js";

export const architectureSamples: readonly FlutterSample[] = [
  {
    id: "riverpod3-feature-architecture",
    title: "Riverpod 3 Feature Slice: AsyncNotifier, Repository Seam, Test Overrides",
    category: "architecture",
    difficulty: "advanced",
    description:
      "A complete vertical feature slice in Riverpod 3: a repository behind a Provider, an AsyncNotifier whose build() wires dependencies with ref.watch, mutation methods that funnel through AsyncValue.guard, derived state in a computed provider, and a UI consuming it all with when(). Reach for this shape for any networked CRUD feature -- the repository provider is the single override point that makes the whole slice testable via ProviderScope overrides, no mocking framework required.",
    tags: ["riverpod", "riverpod-3", "asyncnotifier", "asyncvalue", "state-management", "dependency-injection", "provider-override", "repository-pattern", "feature-slice", "testing"],
    minFlutter: "3.29",
    packages: [
      { name: "flutter_riverpod", version: "^3.3.2" },
    ],
    code: `// Riverpod 3 feature slice: data -> application -> presentation in one file.
// The layering matters more than the file count: widgets only touch providers,
// providers only touch the repository interface, and that interface is the
// seam where tests substitute fakes via ProviderScope overrides.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// --- Domain ------------------------------------------------------------------

class Article {
  const Article({required this.id, required this.title, this.starred = false});

  final int id;
  final String title;
  final bool starred;

  Article copyWith({bool? starred}) =>
      Article(id: id, title: title, starred: starred ?? this.starred);
}

// --- Data layer ----------------------------------------------------------------

abstract interface class ArticleRepository {
  Future<List<Article>> fetchAll();
  Future<void> setStarred(int id, bool starred);
}

/// Production implementation. Latency is simulated; swap the internals for a
/// real HTTP client without touching anything below this class.
class RemoteArticleRepository implements ArticleRepository {
  final Map<int, Article> _server = {
    for (var i = 1; i <= 5; i++) i: Article(id: i, title: 'Article #$i'),
  };

  @override
  Future<List<Article>> fetchAll() async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return _server.values.toList(growable: false);
  }

  @override
  Future<void> setStarred(int id, bool starred) async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    final current = _server[id];
    if (current == null) throw StateError('No article $id');
    _server[id] = current.copyWith(starred: starred);
  }
}

/// The repository seam. Tests override this provider instead of mocking the
/// notifier, so the mutation logic itself stays under test.
final articleRepositoryProvider = Provider<ArticleRepository>((ref) {
  return RemoteArticleRepository();
});

// --- Application layer ----------------------------------------------------------

class ArticleListNotifier extends AsyncNotifier<List<Article>> {
  @override
  Future<List<Article>> build() async {
    // watch, not read: if the repository provider is overridden or
    // invalidated, this notifier rebuilds against the new dependency.
    final repo = ref.watch(articleRepositoryProvider);
    return repo.fetchAll();
  }

  Future<void> toggleStar(int id) async {
    final repo = ref.read(articleRepositoryProvider);
    final articles = state.value;
    if (articles == null) return; // nothing loaded yet; ignore the tap

    final target = articles.firstWhere((a) => a.id == id);

    // Riverpod 3 merges the previous state into every manual \`state =\` set,
    // so this AsyncLoading keeps the current list available via state.value
    // (the 2.x copyWithPrevious dance is now internal and automatic).
    state = const AsyncLoading();

    // AsyncValue.guard turns thrown exceptions into AsyncError, so the
    // widget layer never needs try/catch around mutations.
    state = await AsyncValue.guard(() async {
      await repo.setStarred(id, !target.starred);
      return [
        for (final a in articles)
          a.id == id ? a.copyWith(starred: !a.starred) : a,
      ];
    });
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(articleRepositoryProvider).fetchAll(),
    );
  }
}

final articleListProvider =
    AsyncNotifierProvider<ArticleListNotifier, List<Article>>(
  ArticleListNotifier.new,
);

/// Derived state lives in providers, not widgets: this recomputes only when
/// the article list changes, and its watchers rebuild only when the count
/// itself changes.
final starredCountProvider = Provider<int>((ref) {
  final articles = ref.watch(articleListProvider).value ?? const <Article>[];
  return articles.where((a) => a.starred).length;
});

// --- Presentation -----------------------------------------------------------------

class ArticleListScreen extends ConsumerWidget {
  const ArticleListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final articles = ref.watch(articleListProvider);
    final starred = ref.watch(starredCountProvider);

    return Scaffold(
      appBar: AppBar(title: Text('Articles ($starred starred)')),
      body: articles.when(
        // Pairs with copyWithPrevious above: reloads keep stale data on
        // screen instead of flashing the loading branch.
        skipLoadingOnReload: true,
        data: (items) => RefreshIndicator(
          onRefresh: () => ref.read(articleListProvider.notifier).refresh(),
          child: ListView(
            children: [
              for (final article in items)
                ListTile(
                  title: Text(article.title),
                  trailing: IconButton(
                    icon: Icon(
                      article.starred ? Icons.star : Icons.star_border,
                    ),
                    onPressed: () => ref
                        .read(articleListProvider.notifier)
                        .toggleStar(article.id),
                  ),
                ),
            ],
          ),
        ),
        error: (error, stackTrace) => Center(child: Text('Failed: $error')),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

// --- Test seam ---------------------------------------------------------------------

/// Instant, deterministic repository for widget tests and previews.
class FakeArticleRepository implements ArticleRepository {
  final Map<int, Article> _data = {
    1: const Article(id: 1, title: 'Fake article'),
  };

  @override
  Future<List<Article>> fetchAll() async => _data.values.toList();

  @override
  Future<void> setStarred(int id, bool starred) async {
    _data[id] = _data[id]!.copyWith(starred: starred);
  }
}

/// What a widget test pumps: the same tree with the data layer swapped out.
/// No network, no delays, no mocking framework.
Widget buildTestHarness() {
  return ProviderScope(
    overrides: [
      articleRepositoryProvider.overrideWithValue(FakeArticleRepository()),
    ],
    child: const MaterialApp(home: ArticleListScreen()),
  );
}

void main() {
  runApp(const ProviderScope(child: MaterialApp(home: ArticleListScreen())));
}`,
    notes:
      "Riverpod 3 is Notifier/AsyncNotifier-first: StateNotifierProvider still exists but only under the legacy import, so new code should look like this. Do not call copyWithPrevious yourself -- it is @internal in 3.x and the analyzer flags it; setting state = AsyncLoading() inside a notifier now merges the previous value automatically, which is what keeps the list on screen during toggleStar. when(skipLoadingOnReload: true) is the UI half of that contract. Riverpod 3 also retries failed build() calls automatically with exponential backoff (~200ms doubling toward 6.4s); tune or disable via ProviderScope(retry: ...) if your error UI seems to flicker between error and loading. Use ref.watch for dependencies inside build() and ref.read inside mutation methods -- watching from a callback rebuilds the notifier mid-mutation.",
  },
  {
    id: "bloc-concurrency-advanced",
    title: "Bloc 9 + bloc_concurrency: Restartable Search, Droppable Submit, Persisted State",
    category: "architecture",
    difficulty: "advanced",
    description:
      "flutter_bloc 9 with per-event concurrency policies from bloc_concurrency: a debounced-then-restartable search pipeline that cancels stale requests (search-as-you-type without the stale-response race), a droppable save that ignores double-submits, sealed event/state hierarchies that make the BlocBuilder switch exhaustive, onTransition plus a global BlocObserver for observability, and a hydrated_bloc-style restore stub behind a StateStore interface with no extra dependency. Reach for it when ordering and cancellation semantics -- not state shape -- are the hard part of a screen.",
    tags: ["bloc", "flutter-bloc", "bloc-concurrency", "restartable", "droppable", "debounce", "event-transformer", "sealed-classes", "hydrated-bloc", "search", "state-management"],
    minFlutter: "3.10",
    packages: [
      { name: "flutter_bloc", version: "^9.1.1" },
      { name: "bloc_concurrency", version: "^0.3.0" },
    ],
    code: `// flutter_bloc 9 + bloc_concurrency: transformers decide the concurrency story
// per event type, instead of debounce timers and "is loading" guards in the UI.
import 'dart:async';

import 'package:bloc_concurrency/bloc_concurrency.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

// --- Events (sealed: the compiler knows every case) ----------------------------

sealed class SearchEvent {
  const SearchEvent();
}

final class QueryChanged extends SearchEvent {
  const QueryChanged(this.query);
  final String query;
}

final class SearchSaved extends SearchEvent {
  const SearchSaved();
}

// --- States ----------------------------------------------------------------------

sealed class SearchState {
  const SearchState();
}

final class SearchIdle extends SearchState {
  const SearchIdle();
}

final class SearchLoading extends SearchState {
  const SearchLoading(this.query);
  final String query;
}

final class SearchLoaded extends SearchState {
  const SearchLoaded(this.query, this.results, {this.saving = false});
  final String query;
  final List<String> results;
  final bool saving;
  SearchLoaded copyWith({bool? saving}) =>
      SearchLoaded(query, results, saving: saving ?? this.saving);
}

final class SearchError extends SearchState {
  const SearchError(this.message);
  final String message;
}

// --- Event transformers ------------------------------------------------------------

/// bloc_concurrency ships no debounce, so compose one: the timer collapses
/// keystroke bursts, then restartable cancels any in-flight handler when a
/// survivor arrives. debounce AFTER restartable would fetch per keystroke.
EventTransformer<E> debounceRestartable<E>(Duration duration) {
  return (events, mapper) => restartable<E>()(_debounce(events, duration), mapper);
}

Stream<E> _debounce<E>(Stream<E> input, Duration duration) {
  StreamSubscription<E>? sub;
  Timer? timer;
  late final StreamController<E> controller;
  controller = StreamController<E>(
    onListen: () {
      sub = input.listen(
        (event) {
          timer?.cancel();
          timer = Timer(duration, () => controller.add(event));
        },
        onError: controller.addError,
        onDone: () {
          timer?.cancel();
          controller.close();
        },
      );
    },
    onPause: () => sub?.pause(),
    onResume: () => sub?.resume(),
    onCancel: () {
      timer?.cancel();
      return sub?.cancel();
    },
  );
  return controller.stream;
}

// --- Hydrated-style persistence stub -------------------------------------------------

/// The contract hydrated_bloc implements (persist on transition, rehydrate in
/// the constructor) without the storage dependency.
abstract interface class StateStore {
  Map<String, Object?>? read(String key);
  void write(String key, Map<String, Object?> json);
}

class InMemoryStateStore implements StateStore {
  final _data = <String, Map<String, Object?>>{};
  @override
  Map<String, Object?>? read(String key) => _data[key];
  @override
  void write(String key, Map<String, Object?> json) => _data[key] = json;
}

// --- Bloc -----------------------------------------------------------------------------

class SearchApi {
  Future<List<String>> search(String query) async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (query == 'crash') throw Exception('backend 500');
    return List.generate(5, (i) => '$query result \${i + 1}');
  }

  Future<void> saveSearch(String query) =>
      Future<void>.delayed(const Duration(milliseconds: 800));
}

class SearchBloc extends Bloc<SearchEvent, SearchState> {
  SearchBloc({required this.api, required this.store})
      : super(_restore(store) ?? const SearchIdle()) {
    // restartable: a new keystroke cancels the in-flight search, so a slow
    // stale response can never overwrite fresh results (the classic race).
    on<QueryChanged>(
      _onQueryChanged,
      transformer: debounceRestartable(const Duration(milliseconds: 300)),
    );
    // droppable: while a save runs, further submits are silently ignored --
    // double-tap protection without button-disabling logic in the UI.
    on<SearchSaved>(_onSaved, transformer: droppable());
  }

  final SearchApi api;
  final StateStore store;

  static SearchState? _restore(StateStore store) {
    final json = store.read('search');
    final query = json?['query'];
    final results = json?['results'];
    if (query is! String || results is! List) return null;
    return SearchLoaded(query, results.cast<String>());
  }

  Map<String, Object?>? _toJson(SearchState state) => switch (state) {
        SearchLoaded(:final query, :final results) =>
          {'query': query, 'results': results},
        _ => null, // transient states are not worth restoring
      };

  @override
  void onTransition(Transition<SearchEvent, SearchState> transition) {
    // Call super first or the global BlocObserver goes silent for this bloc.
    super.onTransition(transition);
    final json = _toJson(transition.nextState);
    if (json != null) store.write('search', json);
  }

  Future<void> _onQueryChanged(
      QueryChanged event, Emitter<SearchState> emit) async {
    if (event.query.isEmpty) {
      emit(const SearchIdle());
      return;
    }
    emit(SearchLoading(event.query));
    try {
      final results = await api.search(event.query);
      // Safe under restartable: emit() on a cancelled handler is a no-op. But
      // code after the await still RUNS, so keep it idempotent.
      emit(SearchLoaded(event.query, results));
    } catch (e) {
      emit(SearchError('Search failed: $e'));
    }
  }

  Future<void> _onSaved(SearchSaved event, Emitter<SearchState> emit) async {
    final current = state;
    if (current is! SearchLoaded || current.saving) return;
    emit(current.copyWith(saving: true));
    await api.saveSearch(current.query);
    emit(current.copyWith(saving: false));
  }
}

/// Global observability: onTransition here sees every bloc in the app.
class AppBlocObserver extends BlocObserver {
  const AppBlocObserver();

  @override
  void onTransition(
      Bloc<dynamic, dynamic> bloc, Transition<dynamic, dynamic> transition) {
    super.onTransition(bloc, transition);
    debugPrint('\${bloc.runtimeType}: \${transition.event.runtimeType} '
        '-> \${transition.nextState.runtimeType}');
  }
}

// --- UI ------------------------------------------------------------------------------------

class SearchScreen extends StatelessWidget {
  const SearchScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: Column(
        children: [
          TextField(
            decoration: const InputDecoration(hintText: 'Type to search'),
            onChanged: (q) => context.read<SearchBloc>().add(QueryChanged(q)),
          ),
          Expanded(
            child: BlocBuilder<SearchBloc, SearchState>(
              // Exhaustive: a new state class is a compile error here.
              builder: (context, state) => switch (state) {
                SearchIdle() => const Center(child: Text('Start typing')),
                SearchLoading(:final query) =>
                  Center(child: Text('Searching "$query"...')),
                SearchError(:final message) => Center(child: Text(message)),
                SearchLoaded(:final results, :final saving) => ListView(
                    children: [
                      for (final r in results) ListTile(title: Text(r)),
                      TextButton(
                        onPressed: () =>
                            context.read<SearchBloc>().add(const SearchSaved()),
                        child: Text(saving ? 'Saving...' : 'Save this search'),
                      ),
                    ],
                  ),
              },
            ),
          ),
        ],
      ),
    );
  }
}

void main() {
  Bloc.observer = const AppBlocObserver();
  runApp(MaterialApp(
    home: BlocProvider(
      create: (_) => SearchBloc(api: SearchApi(), store: InMemoryStateStore()),
      child: const SearchScreen(),
    ),
  ));
}`,
    notes:
      "Transformer composition order matters: debounce must run BEFORE restartable (collapse the keystroke burst first, then cancel in-flight work for the survivor) -- composed the other way you still fire one fetch per keystroke. Under restartable, emit() on a cancelled handler is a silent no-op rather than an error, but non-emit side effects after the await still execute, so keep anything non-idempotent out of restartable handlers. The default on<E>() transformer in bloc 8/9 is concurrent, not sequential -- a common surprise when porting pre-7.2 code. Call super.onTransition first in the override or the global BlocObserver goes silent for that bloc. The StateStore stub deliberately persists only SearchLoaded: rehydrating transient loading/error states is the classic hydrated_bloc footgun.",
  },
  {
    id: "sealed-result-error-handling",
    title: "Sealed Result/AppException Pipeline with Retry Policy and Zone-Level Crash Wiring",
    category: "architecture",
    difficulty: "advanced",
    description:
      "An end-to-end typed error architecture: a sealed AppException taxonomy, a sealed Result<T, E> returned by the repository so raw exceptions stop at the data boundary, a retry policy that backs off exponentially and only retries failures that declare themselves retryable, exhaustive pattern-matched error UI, and last-resort wiring of FlutterError.onError, PlatformDispatcher.onError, and runZonedGuarded. Reach for it when catch-and-toast error handling has started appearing in review comments and you want the compiler to enforce failure UX.",
    tags: ["result-type", "sealed-classes", "error-handling", "appexception", "retry", "exponential-backoff", "runzonedguarded", "fluttererror", "platformdispatcher", "crash-reporting", "pattern-matching"],
    minFlutter: "3.10",
    packages: [],
    code: `// Result/AppException architecture: failures are typed values, not thrown
// surprises. Exceptions stop at the repository boundary; everything above it
// pattern-matches on sealed classes and the compiler enforces exhaustiveness.
import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

// --- Failure taxonomy ---------------------------------------------------------

/// Sealed so every consumer must handle every case. Adding a new failure
/// type breaks the build at each switch -- that is the point.
sealed class AppException implements Exception {
  const AppException(this.message);
  final String message;
}

final class NetworkException extends AppException {
  const NetworkException(super.message, {this.retryable = true});
  final bool retryable;
}

final class AuthException extends AppException {
  const AuthException(super.message);
}

final class ParseException extends AppException {
  const ParseException(super.message);
}

/// Catch-all for defects. Carries the original error for crash reporting.
final class UnexpectedException extends AppException {
  const UnexpectedException(super.message, this.cause);
  final Object cause;
}

// --- Result ----------------------------------------------------------------------

sealed class Result<T, E extends AppException> {
  const Result();

  Result<R, E> map<R>(R Function(T value) transform) => switch (this) {
        Ok<T, E>(:final value) => Ok(transform(value)),
        Err<T, E>(:final error) => Err(error),
      };

  T getOrElse(T Function(E error) orElse) => switch (this) {
        Ok<T, E>(:final value) => value,
        Err<T, E>(:final error) => orElse(error),
      };
}

final class Ok<T, E extends AppException> extends Result<T, E> {
  const Ok(this.value);
  final T value;
}

final class Err<T, E extends AppException> extends Result<T, E> {
  const Err(this.error);
  final E error;
}

// --- Retry policy -----------------------------------------------------------------

/// Retries only failures that declare themselves retryable, with exponential
/// backoff plus jitter. Retrying auth or parse failures would hammer the
/// backend with requests that can never succeed.
Future<Result<T, AppException>> withRetry<T>(
  Future<Result<T, AppException>> Function() operation, {
  int maxAttempts = 3,
  Duration baseDelay = const Duration(milliseconds: 200),
}) async {
  final random = Random();
  for (var attempt = 1; ; attempt++) {
    final result = await operation();
    final retry = switch (result) {
      Ok() => false,
      Err(:final error) =>
        error is NetworkException && error.retryable && attempt < maxAttempts,
    };
    if (!retry) return result;
    final backoff = baseDelay * (1 << (attempt - 1));
    final jitter = Duration(milliseconds: random.nextInt(100));
    await Future<void>.delayed(backoff + jitter);
  }
}

// --- Repository: the exception -> Result boundary ------------------------------------

class QuoteRepository {
  QuoteRepository(this._random);

  final Random _random;

  /// Repositories catch at the boundary and return typed failures. Nothing
  /// above this layer ever sees a raw exception from the transport.
  Future<Result<String, AppException>> fetchQuote() async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    try {
      return Ok(_flakyTransport());
    } on TimeoutException {
      return const Err(NetworkException('Request timed out'));
    } on FormatException catch (e) {
      return Err(ParseException('Bad payload: \${e.message}'));
    } catch (e) {
      return Err(UnexpectedException('Quote fetch failed', e));
    }
  }

  String _flakyTransport() {
    final roll = _random.nextInt(4);
    if (roll == 0) throw TimeoutException('simulated timeout');
    if (roll == 1) throw const FormatException('unexpected token');
    return 'Simplicity is the soul of efficiency. (#\${_random.nextInt(100)})';
  }
}

// --- UI: exhaustive mapping ------------------------------------------------------------

class QuoteScreen extends StatefulWidget {
  const QuoteScreen({super.key});

  @override
  State<QuoteScreen> createState() => _QuoteScreenState();
}

class _QuoteScreenState extends State<QuoteScreen> {
  final _repo = QuoteRepository(Random());
  Result<String, AppException>? _result; // null = request in flight

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _result = null);
    final result = await withRetry(_repo.fetchQuote);
    if (!mounted) return;
    setState(() => _result = result);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Typed failures')),
      body: Center(
        child: switch (_result) {
          null => const CircularProgressIndicator(),
          Ok(:final value) => Padding(
              padding: const EdgeInsets.all(24),
              child: Text(value, textAlign: TextAlign.center),
            ),
          Err(:final error) => _FailureView(error: error, onRetry: _load),
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _load,
        child: const Icon(Icons.refresh),
      ),
    );
  }
}

class _FailureView extends StatelessWidget {
  const _FailureView({required this.error, required this.onRetry});

  final AppException error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    // A new AppException subtype fails compilation here, so error UX can
    // never silently lag behind the failure taxonomy.
    final (icon, text) = switch (error) {
      NetworkException() => (Icons.wifi_off, 'Network trouble: \${error.message}'),
      AuthException() => (Icons.lock, 'Please sign in again'),
      ParseException() => (Icons.report, 'Server sent something unreadable'),
      UnexpectedException(:final cause) => (Icons.bug_report, 'Bug: $cause'),
    };
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 48),
        const SizedBox(height: 12),
        Text(text),
        const SizedBox(height: 12),
        OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    );
  }
}

// --- Last-resort handlers ------------------------------------------------------------------

void _report(Object error, StackTrace stack) {
  // Ship to Crashlytics/Sentry here. Deduplicate upstream: more than one of
  // these hooks can observe the same failure depending on where it escaped.
  debugPrint('REPORT: $error');
}

void main() {
  runZonedGuarded(() {
    // The binding MUST be created inside the guarded zone. Creating it
    // outside (e.g. a stray ensureInitialized above runZonedGuarded) parks
    // the framework in the root zone and this handler never fires.
    WidgetsFlutterBinding.ensureInitialized();

    // Errors the framework catches itself: build, layout, paint.
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      _report(details.exception, details.stack ?? StackTrace.current);
    };

    // Uncaught async errors that reach the platform dispatcher (Flutter 3.3+).
    // Returning true marks them handled so they do not double-report.
    WidgetsBinding.instance.platformDispatcher.onError = (error, stack) {
      _report(error, stack);
      return true;
    };

    runApp(const MaterialApp(home: QuoteScreen()));
  }, _report); // whatever escapes both hooks above lands here
}`,
    notes:
      "WidgetsFlutterBinding.ensureInitialized() must run INSIDE the runZonedGuarded callback -- created outside, the binding lives in the root zone and the guarded handler never fires (debug builds warn about the zone mismatch). Since Flutter 3.3, uncaught async/platform errors route to PlatformDispatcher.onError rather than the surrounding zone, so wire both and return true from onError to mark errors handled. FlutterError.onError only sees framework-caught errors (build/layout/paint). The retry helper consults the failure type: retrying AuthException or ParseException can never succeed and just hammers the backend. Because Err carries the sealed error, every switch over Result or AppException is compiler-checked -- adding a failure type breaks each consumer's build, which is the feature, not a bug.",
  },
  {
    id: "offline-first-repository",
    title: "Offline-First Repository: Stale-While-Revalidate, ETag Merge, Connectivity-Aware Sync",
    category: "architecture",
    difficulty: "expert",
    description:
      "A repository layering an in-memory hot cache over abstracted persistence and network ports: watchAll() emits cached data instantly and then revalidates (stale-while-revalidate), refresh() does an ETag round-trip with last-writer-wins merging on server timestamps, offline saves queue in an outbox, and a connectivity port triggers automatic sync on reconnect. All ports have in-file fakes so the pattern runs standalone -- swap them for drift/dio/connectivity_plus in production. Reach for it when a feature must keep working in airplane mode and reconcile afterwards.",
    tags: ["offline-first", "repository-pattern", "stale-while-revalidate", "etag", "cache", "sync", "conflict-resolution", "connectivity", "outbox", "streams", "hexagonal-architecture"],
    minFlutter: "3.10",
    packages: [],
    code: `// Offline-first repository: stale-while-revalidate over abstracted storage,
// network, and connectivity ports. The fakes at the bottom make this file
// self-contained; production swaps them for drift/dio/connectivity_plus
// without touching the repository.
import 'dart:async';
import 'dart:io';

// --- Domain -----------------------------------------------------------------

class Note {
  const Note({required this.id, required this.body, required this.updatedAt});

  final String id;
  final String body;
  final DateTime updatedAt;

  @override
  String toString() => '$id:"$body"';
}

// --- Ports (the seams) -----------------------------------------------------------

/// Persistence port. Real apps back this with sqflite/drift/hive; the
/// repository never knows which.
abstract interface class NoteStore {
  Future<List<Note>> readAll();
  Future<void> upsertAll(List<Note> notes);
  Future<String?> readEtag();
  Future<void> writeEtag(String? etag);
}

/// Network port. fetch returns null when the server answers 304 Not Modified
/// for the presented ETag: the cache is already current, skip the merge.
abstract interface class NoteApi {
  Future<RemoteSnapshot?> fetch({String? etag});
  Future<Note> push(Note note);
}

class RemoteSnapshot {
  const RemoteSnapshot(this.notes, this.etag);
  final List<Note> notes;
  final String etag;
}

abstract interface class ConnectivityMonitor {
  bool get isOnline;
  Stream<bool> get changes;
}

// --- Repository --------------------------------------------------------------------

class OfflineFirstNoteRepository {
  OfflineFirstNoteRepository({
    required this.store,
    required this.api,
    required this.connectivity,
  }) {
    // Connectivity-aware refresh: a regained connection flushes the outbox
    // and pulls the latest snapshot without anyone asking.
    _connectivitySub = connectivity.changes.listen((online) {
      if (online) unawaited(refresh());
    });
  }

  final NoteStore store;
  final NoteApi api;
  final ConnectivityMonitor connectivity;

  List<Note>? _memory; // hot cache above the persistent store
  final _outbox = <String, Note>{}; // offline edits awaiting upload
  final _changes = StreamController<List<Note>>.broadcast();
  StreamSubscription<bool>? _connectivitySub;

  /// Stale-while-revalidate: emit the cached list immediately, kick off a
  /// refresh, then keep emitting as fresher data lands.
  Stream<List<Note>> watchAll() async* {
    // Buffer change events raised before this generator reaches yield*:
    // broadcast streams do not replay, so an update emitted during the
    // first await below would otherwise be silently lost.
    final buffer = StreamController<List<Note>>();
    final sub = _changes.stream.listen(buffer.add, onError: buffer.addError);
    try {
      yield await _cached(); // stale
      unawaited(refresh()); // revalidate
      yield* buffer.stream; // fresh, forever after
    } finally {
      await sub.cancel();
      await buffer.close();
    }
  }

  Future<List<Note>> _cached() async => _memory ??= await store.readAll();

  Future<void> refresh() async {
    if (!connectivity.isOnline) return;

    // Push before pull so offline edits take part in the merge below.
    for (final note in List.of(_outbox.values)) {
      final canonical = await api.push(note);
      _outbox.remove(note.id);
      await _applyLocal(canonical);
    }

    final snapshot = await api.fetch(etag: await store.readEtag());
    if (snapshot == null) return; // 304: nothing changed server-side

    final local = {for (final n in await _cached()) n.id: n};
    final merged = <String, Note>{...local};
    for (final remote in snapshot.notes) {
      final mine = local[remote.id];
      // Server wins unless we hold a strictly newer pending edit. Comparing
      // updatedAt across machines assumes the server stamps both sides --
      // never trust two client clocks against each other.
      final keepLocal = mine != null &&
          _outbox.containsKey(remote.id) &&
          mine.updatedAt.isAfter(remote.updatedAt);
      if (!keepLocal) merged[remote.id] = remote;
    }

    _memory = merged.values.toList(growable: false);
    await store.upsertAll(_memory!);
    await store.writeEtag(snapshot.etag);
    _changes.add(_memory!);
  }

  /// Optimistic write: local first (UI updates instantly), network after.
  Future<void> save(Note note) async {
    await _applyLocal(note);
    if (connectivity.isOnline) {
      // The server stamps its own clock; store its canonical copy, not ours.
      final canonical = await api.push(note);
      await _applyLocal(canonical);
    } else {
      _outbox[note.id] = note; // queue until connectivity returns
    }
  }

  Future<void> _applyLocal(Note note) async {
    final list = List.of(await _cached());
    final i = list.indexWhere((n) => n.id == note.id);
    if (i >= 0) {
      list[i] = note;
    } else {
      list.add(note);
    }
    _memory = list;
    await store.upsertAll(list);
    _changes.add(list);
  }

  Future<void> dispose() async {
    await _connectivitySub?.cancel();
    await _changes.close();
  }
}

// --- Fakes so this file runs standalone ------------------------------------------------

class InMemoryNoteStore implements NoteStore {
  final _notes = <String, Note>{};
  String? _etag;

  @override
  Future<List<Note>> readAll() async => _notes.values.toList();

  @override
  Future<void> upsertAll(List<Note> notes) async {
    for (final n in notes) {
      _notes[n.id] = n;
    }
  }

  @override
  Future<String?> readEtag() async => _etag;

  @override
  Future<void> writeEtag(String? etag) async => _etag = etag;
}

class FakeNoteApi implements NoteApi {
  final _server = <String, Note>{};
  var _version = 0;

  @override
  Future<RemoteSnapshot?> fetch({String? etag}) async {
    await Future<void>.delayed(const Duration(milliseconds: 40));
    final current = 'v$_version';
    if (etag == current) return null; // 304 Not Modified
    return RemoteSnapshot(_server.values.toList(), current);
  }

  @override
  Future<Note> push(Note note) async {
    await Future<void>.delayed(const Duration(milliseconds: 30));
    final canonical =
        Note(id: note.id, body: note.body, updatedAt: DateTime.now());
    _server[note.id] = canonical;
    _version++;
    return canonical;
  }
}

class ManualConnectivity implements ConnectivityMonitor {
  final _controller = StreamController<bool>.broadcast();
  var _online = false;

  @override
  bool get isOnline => _online;

  @override
  Stream<bool> get changes => _controller.stream;

  void set(bool online) {
    _online = online;
    _controller.add(online);
  }
}

Future<void> main() async {
  final connectivity = ManualConnectivity();
  final repo = OfflineFirstNoteRepository(
    store: InMemoryNoteStore(),
    api: FakeNoteApi(),
    connectivity: connectivity,
  );

  final sub =
      repo.watchAll().listen((notes) => stdout.writeln('UI sees: $notes'));

  // Edit while offline: the UI updates instantly, the push queues.
  await repo.save(Note(id: 'a', body: 'draft', updatedAt: DateTime.now()));
  await Future<void>.delayed(const Duration(milliseconds: 100));

  // Connectivity returns: outbox flushes, ETag round-trip merges the result.
  connectivity.set(true);
  await Future<void>.delayed(const Duration(milliseconds: 300));

  await sub.cancel();
  await repo.dispose();
}`,
    notes:
      "The watchAll() generator buffers change events through an intermediate controller before reaching yield* -- broadcast streams do not replay, so anything emitted during the initial cache read would otherwise vanish silently. Push the outbox BEFORE pulling: merging first would overwrite pending local edits with stale server rows. The conflict rule compares updatedAt only because the (fake) server stamps both sides; never compare two client clocks against each other -- use server timestamps or version vectors. A local note survives the merge only while it is in the outbox AND strictly newer. The ETag/304 path makes refresh() cheap enough to run on every reconnect. And call dispose(): the connectivity subscription and the broadcast controller otherwise outlive the repository.",
  },
];
