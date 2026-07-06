// Contract for the advanced Flutter sample corpus.
// Every sample must be complete, compilable Dart — validated by `npm test`
// (structural checks) and the flutter-analyze harness in scripts/.

export type SampleCategory =
  | "rendering"      // CustomPainter, RenderObject, shaders, custom slivers
  | "animation"      // explicit/staggered animation, physics simulations, hero
  | "architecture"   // app structure, state management, dependency injection
  | "async"          // isolates, streams, cancellation, concurrency
  | "platform"       // platform channels, FFI, native integration
  | "navigation"     // go_router: shell routes, guards, deep links
  | "performance"    // jank hunting, rebuild control, memory
  | "testing"        // widget, golden, integration, fakes
  | "ui-patterns";   // overlays, custom layout, gestures, theming

export const sampleCategories: readonly SampleCategory[] = [
  "rendering",
  "animation",
  "architecture",
  "async",
  "platform",
  "navigation",
  "performance",
  "testing",
  "ui-patterns",
];

export interface PackageDep {
  readonly name: string;    // pub.dev package name
  readonly version: string; // constraint used when the sample was verified, e.g. "^3.0.1"
}

export interface FlutterSample {
  readonly id: string;                       // unique kebab-case, e.g. "custom-render-object-badge"
  readonly title: string;
  readonly category: SampleCategory;
  readonly difficulty: "advanced" | "expert";
  readonly description: string;              // what it demonstrates and when to reach for it
  readonly tags: readonly string[];          // search keywords
  readonly minFlutter: string;               // lowest Flutter stable the code targets, e.g. "3.24"
  readonly packages: readonly PackageDep[];  // pub deps beyond the Flutter SDK ([] if none)
  readonly code: string;                     // complete Dart source, compiles as written
  readonly notes: string;                    // gotchas, pitfalls, perf implications
}
