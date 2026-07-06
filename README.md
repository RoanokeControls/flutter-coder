# Flutter Coder MCP Server

MCP server providing Flutter and Dart reference data, code generation, live API lookups,
a **verified advanced-sample corpus**, and an opinionated **knowledge base** for
[Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## Tools (12)

| Tool | Description | Source |
|------|-------------|--------|
| `flutter_find_sample` | Search the advanced sample corpus by describing what you're building | Static (verified corpus) |
| `flutter_get_sample` | Full code + gotchas for a specific sample id | Static (verified corpus) |
| `flutter_list_samples` | Browse the corpus index by category | Static (verified corpus) |
| `flutter_knowledge` | Architecture/tooling guidance: structure, state management, theming, flavors/CI, package picks | Static (verified 2026-07) |
| `flutter_docs` | Search Flutter API docs for any class/widget/method | Live (api.flutter.dev) |
| `dart_docs` | Search Dart API docs for core library references | Live (api.dart.dev) |
| `pub_package` | Get pub.dev package details, versions, score, dependencies | Live (pub.dev API) |
| `flutter_widget_lookup` | Search curated widget catalog with properties and tips | Static (100+ widgets) |
| `flutter_error_help` | Diagnose common Flutter errors with solutions | Static (20+ patterns) |
| `flutter_breaking_changes` | Query breaking changes by version or keyword | Live (docs.flutter.dev) |
| `dart_language_ref` | Dart language feature reference through Dart 3.12 | Static (21 features) |
| `flutter_codegen` | Generate widget/BLoC/Riverpod 3/test/freezed/repository boilerplate | Static (7 templates) |

## Resources (6)

| Resource | URI | Description |
|----------|-----|-------------|
| Samples Index | `flutter://samples-index` | The verified advanced sample corpus, grouped by category |
| Knowledge Base | `flutter://knowledge-base` | Index of current best-practice guidance entries |
| Widget Catalog | `flutter://widget-catalog` | 100+ widgets with categories, properties, usage tips |
| Error Catalog | `flutter://error-catalog` | Common errors with root causes and solutions |
| Dart Features | `flutter://dart-features` | Dart language features through 3.12 (incl. the macros cancellation) |
| State Management | `flutter://state-management` | BLoC vs Riverpod 3 vs Provider comparison |

## The sample corpus

Every sample in `src/data/samples/` is complete, self-contained Dart that passed
`flutter analyze` with zero errors/warnings in a scratch app before landing here
(test-category samples also pass `flutter test`). Categories: rendering, animation,
architecture, async, platform, navigation, performance, testing, ui-patterns.

## Setup

```bash
git clone https://github.com/RoanokeControls/flutter-coder.git
cd flutter-coder
npm install
npm run build
npm test        # corpus integrity suite
```

### Register in Claude Code

Add to `~/.claude.json` under `mcpServers`:

```json
{
  "flutter-coder": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/flutter-coder/dist/index.js"]
  }
}
```

Or copy `.mcp.json` to your Flutter project root for project-level registration.

## Staying current

`npm run check-updates` probes Flutter/Dart releases and the tracked pub.dev
packages against the committed baseline in `data/version-state.json`, exiting 1
when static content may be stale. A scheduled cloud routine runs it on the 1st
of every month and opens a GitHub issue with the findings. See `CLAUDE.md` for
the maintenance playbook.

## Architecture

```
src/
├── index.ts                  # MCP server entry, tool + resource registration
├── cache.ts                  # In-memory TTL cache (5 min API, 1 hour docs)
├── fetcher.ts                # HTTP fetch helpers with timeout and HTML parsing
├── tools/                    # Tool implementations (live fetchers + corpus search)
└── data/
    ├── samples/              # Verified advanced sample corpus (one file per area)
    ├── knowledge/            # Knowledge base entries (asOf-dated guidance)
    ├── widget-catalog.ts     # 100+ curated widget entries
    ├── error-catalog.ts      # 20+ error patterns with solutions
    ├── dart-features.ts      # Dart language features through 3.12
    └── patterns.ts           # State management patterns + codegen templates
scripts/check-updates.mjs     # Monthly freshness probe (exit 1 = actionable)
data/version-state.json       # Committed baseline the probe diffs against
test/corpus.test.mjs          # Integrity suite (ids, categories, deprecated-API bans)
```

**Hybrid approach:** live fetching from official APIs (pub.dev, api.flutter.dev,
api.dart.dev, docs.flutter.dev) combined with curated, analyzer-verified static
data for samples, error solutions, and guidance. All live fetches use an
in-memory TTL cache.

## License

MIT
