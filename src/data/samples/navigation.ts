// Verified advanced navigation samples: go_router stateful shell routes,
// redirect-based auth guarding, and typed deep links with declarative
// modals. Every `code` field was verified on Flutter 3.38.5 / Dart 3.10.4
// with go_router 17.3.0: `flutter analyze` clean (zero errors/warnings/
// infos).

import type { FlutterSample } from "./types.js";

export const navigationSamples: readonly FlutterSample[] = [
  {
    id: "go-router-stateful-shell",
    title: "Bottom Navigation with Preserved Per-Tab Stacks (StatefulShellRoute)",
    category: "navigation",
    difficulty: "advanced",
    description:
      "A bottom-nav app on StatefulShellRoute.indexedStack where every tab owns an independent Navigator stack that survives tab switches: nested detail routes stay pushed, text fields keep their contents, and re-tapping the active tab resets its branch via goBranch(initialLocation:). Also shows parentNavigatorKey to push a route on the root navigator so it covers the bottom bar. Reach for this whenever an app has persistent bottom/rail navigation \u2014 it is the canonical go_router shell pattern.",
    tags: ["go_router", "statefulshellroute", "indexedstack", "bottom-navigation", "navigationbar", "goBranch", "shell-route", "nested-routes", "tab-state", "parentNavigatorKey"],
    minFlutter: "3.38",
    packages: [{ name: "go_router", version: "^17.3.0" }],
    code: `// StatefulShellRoute.indexedStack: a bottom-nav app where every tab keeps
// its own Navigator stack alive across tab switches. Each branch hosts an
// independent Navigator; the shell parks inactive branches in an
// IndexedStack instead of disposing them, so scroll positions, text field
// contents, and pushed detail routes all survive tab changes.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

// Routes that must cover the bottom bar (checkout, full-screen viewers)
// are hosted on this root navigator instead of a branch navigator.
final GlobalKey<NavigatorState> _rootNavigatorKey =
    GlobalKey<NavigatorState>();

final GoRouter _router = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/feed',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) =>
          AppScaffold(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/feed',
              builder: (context, state) => const FeedScreen(),
              routes: [
                // Nested route: pushed *inside* the Feed branch, so the
                // bottom bar stays visible and this detail page survives
                // switching to another tab and back.
                GoRoute(
                  path: 'article/:id',
                  builder: (context, state) =>
                      ArticleScreen(id: state.pathParameters['id']!),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/search',
              builder: (context, state) => const SearchScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/settings',
              builder: (context, state) => const SettingsScreen(),
              routes: [
                GoRoute(
                  path: 'about',
                  // Escapes the shell: hosted on the root navigator, so it
                  // slides in over the bottom bar instead of under it.
                  parentNavigatorKey: _rootNavigatorKey,
                  builder: (context, state) => const AboutScreen(),
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
);

class AppScaffold extends StatelessWidget {
  const AppScaffold({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // The shell IS the IndexedStack of branch navigators.
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) => navigationShell.goBranch(
          index,
          // Re-tapping the active tab resets that branch to its initial
          // route — the platform-conventional behavior. Without this flag
          // the tap is a no-op and users get stuck deep in a stack.
          initialLocation: index == navigationShell.currentIndex,
        ),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.article), label: 'Feed'),
          NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
          NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}

class FeedScreen extends StatelessWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Feed')),
      body: ListView.builder(
        itemCount: 30,
        itemBuilder: (context, index) => ListTile(
          title: Text('Article $index'),
          // go() rebuilds the branch stack from the route tree
          // (feed -> feed/article), which keeps the URL canonical.
          // push() would also work but builds an ad-hoc stack instead.
          onTap: () => context.go('/feed/article/$index'),
        ),
      ),
    );
  }
}

class ArticleScreen extends StatelessWidget {
  const ArticleScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Article $id')),
      body: const Center(
        child: Text('Switch tabs and come back — this route survives.'),
      ),
    );
  }
}

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  // Branch state: survives tab switches because the shell keeps this
  // branch mounted (offstage) inside its IndexedStack.
  final TextEditingController _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: TextField(
          controller: _query,
          decoration: const InputDecoration(
            hintText: 'Type, switch tabs, switch back — text persists',
          ),
        ),
      ),
    );
  }
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(
            title: const Text('About (covers the bottom bar)'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/about'),
          ),
        ],
      ),
    );
  }
}

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('About')),
      body: const Center(child: Text('Pushed on the root navigator.')),
    );
  }
}

void main() => runApp(MaterialApp.router(routerConfig: _router));
`,
    notes:
      "goBranch(initialLocation: index == currentIndex) is load-bearing: pass true unconditionally and switching TO a tab also resets its stack; omit it and re-tapping the active tab is a dead no-op. State survives because the shell keeps inactive branches mounted (offstage) in an IndexedStack \u2014 that also means every visited tab holds its widgets and memory until the shell itself is disposed, so very heavy tabs may need their own lazy-init. Routes that must cover the bottom bar need parentNavigatorKey: rootNavigatorKey on the GoRoute; forgetting it renders them inside the branch, under the bar. Keep the GoRouter instance top-level or in state \u2014 constructing it inside build() discards all navigation state on rebuild. Use context.go for canonical stack rebuilds within a branch; context.push builds ad-hoc stacks that may not match the declared tree.",
  },
  {
    id: "go-router-auth-guard",
    title: "Auth Guard via redirect + refreshListenable (Loop-Free)",
    category: "navigation",
    difficulty: "advanced",
    description:
      "Redirect-based auth flow: a ChangeNotifier auth controller bound to the router through refreshListenable, a three-state (unknown/signedOut/signedIn) redirect that parks unresolved sessions on a splash screen, and a ?from= query parameter that carries the original deep-link destination through splash and login so users land where the link pointed. Reach for this pattern for any app with protected routes \u2014 it centralizes access control in one pure function instead of scattering checks across screens.",
    tags: ["go_router", "redirect", "refreshlistenable", "auth", "authentication", "guard", "deep-link", "changenotifier", "login", "splash", "redirect-loop"],
    minFlutter: "3.38",
    packages: [{ name: "go_router", version: "^17.3.0" }],
    code: `// Redirect-based auth guarding with go_router: a ChangeNotifier auth state
// drives redirects via refreshListenable, deep links survive the login
// round-trip via a ?from= parameter, and the redirect function is written
// so it can never loop.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

enum AuthStatus {
  unknown, // session restore in flight — don't guess, park on splash
  signedOut,
  signedIn,
}

class AuthController extends ChangeNotifier {
  AuthStatus _status = AuthStatus.unknown;
  AuthStatus get status => _status;

  Future<void> restoreSession() async {
    // Simulates reading a stored token. Until this resolves, the router
    // keeps everyone on /splash instead of flashing the login screen at
    // users who are actually signed in.
    await Future<void>.delayed(const Duration(milliseconds: 800));
    _status = AuthStatus.signedOut;
    notifyListeners(); // wakes the router: redirect re-runs immediately
  }

  Future<void> signIn() async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    _status = AuthStatus.signedIn;
    notifyListeners();
  }

  void signOut() {
    _status = AuthStatus.signedOut;
    notifyListeners();
  }
}

final AuthController _auth = AuthController();

final GoRouter _router = GoRouter(
  initialLocation: '/',
  // Without this, redirect only runs on navigation events. Auth changes
  // that arrive outside navigation (token expiry, server-pushed sign-out)
  // would leave the user parked on a protected screen.
  refreshListenable: _auth,
  redirect: (context, state) {
    final status = _auth.status;
    final location = state.matchedLocation;
    final onSplash = location == '/splash';
    final onLogin = location == '/login';

    // Rule 1: auth unknown -> everything parks on /splash. The original
    // destination rides along in ?from= so a cold-start deep link
    // (myapp://orders/42) still lands on /orders/42 after login.
    if (status == AuthStatus.unknown) {
      if (onSplash) return null; // already there: null breaks the loop
      return Uri(
        path: '/splash',
        queryParameters: {'from': state.uri.toString()},
      ).toString();
    }

    // Rule 2: signed out -> /login, carrying ?from= through from splash.
    if (status == AuthStatus.signedOut) {
      if (onLogin) return null;
      final from =
          onSplash ? state.uri.queryParameters['from'] : state.uri.toString();
      return Uri(
        path: '/login',
        queryParameters: {if (from != null && from != '/') 'from': from},
      ).toString();
    }

    // Rule 3: signed in -> bounce off login/splash to the saved target.
    if (onLogin || onSplash) {
      return state.uri.queryParameters['from'] ?? '/';
    }
    return null; // signed in, on a real page — nothing to do
  },
  routes: [
    GoRoute(
      path: '/splash',
      builder: (context, state) => const SplashScreen(),
    ),
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/',
      builder: (context, state) => const HomeScreen(),
    ),
    GoRoute(
      path: '/orders/:id',
      builder: (context, state) =>
          OrderScreen(id: state.pathParameters['id']!),
    ),
  ],
);

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    // Guarded: splash can be remounted (hot reload, back navigation) and
    // restoring twice would clobber a signed-in session.
    if (_auth.status == AuthStatus.unknown) {
      _auth.restoreSession();
    }
  }

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _busy = false;

  Future<void> _signIn() async {
    setState(() => _busy = true);
    // No manual navigation afterwards: notifyListeners() re-runs the
    // router's redirect, which sends the user to ?from= or '/'. Adding a
    // context.go() here as well is the classic double-navigation bug.
    await _auth.signIn();
  }

  @override
  Widget build(BuildContext context) {
    final from = GoRouterState.of(context).uri.queryParameters['from'];
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Sign in required'),
            if (from != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('You will return to $from'),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _signIn,
              child: Text(_busy ? 'Signing in…' : 'Sign in'),
            ),
          ],
        ),
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Home'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            // Sign-out needs no navigation either: the state change alone
            // ejects the user to /login via the redirect.
            onPressed: _auth.signOut,
          ),
        ],
      ),
      body: Center(
        child: FilledButton(
          // Deep-link simulation: sign out, then navigate here directly —
          // you get login first, then land on the order.
          onPressed: () => context.go('/orders/42'),
          child: const Text('Open order #42'),
        ),
      ),
    );
  }
}

class OrderScreen extends StatelessWidget {
  const OrderScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Order $id')),
      body: const Center(child: Text('Protected content')),
    );
  }
}

void main() => runApp(MaterialApp.router(routerConfig: _router));
`,
    notes:
      "Every branch of redirect MUST have a 'return null' path for the location it targets (already-on-login returns null, etc.) \u2014 an unconditional return is an infinite redirect loop, which go_router aborts with an exception after a redirect limit. Without refreshListenable the redirect only runs on navigation events, so out-of-band auth changes (token expiry, server sign-out) leave users parked on protected screens. Compare locations with state.matchedLocation (query params stripped) but preserve destinations with state.uri.toString(); build redirect URLs with the Uri constructor so ?from= gets percent-encoded correctly. After signIn(), do NOT also context.go() \u2014 notifyListeners() already re-runs the redirect and navigates; doing both is the classic double-navigation bug. The unknown state parking everyone on /splash is what prevents the login screen flashing at users whose session restore is about to succeed.",
  },
  {
    id: "go-router-deeplink-typed",
    title: "Typed Deep Links, onException, and Dialogs/Sheets as Pages",
    category: "navigation",
    difficulty: "expert",
    description:
      "Deep-link discipline for go_router: path and query parameters parsed once at the route boundary into a typed ProductRoute object (with the same type generating outbound URLs), validation in GoRoute.redirect so bad input never reaches the widget layer, onException routing unmatched URIs to a not-found screen, the extra-vs-params tradeoff with an id-based fallback, and dialogs/bottom sheets implemented as Page subclasses so back button, URL, and deep links treat them as real routes. A ShellRoute pageBuilder and CustomTransitionPage show where shell vs child transitions live. Reach for this when an app takes deep links seriously \u2014 marketing URLs, web, state restoration.",
    tags: ["go_router", "deep-link", "typed-routes", "path-parameters", "query-parameters", "onexception", "extra", "custom-page", "dialogroute", "modalbottomsheetroute", "customtransitionpage", "shellroute", "pagebuilder"],
    minFlutter: "3.38",
    packages: [{ name: "go_router", version: "^17.3.0" }],
    code: `// Typed deep links with go_router: path/query parsing at the route
// boundary, onException for unmatched URIs, the extra-vs-params tradeoff,
// and dialogs/bottom sheets driven declaratively as Pages so back button,
// URL, and deep links all treat them as real routes.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

enum ProductTab { details, reviews }

/// Everything /product/:id?tab=&page= can express, parsed exactly once.
/// Screens receive this object and never touch raw strings, so a
/// malformed URL can only fail in one place — the route boundary.
class ProductRoute {
  const ProductRoute(
      {required this.id, this.tab = ProductTab.details, this.page = 1});

  final int id;
  final ProductTab tab;
  final int page;

  static ProductRoute? tryParse(GoRouterState state) {
    final id = int.tryParse(state.pathParameters['id'] ?? '');
    if (id == null || id < 1) return null;
    final query = state.uri.queryParameters;
    return ProductRoute(
      id: id,
      tab: ProductTab.values.asNameMap()[query['tab']] ?? ProductTab.details,
      page: (int.tryParse(query['page'] ?? '') ?? 1).clamp(1, 999),
    );
  }

  /// Outbound links go through the same type: no hand-assembled strings.
  String get location {
    final query = <String, String>{
      if (tab != ProductTab.details) 'tab': tab.name,
      if (page != 1) 'page': '$page',
    };
    return Uri(path: '/product/$id', queryParameters: query.isEmpty ? null : query)
        .toString();
  }
}

class Product {
  const Product(this.id, this.name);
  final int id;
  final String name;
  // Stands in for a repository lookup — the fallback when \`extra\` is gone.
  static Product byId(int id) => Product(id, 'Product #$id');
}

/// A dialog as a Page: back button, URL bar, and deep links all see it as
/// a real route, unlike showDialog() which lives outside the route table.
class DialogPage<T> extends Page<T> {
  const DialogPage({required this.builder, super.key, super.name});
  final WidgetBuilder builder;
  @override
  Route<T> createRoute(BuildContext context) => DialogRoute<T>(
      // settings ties Route to Page — required for pop bookkeeping.
      context: context, settings: this, builder: builder);
}

class BottomSheetPage<T> extends Page<T> {
  const BottomSheetPage({required this.builder, super.key, super.name});
  final WidgetBuilder builder;
  @override
  Route<T> createRoute(BuildContext context) => ModalBottomSheetRoute<T>(
      settings: this,
      isScrollControlled: false,
      showDragHandle: true,
      builder: builder);
}

final GoRouter _router = GoRouter(
  initialLocation: '/',
  // Any URI that matches no route (stale marketing link, typo'd deep link)
  // lands here instead of surfacing a GoException error screen.
  onException: (context, state, router) =>
      router.go('/not-found', extra: state.uri.toString()),
  routes: [
    ShellRoute(
      // pageBuilder (not builder) lets the shell itself animate when
      // entering/leaving shelled territory. Transitions *between* child
      // routes are owned by the children's own pageBuilders below.
      pageBuilder: (context, state, child) => CustomTransitionPage(
        key: state.pageKey,
        child: StoreShell(child: child),
        transitionsBuilder: (context, animation, secondaryAnimation, child) =>
            FadeTransition(opacity: animation, child: child),
      ),
      routes: [
        GoRoute(path: '/', builder: (context, state) => const CatalogScreen()),
        GoRoute(
          path: '/product/:id',
          // Validate BEFORE build: redirecting on bad input (try
          // /product/oops) keeps parse failures out of the widget layer.
          redirect: (context, state) =>
              ProductRoute.tryParse(state) == null ? '/not-found' : null,
          pageBuilder: (context, state) => CustomTransitionPage(
            key: state.pageKey,
            child: ProductScreen(data: ProductRoute.tryParse(state)!),
            transitionsBuilder:
                (context, animation, secondaryAnimation, child) =>
                    SlideTransition(
              position: animation.drive(
                  Tween(begin: const Offset(0, 0.05), end: Offset.zero)
                      .chain(CurveTween(curve: Curves.easeOutCubic))),
              child: FadeTransition(opacity: animation, child: child),
            ),
          ),
          routes: [
            GoRoute(
              path: 'share',
              pageBuilder: (context, state) {
                // \`extra\` carries the in-memory object to skip a refetch,
                // but extra does NOT survive process death, web refresh,
                // or a cold deep link — always keep an id-based fallback.
                final product = state.extra as Product? ??
                    Product.byId(int.parse(state.pathParameters['id']!));
                return BottomSheetPage(
                  builder: (context) => SafeArea(
                    child: ListTile(
                      leading: const Icon(Icons.link),
                      title: Text('Copy link to \${product.name}'),
                      onTap: () => context.pop(),
                    ),
                  ),
                );
              },
            ),
            GoRoute(
              path: 'delete',
              pageBuilder: (context, state) => DialogPage(
                builder: (context) => AlertDialog(
                  title: const Text('Delete product?'),
                  content: const Text('This dialog is a route: the system '
                      'back gesture dismisses it correctly.'),
                  actions: [
                    TextButton(
                        onPressed: () => context.pop(),
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: () => context.go('/'),
                        child: const Text('Delete')),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    ),
    GoRoute(
      path: '/not-found',
      builder: (context, state) => NotFoundScreen(uri: state.extra as String?),
    ),
  ],
);

class StoreShell extends StatelessWidget {
  const StoreShell({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Typed Links Store')), body: child);
}

class CatalogScreen extends StatelessWidget {
  const CatalogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        for (var id = 1; id <= 3; id++)
          ListTile(
            title: Text('Product #$id'),
            // id 3 deep-links straight to reviews page 2 — typed outbound.
            onTap: () => context.go(ProductRoute(
              id: id,
              tab: id == 3 ? ProductTab.reviews : ProductTab.details,
              page: id == 3 ? 2 : 1,
            ).location),
          ),
        ListTile(
          title: const Text('Unknown route (exercises onException)'),
          onTap: () => context.go('/warehouse/9'),
        ),
      ],
    );
  }
}

class ProductScreen extends StatelessWidget {
  const ProductScreen({super.key, required this.data});

  final ProductRoute data;

  @override
  Widget build(BuildContext context) {
    final product = Product.byId(data.id);
    return Column(
      children: [
        SegmentedButton<ProductTab>(
          segments: const [
            ButtonSegment(value: ProductTab.details, label: Text('Details')),
            ButtonSegment(value: ProductTab.reviews, label: Text('Reviews')),
          ],
          selected: {data.tab},
          // Tab switches are URL changes: back button walks tab history.
          onSelectionChanged: (selection) => context.go(
              ProductRoute(id: data.id, tab: selection.first, page: data.page)
                  .location),
        ),
        Expanded(
            child: Center(
                child: Text(
                    '\${product.name} — \${data.tab.name}, page \${data.page}'))),
        OverflowBar(
          children: [
            TextButton(
              // push() layers the sheet on the stack; the URL becomes
              // /product/:id/share and pop returns beneath it.
              onPressed: () =>
                  context.push('/product/\${data.id}/share', extra: product),
              child: const Text('Share'),
            ),
            TextButton(
                onPressed: () => context.push('/product/\${data.id}/delete'),
                child: const Text('Delete')),
          ],
        ),
      ],
    );
  }
}

class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key, this.uri});

  final String? uri;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Not found')),
        body: Center(
            child: Text(uri == null ? 'Invalid link' : 'No route for $uri')),
      );
}

void main() => runApp(MaterialApp.router(routerConfig: _router));
`,
    notes:
      "state.extra is never serialized: it is lost on process death, web refresh, and cold deep links, so any route relying on it needs an id-based fallback (the share route here). In custom Page.createRoute implementations, settings: this is mandatory \u2014 omit it and the Navigator cannot match the Route back to its Page, breaking pop bookkeeping with assertion failures. onException only catches routing failures (no matching route); exceptions thrown inside builders surface as widget errors, which is why validation lives in the route-level redirect instead of throwing in the builder. CustomTransitionPage needs key: state.pageKey or transitions replay incorrectly when only parameters change. The ShellRoute pageBuilder transition fires when entering/leaving the shell as a whole; transitions between children belong to the children's own pageBuilders. ModalBottomSheetRoute requires isScrollControlled explicitly. int.parse in the share pageBuilder is safe only because the parent route's redirect already validated :id \u2014 keep that invariant in mind when reordering routes.",
  },
];
