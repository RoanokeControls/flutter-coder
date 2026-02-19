// Common Flutter errors with root causes, solutions, and code examples

export interface ErrorEntry {
  readonly pattern: string;
  readonly title: string;
  readonly cause: string;
  readonly solution: string;
  readonly code?: string;
  readonly keywords: readonly string[];
}

export const errorCatalog: readonly ErrorEntry[] = [
  // ── Layout Errors ─────────────────────────────────────────────────────
  {
    pattern: "RenderFlex overflowed",
    title: "RenderFlex Overflow (Yellow/Black Stripes)",
    cause: "A Row, Column, or Flex widget's children exceed the available space along the main axis.",
    solution: "Wrap overflowing children in Flexible or Expanded. For text, add overflow: TextOverflow.ellipsis. For entire content, wrap in SingleChildScrollView.",
    code: `// WRONG
Row(children: [Text('Very long text that overflows...')])

// FIX: Wrap in Flexible or Expanded
Row(children: [Expanded(child: Text('Very long text...', overflow: TextOverflow.ellipsis))])

// FIX: Make scrollable
SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(...))`,
    keywords: ["overflow", "renderflex", "yellow", "black", "stripes", "pixel"],
  },
  {
    pattern: "Vertical viewport was given unbounded height",
    title: "Unbounded Height in Vertical Viewport",
    cause: "A ListView, GridView, or other scrollable is inside a Column, another ListView, or widget that doesn't constrain height.",
    solution: "Wrap the inner scrollable in Expanded or SizedBox with fixed height. Or use shrinkWrap: true (less performant).",
    code: `// WRONG - ListView in Column without constraints
Column(children: [ListView(...)])

// FIX 1: Expanded (preferred)
Column(children: [Expanded(child: ListView(...))])

// FIX 2: SizedBox with fixed height
Column(children: [SizedBox(height: 300, child: ListView(...))])

// FIX 3: shrinkWrap (less performant for long lists)
Column(children: [ListView(shrinkWrap: true, physics: NeverScrollableScrollPhysics())])`,
    keywords: ["unbounded", "height", "viewport", "listview", "column", "scrollable"],
  },
  {
    pattern: "BoxConstraints forces an infinite",
    title: "Infinite Constraints",
    cause: "A widget received infinite width or height constraints, typically from being in a scroll view without proper sizing.",
    solution: "Provide explicit size constraints. Use SizedBox, ConstrainedBox, or Expanded to constrain the widget.",
    code: `// WRONG - Container in horizontal ListView without width
ListView(scrollDirection: Axis.horizontal, children: [Container(color: Colors.red)])

// FIX: Provide explicit width
ListView(scrollDirection: Axis.horizontal, children: [SizedBox(width: 200, child: Container(color: Colors.red))])`,
    keywords: ["infinite", "constraints", "boxconstraints", "width", "height"],
  },
  {
    pattern: "Incorrect use of ParentDataWidget",
    title: "Wrong Parent for Expanded/Flexible/Positioned",
    cause: "Expanded or Flexible used outside Row/Column/Flex, or Positioned used outside Stack.",
    solution: "Ensure Expanded/Flexible are direct children of Row, Column, or Flex. Ensure Positioned is a direct child of Stack.",
    code: `// WRONG - Expanded not directly in Row/Column
Container(child: Expanded(child: Text('Hello')))

// FIX
Row(children: [Expanded(child: Text('Hello'))])

// WRONG - Positioned not in Stack
Column(children: [Positioned(top: 0, child: Text('Hello'))])

// FIX
Stack(children: [Positioned(top: 0, child: Text('Hello'))])`,
    keywords: ["parentdata", "expanded", "flexible", "positioned", "stack", "row", "column"],
  },
  {
    pattern: "hasSize",
    title: "RenderBox Was Not Laid Out (hasSize assertion)",
    cause: "A widget tried to access its size before layout completed. Often caused by infinite constraints or circular dependencies.",
    solution: "Ensure parent provides finite constraints. Check for unbounded scroll views. Use LayoutBuilder to inspect constraints.",
    code: `// Use LayoutBuilder to debug constraints
LayoutBuilder(
  builder: (context, constraints) {
    debugPrint('Constraints: \$constraints');
    return YourWidget();
  },
)`,
    keywords: ["hassize", "laid out", "renderbox", "size", "layout"],
  },

  // ── State & Lifecycle Errors ──────────────────────────────────────────
  {
    pattern: "setState() called after dispose()",
    title: "setState After Dispose",
    cause: "An async operation (Future, Timer, Stream) completes after the widget has been removed from the tree, and the callback calls setState().",
    solution: "Check `mounted` before calling setState. Cancel timers and subscriptions in dispose(). Use CancelableOperation.",
    code: `// WRONG
Future.delayed(Duration(seconds: 2), () {
  setState(() { _loading = false; }); // Widget may be disposed!
});

// FIX: Check mounted
Future.delayed(Duration(seconds: 2), () {
  if (mounted) setState(() { _loading = false; });
});

// BETTER: Cancel in dispose
late final Timer _timer;
@override
void initState() {
  super.initState();
  _timer = Timer(Duration(seconds: 2), () {
    if (mounted) setState(() { _loading = false; });
  });
}
@override
void dispose() {
  _timer.cancel();
  super.dispose();
}`,
    keywords: ["setstate", "dispose", "mounted", "async", "timer", "future"],
  },
  {
    pattern: "Looking up a deactivated widget's ancestor",
    title: "Context Used After Deactivation",
    cause: "BuildContext is used after the widget has been removed from the tree, typically in async gaps (await in onPressed, then() callbacks).",
    solution: "Check `mounted` after await. Store context reference before async gap. Use ref (Riverpod) instead of context in callbacks.",
    code: `// WRONG
onPressed: () async {
  await doSomething();
  Navigator.of(context).pop(); // context may be invalid!
}

// FIX: Check mounted
onPressed: () async {
  await doSomething();
  if (mounted) Navigator.of(context).pop();
}

// BETTER: Capture navigator before async gap
onPressed: () async {
  final nav = Navigator.of(context);
  await doSomething();
  nav.pop();
}`,
    keywords: ["deactivated", "ancestor", "context", "async", "await", "navigator"],
  },
  {
    pattern: "Duplicate GlobalKey",
    title: "Duplicate GlobalKey Detected",
    cause: "Two widgets in the tree have the same GlobalKey. GlobalKeys must be unique across the entire widget tree.",
    solution: "Ensure each GlobalKey is created once and not reused. Store GlobalKeys in State, not build(). Use ValueKey or ObjectKey for lists.",
    code: `// WRONG - creating GlobalKey in build
@override
Widget build(BuildContext context) {
  final key = GlobalKey(); // New key every build!
  return Form(key: key, ...);
}

// FIX: Store in State
final _formKey = GlobalKey<FormState>();
@override
Widget build(BuildContext context) {
  return Form(key: _formKey, ...);
}`,
    keywords: ["globalkey", "duplicate", "key", "form"],
  },

  // ── Navigation Errors ─────────────────────────────────────────────────
  {
    pattern: "Navigator operation requested with a context that does not include a Navigator",
    title: "No Navigator in Context",
    cause: "Navigator.of(context) called with a context that is above the Navigator (e.g., from the same widget that creates MaterialApp).",
    solution: "Use a context below MaterialApp/Navigator. Use Builder widget or a separate widget for navigation.",
    code: `// WRONG - context is above Navigator
class MyApp extends StatelessWidget {
  Widget build(BuildContext context) {
    return MaterialApp(
      home: ElevatedButton(
        onPressed: () => Navigator.of(context).push(...), // Wrong context!
      ),
    );
  }
}

// FIX: Use context from Builder or child widget
class MyApp extends StatelessWidget {
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Builder(
        builder: (context) => ElevatedButton(
          onPressed: () => Navigator.of(context).push(...), // Correct context!
        ),
      ),
    );
  }
}`,
    keywords: ["navigator", "context", "materialapp", "push", "pop"],
  },
  {
    pattern: "Could not find a generator for route",
    title: "Route Not Found",
    cause: "Navigating to a named route that isn't defined in MaterialApp.routes or onGenerateRoute.",
    solution: "Add the route to MaterialApp.routes map or implement onGenerateRoute. Check for typos in route names.",
    code: `MaterialApp(
  routes: {
    '/': (context) => HomeScreen(),
    '/details': (context) => DetailsScreen(),
  },
  // OR: Use onGenerateRoute for dynamic routes
  onGenerateRoute: (settings) {
    switch (settings.name) {
      case '/user':
        final userId = settings.arguments as String;
        return MaterialPageRoute(builder: (_) => UserScreen(id: userId));
      default:
        return MaterialPageRoute(builder: (_) => NotFoundScreen());
    }
  },
)`,
    keywords: ["route", "generator", "named", "navigation", "onGenerateRoute"],
  },

  // ── Build & Compilation Errors ────────────────────────────────────────
  {
    pattern: "type '.*' is not a subtype of type",
    title: "Type Mismatch (Not a Subtype)",
    cause: "Runtime type cast failure. Often from incorrect generic types, wrong map/list types, or JSON parsing issues.",
    solution: "Check the actual runtime type. Use `as` carefully. Add type parameters to collections. Use type-safe JSON parsing.",
    code: `// WRONG - assuming map value type
final data = json.decode(response) as Map<String, dynamic>;
final name = data['name'] as int; // Fails if it's a String!

// FIX: Safe casting
final name = data['name'];
if (name is int) { /* use as int */ }

// FIX: Type-safe JSON with fromJson
final user = User.fromJson(json.decode(response));`,
    keywords: ["subtype", "type", "cast", "dynamic", "json", "map", "list"],
  },
  {
    pattern: "Null check operator used on a null value",
    title: "Null Check Operator on Null",
    cause: "Using the `!` operator on a null value. Common with widget.key!, map['key']!, or uninitialized late variables.",
    solution: "Check for null before using `!`. Use `??` for defaults. Use `?.` for optional access. Validate data at boundaries.",
    code: `// WRONG
final value = map['key']!; // Throws if key doesn't exist

// FIX: Default value
final value = map['key'] ?? 'default';

// FIX: Null check
final value = map['key'];
if (value != null) {
  // use value safely
}

// FIX: Pattern matching
if (map['key'] case final String value) {
  // use value safely
}`,
    keywords: ["null", "check", "operator", "bang", "late", "uninitialized"],
  },
  {
    pattern: "LateInitializationError",
    title: "Late Variable Not Initialized",
    cause: "A `late` variable was accessed before being assigned a value.",
    solution: "Initialize the variable before accessing it. Consider using nullable type instead of late. Initialize in initState() for State variables.",
    code: `// WRONG
late String _name;
void printName() => print(_name); // Throws if not set!

// FIX: Make nullable
String? _name;
void printName() => print(_name ?? 'Unknown');

// FIX: Initialize in initState
late final TextEditingController _controller;
@override
void initState() {
  super.initState();
  _controller = TextEditingController();
}`,
    keywords: ["late", "initialization", "uninitialized", "lateinit"],
  },
  {
    pattern: "MissingPluginException",
    title: "Missing Plugin Exception",
    cause: "A platform plugin (camera, location, etc.) isn't properly installed or the app needs to be rebuilt after adding a plugin.",
    solution: "Run `flutter clean && flutter pub get`. Rebuild the app (hot reload won't work for new plugins). Check platform-specific setup.",
    code: `# Terminal commands to fix
flutter clean
flutter pub get
flutter run  # Full rebuild, not hot reload

# Check pubspec.yaml has the plugin
dependencies:
  camera: ^0.10.0

# Check platform setup (e.g., iOS Info.plist, Android manifest)`,
    keywords: ["plugin", "missing", "platform", "channel", "native"],
  },

  // ── Image & Asset Errors ──────────────────────────────────────────────
  {
    pattern: "Unable to load asset",
    title: "Asset Not Found",
    cause: "Asset path in pubspec.yaml doesn't match the actual file path, or pubspec.yaml indentation is wrong.",
    solution: "Verify exact path in pubspec.yaml matches filesystem. Check indentation (2 spaces). Run flutter pub get after changes.",
    code: `# pubspec.yaml - CORRECT indentation
flutter:
  assets:
    - assets/images/logo.png
    - assets/images/      # Entire directory

# Dart code
Image.asset('assets/images/logo.png')  # Must match pubspec exactly

# Common mistakes:
# - Wrong path separator (use / not \\)
# - Missing the directory prefix
# - pubspec indentation wrong (must be under flutter:)`,
    keywords: ["asset", "load", "image", "pubspec", "path", "file"],
  },
  {
    pattern: "HttpException.*Failed host lookup",
    title: "Network Request Failed (No Internet / Bad Host)",
    cause: "Device has no internet connection, or the hostname couldn't be resolved (DNS failure, typo in URL).",
    solution: "Check internet connectivity. Verify URL spelling. Add internet permission on Android. Handle network errors gracefully.",
    code: `// Android: Add to AndroidManifest.xml
<uses-permission android:name="android.permission.INTERNET" />

// Handle network errors
try {
  final response = await http.get(Uri.parse(url));
  return response.body;
} on SocketException {
  throw Exception('No internet connection');
} on HttpException {
  throw Exception('Server error');
} on FormatException {
  throw Exception('Invalid response format');
}`,
    keywords: ["http", "network", "internet", "host", "dns", "socket", "connection"],
  },

  // ── Platform-Specific Errors ──────────────────────────────────────────
  {
    pattern: "PlatformException.*Permission",
    title: "Platform Permission Denied",
    cause: "App tried to access a platform feature (camera, location, storage) without the required permission.",
    solution: "Request permission at runtime using permission_handler package. Declare permissions in platform manifests.",
    code: `// pubspec.yaml
dependencies:
  permission_handler: ^11.0.0

// Request permission
import 'package:permission_handler/permission_handler.dart';

Future<bool> requestCamera() async {
  final status = await Permission.camera.request();
  return status.isGranted;
}

// Android: AndroidManifest.xml
<uses-permission android:name="android.permission.CAMERA" />

// iOS: Info.plist
<key>NSCameraUsageDescription</key>
<string>We need camera access to take photos</string>`,
    keywords: ["permission", "platform", "camera", "location", "storage", "denied"],
  },
  {
    pattern: "Gradle.*build failed",
    title: "Android Gradle Build Failure",
    cause: "Gradle version mismatch, SDK version issues, or dependency conflicts in the Android build.",
    solution: "Check minSdkVersion, compileSdkVersion. Run flutter clean. Update Gradle wrapper. Check for conflicting plugin versions.",
    code: `# Common fixes:
flutter clean
flutter pub get

# android/app/build.gradle - check versions
android {
    compileSdkVersion 34
    defaultConfig {
        minSdkVersion 21       // Minimum for most plugins
        targetSdkVersion 34
    }
}

# android/build.gradle - check Gradle plugin version
buildscript {
    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.0'
    }
}

# android/gradle/wrapper/gradle-wrapper.properties
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.0-all.zip`,
    keywords: ["gradle", "android", "build", "sdk", "version", "compile"],
  },
  {
    pattern: "CocoaPods.*not installed",
    title: "CocoaPods Issue (iOS Build)",
    cause: "CocoaPods not installed, pods not fetched, or pod version conflicts for iOS dependencies.",
    solution: "Install/update CocoaPods. Run pod install. Delete Podfile.lock for fresh resolution.",
    code: `# Install CocoaPods
sudo gem install cocoapods

# Fix pod issues
cd ios
pod deintegrate
pod install --repo-update

# Or from project root
flutter clean
flutter pub get
cd ios && pod install && cd ..
flutter run`,
    keywords: ["cocoapods", "pod", "ios", "xcode", "build", "install"],
  },

  // ── Performance Errors ────────────────────────────────────────────────
  {
    pattern: "The following assertion was thrown during performLayout",
    title: "Layout Assertion Error",
    cause: "Widget received invalid constraints or returned invalid size during layout. Often from negative dimensions or NaN values.",
    solution: "Check for negative padding/margin values. Ensure calculations don't produce NaN or negative numbers. Use LayoutBuilder to inspect constraints.",
    code: `// Debug constraints
LayoutBuilder(
  builder: (context, constraints) {
    assert(constraints.maxWidth > 0, 'Invalid width');
    assert(constraints.maxHeight > 0, 'Invalid height');
    return YourWidget();
  },
)

// Clamp values to prevent negatives
final safeWidth = width.clamp(0.0, double.infinity);`,
    keywords: ["performlayout", "assertion", "layout", "constraints", "negative", "nan"],
  },
  {
    pattern: "Jank|frame.*missed|performance",
    title: "UI Jank / Dropped Frames",
    cause: "Heavy computation on the main (UI) thread, expensive build methods, unnecessary widget rebuilds, or large image decoding.",
    solution: "Use const constructors. Avoid expensive operations in build(). Use compute() for heavy work. Profile with DevTools.",
    code: `// Move heavy work off UI thread
import 'package:flutter/foundation.dart';

final result = await compute(expensiveFunction, data);

// Avoid rebuilding entire tree
// WRONG: setState rebuilds everything
setState(() { _items = newItems; });

// BETTER: Use ValueNotifier + ValueListenableBuilder for localized updates
final _counter = ValueNotifier<int>(0);
ValueListenableBuilder<int>(
  valueListenable: _counter,
  builder: (context, value, child) => Text('\$value'),
)

// Use const widgets for static subtrees
Column(
  children: [
    const ExpensiveHeader(),   // Won't rebuild
    DynamicContent(data: data), // Only this rebuilds
  ],
)`,
    keywords: ["jank", "frame", "performance", "slow", "rebuild", "compute"],
  },
];

/**
 * Format the full error catalog as markdown
 */
export function formatErrorCatalog(): string {
  let text = "# Flutter Common Errors & Solutions\n\n";
  text += `**${errorCatalog.length} error patterns** with causes and fixes.\n\n`;
  text += "---\n\n";

  for (const entry of errorCatalog) {
    text += `## ${entry.title}\n\n`;
    text += `**Pattern:** \`${entry.pattern}\`\n\n`;
    text += `**Cause:** ${entry.cause}\n\n`;
    text += `**Solution:** ${entry.solution}\n\n`;
    if (entry.code) {
      text += "```dart\n" + entry.code + "\n```\n\n";
    }
    text += "---\n\n";
  }

  return text;
}
