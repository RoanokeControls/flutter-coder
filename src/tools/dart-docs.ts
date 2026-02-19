// Dart API docs search tool

import { fetchText, stripHtml } from "../fetcher.js";
import { cache, TTL_DOCS } from "../cache.js";

const DART_API_BASE = "https://api.dart.dev/stable/latest";

// Library hints for common Dart types
const LIBRARY_HINTS: Record<string, string> = {
  // dart:core
  String: "dart-core", int: "dart-core", double: "dart-core", num: "dart-core",
  bool: "dart-core", List: "dart-core", Map: "dart-core", Set: "dart-core",
  Iterable: "dart-core", Iterator: "dart-core", Object: "dart-core",
  Duration: "dart-core", DateTime: "dart-core", RegExp: "dart-core",
  Uri: "dart-core", Pattern: "dart-core", Comparable: "dart-core",
  Exception: "dart-core", Error: "dart-core", Function: "dart-core",
  Type: "dart-core", Null: "dart-core", Symbol: "dart-core",
  Enum: "dart-core", Record: "dart-core",
  // dart:async
  Future: "dart-async", Stream: "dart-async", StreamController: "dart-async",
  StreamSubscription: "dart-async", Completer: "dart-async",
  Timer: "dart-async", Zone: "dart-async",
  StreamTransformer: "dart-async", EventSink: "dart-async",
  // dart:collection
  HashMap: "dart-collection", LinkedHashMap: "dart-collection",
  HashSet: "dart-collection", LinkedHashSet: "dart-collection",
  Queue: "dart-collection", ListQueue: "dart-collection",
  SplayTreeMap: "dart-collection", SplayTreeSet: "dart-collection",
  UnmodifiableListView: "dart-collection",
  // dart:convert
  JsonCodec: "dart-convert", Utf8Codec: "dart-convert",
  JsonEncoder: "dart-convert", JsonDecoder: "dart-convert",
  Codec: "dart-convert", Converter: "dart-convert",
  // dart:math
  Random: "dart-math", Point: "dart-math", Rectangle: "dart-math",
  // dart:io
  File: "dart-io", Directory: "dart-io", HttpClient: "dart-io",
  HttpServer: "dart-io", Socket: "dart-io", Platform: "dart-io",
  Process: "dart-io", Stdin: "dart-io", Stdout: "dart-io",
  // dart:typed_data
  Uint8List: "dart-typed_data", Int32List: "dart-typed_data",
  Float64List: "dart-typed_data", ByteBuffer: "dart-typed_data",
  ByteData: "dart-typed_data",
  // dart:isolate
  Isolate: "dart-isolate", ReceivePort: "dart-isolate", SendPort: "dart-isolate",
};

function guessLibrary(query: string): string {
  return LIBRARY_HINTS[query] ?? "dart-core";
}

function libraryNameToParam(library: string): string {
  // Convert "dart:core" or "core" to "dart-core"
  if (library.startsWith("dart:")) {
    return `dart-${library.slice(5)}`;
  }
  if (library.startsWith("dart-")) {
    return library;
  }
  return `dart-${library}`;
}

export async function dartDocsSearch(query: string, library?: string): Promise<string> {
  const cacheKey = cache.makeKey("dart_docs", { query, library: library ?? "" });
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const className = query.trim();
  const lib = library ? libraryNameToParam(library) : guessLibrary(className);

  const url = `${DART_API_BASE}/${lib}/${className}-class.html`;

  try {
    const html = await fetchText(url);

    let text = `# ${className} (${lib.replace("-", ":")} library)\n\n`;
    text += `**API Docs:** ${url}\n\n`;

    // Extract description
    const descSection = html.match(/<section[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
    if (descSection) {
      const desc = stripHtml(descSection[1]).trim().slice(0, 1000);
      if (desc) {
        text += `## Description\n\n${desc}\n\n`;
      }
    } else {
      // Try documentation div
      const docDiv = html.match(/<div[^>]*class="[^"]*documentation[^"]*"[^>]*>([\s\S]*?)(?=<section)/i);
      if (docDiv) {
        const desc = stripHtml(docDiv[1]).trim().slice(0, 1000);
        if (desc) {
          text += `## Description\n\n${desc}\n\n`;
        }
      }
    }

    // Extract constructors
    const ctorSection = html.match(/<section[^>]*id="constructors"[^>]*>([\s\S]*?)<\/section>/i);
    if (ctorSection) {
      text += "## Constructors\n\n";
      const ctors = ctorSection[1].match(/<dt[^>]*>([\s\S]*?)<\/dt>/gi) ?? [];
      for (const ctor of ctors.slice(0, 5)) {
        const ctorText = stripHtml(ctor).trim();
        if (ctorText) text += `- \`${ctorText}\`\n`;
      }
      text += "\n";
    }

    // Extract properties
    const propsSection = html.match(/<section[^>]*id="instance-properties"[^>]*>([\s\S]*?)<\/section>/i);
    if (propsSection) {
      text += "## Properties\n\n";
      const dtPairs = propsSection[1].match(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi) ?? [];
      for (const pair of dtPairs.slice(0, 20)) {
        const dtMatch = pair.match(/<dt[^>]*>([\s\S]*?)<\/dt>/i);
        const ddMatch = pair.match(/<dd[^>]*>([\s\S]*?)<\/dd>/i);
        if (dtMatch && ddMatch) {
          const prop = stripHtml(dtMatch[1]).trim();
          const desc = stripHtml(ddMatch[1]).trim().slice(0, 100);
          if (prop) text += `- **${prop}** — ${desc}\n`;
        }
      }
      text += "\n";
    }

    // Extract methods
    const methodSection = html.match(/<section[^>]*id="instance-methods"[^>]*>([\s\S]*?)<\/section>/i);
    if (methodSection) {
      text += "## Methods\n\n";
      const methods = methodSection[1].match(/<dt[^>]*>([\s\S]*?)<\/dt>/gi) ?? [];
      for (const method of methods.slice(0, 20)) {
        const methodText = stripHtml(method).trim();
        if (methodText) text += `- \`${methodText}\`\n`;
      }
      text += "\n";
    }

    // Extract static methods
    const staticSection = html.match(/<section[^>]*id="static-methods"[^>]*>([\s\S]*?)<\/section>/i);
    if (staticSection) {
      text += "## Static Methods\n\n";
      const methods = staticSection[1].match(/<dt[^>]*>([\s\S]*?)<\/dt>/gi) ?? [];
      for (const method of methods.slice(0, 10)) {
        const methodText = stripHtml(method).trim();
        if (methodText) text += `- \`${methodText}\`\n`;
      }
      text += "\n";
    }

    cache.set(cacheKey, text, TTL_DOCS);
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("404")) {
      // Try other common libraries
      const otherLibs = ["dart-core", "dart-async", "dart-collection", "dart-convert", "dart-math", "dart-io", "dart-typed_data", "dart-isolate"];
      for (const altLib of otherLibs) {
        if (altLib === lib) continue;
        try {
          const altUrl = `${DART_API_BASE}/${altLib}/${className}-class.html`;
          const html = await fetchText(altUrl);
          const desc = stripHtml(html).slice(0, 500);
          const result = `# ${className} (${altLib.replace("-", ":")} library)\n\n**API Docs:** ${altUrl}\n\n${desc}\n`;
          cache.set(cacheKey, result, TTL_DOCS);
          return result;
        } catch {
          continue;
        }
      }
      return `Could not find "${className}" in Dart API docs. Try a different class name or specify the library (e.g., "dart:async").`;
    }
    return `Failed to fetch Dart docs for "${className}": ${message}`;
  }
}
