# flutter-coder

MCP server for Flutter/Dart work: live doc lookups (api.flutter.dev, api.dart.dev,
pub.dev), curated widget/error catalogs, Dart language reference, codegen templates,
and — the reason this server earns its keep — a **verified advanced-sample corpus**
and **knowledge base** for starting and structuring Flutter programs.

## The one rule

**Nothing in `src/data/samples/` is guessed.** Every sample's `code` field was
written into a scratch Flutter app and passed `flutter analyze` with zero
errors/warnings (test samples also pass `flutter test`) before landing here.
When you touch a sample:

1. Reproduce it in a scratch app (`flutter create --empty`), edit there.
2. `flutter analyze` clean — then copy back, re-applying the TS `\${` escaping.
3. Update `minFlutter` / `packages` honestly (versions from pubspec.lock).
4. `npm test` — the integrity suite enforces ids, categories, deprecated-API bans.

Knowledge-base entries (`src/data/knowledge/`) carry an `asOf` date; package picks
in them cite versions verified live against the pub.dev API on that date.

## Layout

- `src/` — TypeScript MCP server (ESM, `@modelcontextprotocol/sdk`, zod). Build: `npm run build` → `dist/`.
- `src/data/samples/*.ts` — the sample corpus, one file per area (contract in `types.ts`).
- `src/data/knowledge/entries.ts` — the knowledge base (contract in `types.ts`).
- `src/data/*.ts` — widget catalog, error catalog, Dart features, state patterns + codegen templates.
- `src/tools/` — tool implementations; live fetchers use the TTL cache in `src/cache.ts`.
- `data/version-state.json` — committed baseline for update checking (Flutter/Dart/tracked pub packages).
- `scripts/check-updates.mjs` — CLI update probe (`npm run check-updates`, `--no-mark-seen` for dry runs).

## Tools (server name: `flutter-coder`)

- `flutter_find_sample` / `flutter_get_sample` / `flutter_list_samples` — the verified corpus. **First stop when writing advanced Flutter code.**
- `flutter_knowledge` — architecture/tooling guidance for new projects (structure, state management choice, theming, flavors/CI, package picks).
- `flutter_docs` / `dart_docs` / `pub_package` — live lookups with caching.
- `flutter_widget_lookup` / `flutter_error_help` / `dart_language_ref` — curated static reference.
- `flutter_breaking_changes` — scrapes docs.flutter.dev; useful for migration planning.
- `flutter_codegen` — boilerplate templates (stateless/stateful/bloc/riverpod/test/freezed/repository).

## Maintenance cadence

A scheduled cloud routine ("flutter-coder update check",
https://claude.ai/code/routines/trig_01YPBFbMcvX1SVrdC1h1DMof) runs
`scripts/check-updates.mjs --no-mark-seen` on the 1st of every month (12:00 UTC)
and opens a GitHub issue on this repo when Flutter stable moves, Dart gains a
minor version, a tracked package ships a new major, or a recommended package
goes stale (>18 months since publish). The routine never commits — unresolved
drift keeps alerting monthly until acted on.
Acting on those issues is a human+Claude job, done locally:

- Flutter/Dart moved → refresh `dart-features.ts` (new language features), re-verify
  affected samples against the new SDK, update KB `asOf` dates.
- Package major → re-verify the samples using it (`packages` field says which),
  update `package-picks-2026` guidance.
- After acting, the script's default mark-seen rewrite of `data/version-state.json`
  gets committed with the content changes — that closes the loop.

Also run `npm run check-updates -- --no-mark-seen` manually when starting a new
Flutter project, so guidance served is known-fresh.

## Fleet notes

Registered in `~/.claude.json` user-level `mcpServers` as `flutter-coder`
(`node dist/index.js`). Sibling knowledge servers: microprocessor, rec-circuit-design,
autodesk-coder, eve-reference, pinball-wizard, whitehall-inventory — same
verified-data + monthly-update-check pattern as microprocessor-mcp.
