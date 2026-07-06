// Dart 3.x language features reference

export interface DartFeature {
  readonly name: string;
  readonly version: string;
  readonly category: string;
  readonly description: string;
  readonly syntax: string;
  readonly example: string;
  readonly tips: string;
  readonly keywords: readonly string[];
}

export const dartFeatures: readonly DartFeature[] = [
  // ── Records ───────────────────────────────────────────────────────────
  {
    name: "Records",
    version: "3.0",
    category: "Types",
    description: "Lightweight, immutable, anonymous composite types. Like tuples with optional named fields.",
    syntax: `// Positional record
(int, String) pair = (42, 'hello');

// Named record
({int x, int y}) point = (x: 10, y: 20);

// Mixed
(int, {String name}) mixed = (1, name: 'Alice');`,
    example: `// Function returning multiple values
(String, int) getUserInfo() {
  return ('Alice', 30);
}

final (name, age) = getUserInfo();
print('$name is $age'); // Alice is 30

// Named fields
({double lat, double lng}) getLocation() {
  return (lat: 37.7749, lng: -122.4194);
}

final (:lat, :lng) = getLocation();`,
    tips: "Records are value types - two records with same values are equal. Great for returning multiple values without creating a class. Destructure with pattern matching.",
    keywords: ["record", "tuple", "multiple return", "positional", "named"],
  },
  {
    name: "Record Types",
    version: "3.0",
    category: "Types",
    description: "Record type annotations with positional and named fields.",
    syntax: `// Type annotations
(int, int) point = (1, 2);
(int x, int y) namedPoint = (1, 2);  // Named for documentation only
({int x, int y}) namedFields = (x: 1, y: 2);  // Named fields in type

// Nullable records
(int, String)? nullableRecord;

// Records as map keys (value equality)
final cache = <(String, int), Widget>{};`,
    example: `typedef Point = ({int x, int y});

Point translate(Point p, int dx, int dy) {
  return (x: p.x + dx, y: p.y + dy);
}`,
    tips: "Record type equality is structural. (int, String) and (int, String) are the same type. Named fields are part of the type: ({int x, int y}) != ({int a, int b}).",
    keywords: ["record", "type", "annotation", "typedef"],
  },

  // ── Patterns ──────────────────────────────────────────────────────────
  {
    name: "Pattern Matching",
    version: "3.0",
    category: "Patterns",
    description: "Destructure and match values in switch expressions, if-case, and variable declarations.",
    syntax: `// Switch expression
final result = switch (value) {
  int n when n > 0 => 'positive',
  int n when n < 0 => 'negative',
  _ => 'zero',
};

// If-case
if (json case {'name': String name, 'age': int age}) {
  print('$name, age $age');
}

// Destructuring assignment
final [a, b, ...rest] = [1, 2, 3, 4, 5];`,
    example: `// JSON parsing with patterns
Object? json = {'name': 'Alice', 'age': 30, 'email': 'a@b.com'};

if (json case {
  'name': String name,
  'age': int age,
  'email': String email,
}) {
  print('Valid user: $name ($email), age $age');
}

// List pattern
final [first, second, ...] = [1, 2, 3, 4, 5];
print(first);  // 1
print(second); // 2`,
    tips: "Patterns replace manual type checking and casting. Use 'when' guards for conditions. Exhaustiveness checking works with sealed classes.",
    keywords: ["pattern", "match", "switch", "destructure", "if-case", "when", "guard"],
  },
  {
    name: "Switch Expressions",
    version: "3.0",
    category: "Patterns",
    description: "Expression-form switch that returns a value. Must be exhaustive.",
    syntax: `// Basic switch expression
final label = switch (status) {
  Status.active => 'Active',
  Status.inactive => 'Inactive',
  Status.pending => 'Pending',
};

// With pattern matching
final description = switch (shape) {
  Circle(radius: var r) => 'Circle with radius $r',
  Rectangle(w: var w, h: var h) => 'Rectangle \${w}x\$h',
};`,
    example: `// Replacing if-else chains
String httpStatus(int code) => switch (code) {
  200 => 'OK',
  301 => 'Moved Permanently',
  404 => 'Not Found',
  >= 500 && < 600 => 'Server Error',
  _ => 'Unknown',
};

// Enum exhaustiveness
enum Flavor { vanilla, chocolate, strawberry }
String describe(Flavor f) => switch (f) {
  Flavor.vanilla => 'Classic',
  Flavor.chocolate => 'Rich',
  Flavor.strawberry => 'Fruity',
  // No _ needed - compiler knows all cases covered
};`,
    tips: "Switch expressions must be exhaustive (cover all cases). Use '_' as wildcard. The compiler enforces exhaustiveness for enums and sealed classes.",
    keywords: ["switch", "expression", "exhaustive", "wildcard", "enum"],
  },
  {
    name: "Object Patterns",
    version: "3.0",
    category: "Patterns",
    description: "Match and destructure object properties by getter name.",
    syntax: `// Match object properties
switch (point) {
  case Point(x: 0, y: 0):
    print('Origin');
  case Point(x: var x, y: var y) when x == y:
    print('On diagonal');
  case Point(:var x, :var y):  // Shorthand
    print('($x, $y)');
}`,
    example: `class User {
  final String name;
  final int age;
  const User(this.name, this.age);
}

String greet(User user) => switch (user) {
  User(name: 'Admin', age: _) => 'Welcome, Admin!',
  User(name: var n, age: >= 18) => 'Hello, $n',
  User(:var name) => 'Hi $name, are you old enough?',
};`,
    tips: "Object patterns match on getter return values, not fields directly. Use :var name shorthand when variable name matches getter name.",
    keywords: ["object", "pattern", "destructure", "getter", "property"],
  },

  // ── Sealed Classes ────────────────────────────────────────────────────
  {
    name: "Sealed Classes",
    version: "3.0",
    category: "Types",
    description: "Abstract classes that restrict which classes can extend/implement them. Enables exhaustive switch.",
    syntax: `sealed class Shape {}

class Circle extends Shape {
  final double radius;
  Circle(this.radius);
}

class Rectangle extends Shape {
  final double width, height;
  Rectangle(this.width, this.height);
}

class Triangle extends Shape {
  final double base, height;
  Triangle(this.base, this.height);
}`,
    example: `sealed class Result<T> {
  const Result();
}

class Success<T> extends Result<T> {
  final T data;
  const Success(this.data);
}

class Failure<T> extends Result<T> {
  final String message;
  final Exception? exception;
  const Failure(this.message, [this.exception]);
}

class Loading<T> extends Result<T> {
  const Loading();
}

// Exhaustive switch - compiler ensures all cases covered
Widget buildUI(Result<User> result) => switch (result) {
  Success(:final data) => UserWidget(user: data),
  Failure(:final message) => ErrorWidget(message: message),
  Loading() => const CircularProgressIndicator(),
};`,
    tips: "Sealed classes can only be extended in the same library. Compiler enforces exhaustiveness in switch. Perfect for state management (Success/Error/Loading), navigation events, etc.",
    keywords: ["sealed", "class", "exhaustive", "sum type", "union", "algebraic"],
  },

  // ── Class Modifiers ───────────────────────────────────────────────────
  {
    name: "Class Modifiers",
    version: "3.0",
    category: "Types",
    description: "New modifiers: base, interface, final, mixin class. Control how classes can be extended/implemented.",
    syntax: `// base: can be extended, not implemented
base class Animal { void breathe() {} }

// interface: can be implemented, not extended
interface class Printable { void print(); }

// final: cannot be extended or implemented outside library
final class DatabaseConnection { }

// mixin class: can be used as both class and mixin
mixin class Walker {
  void walk() => print('Walking');
}

class Robot extends Machine with Walker { }`,
    example: `// Designing a public API
// Users can extend but not implement (preserves invariants)
base class Widget {
  void build() { /* ... */ }
}

// Users can implement but not extend (no inherited behavior)
interface class Logger {
  void log(String message);
}

// Completely locked down
final class Config {
  final String apiUrl;
  const Config(this.apiUrl);
}`,
    tips: "Use 'final' for classes that should not be subclassed. Use 'base' when you want to allow extension but not implementation (preserves super calls). Use 'interface' for pure contracts. 'sealed' implies 'abstract'.",
    keywords: ["class", "modifier", "base", "interface", "final", "mixin", "sealed"],
  },

  // ── Extension Types ───────────────────────────────────────────────────
  {
    name: "Extension Types",
    version: "3.3",
    category: "Types",
    description: "Zero-cost wrapper types that provide a different interface for an existing type at compile time.",
    syntax: `extension type UserId(int value) {
  // Custom methods
  bool get isValid => value > 0;

  // Can implement interfaces
  // implements int  // Expose int methods
}

// Usage
UserId id = UserId(42);
print(id.value);     // 42
print(id.isValid);   // true
// print(id + 1);    // Error! Not an int`,
    example: `// Type-safe IDs (no runtime cost)
extension type UserId(String value) implements String {
  factory UserId.generate() => UserId(Uuid().v4());
}

extension type OrderId(String value) implements String {
  factory OrderId.generate() => OrderId(Uuid().v4());
}

// These are different types at compile time
void processUser(UserId id) { }
void processOrder(OrderId id) { }

// processUser(OrderId('123')); // Compile error!
processUser(UserId('123'));     // OK

// Type-safe JSON keys
extension type JsonMap(Map<String, dynamic> _map) {
  String getString(String key) => _map[key] as String;
  int getInt(String key) => _map[key] as int;
  bool getBool(String key) => _map[key] as bool;
}`,
    tips: "Extension types are erased at runtime (zero cost). Use 'implements' to expose the underlying type's methods. Perfect for type-safe wrappers around primitives (IDs, units, etc.).",
    keywords: ["extension", "type", "wrapper", "zero-cost", "newtype", "id"],
  },

  // ── Extensions ────────────────────────────────────────────────────────
  {
    name: "Extensions",
    version: "2.7",
    category: "Types",
    description: "Add methods to existing types without modifying them.",
    syntax: `extension StringExtension on String {
  String capitalize() {
    if (isEmpty) return this;
    return '\${this[0].toUpperCase()}\${substring(1)}';
  }

  bool get isEmail => RegExp(r'^[\\w.]+@[\\w.]+\\.[a-z]+$').hasMatch(this);
}

// Usage
'hello'.capitalize(); // 'Hello'
'a@b.com'.isEmail;    // true`,
    example: `// Context extensions for Flutter
extension BuildContextExtension on BuildContext {
  ThemeData get theme => Theme.of(this);
  TextTheme get textTheme => Theme.of(this).textTheme;
  ColorScheme get colorScheme => Theme.of(this).colorScheme;
  MediaQueryData get mediaQuery => MediaQuery.of(this);
  double get screenWidth => mediaQuery.size.width;
  double get screenHeight => mediaQuery.size.height;

  void showSnackBar(String message) {
    ScaffoldMessenger.of(this).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}

// Usage in widget
Text('Hello', style: context.textTheme.headlineMedium)
context.showSnackBar('Saved!');`,
    tips: "Extensions are resolved statically (based on declared type, not runtime type). Use named extensions for library exports. Unnamed extensions are file-private.",
    keywords: ["extension", "method", "utility", "helper"],
  },

  // ── Enhanced Enums ────────────────────────────────────────────────────
  {
    name: "Enhanced Enums",
    version: "2.17",
    category: "Types",
    description: "Enums with fields, constructors, methods, and interface implementation.",
    syntax: `enum Priority implements Comparable<Priority> {
  low(1, 'Low Priority'),
  medium(2, 'Medium Priority'),
  high(3, 'High Priority'),
  critical(4, 'Critical!');

  final int level;
  final String label;

  const Priority(this.level, this.label);

  bool get isUrgent => level >= 3;

  @override
  int compareTo(Priority other) => level.compareTo(other.level);
}`,
    example: `enum HttpMethod {
  get('GET'),
  post('POST'),
  put('PUT'),
  patch('PATCH'),
  delete('DELETE');

  final String value;
  const HttpMethod(this.value);

  bool get isModifying => this != get;

  static HttpMethod fromString(String method) {
    return HttpMethod.values.firstWhere(
      (e) => e.value.toUpperCase() == method.toUpperCase(),
      orElse: () => throw ArgumentError('Unknown method: $method'),
    );
  }
}`,
    tips: "Enhanced enums are great for replacing string constants with type-safe values. All fields must be final. Constructors must be const.",
    keywords: ["enum", "enhanced", "field", "method", "constructor"],
  },

  // ── Null Safety ───────────────────────────────────────────────────────
  {
    name: "Sound Null Safety",
    version: "2.12",
    category: "Safety",
    description: "Type system distinguishes nullable and non-nullable types. Prevents null reference errors at compile time.",
    syntax: `// Non-nullable (default)
String name = 'Alice';    // Cannot be null
// name = null;           // Compile error!

// Nullable
String? nickname;          // Can be null
nickname = null;           // OK

// Null-aware operators
final len = nickname?.length;     // int? (null if nickname is null)
final safe = nickname ?? 'N/A';   // String (default if null)
nickname ??= 'Default';           // Assign only if null

// Assertion operator (use carefully!)
final bang = nickname!;            // Throws if null at runtime`,
    example: `// Late initialization
late final String _apiKey;

void init(String key) {
  _apiKey = key;  // Must be set before use
}

// Null promotion
void process(String? input) {
  if (input == null) return;
  // input is promoted to String here
  print(input.length);  // No ? needed
}

// Collection null safety
final List<String> names = [];        // Non-nullable list of non-nullable strings
final List<String?> maybeNames = [];  // Non-nullable list of nullable strings
final List<String>? nullableList;     // Nullable list of non-nullable strings`,
    tips: "Avoid the ! operator - it defeats null safety. Use ?? for defaults, ?. for optional access, and if-null checks for promotion. late should be rare - prefer nullable types.",
    keywords: ["null", "safety", "nullable", "late", "bang", "promotion"],
  },

  // ── Async ─────────────────────────────────────────────────────────────
  {
    name: "Async/Await & Futures",
    version: "1.0",
    category: "Async",
    description: "Asynchronous programming with Future, async/await, and error handling.",
    syntax: `// Basic async/await
Future<String> fetchData() async {
  final response = await http.get(Uri.parse(url));
  return response.body;
}

// Error handling
try {
  final data = await fetchData();
} on HttpException catch (e) {
  print('HTTP error: $e');
} catch (e, stackTrace) {
  print('Error: $e\\n$stackTrace');
}

// Parallel execution
final results = await Future.wait([
  fetchUsers(),
  fetchPosts(),
  fetchComments(),
]);`,
    example: `// Timeout
final data = await fetchData().timeout(
  Duration(seconds: 10),
  onTimeout: () => throw TimeoutException('Fetch timed out'),
);

// Retry pattern
Future<T> retry<T>(Future<T> Function() fn, {int maxAttempts = 3}) async {
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt == maxAttempts) rethrow;
      await Future.delayed(Duration(seconds: attempt));
    }
  }
  throw StateError('Unreachable');
}`,
    tips: "Use Future.wait() for parallel async operations. Always handle errors with try/catch. Use .timeout() to prevent indefinite waiting. Avoid mixing then() and await.",
    keywords: ["async", "await", "future", "promise", "parallel", "concurrent"],
  },
  {
    name: "Streams",
    version: "1.0",
    category: "Async",
    description: "Asynchronous sequences of events. Single-subscription or broadcast.",
    syntax: `// Creating streams
Stream<int> countStream(int max) async* {
  for (var i = 0; i < max; i++) {
    yield i;
    await Future.delayed(Duration(seconds: 1));
  }
}

// Listening
final sub = countStream(5).listen(
  (value) => print(value),
  onError: (e) => print('Error: $e'),
  onDone: () => print('Done'),
);

// Don't forget to cancel!
sub.cancel();`,
    example: `// StreamController for custom streams
class EventBus {
  final _controller = StreamController<AppEvent>.broadcast();

  Stream<AppEvent> get stream => _controller.stream;

  void emit(AppEvent event) => _controller.add(event);

  void dispose() => _controller.close();
}

// Stream transformations
stream
  .where((event) => event.type == EventType.user)
  .map((event) => event.data as UserData)
  .distinct()
  .debounce(Duration(milliseconds: 300))
  .listen((userData) => updateUI(userData));`,
    tips: "Always cancel subscriptions in dispose(). Use broadcast streams for multiple listeners. async* + yield for generating streams. StreamController needs explicit close().",
    keywords: ["stream", "subscription", "broadcast", "yield", "controller", "listen"],
  },
  {
    name: "Isolates",
    version: "2.15",
    category: "Async",
    description: "Dart's concurrency model. Isolates run in separate memory spaces with message passing.",
    syntax: `// Simple isolate with compute()
import 'package:flutter/foundation.dart';

final result = await compute(heavyComputation, inputData);

// Full isolate control
final receivePort = ReceivePort();
final isolate = await Isolate.spawn(
  _isolateEntry,
  receivePort.sendPort,
);`,
    example: `// Isolate.run (Dart 2.19+, simpler API)
final result = await Isolate.run(() {
  // Runs in a separate isolate
  return expensiveJsonParse(hugeJsonString);
});

// Flutter compute for heavy work
Future<List<ProcessedItem>> processItems(List<RawItem> items) {
  return compute(_processInBackground, items);
}

List<ProcessedItem> _processInBackground(List<RawItem> items) {
  // Must be a top-level or static function
  return items.map((item) => ProcessedItem.from(item)).toList();
}`,
    tips: "Use compute() in Flutter for simple background work. Isolate.run() is even simpler in Dart 2.19+. Functions must be top-level or static. Can't share mutable state between isolates.",
    keywords: ["isolate", "concurrency", "compute", "background", "thread", "parallel"],
  },

  // ── Modern Syntax (Dart 3.6+) ─────────────────────────────────────────
  {
    name: "Digit Separators",
    version: "3.6",
    category: "Syntax",
    description: "Underscores in numeric literals to group digits for readability. Purely visual - the value is unchanged.",
    syntax: `// Decimal
final million = 1_000_000;
final billion = 1_000_000_000;

// Hex and binary
final mask = 0xFF_FF_FF_FF;
final flags = 0b1010_1010;

// Doubles
final micro = 0.000_001;
final price = 1_299.99;`,
    example: `const maxFileSize = 10_000_000; // 10 MB
const timeoutMs = 30_000;
const cardNumber = 1234_5678_9012_3456;

// Separators do not change the value
assert(1_000_000 == 1000000);`,
    tips: "Separators can appear anywhere between digits, but not at the start or end of a literal, or next to the decimal point. Group decimals by thousands and hex/binary by bytes or nibbles.",
    keywords: ["digit", "separator", "underscore", "literal", "number", "readability"],
  },
  {
    name: "Wildcard Variables",
    version: "3.7",
    category: "Syntax",
    description: "The identifier `_` is non-binding: it declares nothing, so multiple `_` parameters and local variables can coexist.",
    syntax: `// Multiple wildcard parameters - no name collisions
onDrag((_, _) => print('dragging'));

// Unused local variable
final _ = logAndReturn();

// For loop where the element is unused
for (final _ in items) {
  count++;
}`,
    example: `// Callbacks that ignore their arguments
stream.listen((_) => refresh());

// Before Dart 3.7 each unused parameter needed a unique name (_, __, ___)
grid.onCellTap((_, _, _) => deselect());

// Wildcards in patterns were already non-binding
switch (pair) {
  case (int x, _):
    print('first is $x');
}`,
    tips: "`_` no longer creates a variable, so you cannot read it after declaring it. Field and getter names starting with `_` are unaffected - that is still library privacy, not a wildcard.",
    keywords: ["wildcard", "underscore", "unused", "parameter", "non-binding"],
  },
  {
    name: "Null-Aware Elements",
    version: "3.8",
    category: "Syntax",
    description: "A `?` before a collection element includes it only when it is non-null. Works in lists, sets, and map keys/values.",
    syntax: `String? title;
String? subtitle;
int? id;

final list = [?title, 'always here'];  // title omitted if null
final set = {?title, ?subtitle};
final map = {'id': ?id};               // entry omitted if id is null`,
    example: `// Optional widgets without if-null boilerplate
Column(
  children: [
    ?header,          // Widget? - skipped when null
    const Divider(),
    ?footer,
  ],
);

// Before Dart 3.8:
// if (header != null) header!,

// Query params without null checks
final params = {
  'q': query,
  'page': ?page?.toString(),
  'filter': ?filter,
};`,
    tips: "Replaces the `if (x != null) x!` collection-if idiom. The `?` applies to a single element (or the map key/value it prefixes). For whole collections, the spread form `...?maybeList` still works.",
    keywords: ["null-aware", "element", "collection", "list", "map", "set", "conditional"],
  },
  {
    name: "Dot Shorthands",
    version: "3.10",
    category: "Syntax",
    description: "Omit the type name when context already infers it: `.center` instead of `Alignment.center`. Works for enum values, static members, and constructors.",
    syntax: `// Enum values
Alignment alignment = .center;   // Alignment.center

// Static members / constructors
int x = .parse('42');            // int.parse('42')
Duration d = .zero;              // Duration.zero

// In arguments where the parameter type is known
Container(alignment: .topLeft);`,
    example: `// Widget code gets much terser
Column(
  mainAxisAlignment: .spaceBetween,
  crossAxisAlignment: .start,
  children: [/* ... */],
);

TextStyle(fontWeight: .bold);

// Switch on enums
final label = switch (status) {
  .active => 'Active',
  .inactive => 'Inactive',
  .pending => 'Pending',
};`,
    tips: "The context type must be known - shorthands resolve against the expected type's static namespace. Great for enums, Alignment, EdgeInsets, Duration, etc. If the context type is dynamic or ambiguous, spell out the type name.",
    keywords: ["dot", "shorthand", "enum", "static", "inference", "terse"],
  },

  // ── Constructors (Dart 3.12) ──────────────────────────────────────────
  {
    name: "Private Named Parameters",
    version: "3.12",
    category: "Types",
    description: "Use `this._field` directly as a named constructor parameter. The public argument name is derived by stripping the leading underscore.",
    syntax: `class ApiClient {
  final String _baseUrl;
  final Duration _timeout;

  // Callers pass baseUrl: / timeout: - underscore is stripped
  ApiClient({
    required this._baseUrl,
    this._timeout = const Duration(seconds: 30),
  });
}

final client = ApiClient(baseUrl: 'https://api.example.com');`,
    example: `// Before Dart 3.12 - manual forwarding boilerplate:
class Counter {
  final int _count;
  Counter({required int count}) : _count = count;
}

// Dart 3.12:
class Counter {
  final int _count;
  Counter({required this._count});
}

final c = Counter(count: 5); // public name derived automatically`,
    tips: "Only the parameter's external name loses the underscore - the field itself stays private to the library. If stripping the underscore would collide with another parameter name, it is a compile error.",
    keywords: ["private", "named", "parameter", "constructor", "underscore", "field"],
  },
  {
    name: "Primary Constructors (Experimental)",
    version: "3.12",
    category: "Types",
    description: "EXPERIMENTAL in Dart 3.12: declare constructor parameters and fields directly in the class header. Requires an experiment flag - not yet stable.",
    syntax: `// Enable the experiment first:
// dart --enable-experiment=primary-constructors
//
// analysis_options.yaml:
// analyzer:
//   enable-experiment:
//     - primary-constructors

class Point(final int x, final int y);

// Equivalent to:
class Point {
  final int x;
  final int y;
  Point(this.x, this.y);
}`,
    example: `// Header parameters become fields
class User(final String name, {final int age = 0});

final u = User('Alice', age: 30);
print(u.name); // Alice

// Combine with a class body
class Vector(final double x, final double y) {
  double get length => sqrt(x * x + y * y);
}`,
    tips: "EXPERIMENTAL - syntax and semantics may change before stabilizing. Do not use in production code or published packages yet. Requires --enable-experiment=primary-constructors (and the matching analyzer setting) on Dart 3.12.",
    keywords: ["primary", "constructor", "experimental", "header", "field", "boilerplate"],
  },

  // ── Macros (Cancelled) ────────────────────────────────────────────────
  {
    name: "Macros (Cancelled)",
    version: "—",
    category: "Metaprogramming",
    description: "Dart macros were cancelled by the Dart team in January 2025 and never shipped. Use build_runner with freezed and json_serializable instead - they remain the standard for code generation.",
    syntax: `// Macros never shipped. Use build_runner codegen instead:
//
// pubspec.yaml
// dependencies:
//   freezed_annotation: ^3.0.0
//   json_annotation: ^4.9.0
// dev_dependencies:
//   build_runner: ^2.4.0
//   freezed: ^3.0.0
//   json_serializable: ^6.9.0

import 'package:freezed_annotation/freezed_annotation.dart';

part 'user.freezed.dart';
part 'user.g.dart';

@freezed
abstract class User with _$User {
  const factory User({
    required String name,
    required int age,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}`,
    example: `// Generate the code:
// dart run build_runner build --delete-conflicting-outputs

@freezed
abstract class Product with _$Product {
  const factory Product({
    required String id,
    required String name,
    required double price,
    required List<String> tags,
  }) = _Product;

  factory Product.fromJson(Map<String, dynamic> json) =>
      _$ProductFromJson(json);
}

// build_runner generates:
// Product.fromJson / toJson, ==, hashCode, toString, copyWith`,
    tips: "Macros were cancelled in January 2025 because compile-time performance could not be made acceptable. The Dart team instead invested in making build_runner faster and improving the analyzer. Stick with build_runner + freezed + json_serializable for data classes and JSON serialization.",
    keywords: ["macro", "codegen", "compile-time", "json", "data class", "freezed", "cancelled", "build_runner"],
  },
];

/**
 * Format all Dart features as markdown
 */
export function formatDartFeatures(): string {
  const categories = new Map<string, DartFeature[]>();

  for (const feature of dartFeatures) {
    const existing = categories.get(feature.category) ?? [];
    categories.set(feature.category, [...existing, feature]);
  }

  let text = "# Dart Language Features Reference\n\n";
  text += `**${dartFeatures.length} features** covering Dart 2.7 through 3.12\n\n`;
  text += "---\n\n";

  for (const [category, features] of categories) {
    text += `## ${category}\n\n`;
    for (const f of features) {
      text += `### ${f.name} (Dart ${f.version})\n\n`;
      text += `${f.description}\n\n`;
      text += "**Syntax:**\n```dart\n" + f.syntax + "\n```\n\n";
      text += "**Example:**\n```dart\n" + f.example + "\n```\n\n";
      text += `**Tips:** ${f.tips}\n\n`;
    }
  }

  return text;
}
