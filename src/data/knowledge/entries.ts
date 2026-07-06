// Knowledge base: opinionated, current guidance for starting Flutter programs.
// Verified against Flutter stable 3.44.4 / Dart 3.12.2 (July 2026).
// Package versions cited below were checked live against the pub.dev API in
// July 2026 — the monthly update-check re-verifies them against `package-picks-2026`.

import type { KnowledgeEntry } from "./types.js";

export const knowledgeEntries: readonly KnowledgeEntry[] = [
  // ── 1. Project structure ──────────────────────────────────────────────
  {
    id: "project-structure",
    title: "Project Structure: Feature-First Layout",
    topic: "Architecture",
    summary:
      "How to lay out a Flutter app in 2026: feature-first folders with data/domain/presentation inside each feature, a core/ for app-agnostic plumbing and shared/ for cross-feature UI, a restrictive barrel-file policy, and clear rules for where providers live. Includes the full tree for large apps and a flatter pragmatic variant for small ones.",
    tags: [
      "structure", "folders", "feature-first", "layers", "barrel files",
      "core", "shared", "providers", "organization", "scaffolding",
    ],
    asOf: "2026-07",
    content: `# Project Structure: Feature-First Layout

Organize by **feature, not by layer**. A top-level \`screens/\`, \`models/\`,
\`services/\` split stops scaling around the fifth feature: every change fans out
across three directories and nothing can be deleted cleanly. Feature-first keeps
each vertical slice in one place — you can open, review, and delete a feature as
a unit.

## The large-app tree (default for anything with 3+ devs or 5+ features)

\`\`\`text
lib/
  main.dart                     # bootstrap ONLY: error wiring, DI, runApp
  app/
    app.dart                    # MaterialApp.router, theme, localization
    router.dart                 # GoRouter config (routes reference features)
  core/                         # app-AGNOSTIC plumbing. Could be a package.
    network/
      dio_client.dart           # configured Dio + interceptors
      api_exception.dart
    storage/
      key_value_store.dart      # shared_preferences wrapper behind interface
    error/
      app_exception.dart        # sealed exception hierarchy
      result.dart               # Result<T> if you use one
    utils/
  shared/                       # app-SPECIFIC, cross-feature
    widgets/                    # design-system widgets (AppButton, AppCard)
    extensions/                 # BuildContext, DateTime extensions
    models/                     # only models genuinely used by 2+ features
  features/
    auth/
      data/
        auth_api.dart           # remote data source (raw DTO in/out)
        auth_repository.dart    # repository impl + its provider
        dto/                    # freezed DTOs + *.g.dart
      domain/
        user.dart               # entity (freezed), repository interface
      presentation/
        login_screen.dart
        login_controller.dart   # AsyncNotifier + provider
        widgets/
    settings/
      ...
  l10n/                         # ARB files (gen_l10n)
\`\`\`

The rule that keeps this honest: **features never import each other's
data/ or presentation/**. If feature B needs feature A's data, it goes through
A's domain interface (or the dependency gets promoted to \`shared/\`). Enforce it
in review; on bigger teams enforce it with \`import_lint\` or a melos workspace.

## core/ vs shared/ — the actual distinction

- \`core/\` = would survive being copied into a *different* app unchanged.
  Networking, storage wrappers, error types, logging. No Flutter widgets except
  truly generic ones. No imports from \`features/\` — ever.
- \`shared/\` = belongs to *this* app but to no single feature. Your design-system
  widgets, brand extensions, cross-feature models.

If you can't decide, it goes in the feature. Promotion to \`shared/\` happens on
the **second** consumer, not speculatively.

## Barrel-file policy

Barrels rot: they hide dependency direction, break tree-aware tooling, and
invite cycles. Policy:

- **No** \`lib/lib.dart\` or per-layer barrels (\`widgets/widgets.dart\`).
- **Optionally one** barrel per feature (\`features/auth/auth.dart\`) exporting
  only the feature's public surface (screens + domain types). Everything not
  exported there is private to the feature by convention.
- Never barrel \`core/\` — import the specific file so the dependency is visible.

## Where providers live

Colocate providers with what they provide — do not build a \`providers/\` dumping
ground:

- Infrastructure providers (\`dioProvider\`, \`keyValueStoreProvider\`) live next to
  the class in \`core/\`.
- \`authRepositoryProvider\` lives in \`auth/data/auth_repository.dart\`.
- \`loginControllerProvider\` lives in \`auth/presentation/login_controller.dart\`.

With riverpod_generator this is automatic — \`@riverpod\` annotates the class in
its own file and the provider is generated beside it.

## The small-app variant (1–2 devs, < ~5 features)

Skip the three-layer split inside features; keep the feature folders:

\`\`\`text
lib/
  main.dart
  app/
    app.dart
    router.dart
  core/                         # same rules, fewer files
  features/
    timer/
      timer_repository.dart     # data access + provider, one file
      timer_controller.dart     # Notifier + provider
      timer_screen.dart
      widgets/
\`\`\`

A separate \`domain/\` with repository interfaces earns its keep when you have
multiple data sources or a team that tests against fakes heavily. For a small
app, a concrete repository class overridden with \`ProviderScope(overrides:)\` in
tests is the same testability with a third of the files. Start flat; split a
feature into data/domain/presentation the day it stops fitting in your head —
the migration is mechanical because the feature boundary already exists.
`,
  },

  // ── 2. State management choice ────────────────────────────────────────
  {
    id: "state-management-choice",
    title: "State Management in 2026: Decision Guide",
    topic: "Architecture",
    summary:
      "The 2026 call: setState/ValueNotifier for widget-local state, Riverpod 3 (Notifier/AsyncNotifier) as the default for app state, flutter_bloc when the team explicitly wants event-driven auditing. What to avoid in new code — GetX, StateNotifier, adopting provider — and why. Includes a decision table.",
    tags: [
      "state management", "riverpod", "bloc", "setState", "ValueNotifier",
      "Notifier", "AsyncNotifier", "GetX", "StateNotifier", "provider",
    ],
    asOf: "2026-07",
    content: `# State Management in 2026: Decision Guide

The debate is over for new apps. The answer is layered, not singular:

| State kind | Pick | Why |
|---|---|---|
| Ephemeral, one widget (tab index, animation, text field) | \`setState\` / \`StatefulWidget\` | Zero ceremony. Reaching for a framework here is a smell. |
| Local, shared by a small subtree, no async | \`ValueNotifier\` + \`ValueListenableBuilder\` | Cheap, testable, no package. |
| App state, async data, caching, DI | **Riverpod 3** (\`flutter_riverpod\` 3.3.2, checked 2026-07) | The default. See below. |
| Team mandates event-sourced, auditable transitions | \`flutter_bloc\` 9.1.1 | Legitimate, heavier. See below. |
| Anything else (GetX, MobX, redux ports, StateNotifier) | **No** for new code | See "avoid" below. |

## Default: Riverpod 3

Riverpod 3.x is **Notifier/AsyncNotifier-first**. \`StateNotifier\` and
\`StateNotifierProvider\` are legacy (relegated to a \`legacy\` import) — do not
write new ones. Use riverpod_generator (4.0.4) so providers are derived from
annotated classes and \`riverpod_lint\` (3.1.4) can enforce correct usage.

\`\`\`dart
@riverpod
class LoginController extends _\$LoginController {
  @override
  FutureOr<void> build() {} // idle

  Future<void> signIn(String email, String password) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).signIn(email, password),
    );
  }
}

// Widget side — AsyncValue forces you to handle all three states:
final login = ref.watch(loginControllerProvider);
switch (login) {
  AsyncData() => /* success UI */,
  AsyncError(:final error) => /* error UI */,
  _ => /* spinner */,
}
\`\`\`

Why it wins: compile-safe (no \`BuildContext\` lookup that throws at runtime),
providers are lazy and cached, \`AsyncValue\` makes loading/error states
unrepresentable-to-ignore, testing is \`ProviderContainer\` + overrides with no
widget tree, and the lint package catches misuse (\`ref.watch\` in callbacks,
missing \`dependencies\`, etc.). Riverpod 3 also added automatic retry for failed
providers and unified \`Ref\` — check current docs before copying pre-3.0 snippets.

## When BLoC instead

\`flutter_bloc\` 9.1.1 (checked 2026-07; the bloc ecosystem is mature and
intentionally slow-moving — that's a feature). Choose it when:

- The team already runs BLoC in production and has conventions/tooling for it.
- You genuinely want event-sourced transitions: every state change is a named
  event you can log, replay, and assert on with \`bloc_test\` (10.0.0).
- Org process values uniformity over per-dev ergonomics (big teams, rotation).

Cost: ~3× the ceremony per feature (event classes, state classes, bloc). If
you pick BLoC, pick it everywhere — a half-Riverpod half-BLoC app is worse than
either.

## Avoid for new code — and say why in the ADR

- **GetX** (\`get\` 4.7.3): still published, still avoid. It's a framework-inside-
  the-framework: global service locator, navigation/state/DI/snackbars fused
  into one god-object, context-free magic that defeats Flutter's tree-based
  model, and untypeable \`Get.find()\` failures at runtime. Migrating off it later
  means rewriting, not refactoring.
- **StateNotifier / StateNotifierProvider**: legacy in Riverpod 3. New
  controllers are \`Notifier\`/\`AsyncNotifier\`. Migrate opportunistically.
- **Adopting \`provider\` for new apps**: it's maintained but superseded by
  Riverpod (same author, same mental model, fewer runtime footguns). Existing
  provider apps: fine, don't churn; migrate feature-by-feature if you touch it.
- **Hand-rolled InheritedWidget plumbing** beyond one or two static config
  objects — you're rebuilding Riverpod without the safety.

## The one-sentence policy

setState until state leaves the widget; Riverpod 3 the moment it does; BLoC
only as a whole-team, whole-app decision; nothing else for new code.
`,
  },

  // ── 3. Error handling strategy ────────────────────────────────────────
  {
    id: "error-handling-strategy",
    title: "Error Handling: Exceptions, Results, and Crash Wiring",
    topic: "Architecture",
    summary:
      "A complete error strategy: a sealed AppException hierarchy thrown from the data layer, AsyncValue as the error carrier in presentation, Result<T> reserved for the few flows that need exhaustive handling, plus the exact FlutterError.onError / PlatformDispatcher.onError / runZonedGuarded wiring, crash-reporting hooks, and a user-facing error taxonomy.",
    tags: [
      "errors", "exceptions", "Result", "sealed classes", "AsyncValue",
      "runZonedGuarded", "FlutterError", "PlatformDispatcher", "crash reporting",
      "Crashlytics", "Sentry",
    ],
    asOf: "2026-07",
    content: `# Error Handling: Exceptions, Results, and Crash Wiring

## The stance

**Typed exceptions at the data boundary, \`AsyncValue\` as the carrier in
presentation, \`Result<T>\` only where exhaustive handling is a business
requirement.** Result-ifying every function turns Dart into worse Rust: you
lose stack traces by default, \`await\`-chains become \`fold\`-chains, and half the
codebase is plumbing. Dart's tools — sealed classes for the error *taxonomy*,
exceptions for *propagation*, \`AsyncValue.guard\` for *capture* — compose better.

## 1. One sealed exception hierarchy (\`core/error/app_exception.dart\`)

\`\`\`dart
sealed class AppException implements Exception {
  const AppException(this.message);
  final String message; // developer-facing, NOT shown to users
}

final class NetworkException extends AppException {
  const NetworkException(super.message);
}
final class AuthException extends AppException {
  const AuthException(super.message, {this.sessionExpired = false});
  final bool sessionExpired;
}
final class ValidationException extends AppException {
  const ValidationException(super.message, {this.fieldErrors = const {}});
  final Map<String, String> fieldErrors;
}
final class NotFoundException extends AppException {
  const NotFoundException(super.message);
}
final class UnexpectedException extends AppException {
  const UnexpectedException(super.message, [this.cause, this.stackTrace]);
  final Object? cause;
  final StackTrace? stackTrace;
}
\`\`\`

The **data layer's contract**: everything it throws is an \`AppException\`.
Repositories catch \`DioException\`, platform exceptions, parse errors, and map
them. Nothing above the repository ever sees a \`DioException\`.

## 2. AsyncValue is the presentation-layer error carrier

Controllers don't try/catch; they guard:

\`\`\`dart
state = await AsyncValue.guard(() => repo.submit(order));
\`\`\`

The UI pattern-matches \`AsyncError(:final error)\` and maps \`AppException\` →
user copy (taxonomy below). This gives every async flow loading/error handling
for free and keeps it impossible to forget.

## 3. Result<T> — the 10% case

Use a Result only when the *caller must* branch on failure as part of business
logic (e.g. a checkout step where each failure kind routes differently), not
for generic fetches:

\`\`\`dart
sealed class Result<T> {
  const Result();
}
final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}
final class Err<T> extends Result<T> {
  const Err(this.error, [this.stackTrace]);
  final AppException error;
  final StackTrace? stackTrace;
}
\`\`\`

Dart 3 switch expressions make consumption exhaustive without a package —
skip fpdart/dartz unless the team already speaks functional.

## 4. Global wiring (\`main.dart\`)

\`\`\`dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Framework errors (build/layout/paint):
  FlutterError.onError = (details) {
    FlutterError.presentError(details); // keep console output in debug
    crashReporter.recordFlutterError(details);
  };

  // 2. Uncaught async + platform errors. Returning true = handled.
  PlatformDispatcher.instance.onError = (error, stack) {
    crashReporter.record(error, stack, fatal: true);
    return true;
  };

  runApp(const ProviderScope(child: App()));
}
\`\`\`

**\`runZonedGuarded\` note:** since \`PlatformDispatcher.onError\` landed, the zone
wrapper is redundant for the standard case — the two handlers above catch
everything. Only reach for \`runZonedGuarded\` if you need zone-local behavior
(e.g. capturing \`print\` output, or third-party init that must share the zone
with \`runApp\` — in which case ensure \`ensureInitialized\` and \`runApp\` are in the
*same* zone or you'll get the classic zone-mismatch error).

## 5. Crash reporting hooks

Wrap the vendor behind a tiny interface (\`crashReporter\` above) so main.dart
doesn't import Crashlytics/Sentry directly. Whichever you use:

- Record **all** \`AsyncError\` states as *non-fatal* — a Riverpod
  \`ProviderObserver\` overriding provider-failure callbacks does this in one
  place for the whole app (API changed in Riverpod 3; check current docs).
- Attach user/session context at login, clear it at logout.
- Debug builds: log, never upload.

## 6. User-facing taxonomy

One mapper, one place (\`core/error/error_messages.dart\`), used by every screen:

| Exception | User copy | UI |
|---|---|---|
| NetworkException | "You're offline. Check your connection." | Retry button |
| AuthException(sessionExpired) | "Session expired. Please sign in again." | Route to login |
| ValidationException | Field-level messages from \`fieldErrors\` | Inline on form |
| NotFoundException | "That item is no longer available." | Back/refresh |
| UnexpectedException + anything else | "Something went wrong." | Retry + auto-report |

Never surface \`error.toString()\` to users. Never show a raw \`DioException\`
message. If you see one in a screenshot, the data layer's contract is leaking.
`,
  },

  // ── 4. Networking and serialization ───────────────────────────────────
  {
    id: "networking-and-serialization",
    title: "Networking & Serialization: dio + freezed Pipeline",
    topic: "Architecture",
    summary:
      "dio over http for any real app: interceptor-based auth refresh (QueuedInterceptor), hand-rolled retry, and logging. The post-macro-cancellation model pipeline — freezed 3 + json_serializable via build_runner — with the exact codegen commands, freezed 3 migration notes, and how to structure API clients per feature.",
    tags: [
      "networking", "dio", "http", "interceptors", "auth refresh", "retry",
      "serialization", "freezed", "json_serializable", "build_runner", "codegen",
    ],
    asOf: "2026-07",
    content: `# Networking & Serialization: dio + freezed Pipeline

## dio vs http in 2026

Versions checked 2026-07: **dio 5.10.0** (actively maintained by the cfug
collective), **http 1.6.0** (Dart team).

- **Pick \`dio\`** for any app with auth, retries, uploads, or more than a couple
  of endpoints. Interceptors, per-request cancellation via \`CancelToken\`,
  form-data/download progress, connection/receive timeouts as first-class
  config — you will otherwise hand-build all of this on top of \`http\`.
- **Pick \`http\`** for scripts, packages that must stay dependency-light, or an
  app that calls one public API anonymously.

Not \`retrofit\`-style generated clients by default: they add a codegen surface
for what is, per endpoint, three lines of dio. Fine if the team likes it; not
the recommendation.

## One configured client in core/

\`\`\`dart
@Riverpod(keepAlive: true)
Dio dio(Ref ref) {
  final dio = Dio(BaseOptions(
    baseUrl: const String.fromEnvironment('API_BASE_URL'),
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 20),
  ));
  dio.interceptors.addAll([
    AuthInterceptor(ref),
    RetryInterceptor(dio),
    if (kDebugMode) LogInterceptor(responseBody: false),
  ]);
  return dio;
}
\`\`\`

### Auth refresh — use QueuedInterceptor

A plain \`Interceptor\` will fire N parallel refreshes when N requests 401
together. \`QueuedInterceptor\` serializes them:

\`\`\`dart
class AuthInterceptor extends QueuedInterceptor {
  AuthInterceptor(this.ref);
  final Ref ref;

  @override
  void onRequest(options, handler) {
    final token = ref.read(tokenStoreProvider).accessToken;
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, handler) async {
    if (err.response?.statusCode != 401) return handler.next(err);
    final refreshed = await ref.read(tokenStoreProvider).refresh();
    if (!refreshed) {
      ref.read(sessionProvider.notifier).forceLogout();
      return handler.next(err);
    }
    // Replay the original request with the new token.
    final response = await ref.read(dioProvider).fetch(err.requestOptions);
    handler.resolve(response);
  }
}
\`\`\`

**Refresh the token with a separate bare \`Dio\` instance** (no interceptors) or
you'll recurse through your own 401 handler.

### Retry — own it, it's 25 lines

Retry idempotent GETs on \`connectionTimeout\`/\`connectionError\` with jittered
exponential backoff (250ms · 2^attempt, max 3). Never auto-retry POSTs without
an idempotency key. Hand-roll it as an \`Interceptor\` rather than adding a
dependency for this.

## Serialization: the pipeline that survived the macro cancellation

Dart macros were **cancelled in January 2025**. There is no "wait for macros"
option: **freezed + json_serializable + build_runner is the standard**, and it's
fine. Checked 2026-07: freezed 3.2.5, freezed_annotation 3.1.0,
json_serializable 6.14.0, json_annotation 4.12.0, build_runner 2.15.0.

\`\`\`dart
// features/orders/data/dto/order_dto.dart
import 'package:freezed_annotation/freezed_annotation.dart';
part 'order_dto.freezed.dart';
part 'order_dto.g.dart';

@freezed
abstract class OrderDto with _\$OrderDto {
  const factory OrderDto({
    required String id,
    required int amountCents,
    @JsonKey(name: 'created_at') required DateTime createdAt,
  }) = _OrderDto;

  factory OrderDto.fromJson(Map<String, dynamic> json) =>
      _\$OrderDtoFromJson(json);
}
\`\`\`

**freezed 3 notes** (if you're migrating old snippets): classes must now be
declared \`abstract\` (or \`sealed\` for unions); the generated \`.when\`/\`.map\`
methods are gone — use Dart 3 \`switch\` pattern matching on the sealed cases
instead. Don't copy freezed 2 examples from old blog posts.

### Codegen commands (put these in a Makefile/melos script)

\`\`\`bash
dart run build_runner watch --delete-conflicting-outputs   # while developing
dart run build_runner build --delete-conflicting-outputs   # CI / one-shot
\`\`\`

Commit generated files? **Yes** for apps — CI stays fast and \`git bisect\`
works. Regenerate in CI and fail on diff if you want to guarantee freshness.

## API client structure

Per feature, a thin API class that speaks DTOs, wrapped by a repository that
speaks domain types and maps errors:

\`\`\`dart
class OrdersApi {
  OrdersApi(this._dio);
  final Dio _dio;

  Future<List<OrderDto>> fetchOrders() async {
    final res = await _dio.get<List<dynamic>>('/orders');
    return [for (final j in res.data!) OrderDto.fromJson(j as Map<String, dynamic>)];
  }
}
\`\`\`

Repository maps \`DioException\` → \`AppException\` (see \`error-handling-strategy\`)
and DTO → entity. Screens never import \`dio\` or a DTO — that's the layering
test in code review.
`,
  },

  // ── 5. Material 3 theming ─────────────────────────────────────────────
  {
    id: "theming-material3",
    title: "Material 3 Theming Discipline",
    topic: "UI",
    summary:
      "Theming that survives redesigns: one ColorScheme.fromSeed pair, ThemeExtension for every app-specific design token, proper dark mode via ThemeMode.system, dynamic color as progressive enhancement, typography rules — plus what the Flutter 3.44 Material/Cupertino decoupling into standalone packages means for your upgrade strategy.",
    tags: [
      "theme", "material 3", "ColorScheme", "fromSeed", "ThemeExtension",
      "dark mode", "dynamic color", "typography", "cupertino", "flutter 3.44",
    ],
    asOf: "2026-07",
    content: `# Material 3 Theming Discipline

Material 3 has been the only mode since Flutter 3.16. The discipline that keeps
theming maintainable is simple: **all color decisions flow from a ColorScheme;
all app-specific tokens live in ThemeExtensions; widgets read from
Theme.of(context) and never hardcode**.

## 1. One seed, two schemes

\`\`\`dart
const _seed = Color(0xFF1B6EF3); // the ONE brand decision

final lightScheme = ColorScheme.fromSeed(seedColor: _seed);
final darkScheme =
    ColorScheme.fromSeed(seedColor: _seed, brightness: Brightness.dark);

ThemeData buildTheme(ColorScheme scheme) => ThemeData(
      colorScheme: scheme,
      // Component themes here — the only place widget styling is customized.
      appBarTheme: const AppBarTheme(centerTitle: false),
      cardTheme: CardTheme(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
\`\`\`

If brand requires exact colors that \`fromSeed\` won't hit, use
\`ColorScheme.fromSeed(...).copyWith(primary: brandExact, ...)\` — still derive
the other 40+ roles, override the few that are contractual. Hand-writing a full
ColorScheme is how dark mode ends up broken.

**Never** put a raw \`Color(0xFF...)\` in a widget. \`Theme.of(context)
.colorScheme.primary\` or a ThemeExtension token, always. Grep for \`Color(0x\`
outside the theme directory in review.

## 2. ThemeExtension for app tokens

Everything the design system defines beyond Material's roles — semantic colors
(success/warning), spacing, brand gradients — is a \`ThemeExtension\`, so it
switches with dark mode and is mockable in tests:

\`\`\`dart
class AppTokens extends ThemeExtension<AppTokens> {
  const AppTokens({required this.success, required this.warning});
  final Color success;
  final Color warning;

  @override
  AppTokens copyWith({Color? success, Color? warning}) => AppTokens(
      success: success ?? this.success, warning: warning ?? this.warning);

  @override
  AppTokens lerp(AppTokens? other, double t) => other == null
      ? this
      : AppTokens(
          success: Color.lerp(success, other.success, t)!,
          warning: Color.lerp(warning, other.warning, t)!,
        );
}

// ThemeData(extensions: [lightTokens]) ... then in widgets:
final tokens = Theme.of(context).extension<AppTokens>()!;
\`\`\`

## 3. Dark mode: ship both from day one

\`\`\`dart
MaterialApp.router(
  theme: buildTheme(lightScheme),
  darkTheme: buildTheme(darkScheme),
  themeMode: settings.themeMode, // default ThemeMode.system
)
\`\`\`

Retrofitting dark mode is a full audit of every hardcoded color; the two rules
above make it free. Test both schemes in golden tests.

## 4. Dynamic color — progressive enhancement, not the brand

\`dynamic_color\` 1.8.1 (checked 2026-07) reads the user's Material You palette
on Android 12+. Use \`DynamicColorBuilder\`; fall back to your seed schemes when
it returns null (iOS, desktop, older Android). Make it a settings toggle —
some brands can't float on user-picked colors, and that's a product decision,
not a default.

## 5. Typography

Start from \`ThemeData\`'s M3 type scale; override via
\`textTheme: baseTheme.textTheme.copyWith(...)\` rather than rebuilding a
TextTheme from scratch (you'll miss inherit/color subtleties). Custom fonts:
bundle them in \`pubspec.yaml\` and set \`fontFamily\` — for anything user-facing,
prefer bundling over runtime-fetching so first paint is correct offline. Never
set fixed \`fontSize\` on widgets to dodge scaling — see \`responsive-adaptive\`
for TextScaler rules.

## 6. Flutter 3.44: Material & Cupertino decoupling — what it changes for you

As of Flutter 3.44 (Google I/O 2026), **Material and Cupertino are frozen in
the core framework and are moving to standalone packages with independent
versioning**. Practical consequences:

- **New Material/Cupertino features and fixes ship in the packages**, on their
  own cadence — you'll take them via \`pubspec.yaml\` bumps, not only via Flutter
  SDK upgrades. Framework upgrades and design-library upgrades decouple.
- **Pin the design-library packages** like any dependency and read their
  changelogs; a Flutter SDK bump no longer implies widget-behavior churn, and
  vice versa.
- **Migration posture**: keep imports on the standard \`package:flutter/material.dart\`
  surface until the standalone packages are the documented default for stable —
  then follow the official migration guide in one dedicated PR, not gradually.
- This is another reason for the ThemeExtension discipline: your token layer
  sits *above* the widget library, so library churn doesn't ripple through
  feature code.
`,
  },

  // ── 6. Responsive & adaptive ──────────────────────────────────────────
  {
    id: "responsive-adaptive",
    title: "Responsive & Adaptive Layout",
    topic: "UI",
    summary:
      "The 2026 playbook: Material 3 window-class breakpoints as shared constants, LayoutBuilder for component-local decisions vs MediaQuery.sizeOf for page-level ones, adaptive navigation (NavigationBar/Rail/Drawer), foldable and desktop realities including 3.44's macOS popup windows, SafeArea discipline, and non-negotiable TextScaler support.",
    tags: [
      "responsive", "adaptive", "breakpoints", "LayoutBuilder", "MediaQuery",
      "sizeOf", "NavigationRail", "foldables", "desktop", "SafeArea", "TextScaler",
    ],
    asOf: "2026-07",
    content: `# Responsive & Adaptive Layout

Two different problems, two different tools:

- **Responsive** = same UI, reflowed for the space available → constraints.
- **Adaptive** = different UI/idiom per class of device → window size classes.

## 1. Breakpoints: Material 3 window classes, as code

Use the M3 window size classes; define them once in \`core/\`, never inline
magic numbers:

\`\`\`dart
enum WindowClass {
  compact,   // < 600      phones portrait
  medium,    // 600–839    tablets portrait, foldables open (portrait)
  expanded,  // 840–1199   tablets landscape, small desktop
  large,     // 1200–1599  desktop
  extraLarge; // >= 1600   big desktop / ultrawide

  static WindowClass of(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w < 600) return compact;
    if (w < 840) return medium;
    if (w < 1200) return expanded;
    if (w < 1600) return large;
    return extraLarge;
  }
}
\`\`\`

Design for compact / medium / expanded first; large/extraLarge usually just cap
content width (\`ConstrainedBox(maxWidth: 1040)\` around reading surfaces).

## 2. LayoutBuilder vs MediaQuery — the actual rule

- **Page-level, idiom decisions** (which navigation, how many panes):
  \`MediaQuery.sizeOf(context)\` → \`WindowClass.of(context)\`.
- **Component-level decisions** (card grid columns, whether a row wraps):
  \`LayoutBuilder\` — the component must respond to the space *it was given*,
  not the window. A card in a side panel should not think it's on a phone
  because the window is wide.

**Always the granular MediaQuery accessors** — \`MediaQuery.sizeOf\`,
\`.paddingOf\`, \`.textScalerOf\`, \`.platformBrightnessOf\` — never
\`MediaQuery.of(context).size\`. The granular form rebuilds you only when that
one aspect changes; \`MediaQuery.of\` rebuilds on *every* metrics change,
including keyboard show/hide, which cascades through whole pages.

## 3. Adaptive navigation

One scaffold owns the decision; feature screens never know which chrome
they're in:

| WindowClass | Navigation |
|---|---|
| compact | \`NavigationBar\` (bottom) |
| medium | \`NavigationRail\` |
| expanded+ | \`NavigationRail(extended: true)\` or permanent \`NavigationDrawer\` |

Put this in an \`AdaptiveScaffold\`-style wrapper of your own (~60 lines) wired
to go_router's \`StatefulShellRoute\` so each destination keeps its own stack.
Prefer owning these 60 lines over depending on an adaptive-scaffold package —
this layout is app-specific and the wrappers churn.

## 4. Foldables & desktop

- Treat an open foldable as **medium/expanded**, not as a weird phone. For
  hinge-aware layouts read \`MediaQuery.displayFeaturesOf\` and avoid placing
  interactive content under a hinge \`DisplayFeature\` — for most apps, two-pane
  at \`medium+\` handles foldables with zero extra code.
- Desktop (3.44+): windows resize continuously — your breakpoints will be
  crossed *live*, so test dragging a window across 600/840/1200, not just fixed
  sizes. Flutter 3.44 added **popup window support on macOS** — real secondary
  windows for palettes/inspectors instead of faking them with overlays; design
  desktop tooling UIs with that in mind.
- Also on desktop: hover states, \`SelectionArea\` for text, and keyboard
  traversal are the difference between "runs on desktop" and "is a desktop app".

## 5. SafeArea discipline

- Apply \`SafeArea\` **once per screen**, at the scaffold-body level — not
  sprinkled per-widget (double-insets) and not globally around the router
  (kills edge-to-edge scrolling).
- Scrollables that should draw under notches/home-indicator: skip SafeArea and
  use \`SliverSafeArea\` / pad content with \`MediaQuery.paddingOf\` so content
  scrolls edge-to-edge but rests inside the insets.
- \`Scaffold\` + \`AppBar\`/\`NavigationBar\` already handle their own insets — the
  usual bug is *adding* SafeArea on top of them.

## 6. Text scaling: TextScaler, and you support it

\`textScaleFactor\` is gone; \`TextScaler\` (nonlinear scaling) is the reality.
Rules:

- Never disable scaling to "protect the design". Broken layout at 1.6× is a
  bug in the layout.
- Fixed-height widgets containing text are the failure mode — replace fixed
  heights with padding-driven height wherever text lives.
- If a truly rigid element (badge, tab bar) must cap growth, clamp locally and
  narrowly:

\`\`\`dart
MediaQuery.withClampedTextScaling(
  maxScaleFactor: 1.3,
  child: BottomBarLabels(...),
)
\`\`\`

- Add one golden/widget test per key screen at \`TextScaler.linear(1.5)\` and at
  \`WindowClass.medium\` — those two catch the majority of adaptive regressions.
`,
  },

  // ── 7. Flavors and delivery ───────────────────────────────────────────
  {
    id: "flavors-and-delivery",
    title: "Flavors, Config, and CI Delivery",
    topic: "Delivery",
    summary:
      "Three flavors (dev/staging/prod) wired through Android productFlavors and iOS schemes+xcconfig, all runtime config through --dart-define-from-file, secrets kept out of the repo and injected in CI, a GitHub Actions outline (analyze, test, build matrix), the Swift Package Manager reality on iOS/macOS since Flutter 3.44, and build-number automation.",
    tags: [
      "flavors", "dart-define", "secrets", "ci", "github actions",
      "swift package manager", "cocoapods", "versioning", "build number", "delivery",
    ],
    asOf: "2026-07",
    content: `# Flavors, Config, and CI Delivery

## 1. Three flavors, no more

\`dev\` (local/branch builds, dev backend), \`staging\` (release-mode, staging
backend, internal distribution), \`prod\` (stores). Resist per-customer flavors —
that's runtime config, not build config.

**Android** (\`android/app/build.gradle.kts\`):

\`\`\`kotlin
android {
  flavorDimensions += "env"
  productFlavors {
    create("dev")     { dimension = "env"; applicationIdSuffix = ".dev"
                        resValue("string", "app_name", "MyApp DEV") }
    create("staging") { dimension = "env"; applicationIdSuffix = ".stg"
                        resValue("string", "app_name", "MyApp STG") }
    create("prod")    { dimension = "env"
                        resValue("string", "app_name", "MyApp") }
  }
}
\`\`\`

**iOS**: one scheme per flavor (\`dev\`/\`staging\`/\`prod\`), each pairing
Debug/Release build configurations with a per-flavor \`.xcconfig\` that sets
\`PRODUCT_BUNDLE_IDENTIFIER\` and display name. Tedious one-time Xcode setup;
do it at project creation (or scaffold the project with a flavor-aware
template) — retrofitting is the painful version.

Distinct app IDs per flavor mean dev/staging/prod install side-by-side on one
device. Non-negotiable for QA.

## 2. Config: --dart-define-from-file for everything

One JSON file per flavor in \`env/\` (gitignore the ones with real values;
commit \`env/dev.json\` with harmless defaults and an \`env/example.json\`):

\`\`\`json
{ "API_BASE_URL": "https://api.staging.example.com", "SENTRY_DSN": "" }
\`\`\`

\`\`\`bash
flutter run   --flavor dev     --dart-define-from-file=env/dev.json
flutter build appbundle --flavor prod --dart-define-from-file=env/prod.json
\`\`\`

Read with \`const String.fromEnvironment('API_BASE_URL')\` — const-folded at
compile time, tree-shaken, no runtime file to tamper with. Do **not** use
dotenv-style packages that ship a plaintext config file inside the app bundle.

## 3. Secrets

- Client-side "secrets" are only ever *low-value* keys (public API keys, DSNs).
  Anything genuinely secret stays server-side — the app binary is public.
- Real values for staging/prod live in **CI secrets**, written to
  \`env/prod.json\` at build time — never in the repo.
- Signing: Android keystore + \`key.properties\` and iOS certs/profiles are CI
  secrets too (base64-encoded files, or a fastlane match repo).
- User-held secrets at runtime (tokens) → \`flutter_secure_storage\` 10.3.1, see
  \`package-picks-2026\`.

## 4. iOS/macOS dependencies: Swift Package Manager (Flutter 3.44+)

As of Flutter 3.44, **SwiftPM replaces CocoaPods** as the iOS/macOS dependency
mechanism. What this means in practice:

- **New projects**: SwiftPM from day one. No \`Podfile\`, no \`pod install\`, no
  Ruby on your CI image — noticeably simpler runners.
- **Existing projects**: migrate with the official tooling/guide; the tooling
  supports plugins that still only ship podspecs during the transition, but
  audit your plugin list first — a plugin without SwiftPM support in mid-2026
  is a maintenance red flag (see abandonment rule in \`package-picks-2026\`).
- CI: drop CocoaPods caching/install steps after migrating; cache the SwiftPM
  checkout instead.

## 5. CI outline (GitHub Actions)

Three jobs; PRs run the first two, tags/main run all:

\`\`\`yaml
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { flutter-version: "3.44.4", cache: true }
      - run: flutter pub get
      - run: dart format --output=none --set-exit-if-changed .
      - run: flutter analyze --fatal-infos
      - run: dart run custom_lint         # analyzer plugins don't gate 'analyze'
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { flutter-version: "3.44.4", cache: true }
      - run: flutter test --coverage
  build:
    strategy:
      matrix:
        include:
          - { os: ubuntu-latest, target: appbundle }
          - { os: macos-latest,  target: ipa }       # SwiftPM: no pod install step
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { flutter-version: "3.44.4", cache: true }
      - run: echo '\${{ secrets.PROD_ENV_JSON }}' > env/prod.json
      - run: flutter build \${{ matrix.target }} --flavor prod
             --dart-define-from-file=env/prod.json
             --build-number=\${{ github.run_number }}
\`\`\`

Pin the Flutter version in CI to the version in your \`pubspec.yaml\`
\`environment\` — "latest stable" CI plus a pinned local SDK is how phantom CI
failures happen.

## 6. Versioning & build numbers

- \`pubspec.yaml\` \`version: 1.4.0+1\` — humans own \`1.4.0\` (bump in the release
  PR), **CI owns the build number** via \`--build-number=\$GITHUB_RUN_NUMBER\`
  (monotonic, no merge conflicts, satisfies both stores).
- Tag releases \`v1.4.0\`; build stores artifacts + mapping/symbol files
  (\`--obfuscate --split-debug-info=...\` for prod, and upload the symbols to
  your crash reporter in the same job).
`,
  },

  // ── 8. Lint and analysis ──────────────────────────────────────────────
  {
    id: "lint-and-analysis",
    title: "Linting & Static Analysis Baseline",
    topic: "Tooling",
    summary:
      "The analysis_options.yaml every new app starts from: flutter_lints 6 as the base, strict-casts/strict-inference/strict-raw-types on from day one, a short list of high-value extra rules, custom_lint + riverpod_lint wiring (and why CI must run custom_lint separately from flutter analyze), and dart format/dart fix gates.",
    tags: [
      "lint", "analysis_options", "flutter_lints", "strict-casts",
      "strict-raw-types", "custom_lint", "riverpod_lint", "dart format",
      "dart fix", "static analysis",
    ],
    asOf: "2026-07",
    content: `# Linting & Static Analysis Baseline

Turn strictness to maximum on day one. Every option below is nearly free in a
new codebase and a week-long slog to retrofit at month six.

## The baseline \`analysis_options.yaml\`

Checked 2026-07: flutter_lints 6.0.0 (current major), custom_lint 0.8.1,
riverpod_lint 3.1.4.

\`\`\`yaml
include: package:flutter_lints/flutter.yaml

analyzer:
  language:
    strict-casts: true        # no implicit dynamic→T casts
    strict-inference: true    # inference failures are errors, not dynamic
    strict-raw-types: true    # no bare List / Map / Future
  errors:
    # Escalate the lints people "fix later" (never) into hard errors:
    unawaited_futures: error
    discarded_futures: error
    avoid_dynamic_calls: error
  exclude:
    - "**/*.g.dart"
    - "**/*.freezed.dart"

plugins:
  - custom_lint

linter:
  rules:
    # High-value additions on top of flutter_lints:
    unawaited_futures: true
    discarded_futures: true
    avoid_dynamic_calls: true
    prefer_final_locals: true
    require_trailing_commas: true
    always_declare_return_types: true
    cast_nullable_to_non_nullable: true
    no_self_assignments: true
\`\`\`

Notes:

- **flutter_lints 6** is the floor, not the ceiling. It's deliberately
  uncontroversial; the \`linter.rules\` block above is where the real safety is.
  Teams that want a bigger curated set: \`very_good_analysis\` 10.3.0 (checked
  2026-07) as the \`include\` instead — but then *remove* rules you disagree with
  explicitly rather than ignoring them inline forever.
- The three \`strict-*\` language flags catch the whole class of
  "dynamic snuck through JSON handling" bugs at compile time. Non-negotiable.
- \`unawaited_futures\` + \`discarded_futures\` are the two highest-value async
  lints in Flutter code (fire-and-forgot navigation, un-awaited writes). Use
  \`unawaited()\` from \`dart:async\` to mark intentional fire-and-forget.
- Excluding generated files keeps analyzer noise (and time) down; you don't
  own that code style.

## custom_lint + riverpod_lint

Riverpod's lints are load-bearing, not cosmetic — they catch runtime bugs
(\`ref.watch\` inside callbacks, providers missing \`dependencies\`, misuse of
\`ref\` after dispose) and power refactors like automatic provider migrations:

\`\`\`yaml
dev_dependencies:
  custom_lint: ^0.8.1
  riverpod_lint: ^3.1.4
\`\`\`

plus \`plugins: [custom_lint]\` under \`analyzer:\` (already in the baseline
above). IDEs pick this up via the analysis server automatically.

**The CI trap**: \`flutter analyze\` does **not** run analyzer plugins. If CI
only runs \`flutter analyze\`, every custom_lint rule is decorative. CI must run
both:

\`\`\`bash
flutter analyze --fatal-infos
dart run custom_lint --fatal-infos
\`\`\`

custom_lint runs as a separate analyzer-plugin process; first run is slow
(compiles the plugin), so cache \`.dart_tool\` in CI. If the IDE ever shows
stale/ghost custom_lint diagnostics, restart the analysis server —
plugin-process staleness is a known papercut, not your config.

## Formatting and auto-fix gates

- \`dart format\` is not optional and has no config beyond line length. Since
  Dart 3.7+ the formatter applies the newer tall style and respects
  \`formatter: { page_width: N }\` in analysis_options if you must deviate from
  80 — pick once, never debate again.
- CI gate: \`dart format --output=none --set-exit-if-changed .\`
- \`dart fix --apply\` after every SDK/lints bump — it mechanically migrates
  deprecations and newly-enabled lint violations. Run it in the same PR as the
  bump so the diff is attributable.

## Policy for suppressions

\`// ignore:\` requires a reason comment on the same line and is reviewed like
code. \`// ignore_for_file:\` is allowed only in generated-adjacent or test
files. If a rule collects more than a handful of justified ignores, disable
the rule explicitly in \`analysis_options.yaml\` with a comment saying why —
config is where policy lives, not scattered inline.
`,
  },

  // ── 9. Package picks 2026 ─────────────────────────────────────────────
  {
    id: "package-picks-2026",
    title: "Package Picks — Verified Shortlist (July 2026)",
    topic: "Tooling",
    summary:
      "The default dependency list for a new Flutter app, one pick per domain — state, routing, network, storage/db, codegen, testing, secure storage, i18n — with the exact version verified live on pub.dev in July 2026, a one-line rationale, and the main alternative. Also the abandoned-package flags (isar, hive) and the freshness rule the monthly update-check enforces.",
    tags: [
      "packages", "dependencies", "pub.dev", "versions", "shortlist",
      "riverpod", "go_router", "dio", "drift", "freezed", "mocktail", "intl",
    ],
    asOf: "2026-07",
    content: `# Package Picks — Verified Shortlist (July 2026)

Every version below was checked live against the pub.dev API in **July 2026**.
This entry is the one the monthly update-check keeps honest: if a cited version
is stale or a pick stops shipping, this file is wrong and gets fixed first.

**Abandonment rule**: no publish in >18 months = abandoned for our purposes →
pick the alternative. (Exception: genuinely finished single-purpose packages —
judge by open-issue triage, not vibes.)

## The shortlist

| Domain | Pick | Checked version | Why | Main alternative |
|---|---|---|---|---|
| State / DI | \`flutter_riverpod\` | 3.3.2 | Notifier/AsyncNotifier-first, compile-safe DI, AsyncValue; the 2026 default | \`flutter_bloc\` 9.1.1 (event-driven teams) |
| State codegen | \`riverpod_annotation\` + \`riverpod_generator\` | 4.0.3 / 4.0.4 | \`@riverpod\` classes; pairs with riverpod_lint enforcement | hand-written providers |
| Routing | \`go_router\` | 17.3.0 | Declarative, deep links, StatefulShellRoute; maintained by the Flutter team, actively released through mid-2026 | \`auto_route\` 11.1.0 (codegen-typed routes) |
| Network | \`dio\` | 5.10.0 | Interceptors, cancellation, timeouts, progress | \`http\` 1.6.0 (trivial needs) |
| Models / unions | \`freezed\` (+ \`freezed_annotation\` 3.1.0) | 3.2.5 | Immutable data classes + sealed unions; the post-macro-cancellation standard | plain classes + pattern matching |
| JSON | \`json_serializable\` (+ \`json_annotation\` 4.12.0) | 6.14.0 | Boring, correct, universal | \`dart_mappable\` |
| Codegen runner | \`build_runner\` | 2.15.0 | Runs the above; macros are dead (cancelled Jan 2025), this is the pipeline | — |
| Key-value prefs | \`shared_preferences\` | 2.5.5 | Flutter-team plugin; use the \`SharedPreferencesAsync\` API in new code | — |
| Database | \`drift\` | 2.34.0 | Type-safe reactive SQLite, migrations, multiplatform; best-maintained Dart DB | \`sqflite\` 2.4.3 (raw SQL, minimal) |
| Secure storage | \`flutter_secure_storage\` | 10.3.1 | Keychain/Keystore-backed; the standard for tokens | — |
| Testing (mocks) | \`mocktail\` | 1.0.5 | Null-safe mocks without codegen | \`mockito\` (codegen) |
| Lint base | \`flutter_lints\` | 6.0.0 | Official baseline; see \`lint-and-analysis\` for the strictness stack | \`very_good_analysis\` 10.3.0 |
| Lint plugins | \`custom_lint\` + \`riverpod_lint\` | 0.8.1 / 3.1.4 | Catches real Riverpod runtime bugs at analysis time | — |
| i18n | \`intl\` + \`flutter_localizations\` (gen_l10n) | 0.20.3 | First-party ARB workflow; \`intl\` is SDK-pinned — let flutter_localizations dictate its version | \`slang\` 4.18.0 (typed keys, if ARB chafes) |

## Flagged: abandoned or avoid

- **\`isar\`** — last publish **April 2023** (3.1.0+1); >3 years silent, well past
  the 18-month line. Do not start new apps on it. Use **drift**.
- **\`hive\`** — last publish **June 2022** (2.2.3); abandoned upstream. The
  maintained community fork is **\`hive_ce\`** (2.19.3, checked 2026-07) if you
  specifically want a fast key-value box store; otherwise shared_preferences
  for small config and drift for structured data.
- **\`get\` (GetX)** — 4.7.3, still published, avoided on architecture, not
  abandonment: see \`state-management-choice\`.
- **\`bloc_test\`** 10.0.0 (Jan 2025) and **\`flutter_bloc\`** 9.1.1 (May 2025)
  are inside the window and the bloc ecosystem is deliberately slow-moving —
  not flagged, just noted for the next re-check.

## Notes that keep this list small

- **No dotenv packages** — config goes through \`--dart-define-from-file\`
  (see \`flavors-and-delivery\`).
- **No retry/interceptor helper packages** — hand-roll on dio, ~25 lines
  (see \`networking-and-serialization\`).
- **No adaptive-scaffold packages** — own the ~60 lines
  (see \`responsive-adaptive\`).
- Every added dependency needs: a maintained release within 18 months, a
  reason a stdlib/SDK feature can't do it, and one named owner on the team who
  read its changelog. Dependencies are the part of your app you didn't review.

## Starter \`pubspec.yaml\` block

\`\`\`yaml
dependencies:
  flutter_riverpod: ^3.3.2
  riverpod_annotation: ^4.0.3
  go_router: ^17.3.0
  dio: ^5.10.0
  freezed_annotation: ^3.1.0
  json_annotation: ^4.12.0
  shared_preferences: ^2.5.5
  flutter_secure_storage: ^10.3.1
  drift: ^2.34.0            # only if you need a database
  intl: any                  # pinned transitively by flutter_localizations

dev_dependencies:
  build_runner: ^2.15.0
  freezed: ^3.2.5
  json_serializable: ^6.14.0
  riverpod_generator: ^4.0.4
  flutter_lints: ^6.0.0
  custom_lint: ^0.8.1
  riverpod_lint: ^3.1.4
  mocktail: ^1.0.5
\`\`\`
`,
  },
];
