// Flutter API docs search tool

import { fetchText, stripHtml } from "../fetcher.js";
import { cache, TTL_DOCS } from "../cache.js";

const FLUTTER_API_BASE = "https://api.flutter.dev/flutter";

// Common library mappings for Flutter classes
const LIBRARY_HINTS: Record<string, string> = {
  // Widgets
  Container: "widgets", Padding: "widgets", Center: "widgets", Align: "widgets",
  Row: "widgets", Column: "widgets", Stack: "widgets", Wrap: "widgets",
  ListView: "widgets", GridView: "widgets", SingleChildScrollView: "widgets",
  CustomScrollView: "widgets", SliverList: "widgets", SliverGrid: "widgets",
  Text: "widgets", RichText: "widgets", Icon: "widgets", Image: "widgets",
  Form: "widgets", Scaffold: "widgets", AppBar: "widgets", Drawer: "widgets",
  Navigator: "widgets", PageView: "widgets", Table: "widgets",
  FutureBuilder: "widgets", StreamBuilder: "widgets",
  GestureDetector: "widgets", Dismissible: "widgets", Draggable: "widgets",
  Hero: "widgets", AnimatedContainer: "widgets", AnimatedOpacity: "widgets",
  AnimatedSwitcher: "widgets", AnimatedCrossFade: "widgets",
  SizedBox: "widgets", ConstrainedBox: "widgets", FractionallySizedBox: "widgets",
  AspectRatio: "widgets", FittedBox: "widgets", Expanded: "widgets",
  Flexible: "widgets", Spacer: "widgets", Positioned: "widgets",
  LayoutBuilder: "widgets", MediaQuery: "widgets", SafeArea: "widgets",
  Visibility: "widgets", Opacity: "widgets", ClipRRect: "widgets",
  DecoratedBox: "widgets", RepaintBoundary: "widgets",
  ValueListenableBuilder: "widgets", ListenableBuilder: "widgets",
  // Material
  ElevatedButton: "material", TextButton: "material", OutlinedButton: "material",
  IconButton: "material", FloatingActionButton: "material",
  TextField: "material", TextFormField: "material",
  Checkbox: "material", Radio: "material", Switch: "material", Slider: "material",
  DropdownButton: "material", PopupMenuButton: "material",
  Card: "material", Chip: "material", Divider: "material",
  ListTile: "material", CircleAvatar: "material", Badge: "material",
  BottomNavigationBar: "material", NavigationBar: "material",
  NavigationRail: "material", TabBar: "material", BottomSheet: "material",
  AlertDialog: "material", SimpleDialog: "material", SnackBar: "material",
  CircularProgressIndicator: "material", LinearProgressIndicator: "material",
  InkWell: "material", Tooltip: "material",
  ThemeData: "material", ColorScheme: "material", TextTheme: "material",
  SearchBar: "material", SearchAnchor: "material", SegmentedButton: "material",
  FilledButton: "material", NavigationDrawer: "material",
  DataTable: "material", ExpansionPanel: "material",
  // Cupertino
  CupertinoButton: "cupertino", CupertinoTextField: "cupertino",
  CupertinoNavigationBar: "cupertino", CupertinoTabBar: "cupertino",
  CupertinoAlertDialog: "cupertino", CupertinoActivityIndicator: "cupertino",
  // Painting
  BoxDecoration: "painting", TextStyle: "painting", EdgeInsets: "painting",
  BorderRadius: "painting", BoxShadow: "painting", Gradient: "painting",
  LinearGradient: "painting", RadialGradient: "painting",
  Alignment: "painting", TextSpan: "painting",
  // Rendering
  BoxConstraints: "rendering",
  // Animation
  AnimationController: "animation", Tween: "animation", CurvedAnimation: "animation",
  Curves: "animation",
  // Foundation
  ChangeNotifier: "foundation", ValueNotifier: "foundation",
  // Services
  SystemChrome: "services", Clipboard: "services",
};

function guessLibrary(query: string): string {
  return LIBRARY_HINTS[query] ?? "widgets";
}

export async function flutterDocsSearch(query: string, type?: string): Promise<string> {
  const cacheKey = cache.makeKey("flutter_docs", { query, type: type ?? "" });
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const className = query.trim();
  const library = guessLibrary(className);

  // Determine URL suffix based on type
  const suffix = type === "enum"
    ? ""
    : type === "method" || type === "function"
    ? ""
    : "-class.html";

  const url = `${FLUTTER_API_BASE}/${library}/${className}${suffix}`;

  try {
    const html = await fetchText(url);

    // Extract the main documentation content
    let text = `# ${className} (Flutter ${library} library)\n\n`;
    text += `**API Docs:** ${url}\n\n`;

    // Extract description
    const descSection = html.match(/<section[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
    if (descSection) {
      const desc = stripHtml(descSection[1]).trim();
      if (desc) {
        text += `## Description\n\n${desc}\n\n`;
      }
    } else {
      // Try multi-line class description
      const multiDesc = html.match(/<div[^>]*class="[^"]*documentation[^"]*"[^>]*>([\s\S]*?)(?=<section|<div[^>]*class="[^"]*summary)/i);
      if (multiDesc) {
        const desc = stripHtml(multiDesc[1]).trim().slice(0, 1000);
        if (desc) {
          text += `## Description\n\n${desc}\n\n`;
        }
      }
    }

    // Extract inheritance
    const inheritance = html.match(/Inheritance[\s\S]*?<ol[^>]*>([\s\S]*?)<\/ol>/i);
    if (inheritance) {
      const chain = stripHtml(inheritance[1]).replace(/\s+/g, " > ").trim();
      if (chain) {
        text += `## Inheritance\n\n${chain}\n\n`;
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
      for (const pair of dtPairs.slice(0, 30)) {
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

    cache.set(cacheKey, text, TTL_DOCS);
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Try alternate libraries if first attempt fails
    if (message.includes("404")) {
      const altLibraries = ["material", "widgets", "cupertino", "painting", "rendering", "animation", "foundation", "services"];
      for (const lib of altLibraries) {
        if (lib === library) continue;
        try {
          const altUrl = `${FLUTTER_API_BASE}/${lib}/${className}-class.html`;
          const html = await fetchText(altUrl);
          const desc = stripHtml(html).slice(0, 500);
          const result = `# ${className} (Flutter ${lib} library)\n\n**API Docs:** ${altUrl}\n\n${desc}\n`;
          cache.set(cacheKey, result, TTL_DOCS);
          return result;
        } catch {
          continue;
        }
      }
      return `Could not find "${className}" in Flutter API docs. Try a different class name or check the spelling.`;
    }
    return `Failed to fetch Flutter docs for "${className}": ${message}`;
  }
}
