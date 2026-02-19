import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { formatWidgetCatalog } from "./data/widget-catalog.js";
import { formatErrorCatalog } from "./data/error-catalog.js";
import { formatDartFeatures } from "./data/dart-features.js";
import { formatStateManagement } from "./data/patterns.js";
import { pubPackageLookup } from "./tools/pub-package.js";
import { flutterDocsSearch } from "./tools/flutter-docs.js";
import { dartDocsSearch } from "./tools/dart-docs.js";
import { widgetLookup } from "./tools/widget-lookup.js";
import { flutterErrorHelp } from "./tools/error-help.js";
import { flutterBreakingChanges } from "./tools/breaking-changes.js";
import { flutterCodegen, dartLanguageRef } from "./tools/codegen.js";

// ── Create Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: "flutter-coder",
  version: "1.0.0",
});

// ── Resources (static reference content) ───────────────────────────────

server.resource(
  "widget-catalog",
  "flutter://widget-catalog",
  {
    description: "Indexed Flutter widget reference (100+ widgets with categories, properties, usage tips)",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: formatWidgetCatalog() }],
  })
);

server.resource(
  "error-catalog",
  "flutter://error-catalog",
  {
    description: "Common Flutter errors with root causes, solutions, and code examples",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: formatErrorCatalog() }],
  })
);

server.resource(
  "dart-features",
  "flutter://dart-features",
  {
    description: "Dart 3.x language features reference (records, patterns, sealed classes, extension types, macros)",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: formatDartFeatures() }],
  })
);

server.resource(
  "state-management",
  "flutter://state-management",
  {
    description: "Comparison of BLoC vs Riverpod vs Provider vs GetX with pattern examples",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: formatStateManagement() }],
  })
);

// ── Tools (executable functions) ───────────────────────────────────────

server.tool(
  "flutter_docs",
  "Search Flutter API docs for any class, widget, method, or enum. Returns description, properties, methods, and constructors.",
  {
    query: z.string().describe("Class or widget name to look up (e.g., 'Container', 'ThemeData', 'BoxDecoration')"),
    type: z.enum(["widget", "class", "method", "enum"]).optional()
      .describe("Type hint to narrow the search"),
  },
  async ({ query, type }) => ({
    content: [{ type: "text" as const, text: await flutterDocsSearch(query, type) }],
  })
);

server.tool(
  "dart_docs",
  "Search Dart API docs for core library classes. Returns description, properties, methods, and constructors.",
  {
    query: z.string().describe("Class name to look up (e.g., 'Future', 'Stream', 'List', 'Map')"),
    library: z.string().optional()
      .describe("Dart library (e.g., 'dart:core', 'dart:async', 'dart:collection', 'dart:io')"),
  },
  async ({ query, library }) => ({
    content: [{ type: "text" as const, text: await dartDocsSearch(query, library) }],
  })
);

server.tool(
  "pub_package",
  "Get pub.dev package details including version, score, dependencies, and installation instructions.",
  {
    name: z.string().describe("Package name on pub.dev (e.g., 'riverpod', 'flutter_bloc', 'go_router')"),
  },
  async ({ name }) => ({
    content: [{ type: "text" as const, text: await pubPackageLookup(name) }],
  })
);

server.tool(
  "flutter_widget_lookup",
  "Search the curated Flutter widget catalog. Returns widget properties, usage tips, and best practices.",
  {
    query: z.string().describe("Widget name or search term (e.g., 'scroll', 'animation', 'input')"),
    category: z.string().optional()
      .describe("Filter by category (e.g., 'Layout', 'Input', 'Navigation', 'Animation')"),
  },
  async ({ query, category }) => ({
    content: [{ type: "text" as const, text: widgetLookup(query, category) }],
  })
);

server.tool(
  "flutter_error_help",
  "Diagnose common Flutter errors and get solutions with code examples. Paste the error message for diagnosis.",
  {
    error_message: z.string().describe("The Flutter error message to diagnose (e.g., 'RenderFlex overflowed', 'setState after dispose')"),
  },
  async ({ error_message }) => ({
    content: [{ type: "text" as const, text: flutterErrorHelp(error_message) }],
  })
);

server.tool(
  "flutter_breaking_changes",
  "Query Flutter breaking changes by version or keyword. Useful for migration planning.",
  {
    version: z.string().optional()
      .describe("Flutter version to filter by (e.g., '3.0', '3.22')"),
    query: z.string().optional()
      .describe("Keyword to search for in breaking changes (e.g., 'Material', 'Navigator', 'Theme')"),
  },
  async ({ version, query }) => ({
    content: [{ type: "text" as const, text: await flutterBreakingChanges(version, query) }],
  })
);

server.tool(
  "dart_language_ref",
  "Dart language feature reference with syntax, examples, and tips. Covers records, patterns, sealed classes, and more.",
  {
    feature: z.string().describe("Feature name (e.g., 'records', 'patterns', 'sealed', 'extensions', 'null safety', 'isolates')"),
  },
  async ({ feature }) => ({
    content: [{ type: "text" as const, text: dartLanguageRef(feature) }],
  })
);

server.tool(
  "flutter_codegen",
  "Generate Flutter/Dart boilerplate code. Supports StatelessWidget, StatefulWidget, BLoC, Riverpod, tests, freezed, and repository patterns.",
  {
    template: z.string().describe("Template type: stateless, stateful, bloc, riverpod, test, freezed, repository"),
    name: z.string().describe("Name for the generated class/widget (e.g., 'UserProfile', 'ShoppingCart')"),
    props: z.array(z.string()).optional()
      .describe("Optional properties with types (e.g., ['String name', 'int age', 'bool isActive'])"),
  },
  async ({ template, name, props }) => ({
    content: [{ type: "text" as const, text: flutterCodegen(template, name, props) }],
  })
);

// ── Start Server ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Flutter Coder MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
