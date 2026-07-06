// State management patterns and code generation templates

export interface PatternEntry {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly example: string;
  readonly whenToUse: string;
}

export const statePatterns: readonly PatternEntry[] = [
  // ── BLoC ──────────────────────────────────────────────────────────────
  {
    name: "BLoC (Business Logic Component)",
    category: "State Management",
    description: "Separates business logic from UI using events and states. Built on streams. Highly testable and scalable.",
    pros: ["Excellent testability (blocTest)", "Clear separation of concerns", "Scalable for large apps", "Great DevTools integration", "Predictable state transitions"],
    cons: ["Verbose boilerplate (events, states, bloc)", "Steeper learning curve", "Overkill for simple apps", "Many files per feature"],
    whenToUse: "Large apps, teams, complex state transitions, when testability is critical",
    example: `// Events
sealed class CounterEvent {}
class Increment extends CounterEvent {}
class Decrement extends CounterEvent {}
class Reset extends CounterEvent {}

// State
class CounterState {
  final int count;
  const CounterState({this.count = 0});

  CounterState copyWith({int? count}) {
    return CounterState(count: count ?? this.count);
  }
}

// BLoC
class CounterBloc extends Bloc<CounterEvent, CounterState> {
  CounterBloc() : super(const CounterState()) {
    on<Increment>((event, emit) {
      emit(state.copyWith(count: state.count + 1));
    });
    on<Decrement>((event, emit) {
      emit(state.copyWith(count: state.count - 1));
    });
    on<Reset>((event, emit) {
      emit(const CounterState());
    });
  }
}

// UI
class CounterPage extends StatelessWidget {
  const CounterPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CounterBloc, CounterState>(
      builder: (context, state) {
        return Column(
          children: [
            Text('\${state.count}'),
            ElevatedButton(
              onPressed: () => context.read<CounterBloc>().add(Increment()),
              child: const Text('Increment'),
            ),
          ],
        );
      },
    );
  }
}`,
  },

  // ── Riverpod ──────────────────────────────────────────────────────────
  {
    name: "Riverpod",
    category: "State Management",
    description: "Compile-safe, testable state management (Riverpod 3.x). Notifier/AsyncNotifier-first API with no BuildContext dependency. Code generation with riverpod_generator (@riverpod) is the recommended style.",
    pros: ["Compile-safe (no runtime errors)", "No BuildContext needed for providers", "Unified Notifier/AsyncNotifier API in 3.x", "Auto-dispose support", "@riverpod code generation reduces boilerplate", "Excellent for dependency injection"],
    cons: ["Learning curve for provider types", "ref.watch vs ref.read confusion", "Code generation adds build step", "Legacy StateNotifier code needs migration"],
    whenToUse: "Any size app, when you want compile safety, dependency injection, or are starting a new project",
    example: `// Provider (read-only)
final greetingProvider = Provider<String>((ref) {
  return 'Hello, World!';
});

// NotifierProvider (mutable state) - the Riverpod 3 standard
final counterProvider = NotifierProvider<CounterNotifier, int>(CounterNotifier.new);

class CounterNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void increment() => state = state + 1;
  void decrement() => state = state - 1;
  void reset() => state = 0;
}

// AsyncNotifierProvider (async state)
final usersProvider = AsyncNotifierProvider<UsersNotifier, List<User>>(UsersNotifier.new);

class UsersNotifier extends AsyncNotifier<List<User>> {
  @override
  Future<List<User>> build() async {
    return ref.read(apiProvider).fetchUsers();
  }

  Future<void> addUser(User user) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(apiProvider).createUser(user);
      return ref.read(apiProvider).fetchUsers();
    });
  }
}

// Recommended: @riverpod code generation (riverpod_generator)
// part 'counter.g.dart';
@riverpod
class Counter extends _\$Counter {
  @override
  int build() => 0;

  void increment() => state = state + 1;
}
// Generates counterProvider. Run:
// dart run build_runner build --delete-conflicting-outputs

// NOTE: StateNotifier / StateNotifierProvider are LEGACY in Riverpod 3.
// They moved to a legacy import:
//   import 'package:flutter_riverpod/legacy.dart';
// Prefer Notifier / AsyncNotifier for all new code.

// UI - ConsumerWidget
class CounterPage extends ConsumerWidget {
  const CounterPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(counterProvider);
    return Column(
      children: [
        Text('\$count'),
        ElevatedButton(
          onPressed: () => ref.read(counterProvider.notifier).increment(),
          child: const Text('Increment'),
        ),
      ],
    );
  }
}

// Async UI
class UsersPage extends ConsumerWidget {
  const UsersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usersAsync = ref.watch(usersProvider);
    return usersAsync.when(
      data: (users) => ListView.builder(
        itemCount: users.length,
        itemBuilder: (context, index) => ListTile(title: Text(users[index].name)),
      ),
      loading: () => const CircularProgressIndicator(),
      error: (error, stack) => Text('Error: \$error'),
    );
  }
}`,
  },

  // ── Provider ──────────────────────────────────────────────────────────
  {
    name: "Provider (package:provider)",
    category: "State Management",
    description: "Flutter's recommended simple state management. Wraps InheritedWidget with a friendlier API.",
    pros: ["Simple to learn", "Officially recommended by Flutter team", "Good for small-medium apps", "Works well with ChangeNotifier", "Minimal boilerplate"],
    cons: ["Relies on BuildContext", "Runtime errors if provider not found", "Less powerful than Riverpod", "ChangeNotifier encourages mutation"],
    whenToUse: "Small to medium apps, beginners, prototyping, when simplicity is preferred",
    example: `// Model with ChangeNotifier
class CartModel extends ChangeNotifier {
  final List<Product> _items = [];

  List<Product> get items => List.unmodifiable(_items);
  int get count => _items.length;
  double get totalPrice => _items.fold(0, (sum, item) => sum + item.price);

  void add(Product product) {
    _items.add(product);
    notifyListeners();
  }

  void remove(Product product) {
    _items.remove(product);
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }
}

// Provide at app level
void main() {
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => CartModel()),
        ChangeNotifierProvider(create: (_) => UserModel()),
      ],
      child: const MyApp(),
    ),
  );
}

// Consume in widget
class CartPage extends StatelessWidget {
  const CartPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<CartModel>(
      builder: (context, cart, child) {
        return Column(
          children: [
            Text('Items: \${cart.count}'),
            Text('Total: \\\$\${cart.totalPrice.toStringAsFixed(2)}'),
            ElevatedButton(
              onPressed: () => cart.clear(),
              child: const Text('Clear Cart'),
            ),
          ],
        );
      },
    );
  }
}

// Read without rebuilding
context.read<CartModel>().add(product);

// Select specific value (rebuilds only when selected value changes)
final count = context.select<CartModel, int>((cart) => cart.count);`,
  },

  // ── GetX ──────────────────────────────────────────────────────────────
  {
    name: "GetX",
    category: "State Management",
    description: "All-in-one solution: state management, navigation, dependency injection, and utilities.",
    pros: ["Minimal boilerplate", "Built-in navigation and DI", "Reactive with .obs", "Large community"],
    cons: ["Non-standard patterns", "Magic behavior hides complexity", "Hard to debug", "Tight coupling to GetX ecosystem", "Not recommended by Flutter team"],
    whenToUse: "Rapid prototyping, if team is already invested in GetX ecosystem (generally not recommended for new projects)",
    example: `// Controller
class CounterController extends GetxController {
  final count = 0.obs;  // Observable

  void increment() => count.value++;
  void decrement() => count.value--;
}

// Usage
class CounterPage extends StatelessWidget {
  final controller = Get.put(CounterController());

  @override
  Widget build(BuildContext context) {
    return Obx(() => Text('\${controller.count}'));
  }
}`,
  },

  // ── ValueNotifier ─────────────────────────────────────────────────────
  {
    name: "ValueNotifier / ChangeNotifier",
    category: "State Management",
    description: "Flutter's built-in state primitives. No external packages needed. Great for simple, localized state.",
    pros: ["Zero dependencies", "Built into Flutter", "Simple mental model", "Great for localized state", "ValueListenableBuilder for efficient rebuilds"],
    cons: ["Manual lifecycle management", "No built-in async support", "No dependency injection", "Doesn't scale well alone"],
    whenToUse: "Localized widget state, simple counters/toggles, when avoiding external packages",
    example: `// ValueNotifier - single value
class CounterWidget extends StatefulWidget {
  const CounterWidget({super.key});

  @override
  State<CounterWidget> createState() => _CounterWidgetState();
}

class _CounterWidgetState extends State<CounterWidget> {
  final _counter = ValueNotifier<int>(0);

  @override
  void dispose() {
    _counter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Only this Text rebuilds when counter changes
        ValueListenableBuilder<int>(
          valueListenable: _counter,
          builder: (context, value, child) => Text('\$value'),
        ),
        ElevatedButton(
          onPressed: () => _counter.value++,
          child: const Text('Increment'),
        ),
      ],
    );
  }
}`,
  },
];

/**
 * Format state management comparison as markdown
 */
export function formatStateManagement(): string {
  let text = "# Flutter State Management Comparison\n\n";

  // Summary table
  text += "## Quick Comparison\n\n";
  text += "| Pattern | Complexity | Testability | Scalability | Boilerplate |\n";
  text += "|---------|-----------|-------------|-------------|-------------|\n";
  text += "| BLoC | High | Excellent | Excellent | High |\n";
  text += "| Riverpod | Medium | Excellent | Excellent | Low-Medium |\n";
  text += "| Provider | Low | Good | Good | Low |\n";
  text += "| GetX | Low | Poor | Poor | Very Low |\n";
  text += "| ValueNotifier | Very Low | Good | Limited | Very Low |\n\n";

  text += "---\n\n";

  for (const pattern of statePatterns) {
    text += `## ${pattern.name}\n\n`;
    text += `${pattern.description}\n\n`;
    text += `**When to Use:** ${pattern.whenToUse}\n\n`;
    text += `**Pros:** ${pattern.pros.join(", ")}\n\n`;
    text += `**Cons:** ${pattern.cons.join(", ")}\n\n`;
    text += "**Example:**\n```dart\n" + pattern.example + "\n```\n\n";
    text += "---\n\n";
  }

  return text;
}

// ── Code Generation Templates ───────────────────────────────────────────

export interface CodegenTemplate {
  readonly name: string;
  readonly description: string;
  readonly generate: (name: string, props?: readonly string[]) => string;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[_\-\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/[_\-\s]+/g, "_");
}

export const codegenTemplates: Record<string, CodegenTemplate> = {
  stateless: {
    name: "StatelessWidget",
    description: "A basic StatelessWidget with const constructor",
    generate: (name: string, props?: readonly string[]) => {
      const className = toPascalCase(name);
      const fileName = toSnakeCase(name);
      const propDecls = (props ?? [])
        .map((p) => `  final ${p.includes(" ") ? p : `String ${p}`};`)
        .join("\n");
      const propParams = (props ?? [])
        .map((p) => {
          const propName = p.includes(" ") ? p.split(" ").pop()! : p;
          return `    required this.${propName},`;
        })
        .join("\n");
      const hasProps = (props ?? []).length > 0;

      return `// ${fileName}.dart
import 'package:flutter/material.dart';

class ${className} extends StatelessWidget {
  const ${className}({
    super.key,${hasProps ? "\n" + propParams : ""}
  });
${hasProps ? "\n" + propDecls + "\n" : ""}
  @override
  Widget build(BuildContext context) {
    return const Placeholder();
  }
}`;
    },
  },

  stateful: {
    name: "StatefulWidget",
    description: "A StatefulWidget with proper lifecycle",
    generate: (name: string, props?: readonly string[]) => {
      const className = toPascalCase(name);
      const fileName = toSnakeCase(name);
      const propDecls = (props ?? [])
        .map((p) => `  final ${p.includes(" ") ? p : `String ${p}`};`)
        .join("\n");
      const propParams = (props ?? [])
        .map((p) => {
          const propName = p.includes(" ") ? p.split(" ").pop()! : p;
          return `    required this.${propName},`;
        })
        .join("\n");
      const hasProps = (props ?? []).length > 0;

      return `// ${fileName}.dart
import 'package:flutter/material.dart';

class ${className} extends StatefulWidget {
  const ${className}({
    super.key,${hasProps ? "\n" + propParams : ""}
  });
${hasProps ? "\n" + propDecls + "\n" : ""}
  @override
  State<${className}> createState() => _${className}State();
}

class _${className}State extends State<${className}> {
  @override
  void initState() {
    super.initState();
    // Initialize state here
  }

  @override
  void dispose() {
    // Clean up controllers, subscriptions, etc.
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return const Placeholder();
  }
}`;
    },
  },

  bloc: {
    name: "BLoC (Event + State + Bloc)",
    description: "Complete BLoC pattern with events, states, and bloc class",
    generate: (name: string, props?: readonly string[]) => {
      const className = toPascalCase(name);
      const fileName = toSnakeCase(name);
      const stateProps = (props ?? ["data"])
        .map((p) => {
          const parts = p.includes(" ") ? p.split(" ") : ["dynamic", p];
          return { type: parts[0], name: parts[parts.length - 1] };
        });
      const propDecls = stateProps
        .map((p) => `  final ${p.type} ${p.name};`)
        .join("\n");
      const propParams = stateProps
        .map((p) => `    ${p.type === "dynamic" ? "" : ""}this.${p.name} = ${p.type === "String" ? "''" : p.type === "int" || p.type === "double" ? "0" : p.type === "bool" ? "false" : "const []"},`)
        .join("\n");
      const copyWithParams = stateProps
        .map((p) => `    ${p.type}? ${p.name},`)
        .join("\n");
      const copyWithBody = stateProps
        .map((p) => `      ${p.name}: ${p.name} ?? this.${p.name},`)
        .join("\n");

      return `// ${fileName}_bloc.dart
import 'package:flutter_bloc/flutter_bloc.dart';

// ── Events ──────────────────────────────────────────────────────────────

sealed class ${className}Event {}

class Load${className} extends ${className}Event {}

class Update${className} extends ${className}Event {
${propDecls}
  Update${className}({${stateProps.map((p) => `required this.${p.name}`).join(", ")}});
}

class Reset${className} extends ${className}Event {}

// ── State ───────────────────────────────────────────────────────────────

enum ${className}Status { initial, loading, success, failure }

class ${className}State {
  final ${className}Status status;
${propDecls}
  final String? errorMessage;

  const ${className}State({
    this.status = ${className}Status.initial,
${propParams}
    this.errorMessage,
  });

  ${className}State copyWith({
    ${className}Status? status,
${copyWithParams}
    String? errorMessage,
  }) {
    return ${className}State(
      status: status ?? this.status,
${copyWithBody}
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}

// ── BLoC ────────────────────────────────────────────────────────────────

class ${className}Bloc extends Bloc<${className}Event, ${className}State> {
  ${className}Bloc() : super(const ${className}State()) {
    on<Load${className}>(_onLoad);
    on<Update${className}>(_onUpdate);
    on<Reset${className}>(_onReset);
  }

  Future<void> _onLoad(
    Load${className} event,
    Emitter<${className}State> emit,
  ) async {
    emit(state.copyWith(status: ${className}Status.loading));
    try {
      // TODO: Load data
      emit(state.copyWith(status: ${className}Status.success));
    } catch (e) {
      emit(state.copyWith(
        status: ${className}Status.failure,
        errorMessage: e.toString(),
      ));
    }
  }

  void _onUpdate(
    Update${className} event,
    Emitter<${className}State> emit,
  ) {
    emit(state.copyWith(${stateProps.map((p) => `${p.name}: event.${p.name}`).join(", ")}));
  }

  void _onReset(
    Reset${className} event,
    Emitter<${className}State> emit,
  ) {
    emit(const ${className}State());
  }
}`;
    },
  },

  riverpod: {
    name: "Riverpod (Notifier + Provider)",
    description: "Riverpod 3 Notifier with NotifierProvider, state class, and async support",
    generate: (name: string, props?: readonly string[]) => {
      const className = toPascalCase(name);
      const fileName = toSnakeCase(name);
      const varName = toCamelCase(name);
      const stateProps = (props ?? ["data"])
        .map((p) => {
          const parts = p.includes(" ") ? p.split(" ") : ["dynamic", p];
          return { type: parts[0], name: parts[parts.length - 1] };
        });
      const propDecls = stateProps
        .map((p) => `  final ${p.type} ${p.name};`)
        .join("\n");
      const propParams = stateProps
        .map((p) => `    ${p.type === "dynamic" ? "" : ""}this.${p.name} = ${p.type === "String" ? "''" : p.type === "int" || p.type === "double" ? "0" : p.type === "bool" ? "false" : "const []"},`)
        .join("\n");
      const copyWithParams = stateProps
        .map((p) => `    ${p.type}? ${p.name},`)
        .join("\n");
      const copyWithBody = stateProps
        .map((p) => `      ${p.name}: ${p.name} ?? this.${p.name},`)
        .join("\n");

      return `// ${fileName}_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ── State ───────────────────────────────────────────────────────────────

class ${className}State {
${propDecls}
  final bool isLoading;
  final String? error;

  const ${className}State({
${propParams}
    this.isLoading = false,
    this.error,
  });

  ${className}State copyWith({
${copyWithParams}
    bool? isLoading,
    String? error,
  }) {
    return ${className}State(
${copyWithBody}
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

// ── Notifier ────────────────────────────────────────────────────────────

class ${className}Notifier extends Notifier<${className}State> {
  @override
  ${className}State build() => const ${className}State();

  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // TODO: Load data
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void reset() {
    state = const ${className}State();
  }
}

// ── Provider ────────────────────────────────────────────────────────────

final ${varName}Provider = NotifierProvider<${className}Notifier, ${className}State>(
  ${className}Notifier.new,
);

// Prefer the @riverpod codegen style (riverpod_generator) for new code:
//   part '${fileName}_provider.g.dart';
//
//   @riverpod
//   class ${className} extends _\$${className} {
//     @override
//     ${className}State build() => const ${className}State();
//   }
//
// Then run: dart run build_runner build --delete-conflicting-outputs`;
    },
  },

  test: {
    name: "Widget Test",
    description: "Widget test file with common test patterns",
    generate: (name: string) => {
      const className = toPascalCase(name);
      const fileName = toSnakeCase(name);

      return `// ${fileName}_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// import 'package:your_app/features/${fileName}/${fileName}.dart';

void main() {
  group('${className}', () {
    testWidgets('renders correctly', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Placeholder(), // Replace with ${className}()
          ),
        ),
      );

      // Verify initial state
      expect(find.byType(Placeholder), findsOneWidget);
    });

    testWidgets('handles user interaction', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Placeholder(), // Replace with ${className}()
          ),
        ),
      );

      // TODO: Add interaction tests
      // await tester.tap(find.byType(ElevatedButton));
      // await tester.pump();
      // expect(find.text('Expected'), findsOneWidget);
    });

    testWidgets('shows loading state', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Placeholder(), // Replace with ${className}()
          ),
        ),
      );

      // TODO: Verify loading indicator
      // expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('shows error state', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Placeholder(), // Replace with ${className}()
          ),
        ),
      );

      // TODO: Verify error message
      // expect(find.text('Error occurred'), findsOneWidget);
    });
  });
}`;
    },
  },

  freezed: {
    name: "Freezed Data Class",
    description: "Immutable data class using freezed package with JSON serialization",
    generate: (name: string, props?: readonly string[]) => {
      const className = toPascalCase(name);
      const fileName = toSnakeCase(name);
      const stateProps = (props ?? ["String name", "int age"])
        .map((p) => {
          const parts = p.includes(" ") ? p.split(" ") : ["String", p];
          return { type: parts.slice(0, -1).join(" "), name: parts[parts.length - 1] };
        });
      const propDecls = stateProps
        .map((p) => `    required ${p.type} ${p.name},`)
        .join("\n");

      return `// ${fileName}.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part '${fileName}.freezed.dart';
part '${fileName}.g.dart';

@freezed
abstract class ${className} with _$${className} {
  const factory ${className}({
${propDecls}
  }) = _${className};

  factory ${className}.fromJson(Map<String, dynamic> json) =>
      _$${className}FromJson(json);
}

// Run: dart run build_runner build --delete-conflicting-outputs`;
    },
  },

  repository: {
    name: "Repository Pattern",
    description: "Abstract repository with implementation for clean architecture",
    generate: (name: string, props?: readonly string[]) => {
      const className = toPascalCase(name);
      const fileName = toSnakeCase(name);
      const entityName = className.replace(/Repository$/, "");
      const varName = toCamelCase(entityName);

      return `// ${fileName}.dart
// ── Abstract Repository ─────────────────────────────────────────────────

abstract class ${className} {
  Future<List<${entityName}>> getAll();
  Future<${entityName}?> getById(String id);
  Future<${entityName}> create(${entityName} ${varName});
  Future<${entityName}> update(${entityName} ${varName});
  Future<void> delete(String id);
}

// ── Implementation ──────────────────────────────────────────────────────

class ${className}Impl implements ${className} {
  // final ApiClient _api;
  // final LocalDatabase _db;

  const ${className}Impl();

  @override
  Future<List<${entityName}>> getAll() async {
    try {
      // TODO: Implement API call
      throw UnimplementedError();
    } catch (e) {
      throw Exception('Failed to fetch ${varName}s: \$e');
    }
  }

  @override
  Future<${entityName}?> getById(String id) async {
    try {
      // TODO: Implement API call
      throw UnimplementedError();
    } catch (e) {
      throw Exception('Failed to fetch ${varName}: \$e');
    }
  }

  @override
  Future<${entityName}> create(${entityName} ${varName}) async {
    try {
      // TODO: Implement API call
      throw UnimplementedError();
    } catch (e) {
      throw Exception('Failed to create ${varName}: \$e');
    }
  }

  @override
  Future<${entityName}> update(${entityName} ${varName}) async {
    try {
      // TODO: Implement API call
      throw UnimplementedError();
    } catch (e) {
      throw Exception('Failed to update ${varName}: \$e');
    }
  }

  @override
  Future<void> delete(String id) async {
    try {
      // TODO: Implement API call
      throw UnimplementedError();
    } catch (e) {
      throw Exception('Failed to delete ${varName}: \$e');
    }
  }
}`;
    },
  },
};
