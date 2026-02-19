# Flutter Coder MCP Server

MCP server providing Flutter and Dart reference data, code generation, and live API lookups for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## Tools (8)

| Tool | Description | Source |
|------|-------------|--------|
| `flutter_docs` | Search Flutter API docs for any class/widget/method | Live (api.flutter.dev) |
| `dart_docs` | Search Dart API docs for core library references | Live (api.dart.dev) |
| `pub_package` | Get pub.dev package details, versions, score, dependencies | Live (pub.dev API) |
| `flutter_widget_lookup` | Search curated widget catalog with properties and tips | Static (100+ widgets) |
| `flutter_error_help` | Diagnose common Flutter errors with solutions | Static (20+ patterns) |
| `flutter_breaking_changes` | Query breaking changes by version or keyword | Live (docs.flutter.dev) |
| `dart_language_ref` | Dart language feature reference (records, patterns, sealed, etc.) | Static (15 features) |
| `flutter_codegen` | Generate widget/BLoC/Riverpod/test/freezed/repository boilerplate | Static (7 templates) |

## Resources (4)

| Resource | URI | Description |
|----------|-----|-------------|
| Widget Catalog | `flutter://widget-catalog` | 100+ widgets with categories, properties, usage tips |
| Error Catalog | `flutter://error-catalog` | Common errors with root causes and solutions |
| Dart Features | `flutter://dart-features` | Dart 3.x language features reference |
| State Management | `flutter://state-management` | BLoC vs Riverpod vs Provider comparison |

## Setup

```bash
git clone https://github.com/RoanokeControls/flutter-coder.git
cd flutter-coder
npm install
npm run build
```

### Register in Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "flutter-coder": {
      "command": "node",
      "args": ["/path/to/flutter-coder/dist/index.js"]
    }
  }
}
```

Or copy `.mcp.json` to your Flutter project root for project-level registration.

## Architecture

```
src/
├── index.ts                  # MCP server entry, tool + resource registration
├── cache.ts                  # In-memory TTL cache (5 min API, 1 hour docs)
├── fetcher.ts                # HTTP fetch helpers with timeout and HTML parsing
├── tools/
│   ├── flutter-docs.ts       # Flutter API docs (api.flutter.dev)
│   ├── dart-docs.ts          # Dart API docs (api.dart.dev)
│   ├── pub-package.ts        # pub.dev package lookup
│   ├── widget-lookup.ts      # Widget catalog fuzzy search
│   ├── error-help.ts         # Error pattern matching
│   ├── breaking-changes.ts   # Breaking changes scraper
│   └── codegen.ts            # Code generation + dart language ref
└── data/
    ├── widget-catalog.ts     # 100+ curated widget entries
    ├── error-catalog.ts      # 20+ error patterns with solutions
    ├── dart-features.ts      # Dart 3.x language features (records through macros)
    └── patterns.ts           # State management patterns + codegen templates
```

**Hybrid approach:** Live fetching from official APIs (pub.dev, api.flutter.dev, api.dart.dev, docs.flutter.dev) combined with curated static data for error solutions, widget deep-dives, and code generation templates. All live fetches use an in-memory TTL cache to avoid redundant requests.

## License

MIT
